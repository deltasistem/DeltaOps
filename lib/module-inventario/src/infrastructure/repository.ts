/**
 * DGP-011.2 · Módulo Enterprise Inventory — Infraestructura de PERSISTENCIA.
 *
 * Adaptadores PostgreSQL de los PUERTOS del dominio (los Fakes en memoria viven
 * en `fakes.ts`). El aggregate se persiste en tablas PROPIAS del módulo
 * (deltaops.inv_*), NUNCA en el Record Store (reservado a catálogos). El estado
 * completo del aggregate vive en la columna `datos` (JSONB, fuente de
 * reconstrucción); las columnas planas son sólo para filtrar/indexar. RLS por
 * tenant: escrituras con set_config vía pgSessionOf(uow); lecturas con
 * withTenantRead (transacción propia con set_config). Mismo patrón que
 * module-ordenes (0010) y module-activos (0007/0009).
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
import { crearCodigoInventario, type CodigoInventario } from "../domain/value-objects";
import type { ItemInventario } from "../domain/item";
import type { Inventario, MovimientoInventario } from "../domain/inventario";
import type { Bodega, Ubicacion } from "../domain/bodega";
import type { LoteInventario, SerieInventario } from "../domain/lote-serie";
import type { Reserva } from "../domain/reserva";
import type { Transferencia } from "../domain/transferencia";
import type { Ajuste } from "../domain/ajuste";
import type { ConteoFisico } from "../domain/conteo";
import type {
  AjusteRepository,
  BodegaRepository,
  CatalogoPort,
  ConfigCodigo,
  ConsecutivoPort,
  ConteoRepository,
  ExistenciaClave,
  InventarioRepository,
  ItemFiltro,
  ItemRepository,
  LoteSerieRepository,
  OpcionCatalogo,
  Recibo,
  ReciboPort,
  ReservaRepository,
  TenantId,
  TransferenciaRepository,
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
// Los aggregates son objetos inmutables planos (sin métodos): se serializan
// completos a `datos` (fechas → ISO) y se reconstruyen reviviendo las fechas.

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function serializar<T>(agg: T): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(agg, (_k, v) => (v instanceof Date ? v.toISOString() : v)),
  ) as Record<string, unknown>;
}

/** Revive recursivamente strings ISO-8601 a Date (reconstrucción del aggregate). */
function revivir<T>(datos: unknown): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string" && ISO_RE.test(v)) return new Date(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(datos) as T;
}

function parseDatos(v: unknown): Record<string, unknown> {
  return (typeof v === "string" ? JSON.parse(v) : (v as Record<string, unknown>)) ?? {};
}

/* =============================== Aggregates ============================== */

/**
 * Repositorio genérico JSONB por (tenant,id) con bloqueo optimista por
 * `version`. Insert traduce 23505 → conflicto; update usa WHERE version.
 */
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
      return fail(KernelErrors.infrastructure(`${this.recurso} update falló`, err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<T | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.${this.tabla} WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? revivir<T>(parseDatos(r["datos"])) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure(`${this.recurso} findById falló`, err));
    }
  }
}

export class PgItemRepository extends PgAggRepo<ItemInventario> implements ItemRepository {
  constructor(pool: Pool) {
    super(pool, "inv_items", "inventario-item", (i) => ({
      codigo: i.codigo.valor,
      sku: i.sku.valor,
      nombre: i.nombre,
      estado: i.estado,
      tipo_item: i.clasificacion.tipoItem,
      categoria: i.clasificacion.categoria,
      modo_trazabilidad: i.modoTrazabilidad,
      eliminado: i.eliminado,
      created_by: i.createdBy,
    }));
  }
  async insert(uow: UnitOfWork, item: ItemInventario) {
    // SKU único adicional (índice uq_inv_items_sku); 23505 → conflicto.
    return this.insertBase(uow, item);
  }
  async update(uow: UnitOfWork, item: ItemInventario, expectedVersion: number) {
    return this.updateBase(uow, item, expectedVersion);
  }
  async findBySku(tenantId: TenantId, sku: string): Promise<Result<ItemInventario | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.inv_items WHERE tenant_id=$1 AND lower(sku)=lower($2)`, [tenantId, sku]),
      );
      const r = res.rows[0];
      return ok(r ? revivir<ItemInventario>(parseDatos(r["datos"])) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("item findBySku falló", err));
    }
  }
  async list(tenantId: TenantId, filtro: ItemFiltro): Promise<Result<ItemInventario[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.inv_items
           WHERE tenant_id=$1
             AND ($2::boolean IS TRUE OR eliminado=false)
             AND ($3::text IS NULL OR estado=$3)
             AND ($4::text IS NULL OR tipo_item=$4)
           ORDER BY updated_at DESC, id ASC LIMIT $5`,
          [tenantId, filtro.incluirEliminados ?? false, filtro.estado ?? null, filtro.tipoItem ?? null, filtro.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => revivir<ItemInventario>(parseDatos(r["datos"]))));
    } catch (err) {
      return fail(KernelErrors.infrastructure("item list falló", err));
    }
  }
}

