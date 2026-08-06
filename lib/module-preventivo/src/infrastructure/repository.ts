/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Infraestructura de PERSISTENCIA.
 *
 * Adaptadores PostgreSQL de los PUERTOS del dominio (los Fakes en memoria viven
 * en `fakes.ts`). Los aggregates se persisten en tablas PROPIAS del módulo
 * (deltaops.prv_*), NUNCA en el Record Store (reservado a catálogos). El estado
 * completo del aggregate vive en la columna `datos` (JSONB, fuente de
 * reconstrucción); las columnas planas son sólo para filtrar/indexar. RLS por
 * tenant: escrituras con set_config vía pgSessionOf(uow); lecturas con
 * withTenantRead (transacción propia con set_config). Mismo patrón que
 * module-abastecimiento (0021) y module-planes (0018).
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
import type { ProgramaPreventivo } from "../domain/programa";
import type { ActividadPreventiva } from "../domain/actividad";
import type { GeneracionPreventiva } from "../domain/generacion";
import type { HistorialPreventivo } from "../domain/historial";
import type {
  ActividadRepository,
  CatalogoPort,
  ConfigCodigo,
  Consecutivo,
  ConsecutivoPort,
  GeneracionDedupStore,
  GeneracionRepository,
  HistorialRepository,
  OpcionCatalogo,
  ProgramaFiltro,
  ProgramaRepository,
  ProgramaVersionRepository,
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

function serializar<T>(agg: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(agg, (_k, v) => (v instanceof Date ? v.toISOString() : v))) as Record<string, unknown>;
}

/** Los aggregates usan fechas como STRINGS ISO (dominio puro): no se revive a
 *  Date; se conserva el JSON tal cual (parse). */
function parseDatos<T>(v: unknown): T {
  return ((typeof v === "string" ? JSON.parse(v) : v) ?? {}) as T;
}

/* =============================== Aggregates ============================== */

/* ------------------------------- Programa -------------------------------- */

export class PgProgramaRepository implements ProgramaRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, p: ProgramaPreventivo): Promise<Result<ProgramaPreventivo, KernelError>> {
    try {
      await setTenant(uow, p.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_programas
           (tenant_id, id, codigo, nombre, tipo, clasificacion, padre_id, estado, version_programa, datos, version, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [p.tenantId, p.id, p.codigo, p.nombre, p.tipo, p.clasificacion, p.padreId, p.estado, p.versionPrograma, JSON.stringify(serializar(p)), p.version, p.createdBy],
      );
      return ok(p);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`programa ${p.id} ya existe (o código duplicado)`));
      return fail(KernelErrors.infrastructure("programa insert falló", err));
    }
  }

  async update(uow: UnitOfWork, p: ProgramaPreventivo, expectedVersion: number): Promise<Result<ProgramaPreventivo, KernelError>> {
    try {
      await setTenant(uow, p.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.prv_programas
           SET codigo=$3, nombre=$4, tipo=$5, clasificacion=$6, padre_id=$7, estado=$8, version_programa=$9, datos=$10, version=$11, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND version=$12`,
        [p.tenantId, p.id, p.codigo, p.nombre, p.tipo, p.clasificacion, p.padreId, p.estado, p.versionPrograma, JSON.stringify(serializar(p)), p.version, expectedVersion],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión de programa ${p.id}`));
      return ok(p);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`programa ${p.id} viola una restricción única`));
      return fail(KernelErrors.infrastructure("programa update falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<ProgramaPreventivo | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.prv_programas WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<ProgramaPreventivo>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("programa findById falló", err));
    }
  }

  async list(tenantId: TenantId, filtro: ProgramaFiltro): Promise<Result<ProgramaPreventivo[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.prv_programas
           WHERE tenant_id=$1
             AND ($2::text IS NULL OR estado=$2)
             AND ($3::text IS NULL OR tipo=$3)
           ORDER BY updated_at DESC, id ASC LIMIT $4`,
          [tenantId, filtro.estado ?? null, filtro.tipo ?? null, filtro.limit ?? 200],
        ),
      );
      let rows = res.rows.map((r) => parseDatos<ProgramaPreventivo>(r["datos"]));
      if (filtro.padreId !== undefined) rows = rows.filter((p) => p.padreId === filtro.padreId);
      return ok(rows);
    } catch (err) {
      return fail(KernelErrors.infrastructure("programa list falló", err));
    }
  }

  async mapaPadres(tenantId: TenantId): Promise<Result<Map<string, string | null>, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT id, padre_id FROM deltaops.prv_programas WHERE tenant_id=$1`, [tenantId]),
      );
      const m = new Map<string, string | null>();
      for (const r of res.rows) m.set(String(r["id"]), (r["padre_id"] as string | null) ?? null);
      return ok(m);
    } catch (err) {
      return fail(KernelErrors.infrastructure("programa mapaPadres falló", err));
    }
  }
}

