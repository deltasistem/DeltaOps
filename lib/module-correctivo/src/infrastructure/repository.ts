/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Infraestructura de PERSISTENCIA.
 *
 * Adaptadores PostgreSQL de los PUERTOS del dominio (los Fakes en memoria viven
 * en `fakes.ts`). Los aggregates se persisten en tablas PROPIAS del módulo
 * (deltaops.cor_*), NUNCA en el Record Store (reservado a catálogos). El estado
 * completo del aggregate vive en la columna `datos` (JSONB, fuente de
 * reconstrucción); las columnas planas son sólo para filtrar/indexar. RLS por
 * tenant: escrituras con set_config vía pgSessionOf(uow); lecturas con
 * withTenantRead (transacción propia con set_config). Mismo patrón que
 * module-preventivo (0024).
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
import type { SolicitudMantenimiento } from "../domain/solicitud";
import type { Diagnostico } from "../domain/diagnostico";
import type { Intervencion } from "../domain/intervencion";
import type { GeneracionOrdenCorrectiva } from "../domain/orden-correctiva";
import type { HistorialCorrectivo } from "../domain/historial";
import type { EventoActivo } from "../domain/eventos-activo";
import type {
  CatalogoPort,
  ConfigCodigo,
  Consecutivo,
  ConsecutivoPort,
  DiagnosticoRepository,
  EventoActivoRepository,
  GeneracionDedupStore,
  GeneracionRepository,
  HistorialRepository,
  IntervencionRepository,
  OpcionCatalogo,
  Recibo,
  ReciboPort,
  SolicitudFiltro,
  SolicitudRepository,
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

/* ------------------------------- Solicitud ------------------------------- */

export class PgSolicitudRepository implements SolicitudRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, s: SolicitudMantenimiento): Promise<Result<SolicitudMantenimiento, KernelError>> {
    try {
      await setTenant(uow, s.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_solicitudes
           (tenant_id, id, codigo, titulo, origen, activo_id, prioridad, criticidad, estado, diagnostico_id, datos, version, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [s.tenantId, s.id, s.codigo, s.titulo, s.origen, s.objeto.activoId ?? null, s.prioridad, s.criticidad, s.estado, s.diagnosticoId, JSON.stringify(serializar(s)), s.version, s.createdBy],
      );
      return ok(s);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`solicitud ${s.id} ya existe (o código duplicado)`));
      return fail(KernelErrors.infrastructure("solicitud insert falló", err));
    }
  }

  async update(uow: UnitOfWork, s: SolicitudMantenimiento, expectedVersion: number): Promise<Result<SolicitudMantenimiento, KernelError>> {
    try {
      await setTenant(uow, s.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.cor_solicitudes
           SET codigo=$3, titulo=$4, origen=$5, activo_id=$6, prioridad=$7, criticidad=$8, estado=$9, diagnostico_id=$10, datos=$11, version=$12, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND version=$13`,
        [s.tenantId, s.id, s.codigo, s.titulo, s.origen, s.objeto.activoId ?? null, s.prioridad, s.criticidad, s.estado, s.diagnosticoId, JSON.stringify(serializar(s)), s.version, expectedVersion],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión de solicitud ${s.id}`));
      return ok(s);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`solicitud ${s.id} viola una restricción única`));
      return fail(KernelErrors.infrastructure("solicitud update falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<SolicitudMantenimiento | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.cor_solicitudes WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<SolicitudMantenimiento>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("solicitud findById falló", err));
    }
  }

  async list(tenantId: TenantId, filtro: SolicitudFiltro): Promise<Result<SolicitudMantenimiento[], KernelError>> {
    try {
      const conds: string[] = ["tenant_id=$1"];
      const params: unknown[] = [tenantId];
      if (filtro.estado) { params.push(filtro.estado); conds.push(`estado=$${params.length}`); }
      if (filtro.origen) { params.push(filtro.origen); conds.push(`origen=$${params.length}`); }
      if (filtro.activoId) { params.push(filtro.activoId); conds.push(`activo_id=$${params.length}`); }
      let sql = `SELECT datos FROM deltaops.cor_solicitudes WHERE ${conds.join(" AND ")} ORDER BY updated_at DESC, id ASC`;
      if (filtro.limit) { params.push(filtro.limit); sql += ` LIMIT $${params.length}`; }
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(sql, params));
      return ok(res.rows.map((r) => parseDatos<SolicitudMantenimiento>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("solicitud list falló", err));
    }
  }
}

/* ------------------------------- Diagnóstico ----------------------------- */

