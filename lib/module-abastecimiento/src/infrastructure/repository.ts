/**
 * DGP-013.2 · Módulo Enterprise Procurement — Infraestructura de PERSISTENCIA.
 *
 * Adaptadores PostgreSQL de los PUERTOS del dominio (los Fakes en memoria viven
 * en `fakes.ts`). Los aggregates se persisten en tablas PROPIAS del módulo
 * (deltaops.abs_*), NUNCA en el Record Store (reservado a catálogos). El estado
 * completo del aggregate vive en la columna `datos` (JSONB, fuente de
 * reconstrucción); las columnas planas son sólo para filtrar/indexar. RLS por
 * tenant: escrituras con set_config vía pgSessionOf(uow); lecturas con
 * withTenantRead (transacción propia con set_config). Mismo patrón que
 * module-planes (0018) y module-inventario (0014).
 */
import type { Pool } from "pg";
import {
  fail,
  KernelErrors,
  ok,
  pgSessionOf,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { CANONICOS_POR_CATALOGO, type EntradaCatalogo, type NombreCatalogo } from "../domain/catalogos";
import type { CatalogoArticulo } from "../domain/articulo";
import type { Proveedor } from "../domain/proveedor";
import type { SolicitudCompra } from "../domain/solicitud";
import type { Cotizacion } from "../domain/cotizacion";
import type { OrdenCompra } from "../domain/orden-compra";
import type { Recepcion } from "../domain/recepcion";
import type { HistorialAbastecimiento } from "../domain/historial";
import type {
  ArticuloFiltro,
  ArticuloRepository,
  CatalogoPort,
  ConfigCodigo,
  Consecutivo,
  ConsecutivoPort,
  CotizacionRepository,
  HistorialRepository,
  OpcionCatalogo,
  OrdenCompraFiltro,
  OrdenCompraRepository,
  ProveedorFiltro,
  ProveedorRepository,
  Recibo,
  ReciboPort,
  RecepcionRepository,
  SolicitudFiltro,
  SolicitudRepository,
  TenantId,
  EstadoMaterializacion,
  MaterializacionStore,
  RegistroMaterializacion,
} from "../domain/ports";

/* --------------------------- Helpers de sesión --------------------------- */

export async function setTenant(uow: UnitOfWork, tenantId: string): Promise<void> {
  await pgSessionOf(uow).query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export async function withTenantRead<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: { query: Pool["query"] }) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const result = await fn(client as unknown as { query: Pool["query"] });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/* --------------------------- Serialización JSONB ------------------------- */

function serializar<T>(agg: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(agg, (_k, v) => (v instanceof Date ? v.toISOString() : v))) as Record<string, unknown>;
}

/** Los aggregates usan fechas como STRINGS ISO (dominio puro): no se revive a
 *  Date; se conserva el JSON tal cual (parse). */
function parseDatos<T>(v: unknown): T {
  return ((typeof v === "string" ? JSON.parse(v) : v) ?? {}) as T;
}

/* =============================== Aggregates ============================== */

class PgAggRepo<T extends { tenantId: string; id: string; version: number }> {
  constructor(
    protected readonly pool: Pool,
    protected readonly tabla: string,
    protected readonly recurso: string,
    protected readonly columnas: (agg: T) => Record<string, unknown>,
  ) {}