/* --------------------------- Versiones históricas ------------------------ */

export class PgProgramaVersionRepository implements ProgramaVersionRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(uow: UnitOfWork, p: ProgramaPreventivo): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, p.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_programa_versiones (tenant_id, programa_id, version_programa, datos)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (tenant_id, programa_id, version_programa) DO UPDATE SET datos=EXCLUDED.datos`,
        [p.tenantId, p.id, p.versionPrograma, JSON.stringify(serializar(p))],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("programa version guardar falló", err));
    }
  }

  async buscarVersion(tenantId: TenantId, programaId: string, versionPrograma: number): Promise<Result<ProgramaPreventivo | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.prv_programa_versiones WHERE tenant_id=$1 AND programa_id=$2 AND version_programa=$3`, [tenantId, programaId, versionPrograma]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<ProgramaPreventivo>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("programa version buscar falló", err));
    }
  }

  async listarVersiones(tenantId: TenantId, programaId: string): Promise<Result<ProgramaPreventivo[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.prv_programa_versiones WHERE tenant_id=$1 AND programa_id=$2 ORDER BY version_programa ASC`, [tenantId, programaId]),
      );
      return ok(res.rows.map((r) => parseDatos<ProgramaPreventivo>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("programa version listar falló", err));
    }
  }
}

/* ------------------------------- Actividad ------------------------------- */

export class PgActividadRepository implements ActividadRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, a: ActividadPreventiva): Promise<Result<ActividadPreventiva, KernelError>> {
    try {
      await setTenant(uow, a.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_actividades (tenant_id, id, programa_id, nombre, orden, moneda, datos, version, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [a.tenantId, a.id, a.programaId, a.nombre, a.orden, a.moneda, JSON.stringify(serializar(a)), a.version, a.createdBy],
      );
      return ok(a);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`actividad ${a.id} ya existe`));
      return fail(KernelErrors.infrastructure("actividad insert falló", err));
    }
  }

  async update(uow: UnitOfWork, a: ActividadPreventiva, expectedVersion: number): Promise<Result<ActividadPreventiva, KernelError>> {
    try {
      await setTenant(uow, a.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.prv_actividades SET nombre=$3, orden=$4, moneda=$5, datos=$6, version=$7, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND version=$8`,
        [a.tenantId, a.id, a.nombre, a.orden, a.moneda, JSON.stringify(serializar(a)), a.version, expectedVersion],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión de actividad ${a.id}`));
      return ok(a);
    } catch (err) {
      return fail(KernelErrors.infrastructure("actividad update falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<ActividadPreventiva | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.prv_actividades WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<ActividadPreventiva>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("actividad findById falló", err));
    }
  }

  async listPorPrograma(tenantId: TenantId, programaId: string): Promise<Result<ActividadPreventiva[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.prv_actividades WHERE tenant_id=$1 AND programa_id=$2 ORDER BY orden ASC, id ASC`, [tenantId, programaId]),
      );
      return ok(res.rows.map((r) => parseDatos<ActividadPreventiva>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("actividad listPorPrograma falló", err));
    }
  }
}