export class PgDiagnosticoRepository implements DiagnosticoRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, d: Diagnostico): Promise<Result<Diagnostico, KernelError>> {
    try {
      await setTenant(uow, d.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_diagnosticos
           (tenant_id, id, solicitud_id, plantilla_id, plantilla_version, causa_raiz, datos, version, registrado_por, registrado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [d.tenantId, d.id, d.solicitudId, d.plantilla.plantillaId, d.plantilla.version, d.causaRaiz, JSON.stringify(serializar(d)), d.version, d.registradoPor, d.registradoEn],
      );
      return ok(d);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`diagnóstico ${d.id} ya existe`));
      return fail(KernelErrors.infrastructure("diagnostico insert falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<Diagnostico | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.cor_diagnosticos WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<Diagnostico>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("diagnostico findById falló", err));
    }
  }

  async buscarPorSolicitud(tenantId: TenantId, solicitudId: string): Promise<Result<Diagnostico | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.cor_diagnosticos WHERE tenant_id=$1 AND solicitud_id=$2 ORDER BY registrado_en DESC, id ASC LIMIT 1`, [tenantId, solicitudId]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<Diagnostico>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("diagnostico buscarPorSolicitud falló", err));
    }
  }
}

/* ------------------------------ Intervención ----------------------------- */

export class PgIntervencionRepository implements IntervencionRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, i: Intervencion): Promise<Result<Intervencion, KernelError>> {
    try {
      await setTenant(uow, i.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_intervenciones
           (tenant_id, id, solicitud_id, orden_trabajo_id, activo_id, mayor, estado, datos, version, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [i.tenantId, i.id, i.solicitudId, i.ordenTrabajoId, i.activoId, i.mayor, i.estado, JSON.stringify(serializar(i)), i.version, i.createdBy],
      );
      return ok(i);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`intervención ${i.id} ya existe`));
      return fail(KernelErrors.infrastructure("intervencion insert falló", err));
    }
  }

  async update(uow: UnitOfWork, i: Intervencion, expectedVersion: number): Promise<Result<Intervencion, KernelError>> {
    try {
      await setTenant(uow, i.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.cor_intervenciones
           SET solicitud_id=$3, orden_trabajo_id=$4, activo_id=$5, mayor=$6, estado=$7, datos=$8, version=$9, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND version=$10`,
        [i.tenantId, i.id, i.solicitudId, i.ordenTrabajoId, i.activoId, i.mayor, i.estado, JSON.stringify(serializar(i)), i.version, expectedVersion],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión de intervención ${i.id}`));
      return ok(i);
    } catch (err) {
      return fail(KernelErrors.infrastructure("intervencion update falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<Intervencion | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.cor_intervenciones WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<Intervencion>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("intervencion findById falló", err));
    }
  }

  async buscarPorSolicitud(tenantId: TenantId, solicitudId: string): Promise<Result<Intervencion | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.cor_intervenciones WHERE tenant_id=$1 AND solicitud_id=$2 ORDER BY created_at DESC, id ASC LIMIT 1`, [tenantId, solicitudId]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<Intervencion>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("intervencion buscarPorSolicitud falló", err));
    }
  }
}

/* -------------------------------- Generación ----------------------------- */