  protected async insertBase(uow: UnitOfWork, agg: T): Promise<Result<T, KernelError>> {
    try {
      await setTenant(uow, agg.tenantId);
      const extra = this.columnas(agg);
      const cols = ["tenant_id", "id", ...Object.keys(extra), "datos", "version"];
      const vals = [agg.tenantId, agg.id, ...Object.values(extra), JSON.stringify(serializar(agg)), agg.version];
      const ph = cols.map((_, i) => `$${i + 1}`).join(",");
      await pgSessionOf(uow).query(`INSERT INTO deltaops.${this.tabla} (${cols.join(",")}) VALUES (${ph})`, vals);
      return ok(agg);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`${this.recurso} ${agg.id} ya existe`));
      return fail(KernelErrors.infrastructure(`${this.recurso} insert falló`, err));
    }
  }

  protected async updateBase(uow: UnitOfWork, agg: T, expectedVersion: number): Promise<Result<T, KernelError>> {
    try {
      await setTenant(uow, agg.tenantId);
      const extra = this.columnas(agg);
      const setCols = [...Object.keys(extra), "datos", "version", "updated_at"];
      const setVals = [...Object.values(extra), JSON.stringify(serializar(agg)), agg.version, new Date()];
      const setSql = setCols.map((c, i) => `${c}=$${i + 3}`).join(", ");
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.${this.tabla} SET ${setSql} WHERE tenant_id=$1 AND id=$2 AND version=$${setCols.length + 3}`,
        [agg.tenantId, agg.id, ...setVals, expectedVersion],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión de ${this.recurso} ${agg.id}`));
      return ok(agg);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`${this.recurso} ${agg.id} viola una restricción única`));
      return fail(KernelErrors.infrastructure(`${this.recurso} update falló`, err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<T | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.${this.tabla} WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<T>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure(`${this.recurso} findById falló`, err));
    }
  }
}

export class PgArticuloRepository extends PgAggRepo<CatalogoArticulo> implements ArticuloRepository {
  constructor(pool: Pool) {
    super(pool, "abs_articulos", "articulo", (a) => ({
      codigo: a.codigo,
      nombre: a.nombre,
      tipo: a.tipo,
      unidad: a.unidad,
      familia: a.familia,
      metodo_valoracion: a.metodoValoracion,
      moneda: a.costos.moneda,
      activo: a.activo,
      created_by: a.createdBy,
    }));
  }
  insert(uow: UnitOfWork, a: CatalogoArticulo) { return this.insertBase(uow, a); }
  update(uow: UnitOfWork, a: CatalogoArticulo, expectedVersion: number) { return this.updateBase(uow, a, expectedVersion); }
  async list(tenantId: TenantId, filtro: ArticuloFiltro): Promise<Result<CatalogoArticulo[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.abs_articulos
           WHERE tenant_id=$1
             AND ($2::text IS NULL OR tipo=$2)
             AND ($3::text IS NULL OR familia=$3)
             AND ($4::boolean IS NULL OR activo=$4)
           ORDER BY updated_at DESC, id ASC LIMIT $5`,
          [tenantId, filtro.tipo ?? null, filtro.familia ?? null, filtro.activo ?? null, filtro.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => parseDatos<CatalogoArticulo>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("articulo list falló", err));
    }
  }
}

export class PgProveedorRepository extends PgAggRepo<Proveedor> implements ProveedorRepository {
  constructor(pool: Pool) {
    super(pool, "abs_proveedores", "proveedor", (p) => ({
      codigo: p.codigo,
      razon_social: p.razonSocial,
      tipo: p.tipo,
      calificacion_promedio: p.calificacionPromedio,
      activo: p.activo,
      created_by: p.createdBy,
    }));
  }
  insert(uow: UnitOfWork, p: Proveedor) { return this.insertBase(uow, p); }
  update(uow: UnitOfWork, p: Proveedor, expectedVersion: number) { return this.updateBase(uow, p, expectedVersion); }
  async list(tenantId: TenantId, filtro: ProveedorFiltro): Promise<Result<Proveedor[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.abs_proveedores
           WHERE tenant_id=$1
             AND ($2::text IS NULL OR tipo=$2)
             AND ($3::boolean IS NULL OR activo=$3)
           ORDER BY updated_at DESC, id ASC LIMIT $4`,
          [tenantId, filtro.tipo ?? null, filtro.activo ?? null, filtro.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => parseDatos<Proveedor>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("proveedor list falló", err));
    }
  }
}