/* ------------------------------- Generación ------------------------------ */

export class PgGeneracionRepository implements GeneracionRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, g: GeneracionPreventiva): Promise<Result<GeneracionPreventiva, KernelError>> {
    try {
      await setTenant(uow, g.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_generaciones
           (tenant_id, id, programa_id, actividad_id, activo_id, ventana, clave_dedup, origen, fecha_objetivo, orden_trabajo_id, estado, datos, version, generada_por, generada_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [g.tenantId, g.id, g.programaId, g.actividadId, g.activoId, g.ventana, g.claveDedup, g.origen, g.fechaObjetivo, g.ordenTrabajoId, g.estado, JSON.stringify(serializar(g)), g.version, g.generadaPor, g.generadaEn],
      );
      return ok(g);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`generación ${g.claveDedup} ya existe`));
      return fail(KernelErrors.infrastructure("generacion insert falló", err));
    }
  }

  async update(uow: UnitOfWork, g: GeneracionPreventiva, expectedVersion: number): Promise<Result<GeneracionPreventiva, KernelError>> {
    try {
      await setTenant(uow, g.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.prv_generaciones SET orden_trabajo_id=$3, estado=$4, datos=$5, version=$6, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND version=$7`,
        [g.tenantId, g.id, g.ordenTrabajoId, g.estado, JSON.stringify(serializar(g)), g.version, expectedVersion],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión de generación ${g.id}`));
      return ok(g);
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion update falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<GeneracionPreventiva | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.prv_generaciones WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<GeneracionPreventiva>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion findById falló", err));
    }
  }

  async buscarPorClave(tenantId: TenantId, claveDedup: string): Promise<Result<GeneracionPreventiva | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.prv_generaciones WHERE tenant_id=$1 AND clave_dedup=$2`, [tenantId, claveDedup]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<GeneracionPreventiva>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion buscarPorClave falló", err));
    }
  }

  async listPorPrograma(tenantId: TenantId, programaId: string): Promise<Result<GeneracionPreventiva[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.prv_generaciones WHERE tenant_id=$1 AND programa_id=$2 ORDER BY generada_en ASC, id ASC`, [tenantId, programaId]),
      );
      return ok(res.rows.map((r) => parseDatos<GeneracionPreventiva>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion listPorPrograma falló", err));
    }
  }
}

/* -------------------------------- Historial ------------------------------ */