export class PgGeneracionRepository implements GeneracionRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, g: GeneracionOrdenCorrectiva): Promise<Result<GeneracionOrdenCorrectiva, KernelError>> {
    try {
      await setTenant(uow, g.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_generaciones
           (tenant_id, id, solicitud_id, activo_id, clave_dedup, orden_trabajo_id, estado, datos, version, generada_por, generada_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [g.tenantId, g.id, g.solicitudId, g.activoId, g.claveDedup, g.ordenTrabajoId, g.estado, JSON.stringify(serializar(g)), g.version, g.generadaPor, g.generadaEn],
      );
      return ok(g);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`generación ${g.id} ya existe (o clave de dedup duplicada)`));
      return fail(KernelErrors.infrastructure("generacion insert falló", err));
    }
  }

  async update(uow: UnitOfWork, g: GeneracionOrdenCorrectiva, expectedVersion: number): Promise<Result<GeneracionOrdenCorrectiva, KernelError>> {
    try {
      await setTenant(uow, g.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.cor_generaciones
           SET orden_trabajo_id=$3, estado=$4, datos=$5, version=$6, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND version=$7`,
        [g.tenantId, g.id, g.ordenTrabajoId, g.estado, JSON.stringify(serializar(g)), g.version, expectedVersion],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión de generación ${g.id}`));
      return ok(g);
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion update falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<GeneracionOrdenCorrectiva | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.cor_generaciones WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<GeneracionOrdenCorrectiva>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion findById falló", err));
    }
  }

  async buscarPorClave(tenantId: TenantId, claveDedup: string): Promise<Result<GeneracionOrdenCorrectiva | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.cor_generaciones WHERE tenant_id=$1 AND clave_dedup=$2`, [tenantId, claveDedup]),
      );
      const r = res.rows[0];
      return ok(r ? parseDatos<GeneracionOrdenCorrectiva>(r["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("generacion buscarPorClave falló", err));
    }
  }
}

/* -------------------------------- Historial ------------------------------ */

export class PgHistorialRepository implements HistorialRepository {
  constructor(private readonly pool: Pool) {}
  private tenantDe(h: HistorialCorrectivo): string {
    // El id del historial embebe el tenant como prefijo (`${tenant}::${uuid}`).
    return h.id.split("::")[0] ?? "";
  }
  async append(uow: UnitOfWork, h: HistorialCorrectivo): Promise<Result<HistorialCorrectivo, KernelError>> {
    try {
      const tenant = this.tenantDe(h);
      await setTenant(uow, tenant);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_historial (tenant_id, id, entity_ref, hito, version, detalle, ocurrido_en, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [tenant, h.id, h.entityRef, h.hito, h.version, JSON.stringify(h.detalle ?? {}), h.ocurridoEn, h.actorId],
      );
      return ok(h);
    } catch (err) {
      return fail(KernelErrors.infrastructure("historial append falló", err));
    }
  }
  async listPorEntidad(tenantId: TenantId, entityRef: string): Promise<Result<HistorialCorrectivo[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT id, entity_ref, hito, version, detalle, ocurrido_en, actor_id FROM deltaops.cor_historial
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
        })) as HistorialCorrectivo[],
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("historial listPorEntidad falló", err));
    }
  }
}

/* ---------------------------- Eventos de activo -------------------------- */

export class PgEventoActivoRepository implements EventoActivoRepository {
  constructor(private readonly pool: Pool) {}
  async append(uow: UnitOfWork, e: EventoActivo): Promise<Result<EventoActivo, KernelError>> {
    try {
      await setTenant(uow, e.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_eventos_activo (tenant_id, id, activo_id, solicitud_id, orden_trabajo_id, tipo, modo_falla, ocurrido_en, datos, registrado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [e.tenantId, e.id, e.activoId, e.solicitudId, e.ordenTrabajoId, e.tipo, e.modoFalla, e.ocurridoEn, JSON.stringify(serializar(e)), e.registradoPor],
      );
      return ok(e);
    } catch (err) {
      return fail(KernelErrors.infrastructure("evento-activo append falló", err));
    }
  }
  async listPorActivo(tenantId: TenantId, activoId: string): Promise<Result<EventoActivo[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.cor_eventos_activo WHERE tenant_id=$1 AND activo_id=$2 ORDER BY ocurrido_en ASC, id ASC`, [tenantId, activoId]),
      );
      return ok(res.rows.map((r) => parseDatos<EventoActivo>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("evento-activo listPorActivo falló", err));
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
          `SELECT comando, op_id, resultado FROM deltaops.cor_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`,
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
        `INSERT INTO deltaops.cor_recibos (tenant_id, comando, op_id, resultado, created_by)
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
        `INSERT INTO deltaops.cor_secuencias (tenant_id, serie, valor) VALUES ($1,$2,1)
         ON CONFLICT (tenant_id, serie)
         DO UPDATE SET valor = deltaops.cor_secuencias.valor + 1, updated_at = now()
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
        `INSERT INTO deltaops.cor_catalogos (tenant_id, catalogo, clave, etiqueta, posicion, padre, habilitado, datos, created_by, updated_at)
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
        `UPDATE deltaops.cor_catalogos SET habilitado=$4, updated_at=now() WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`,
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
          `SELECT clave, etiqueta, posicion, padre FROM deltaops.cor_catalogos
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
        const r = await c.query(`SELECT count(*)::int AS n FROM deltaops.cor_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
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
        const total = await c.query(`SELECT count(*)::int AS n FROM deltaops.cor_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]);
        if (Number(total.rows[0]?.["n"] ?? 0) === 0) {
          const canonicos = CANONICOS_POR_CATALOGO[catalogo];
          if (!canonicos || canonicos.length === 0) return ok(undefined) as Result<void, KernelError>;
          return canonicos.includes(valor) ? ok(undefined) : fail(KernelErrors.validation(`"${valor}" no es un valor canónico de "${catalogo}"`));
        }
        const e = await c.query(`SELECT habilitado FROM deltaops.cor_catalogos WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`, [tenantId, catalogo, valor]);
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
        `INSERT INTO deltaops.cor_generacion_materializaciones (tenant_id, clave_dedup, generacion_id, estado, datos, updated_at)
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
        `UPDATE deltaops.cor_generacion_materializaciones
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
          `SELECT generacion_id, orden_trabajo_id FROM deltaops.cor_generacion_materializaciones WHERE tenant_id=$1 AND clave_dedup=$2`,
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