export class PgSolicitudRepository extends PgAggRepo<SolicitudCompra> implements SolicitudRepository {
  constructor(pool: Pool) {
    super(pool, "abs_solicitudes", "solicitud", (s) => ({
      codigo: s.codigo,
      titulo: s.titulo,
      estado: s.estado,
      prioridad: s.prioridad,
      origen_tipo: s.origen.tipo,
      created_by: s.createdBy,
    }));
  }
  insert(uow: UnitOfWork, s: SolicitudCompra) { return this.insertBase(uow, s); }
  update(uow: UnitOfWork, s: SolicitudCompra, expectedVersion: number) { return this.updateBase(uow, s, expectedVersion); }
  async list(tenantId: TenantId, filtro: SolicitudFiltro): Promise<Result<SolicitudCompra[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.abs_solicitudes
           WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2)
           ORDER BY updated_at DESC, id ASC LIMIT $3`,
          [tenantId, filtro.estado ?? null, filtro.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => parseDatos<SolicitudCompra>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("solicitud list falló", err));
    }
  }
}

export class PgCotizacionRepository implements CotizacionRepository {
  constructor(private readonly pool: Pool) {}
  async insert(uow: UnitOfWork, c: Cotizacion): Promise<Result<Cotizacion, KernelError>> {
    try {
      await setTenant(uow, c.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_cotizaciones
           (tenant_id, id, solicitud_id, proveedor_id, moneda, total, plazo_entrega_dias, datos, version, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [c.tenantId, c.id, c.solicitudId, c.proveedorId, c.moneda, c.total, c.plazoEntregaDias, JSON.stringify(serializar(c)), c.version, c.createdBy],
      );
      return ok(c);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`cotizacion ${c.id} ya existe`));
      return fail(KernelErrors.infrastructure("cotizacion insert falló", err));
    }
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Cotizacion | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.abs_cotizaciones WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<Cotizacion>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("cotizacion findById falló", err));
    }
  }
  async listPorSolicitud(tenantId: TenantId, solicitudId: string): Promise<Result<Cotizacion[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.abs_cotizaciones WHERE tenant_id=$1 AND solicitud_id=$2 ORDER BY created_at ASC, id ASC`, [tenantId, solicitudId]),
      );
      return ok(res.rows.map((r) => parseDatos<Cotizacion>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("cotizacion listPorSolicitud falló", err));
    }
  }
}

export class PgOrdenCompraRepository extends PgAggRepo<OrdenCompra> implements OrdenCompraRepository {
  constructor(pool: Pool) {
    super(pool, "abs_ordenes_compra", "orden-compra", (o) => ({
      codigo: o.codigo,
      proveedor_id: o.proveedorId,
      solicitud_id: o.solicitudId,
      cotizacion_id: o.cotizacionId,
      moneda: o.moneda,
      estado: o.estado,
      total: o.total,
      created_by: o.createdBy,
    }));
  }
  insert(uow: UnitOfWork, o: OrdenCompra) { return this.insertBase(uow, o); }
  update(uow: UnitOfWork, o: OrdenCompra, expectedVersion: number) { return this.updateBase(uow, o, expectedVersion); }
  async list(tenantId: TenantId, filtro: OrdenCompraFiltro): Promise<Result<OrdenCompra[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.abs_ordenes_compra
           WHERE tenant_id=$1
             AND ($2::text IS NULL OR estado=$2)
             AND ($3::text IS NULL OR proveedor_id=$3)
           ORDER BY updated_at DESC, id ASC LIMIT $4`,
          [tenantId, filtro.estado ?? null, filtro.proveedorId ?? null, filtro.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => parseDatos<OrdenCompra>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("orden-compra list falló", err));
    }
  }
}

export class PgRecepcionRepository implements RecepcionRepository {
  constructor(private readonly pool: Pool) {}
  async insert(uow: UnitOfWork, r: Recepcion): Promise<Result<Recepcion, KernelError>> {
    try {
      await setTenant(uow, r.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_recepciones
           (tenant_id, id, orden_compra_id, consecutivo, completa_orden, con_novedades, datos, recibido_por, recibido_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (tenant_id, id) DO NOTHING`,
        [r.tenantId, r.id, r.ordenCompraId, r.consecutivo, r.completaOrden, r.conNovedades, JSON.stringify(serializar(r)), r.recibidoPor, r.recibidoEn],
      );
      return ok(r);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`recepción ${r.id} ya existe`));
      return fail(KernelErrors.infrastructure("recepcion insert falló", err));
    }
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Recepcion | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.abs_recepciones WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const row = res.rows[0];
      return ok(row ? parseDatos<Recepcion>(row["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("recepcion findById falló", err));
    }
  }
  async contarPorOrden(tenantId: TenantId, ordenCompraId: string): Promise<Result<number, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT count(*)::int AS n FROM deltaops.abs_recepciones WHERE tenant_id=$1 AND orden_compra_id=$2`, [tenantId, ordenCompraId]),
      );
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("recepcion contarPorOrden falló", err));
    }
  }
  async listPorOrden(tenantId: TenantId, ordenCompraId: string): Promise<Result<Recepcion[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.abs_recepciones WHERE tenant_id=$1 AND orden_compra_id=$2 ORDER BY consecutivo ASC`, [tenantId, ordenCompraId]),
      );
      return ok(res.rows.map((r) => parseDatos<Recepcion>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("recepcion listPorOrden falló", err));
    }
  }
}

