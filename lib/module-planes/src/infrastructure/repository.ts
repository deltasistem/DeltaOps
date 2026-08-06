/**
 * DGP-012.2 · Módulo Enterprise Maintenance Plans — Infraestructura de PERSISTENCIA.
 *
 * Adaptadores PostgreSQL de los PUERTOS del dominio (los Fakes en memoria viven
 * en `fakes.ts`). Los aggregates se persisten en tablas PROPIAS del módulo
 * (deltaops.pln_*), NUNCA en el Record Store (reservado a catálogos). El estado
 * completo del aggregate vive en la columna `datos` (JSONB, fuente de
 * reconstrucción); las columnas planas son sólo para filtrar/indexar. RLS por
 * tenant: escrituras con set_config vía pgSessionOf(uow); lecturas con
 * withTenantRead (transacción propia con set_config). Mismo patrón que
 * module-inventario (0014/0015/0016).
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
import { crearCodigoPlan, type CodigoPlan } from "../domain/value-objects";
import type { PlanMantenimiento } from "../domain/plan";
import type { CalendarioOperacional } from "../domain/calendario";
import type { GeneracionOrden } from "../domain/generacion";
import type { HistorialPlan } from "../domain/suspension";
import type {
  CalendarioRepository,
  CatalogoPort,
  ConfigCodigo,
  ConsecutivoPort,
  GeneracionRepository,
  HistorialRepository,
  OpcionCatalogo,
  PlanFiltro,
  PlanRepository,
  Recibo,
  ReciboPort,
  TenantId,
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

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function serializar<T>(agg: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(agg, (_k, v) => (v instanceof Date ? v.toISOString() : v))) as Record<string, unknown>;
}

/** Los aggregates de planes usan fechas como STRINGS ISO (dominio puro): no se
 *  revive a Date; se conserva el JSON tal cual (parse). */
function parseDatos<T>(v: unknown): T {
  return ((typeof v === "string" ? JSON.parse(v) : v) ?? {}) as T;
}

void ISO_RE;

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

export class PgPlanRepository extends PgAggRepo<PlanMantenimiento> implements PlanRepository {
  constructor(pool: Pool) {
    super(pool, "pln_planes", "plan-mantenimiento", (p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      estado: p.estado,
      tipo_plan: p.tipoPlan,
      estrategia: p.estrategia,
      prioridad: p.prioridad,
      version_activa: p.versionActiva,
      created_by: p.createdBy,
    }));
  }
  insert(uow: UnitOfWork, plan: PlanMantenimiento) {
    return this.insertBase(uow, plan);
  }
  update(uow: UnitOfWork, plan: PlanMantenimiento, expectedVersion: number) {
    return this.updateBase(uow, plan, expectedVersion);
  }
  async list(tenantId: TenantId, filtro: PlanFiltro): Promise<Result<PlanMantenimiento[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.pln_planes
           WHERE tenant_id=$1
             AND ($2::text IS NULL OR estado=$2)
             AND ($3::text IS NULL OR tipo_plan=$3)
           ORDER BY updated_at DESC, id ASC LIMIT $4`,
          [tenantId, filtro.estado ?? null, filtro.tipoPlan ?? null, filtro.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => parseDatos<PlanMantenimiento>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("plan list falló", err));
    }
  }
}

export class PgCalendarioRepository extends PgAggRepo<CalendarioOperacional> implements CalendarioRepository {
  constructor(pool: Pool) {
    super(pool, "pln_calendarios", "calendario-operacional", (c) => ({
      tipo: c.tipo,
      ambito: c.ambito,
      nombre: c.nombre,
    }));
  }
  insert(uow: UnitOfWork, cal: CalendarioOperacional) {
    return this.insertBase(uow, cal);
  }
  update(uow: UnitOfWork, cal: CalendarioOperacional, expectedVersion: number) {
    return this.updateBase(uow, cal, expectedVersion);
  }
}

export class PgGeneracionRepository implements GeneracionRepository {
  constructor(private readonly pool: Pool) {}
  async insert(uow: UnitOfWork, g: GeneracionOrden): Promise<Result<GeneracionOrden, KernelError>> {
    try {
      await setTenant(uow, g.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.pln_generaciones
           (tenant_id, id, plan_id, version, activo_id, ocurrencia, clave_dedup, origen, fecha_objetivo, orden_trabajo_id, datos, generada_por, generada_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          g.tenantId, g.id, g.planId, g.version, g.activoId, g.ocurrencia, g.claveDedup, g.origen,
          g.fechaObjetivo, g.ordenTrabajoId, JSON.stringify(serializar(g)), g.generadaPor, g.generadaEn,
        ],
      );
      return ok(g);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return fail(KernelErrors.conflict(`Ya existe una generación con clave ${g.claveDedup}`, { claveDedup: g.claveDedup }));
      }
      return fail(KernelErrors.infrastructure("generacion insert falló", err));
    }
  }
  async findByClaveDedup(tenantId: TenantId, claveDedup: string): Promise<Result<GeneracionOrden | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.pln_generaciones WHERE tenant_id=$1 AND clave_dedup=$2`, [tenantId, claveDedup]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<GeneracionOrden>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion findByClaveDedup falló", err));
    }
  }
  async listPorPlan(tenantId: TenantId, planId: string): Promise<Result<GeneracionOrden[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.pln_generaciones WHERE tenant_id=$1 AND plan_id=$2 ORDER BY generada_en ASC, id ASC`, [tenantId, planId]),
      );
      return ok(res.rows.map((r) => parseDatos<GeneracionOrden>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion listPorPlan falló", err));
    }
  }
  async linkOrden(uow: UnitOfWork, tenantId: TenantId, generacionId: string, ordenTrabajoId: string): Promise<Result<boolean, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      // Idempotente + guarda de concurrencia: sólo vincula si aún NO tiene OT.
      // Actualiza la columna y el snapshot `datos` (estado=materializada) en un
      // solo UPDATE atómico. `rowCount>0` ⇒ vínculo aplicado por ESTA operación.
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.pln_generaciones
           SET orden_trabajo_id=$3,
               datos = jsonb_set(jsonb_set(datos, '{ordenTrabajoId}', to_jsonb($3::text)), '{estado}', '"materializada"')
         WHERE tenant_id=$1 AND id=$2 AND orden_trabajo_id IS NULL`,
        [tenantId, generacionId, ordenTrabajoId],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion linkOrden falló", err));
    }
  }
}