export class PgInventarioRepository implements InventarioRepository {
  private readonly agg: PgAggRepo<Inventario>;
  constructor(private readonly pool: Pool) {
    this.agg = new PgAggRepo<Inventario>(pool, "inv_existencias", "inventario", (inv) => ({
      item_id: inv.itemId,
      bodega_id: inv.bodegaId,
      ubicacion_id: inv.ubicacion.ubicacionId,
      lote_codigo: inv.lote?.codigo ?? null,
      serie_numero: inv.serie?.numero ?? null,
    }));
  }
  insert(uow: UnitOfWork, inv: Inventario) {
    return (this.agg as unknown as { insertBase(u: UnitOfWork, a: Inventario): Promise<Result<Inventario, KernelError>> }).insertBase(uow, inv);
  }
  update(uow: UnitOfWork, inv: Inventario, expectedVersion: number) {
    return (this.agg as unknown as { updateBase(u: UnitOfWork, a: Inventario, v: number): Promise<Result<Inventario, KernelError>> }).updateBase(uow, inv, expectedVersion);
  }
  findById(tenantId: TenantId, id: string) {
    return this.agg.findById(tenantId, id);
  }
  async findByClave(tenantId: TenantId, clave: ExistenciaClave): Promise<Result<Inventario | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.inv_existencias
           WHERE tenant_id=$1 AND item_id=$2 AND bodega_id=$3 AND ubicacion_id=$4
             AND COALESCE(lote_codigo,'')=COALESCE($5,'') AND COALESCE(serie_numero,'')=COALESCE($6,'')`,
          [tenantId, clave.itemId, clave.bodegaId, clave.ubicacionId, clave.loteCodigo, clave.serieNumero],
        ),
      );
      const r = res.rows[0];
      return ok(r ? revivir<Inventario>(parseDatos(r["datos"])) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("existencia findByClave falló", err));
    }
  }
  async listPorItem(tenantId: TenantId, itemId: string): Promise<Result<Inventario[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.inv_existencias WHERE tenant_id=$1 AND item_id=$2 ORDER BY id ASC`, [tenantId, itemId]),
      );
      return ok(res.rows.map((r) => revivir<Inventario>(parseDatos(r["datos"]))));
    } catch (err) {
      return fail(KernelErrors.infrastructure("existencia listPorItem falló", err));
    }
  }
  async registrarMovimiento(uow: UnitOfWork, mov: MovimientoInventario): Promise<Result<MovimientoInventario, KernelError>> {
    try {
      await setTenant(uow, mov.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.inv_movimientos (tenant_id, id, inventario_id, item_id, tipo, familia, datos)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [mov.tenantId, mov.id, mov.inventarioId, mov.itemId, mov.tipo, mov.familia, JSON.stringify(serializar(mov))],
      );
      return ok(mov);
    } catch (err) {
      return fail(KernelErrors.infrastructure("movimiento registrar falló", err));
    }
  }
  async movimientosDe(tenantId: TenantId, inventarioId: string): Promise<Result<MovimientoInventario[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.inv_movimientos WHERE tenant_id=$1 AND inventario_id=$2 ORDER BY created_at ASC`, [tenantId, inventarioId]),
      );
      return ok(res.rows.map((r) => revivir<MovimientoInventario>(parseDatos(r["datos"]))));
    } catch (err) {
      return fail(KernelErrors.infrastructure("movimientosDe falló", err));
    }
  }
}

export class PgBodegaRepository implements BodegaRepository {
  private readonly bodegas: PgAggRepo<Bodega>;
  private readonly ubicaciones: PgAggRepo<Ubicacion>;
  constructor(private readonly pool: Pool) {
    this.bodegas = new PgAggRepo<Bodega>(pool, "inv_bodegas", "inventario-bodega", () => ({}));
    this.ubicaciones = new PgAggRepo<Ubicacion>(pool, "inv_ubicaciones", "inventario-ubicacion", (u) => ({
      bodega_id: (u as unknown as { bodegaId?: string }).bodegaId ?? null,
    }));
  }
  insert(uow: UnitOfWork, b: Bodega) {
    return (this.bodegas as unknown as { insertBase(u: UnitOfWork, a: Bodega): Promise<Result<Bodega, KernelError>> }).insertBase(uow, b);
  }
  findById(tenantId: TenantId, id: string) {
    return this.bodegas.findById(tenantId, id);
  }
  insertUbicacion(uow: UnitOfWork, u: Ubicacion) {
    return (this.ubicaciones as unknown as { insertBase(x: UnitOfWork, a: Ubicacion): Promise<Result<Ubicacion, KernelError>> }).insertBase(uow, u);
  }
  findUbicacion(tenantId: TenantId, id: string) {
    return this.ubicaciones.findById(tenantId, id);
  }
}

export class PgLoteSerieRepository implements LoteSerieRepository {
  constructor(private readonly pool: Pool) {}
  private async upsertLote(uow: UnitOfWork, l: LoteInventario, expected: number | null): Promise<Result<LoteInventario, KernelError>> {
    try {
      await setTenant(uow, l.tenantId);
      if (expected === null) {
        await pgSessionOf(uow).query(
          `INSERT INTO deltaops.inv_lotes (tenant_id, item_id, codigo, datos, version) VALUES ($1,$2,$3,$4,$5)`,
          [l.tenantId, l.itemId, l.codigo, JSON.stringify(serializar(l)), l.version],
        );
        return ok(l);
      }
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.inv_lotes SET datos=$4, version=$5, updated_at=now() WHERE tenant_id=$1 AND item_id=$2 AND codigo=$3 AND version=$6`,
        [l.tenantId, l.itemId, l.codigo, JSON.stringify(serializar(l)), l.version, expected],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict("Conflicto de versión de lote"));
      return ok(l);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`El lote ${l.codigo} ya existe para el item`));
      return fail(KernelErrors.infrastructure("lote upsert falló", err));
    }
  }
  insertLote(uow: UnitOfWork, l: LoteInventario) { return this.upsertLote(uow, l, null); }
  updateLote(uow: UnitOfWork, l: LoteInventario, expectedVersion: number) { return this.upsertLote(uow, l, expectedVersion); }
  async findLote(tenantId: TenantId, itemId: string, codigo: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.inv_lotes WHERE tenant_id=$1 AND item_id=$2 AND codigo=$3`, [tenantId, itemId, codigo]),
      );
      const r = res.rows[0];
      return ok(r ? revivir<LoteInventario>(parseDatos(r["datos"])) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("findLote falló", err));
    }
  }
  private async upsertSerie(uow: UnitOfWork, s: SerieInventario, expected: number | null): Promise<Result<SerieInventario, KernelError>> {
    try {
      await setTenant(uow, s.tenantId);
      if (expected === null) {
        await pgSessionOf(uow).query(
          `INSERT INTO deltaops.inv_series (tenant_id, item_id, numero, datos, version) VALUES ($1,$2,$3,$4,$5)`,
          [s.tenantId, s.itemId, s.numero, JSON.stringify(serializar(s)), s.version],
        );
        return ok(s);
      }
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.inv_series SET datos=$4, version=$5, updated_at=now() WHERE tenant_id=$1 AND item_id=$2 AND numero=$3 AND version=$6`,
        [s.tenantId, s.itemId, s.numero, JSON.stringify(serializar(s)), s.version, expected],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict("Conflicto de versión de serie"));
      return ok(s);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`La serie ${s.numero} ya existe para el item`));
      return fail(KernelErrors.infrastructure("serie upsert falló", err));
    }
  }
  insertSerie(uow: UnitOfWork, s: SerieInventario) { return this.upsertSerie(uow, s, null); }
  updateSerie(uow: UnitOfWork, s: SerieInventario, expectedVersion: number) { return this.upsertSerie(uow, s, expectedVersion); }
  async findSerie(tenantId: TenantId, itemId: string, numero: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.inv_series WHERE tenant_id=$1 AND item_id=$2 AND numero=$3`, [tenantId, itemId, numero]),
      );
      const r = res.rows[0];
      return ok(r ? revivir<SerieInventario>(parseDatos(r["datos"])) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("findSerie falló", err));
    }
  }
}

export class PgReservaRepository extends PgAggRepo<Reserva> implements ReservaRepository {
  constructor(pool: Pool) { super(pool, "inv_reservas", "inventario-reserva", () => ({})); }
  insert(uow: UnitOfWork, r: Reserva) { return this.insertBase(uow, r); }
  update(uow: UnitOfWork, r: Reserva, v: number) { return this.updateBase(uow, r, v); }
}
export class PgTransferenciaRepository extends PgAggRepo<Transferencia> implements TransferenciaRepository {
  constructor(pool: Pool) { super(pool, "inv_transferencias", "inventario-transferencia", () => ({})); }
  insert(uow: UnitOfWork, t: Transferencia) { return this.insertBase(uow, t); }
  update(uow: UnitOfWork, t: Transferencia, v: number) { return this.updateBase(uow, t, v); }
}
export class PgAjusteRepository extends PgAggRepo<Ajuste> implements AjusteRepository {
  constructor(pool: Pool) { super(pool, "inv_ajustes", "inventario-ajuste", () => ({})); }
  insert(uow: UnitOfWork, a: Ajuste) { return this.insertBase(uow, a); }
  update(uow: UnitOfWork, a: Ajuste, v: number) { return this.updateBase(uow, a, v); }
}
export class PgConteoRepository extends PgAggRepo<ConteoFisico> implements ConteoRepository {
  constructor(pool: Pool) { super(pool, "inv_conteos", "inventario-conteo", () => ({})); }
  insert(uow: UnitOfWork, c: ConteoFisico) { return this.insertBase(uow, c); }
  update(uow: UnitOfWork, c: ConteoFisico, v: number) { return this.updateBase(uow, c, v); }
}

/* ==================== Adaptadores PG de puertos SOPORTE ================== */

export class PgReciboStore implements ReciboPort {
  constructor(private readonly pool: Pool) {}
  async buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(
          `SELECT comando, op_id, resultado FROM deltaops.inv_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`,
          [tenantId, comando, opId],
        );
        const row = r.rows[0];
        if (!row) return ok(null);
        return ok({ opId: String(row["op_id"]), comando: String(row["comando"]), resultado: parseDatos(row["resultado"]) });
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo buscar falló", err));
    }
  }
  async sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.inv_recibos (tenant_id, comando, op_id, resultado, created_by)
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
  async siguiente(uow: UnitOfWork, tenantId: TenantId, cfg: ConfigCodigo, _actorId: string): Promise<Result<CodigoInventario, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const r = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.inv_secuencias (tenant_id, serie, valor) VALUES ($1,$2,1)
         ON CONFLICT (tenant_id, serie)
         DO UPDATE SET valor = deltaops.inv_secuencias.valor + 1, updated_at = now()
         RETURNING valor`,
        [tenantId, cfg.serie],
      );
      const secuencia = Number(r.rows[0]?.["valor"] ?? 1);
      const relleno = String(secuencia).padStart(cfg.padding, "0");
      return crearCodigoInventario({ valor: `${cfg.prefijo}${cfg.separador}${relleno}`, prefijo: cfg.prefijo, secuencia });
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
        `INSERT INTO deltaops.inv_catalogos (tenant_id, catalogo, clave, etiqueta, posicion, padre, habilitado, datos, created_by, updated_at)
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
        `UPDATE deltaops.inv_catalogos SET habilitado=$4, updated_at=now() WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`,
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
          `SELECT clave, etiqueta, posicion, padre FROM deltaops.inv_catalogos
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
        const r = await c.query(`SELECT count(*)::int AS n FROM deltaops.inv_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
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
        const total = await c.query(`SELECT count(*)::int AS n FROM deltaops.inv_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
        if (Number(total.rows[0]?.["n"] ?? 0) === 0) {
          const canonicos = CANONICOS_POR_CATALOGO[catalogo];
          if (!canonicos || canonicos.length === 0) return ok(undefined);
          return canonicos.includes(valor) ? ok(undefined) : fail(KernelErrors.validation(`"${valor}" no es un valor canónico de "${catalogo}"`));
        }
        const e = await c.query(`SELECT habilitado FROM deltaops.inv_catalogos WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`, [tenantId, catalogo, valor]);
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