export class PgHistorialRepository implements HistorialRepository {
  constructor(private readonly pool: Pool) {}
  private tenantDe(h: HistorialAbastecimiento): string {
    // El id del historial embebe el tenant como prefijo (`${tenant}::${uuid}`).
    return h.id.split("::")[0] ?? "";
  }
  async append(uow: UnitOfWork, h: HistorialAbastecimiento): Promise<Result<HistorialAbastecimiento, KernelError>> {
    try {
      const tenant = this.tenantDe(h);
      await setTenant(uow, tenant);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_historial (tenant_id, id, entity_ref, hito, version, detalle, ocurrido_en, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [tenant, h.id, h.entityRef, h.hito, h.version, JSON.stringify(h.detalle ?? {}), h.ocurridoEn, h.actorId],
      );
      return ok(h);
    } catch (err) {
      return fail(KernelErrors.infrastructure("historial append falló", err));
    }
  }
  async listPorEntidad(tenantId: TenantId, entityRef: string): Promise<Result<HistorialAbastecimiento[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT id, entity_ref, hito, version, detalle, ocurrido_en, actor_id FROM deltaops.abs_historial
           WHERE tenant_id=$1 AND entity_ref=$2 ORDER BY ocurrido_en ASC, id ASC`,
          [tenantId, entityRef],
        ),
      );
      return ok(
        res.rows.map((r) => ({
          id: String(r["id"]),
          entityRef: String(r["entity_ref"]),
          hito: String(r["hito"]),
          version: Number(r["version"] ?? 0),
          detalle: parseDatos<Record<string, unknown>>(r["detalle"]),
          ocurridoEn: (r["ocurrido_en"] as Date).toISOString(),
          actorId: String(r["actor_id"]),
        })) as HistorialAbastecimiento[],
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("historial listPorEntidad falló", err));
    }
  }
}

/* ==================== Adaptadores PG de puertos SOPORTE ================== */

export class PgReciboStore implements ReciboPort {
  constructor(private readonly pool: Pool) {}
  async buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(
          `SELECT comando, op_id, resultado FROM deltaops.abs_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`,
          [tenantId, comando, opId],
        );
        const row = r.rows[0];
        if (!row) return ok(null) as Result<Recibo | null, KernelError>;
        return ok({ opId: String(row["op_id"]), comando: String(row["comando"]), resultado: parseDatos<Record<string, unknown>>(row["resultado"]) });
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo buscar falló", err));
    }
  }
  async sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_recibos (tenant_id, comando, op_id, resultado, created_by)
         VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT (tenant_id, comando, op_id) DO NOTHING`,
        [tenantId, recibo.comando, recibo.opId, JSON.stringify(recibo.resultado ?? {}), actorId],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo sellar falló", err));
    }
  }
}