export class PgHistorialRepository implements HistorialRepository {
  constructor(private readonly pool: Pool) {}
  private tenantDe(h: HistorialPreventivo): string {
    // El id del historial embebe el tenant como prefijo (`${tenant}::${uuid}`).
    return h.id.split("::")[0] ?? "";
  }
  async append(uow: UnitOfWork, h: HistorialPreventivo): Promise<Result<HistorialPreventivo, KernelError>> {
    try {
      const tenant = this.tenantDe(h);
      await setTenant(uow, tenant);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_historial (tenant_id, id, entity_ref, hito, version, detalle, ocurrido_en, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [tenant, h.id, h.entityRef, h.hito, h.version, JSON.stringify(h.detalle ?? {}), h.ocurridoEn, h.actorId],
      );
      return ok(h);
    } catch (err) {
      return fail(KernelErrors.infrastructure("historial append falló", err));
    }
  }
  async listPorEntidad(tenantId: TenantId, entityRef: string): Promise<Result<HistorialPreventivo[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT id, entity_ref, hito, version, detalle, ocurrido_en, actor_id FROM deltaops.prv_historial
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
        })) as HistorialPreventivo[],
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
          `SELECT comando, op_id, resultado FROM deltaops.prv_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`,
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
        `INSERT INTO deltaops.prv_recibos (tenant_id, comando, op_id, resultado, created_by)
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
        `INSERT INTO deltaops.prv_secuencias (tenant_id, serie, valor) VALUES ($1,$2,1)
         ON CONFLICT (tenant_id, serie)
         DO UPDATE SET valor = deltaops.prv_secuencias.valor + 1, updated_at = now()
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
        `INSERT INTO deltaops.prv_catalogos (tenant_id, catalogo, clave, etiqueta, posicion, padre, habilitado, datos, created_by, updated_at)
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
        `UPDATE deltaops.prv_catalogos SET habilitado=$4, updated_at=now() WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`,
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
          `SELECT clave, etiqueta, posicion, padre FROM deltaops.prv_catalogos
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
        const r = await c.query(`SELECT count(*)::int AS n FROM deltaops.prv_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
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
        const total = await c.query(`SELECT count(*)::int AS n FROM deltaops.prv_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
        if (Number(total.rows[0]?.["n"] ?? 0) === 0) {
          const canonicos = CANONICOS_POR_CATALOGO[catalogo];
          if (!canonicos || canonicos.length === 0) return ok(undefined) as Result<void, KernelError>;
          return canonicos.includes(valor) ? ok(undefined) : fail(KernelErrors.validation(`"${valor}" no es un valor canónico de "${catalogo}"`));
        }
        const e = await c.query(`SELECT habilitado FROM deltaops.prv_catalogos WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`, [tenantId, catalogo, valor]);
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

/* ==================== Dedup durable de generación → OT =================== */

/**
 * Persistencia idempotente del guard anti-duplicado por `claveDedup`. La clave
 * es ÚNICA por tenant (PK) ⇒ `reservar` es idempotente (ON CONFLICT DO NOTHING):
 * `rowCount>0` ⇒ este proceso ganó; `rowCount=0` ⇒ otra generación ya existe
 * (no-dupe). `vincular` fija el ordenTrabajoId sólo si aún no está fijado (guard
 * `orden_trabajo_id IS NULL`): `rowCount>0` ⇒ este proceso ganó el vínculo.
 */
export class PgGeneracionDedupStore implements GeneracionDedupStore {
  constructor(private readonly pool: Pool) {}

  async reservar(uow: UnitOfWork, tenantId: TenantId, claveDedup: string, generacionId: string): Promise<Result<boolean, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_generacion_materializaciones (tenant_id, clave_dedup, generacion_id, estado, datos, updated_at)
         VALUES ($1,$2,$3,'pendiente',$4::jsonb, now())
         ON CONFLICT (tenant_id, clave_dedup) DO NOTHING`,
        [tenantId, claveDedup, generacionId, JSON.stringify({ generacionId })],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("dedup reservar falló", err));
    }
  }

  async vincular(uow: UnitOfWork, tenantId: TenantId, claveDedup: string, ordenTrabajoId: string): Promise<Result<boolean, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.prv_generacion_materializaciones
           SET orden_trabajo_id=$3, estado='materializada', updated_at=now()
         WHERE tenant_id=$1 AND clave_dedup=$2 AND orden_trabajo_id IS NULL`,
        [tenantId, claveDedup, ordenTrabajoId],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("dedup vincular falló", err));
    }
  }

  async buscar(tenantId: TenantId, claveDedup: string): Promise<Result<{ generacionId: string; ordenTrabajoId: string | null } | null, KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(
          `SELECT generacion_id, orden_trabajo_id FROM deltaops.prv_generacion_materializaciones WHERE tenant_id=$1 AND clave_dedup=$2`,
          [tenantId, claveDedup],
        );
        const row = r.rows[0];
        return ok(row ? { generacionId: String(row["generacion_id"]), ordenTrabajoId: (row["orden_trabajo_id"] as string | null) ?? null } : null);
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("dedup buscar falló", err));
    }
  }
}