export class PgHistorialRepository implements HistorialRepository {
  constructor(private readonly pool: Pool) {}
  private tenantDe(h: HistorialPlan): string {
    // El id del historial embebe el tenant como prefijo (`${tenant}::${uuid}`).
    return h.id.split("::")[0] ?? "";
  }
  async append(uow: UnitOfWork, h: HistorialPlan): Promise<Result<HistorialPlan, KernelError>> {
    try {
      const tenant = this.tenantDe(h);
      await setTenant(uow, tenant);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.pln_historial (tenant_id, id, plan_id, hito, version, detalle, ocurrido_en, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [tenant, h.id, h.planId, h.hito, h.version, JSON.stringify(h.detalle ?? {}), h.ocurridoEn, h.actorId],
      );
      return ok(h);
    } catch (err) {
      return fail(KernelErrors.infrastructure("historial append falló", err));
    }
  }
  async listPorPlan(tenantId: TenantId, planId: string): Promise<Result<HistorialPlan[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT id, plan_id, hito, version, detalle, ocurrido_en, actor_id FROM deltaops.pln_historial
           WHERE tenant_id=$1 AND plan_id=$2 ORDER BY ocurrido_en ASC, id ASC`,
          [tenantId, planId],
        ),
      );
      return ok(
        res.rows.map((r) => ({
          id: String(r["id"]),
          planId: String(r["plan_id"]),
          hito: String(r["hito"]),
          version: Number(r["version"] ?? 0),
          detalle: parseDatos<Record<string, unknown>>(r["detalle"]),
          ocurridoEn: (r["ocurrido_en"] as Date).toISOString(),
          actorId: String(r["actor_id"]),
        })) as HistorialPlan[],
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("historial listPorPlan falló", err));
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
          `SELECT comando, op_id, resultado FROM deltaops.pln_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`,
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
        `INSERT INTO deltaops.pln_recibos (tenant_id, comando, op_id, resultado, created_by)
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
  async siguiente(uow: UnitOfWork, tenantId: TenantId, cfg: ConfigCodigo, _actorId: string): Promise<Result<CodigoPlan, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const r = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.pln_secuencias (tenant_id, serie, valor) VALUES ($1,$2,1)
         ON CONFLICT (tenant_id, serie)
         DO UPDATE SET valor = deltaops.pln_secuencias.valor + 1, updated_at = now()
         RETURNING valor`,
        [tenantId, cfg.serie],
      );
      const secuencia = Number(r.rows[0]?.["valor"] ?? 1);
      const relleno = String(secuencia).padStart(cfg.padding, "0");
      return crearCodigoPlan({ valor: `${cfg.prefijo}${cfg.separador}${relleno}`, prefijo: cfg.prefijo, secuencia });
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
        `INSERT INTO deltaops.pln_catalogos (tenant_id, catalogo, clave, etiqueta, posicion, padre, habilitado, datos, created_by, updated_at)
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
        `UPDATE deltaops.pln_catalogos SET habilitado=$4, updated_at=now() WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`,
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
          `SELECT clave, etiqueta, posicion, padre FROM deltaops.pln_catalogos
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
        const r = await c.query(`SELECT count(*)::int AS n FROM deltaops.pln_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
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
        const total = await c.query(`SELECT count(*)::int AS n FROM deltaops.pln_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
        if (Number(total.rows[0]?.["n"] ?? 0) === 0) {
          const canonicos = CANONICOS_POR_CATALOGO[catalogo];
          if (!canonicos || canonicos.length === 0) return ok(undefined) as Result<void, KernelError>;
          return canonicos.includes(valor) ? ok(undefined) : fail(KernelErrors.validation(`"${valor}" no es un valor canónico de "${catalogo}"`));
        }
        const e = await c.query(`SELECT habilitado FROM deltaops.pln_catalogos WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`, [tenantId, catalogo, valor]);
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