export class PgConsecutivoStore implements ConsecutivoPort {
  constructor(private readonly pool: Pool) {}
  async siguiente(uow: UnitOfWork, tenantId: TenantId, cfg: ConfigCodigo, _actorId: string): Promise<Result<Consecutivo, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const r = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_secuencias (tenant_id, serie, valor) VALUES ($1,$2,1)
         ON CONFLICT (tenant_id, serie)
         DO UPDATE SET valor = deltaops.abs_secuencias.valor + 1, updated_at = now()
         RETURNING valor`,
        [tenantId, cfg.serie],
      );
      const secuencia = Number(r.rows[0]?.["valor"] ?? 1);
      const relleno = String(secuencia).padStart(cfg.padding, "0");
      return ok({ valor: `${cfg.prefijo}${cfg.separador}${relleno}`, prefijo: cfg.prefijo, secuencia });
    } catch (err) {
      return fail(KernelErrors.infrastructure("consecutivo siguiente falló", err));
    }
  }
}

export class PgCatalogoStore implements CatalogoPort {
  constructor(private readonly pool: Pool) {}
  async upsert(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, entrada: EntradaCatalogo, actorId: string): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_catalogos (tenant_id, catalogo, clave, etiqueta, posicion, padre, habilitado, datos, created_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7::jsonb,$8, now())
         ON CONFLICT (tenant_id, catalogo, clave)
         DO UPDATE SET etiqueta=EXCLUDED.etiqueta, posicion=EXCLUDED.posicion, padre=EXCLUDED.padre, datos=EXCLUDED.datos, updated_at=now()`,
        [tenantId, catalogo, entrada.clave, entrada.etiqueta, entrada.posicion ?? null, entrada.padre ?? null, JSON.stringify(entrada), actorId],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo upsert falló", err));
    }
  }
  async habilitar(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, clave: string, habilitado: boolean): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const r = await pgSessionOf(uow).query(
        `UPDATE deltaops.abs_catalogos SET habilitado=$4, updated_at=now() WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`,
        [tenantId, catalogo, clave, habilitado],
      );
      if (r.rowCount === 0) return fail(KernelErrors.notFound(`catalogo:${catalogo}`, clave));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo habilitar falló", err));
    }
  }
  async opciones(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(
          `SELECT clave, etiqueta, posicion, padre FROM deltaops.abs_catalogos
           WHERE tenant_id=$1 AND catalogo=$2 AND habilitado=true ORDER BY COALESCE(posicion, 0), clave`,
          [tenantId, catalogo],
        );
        return ok(r.rows.map((x, i) => ({ value: String(x["clave"]), label: String(x["etiqueta"]), posicion: Number(x["posicion"] ?? i), padre: (x["padre"] as string | null) ?? null })));
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo opciones falló", err));
    }
  }
  async contarEntradas(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<number, KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(`SELECT count(*)::int AS n FROM deltaops.abs_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
        return ok(Number(r.rows[0]?.["n"] ?? 0));
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo contar falló", err));
    }
  }
  async validarReferencia(tenantId: TenantId, catalogo: NombreCatalogo, clave: string | null | undefined, obligatorio: boolean): Promise<Result<void, KernelError>> {
    const valor = clave ?? "";
    if (valor === "") return obligatorio ? fail(KernelErrors.validation(`La referencia a "${catalogo}" es obligatoria`)) : ok(undefined);
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const total = await c.query(`SELECT count(*)::int AS n FROM deltaops.abs_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
        if (Number(total.rows[0]?.["n"] ?? 0) === 0) {
          const canonicos = CANONICOS_POR_CATALOGO[catalogo];
          if (!canonicos || canonicos.length === 0) return ok(undefined) as Result<void, KernelError>;
          return canonicos.includes(valor) ? ok(undefined) : fail(KernelErrors.validation(`"${valor}" no es un valor canónico de "${catalogo}"`));
        }
        const e = await c.query(`SELECT habilitado FROM deltaops.abs_catalogos WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`, [tenantId, catalogo, valor]);
        const row = e.rows[0];
        if (!row) return fail(KernelErrors.validation(`"${valor}" no existe en el catálogo "${catalogo}"`));
        if (row["habilitado"] !== true) return fail(KernelErrors.validation(`"${valor}" está deshabilitado en "${catalogo}"`));
        return ok(undefined);
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo validarReferencia falló", err));
    }
  }
}

/* ==================== Dedup durable de materialización ==================== */

/**
 * Persistencia idempotente del vínculo recepción-línea → movimiento de
 * inventario. La `clave_dedup` = `${recepcionId}:${numeroLineaOC}` es ÚNICA por
 * tenant ⇒ `reservar` es idempotente (ON CONFLICT DO NOTHING). `vincular` fija
 * el movimientoId sólo si aún no está fijado (guard `movimiento_id IS NULL`):
 * `rowCount>0` ⇒ este proceso ganó; `rowCount=0` ⇒ otro proceso ya vinculó.
 */
export class PgMaterializacionStore implements MaterializacionStore {
  constructor(private readonly pool: Pool) {}

  private clave(recepcionId: string, numeroLineaOC: number): string {
    return `${recepcionId}:${numeroLineaOC}`;
  }

  async reservar(uow: UnitOfWork, tenantId: TenantId, r: RegistroMaterializacion): Promise<Result<boolean, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const clave = this.clave(r.recepcionId, r.numeroLineaOC);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_recepcion_materializaciones
           (tenant_id, id, recepcion_id, orden_compra_id, numero_linea_oc, clave_dedup, articulo_id, inventario_item_id, cantidad, movimiento_id, estado, datos, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
         ON CONFLICT (tenant_id, clave_dedup) DO NOTHING`,
        [
          tenantId, clave, r.recepcionId, r.ordenCompraId, r.numeroLineaOC, clave,
          r.articuloId, r.inventarioItemId, r.cantidad, r.movimientoId, r.estado, JSON.stringify(r),
        ],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("materializacion reservar falló", err));
    }
  }

  async vincular(uow: UnitOfWork, tenantId: TenantId, recepcionId: string, numeroLineaOC: number, movimientoId: string, estado: EstadoMaterializacion): Promise<Result<boolean, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const clave = this.clave(recepcionId, numeroLineaOC);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.abs_recepcion_materializaciones
           SET movimiento_id = $3, estado = $4, updated_at = now()
         WHERE tenant_id=$1 AND clave_dedup=$2 AND movimiento_id IS NULL`,
        [tenantId, clave, movimientoId, estado],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("materializacion vincular falló", err));
    }
  }

  async buscar(tenantId: TenantId, recepcionId: string, numeroLineaOC: number): Promise<Result<RegistroMaterializacion | null, KernelError>> {
    try {
      const clave = this.clave(recepcionId, numeroLineaOC);
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(`SELECT * FROM deltaops.abs_recepcion_materializaciones WHERE tenant_id=$1 AND clave_dedup=$2`, [tenantId, clave]);
        const row = r.rows[0];
        return ok(row ? this.toRegistro(row) : null);
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("materializacion buscar falló", err));
    }
  }

  async listPorRecepcion(tenantId: TenantId, recepcionId: string): Promise<Result<RegistroMaterializacion[], KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(`SELECT * FROM deltaops.abs_recepcion_materializaciones WHERE tenant_id=$1 AND recepcion_id=$2 ORDER BY numero_linea_oc ASC`, [tenantId, recepcionId]);
        return ok(r.rows.map((x) => this.toRegistro(x)));
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("materializacion list falló", err));
    }
  }

  private toRegistro(x: Record<string, unknown>): RegistroMaterializacion {
    return {
      recepcionId: String(x["recepcion_id"]),
      ordenCompraId: String(x["orden_compra_id"]),
      numeroLineaOC: Number(x["numero_linea_oc"]),
      articuloId: (x["articulo_id"] as string | null) ?? null,
      inventarioItemId: (x["inventario_item_id"] as string | null) ?? null,
      cantidad: Number(x["cantidad"] ?? 0),
      movimientoId: (x["movimiento_id"] as string | null) ?? null,
      estado: String(x["estado"]) as EstadoMaterializacion,
    };
  }
}
