/**
 * DGP-009.2 · Módulo Órdenes de Trabajo — Infraestructura de PERSISTENCIA.
 *
 * Puertos + adaptadores Fake (offline/pruebas) y PostgreSQL. El aggregate se
 * persiste en tablas PROPIAS del módulo (deltaops.ord_ordenes / _read /
 * _sync_receipts / _eventos), NUNCA en el Record Store (reservado a catálogos).
 * RLS por tenant: escrituras con set_config vía pgSessionOf(uow); lecturas con
 * withTenantRead (transacción propia con set_config). Mismo patrón que
 * module-activos (0007/0009).
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
import type { OrdenTrabajo } from "../domain/orden";
import type { EstadoOrdenEfectivo, ExtensionMaquina } from "../domain/maquina-estados";
import { EXTENSION_VACIA } from "../domain/maquina-estados";
import { crearCodigoOrden, type CodigoOrden } from "../domain/value-objects";
import type { EntradaCatalogo, NombreCatalogo } from "../domain/catalogos";
import { CANONICOS_POR_CATALOGO } from "../domain/catalogos";
import type {
  CatalogoPort,
  ConfigCodigo,
  ConsecutivoPort,
  OpcionCatalogo,
  OrdenFiltro,
  OrdenRepository,
  Recibo,
  ReciboClaim,
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

/* ----------------------------- Serialización ----------------------------- */

/**
 * Empaqueta el aggregate COMPLETO como `datos` (JSONB en PG). Las columnas
 * planas de la tabla son sólo para filtrar/indexar; la fuente de reconstrucción
 * es `datos`. Las fechas se serializan a ISO-8601.
 */
export function ordenADatos(o: OrdenTrabajo): Record<string, unknown> {
  return {
    codigo: o.codigo,
    titulo: o.titulo,
    descripcion: o.descripcion,
    estado: o.estado,
    tipo: o.tipo,
    categoria: o.categoria,
    prioridad: o.prioridad,
    severidad: o.severidad,
    sla: o.sla,
    activoPrincipal: o.activoPrincipal,
    activosRelacionados: o.activosRelacionados,
    responsable: o.responsable,
    supervisor: o.supervisor,
    solicitante: o.solicitante,
    empresa: o.empresa,
    proyecto: o.proyecto,
    centroCosto: o.centroCosto,
    ubicacion: o.ubicacion,
    fechas: o.fechas,
    tiempoEstimado: o.tiempoEstimado,
    tiempoReal: o.tiempoReal,
    costoEstimado: o.costoEstimado,
    costoReal: o.costoReal,
    observaciones: o.observaciones,
    diagnostico: o.diagnostico,
    riesgoImpacto: o.riesgoImpacto,
    checklist: o.checklist,
    formulario: o.formulario,
    workflow: o.workflow,
    evidencias: o.evidencias,
    createdBy: o.createdBy,
    createdAt: o.createdAt.toISOString(),
  };
}

/** Reconstruye el aggregate desde `datos` (JSONB) + columnas de control. */
export function datosAOrden(
  tenantId: string,
  id: string,
  version: number,
  updatedAt: Date,
  d: Record<string, unknown>,
): OrdenTrabajo {
  const createdAt = d["createdAt"] ? new Date(String(d["createdAt"])) : updatedAt;
  return {
    id,
    tenantId,
    codigo: d["codigo"] as CodigoOrden,
    titulo: String(d["titulo"] ?? ""),
    descripcion: String(d["descripcion"] ?? ""),
    estado: d["estado"] as EstadoOrdenEfectivo,
    tipo: String(d["tipo"] ?? ""),
    categoria: (d["categoria"] as string | null) ?? null,
    prioridad: (d["prioridad"] as string | null) ?? null,
    severidad: (d["severidad"] as string | null) ?? null,
    sla: (d["sla"] as OrdenTrabajo["sla"]) ?? null,
    activoPrincipal: (d["activoPrincipal"] as OrdenTrabajo["activoPrincipal"]) ?? null,
    activosRelacionados: (d["activosRelacionados"] as OrdenTrabajo["activosRelacionados"]) ?? [],
    responsable: (d["responsable"] as string | null) ?? null,
    supervisor: (d["supervisor"] as string | null) ?? null,
    solicitante: (d["solicitante"] as string | null) ?? null,
    empresa: (d["empresa"] as string | null) ?? null,
    proyecto: (d["proyecto"] as string | null) ?? null,
    centroCosto: (d["centroCosto"] as string | null) ?? null,
    ubicacion: (d["ubicacion"] as OrdenTrabajo["ubicacion"]) ?? null,
    fechas: d["fechas"] as OrdenTrabajo["fechas"],
    tiempoEstimado: (d["tiempoEstimado"] as OrdenTrabajo["tiempoEstimado"]) ?? null,
    tiempoReal: (d["tiempoReal"] as OrdenTrabajo["tiempoReal"]) ?? null,
    costoEstimado: (d["costoEstimado"] as OrdenTrabajo["costoEstimado"]) ?? null,
    costoReal: (d["costoReal"] as OrdenTrabajo["costoReal"]) ?? null,
    observaciones: String(d["observaciones"] ?? ""),
    diagnostico: d["diagnostico"] as OrdenTrabajo["diagnostico"],
    riesgoImpacto: (d["riesgoImpacto"] as OrdenTrabajo["riesgoImpacto"]) ?? null,
    checklist: (d["checklist"] as OrdenTrabajo["checklist"]) ?? null,
    formulario: (d["formulario"] as OrdenTrabajo["formulario"]) ?? null,
    workflow: d["workflow"] as OrdenTrabajo["workflow"],
    evidencias: (d["evidencias"] as OrdenTrabajo["evidencias"]) ?? [],
    version,
    createdBy: String(d["createdBy"] ?? ""),
    createdAt,
    updatedAt,
  };
}

const codigoDe = (o: OrdenTrabajo): string => o.codigo.valor;

/* ---------------------------- Repositorio PG ----------------------------- */

interface PgOrdenRow {
  tenant_id: string;
  id: string;
  version: number;
  updated_at: Date;
  datos: Record<string, unknown>;
}

export class PgOrdenRepository implements OrdenRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, o: OrdenTrabajo): Promise<Result<OrdenTrabajo, KernelError>> {
    try {
      await setTenant(uow, o.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_ordenes
           (tenant_id, id, codigo, titulo, estado, tipo, categoria, prioridad, severidad,
            responsable, supervisor, activo_principal_id, ubicacion_id,
            datos, version, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          o.tenantId, o.id, codigoDe(o), o.titulo, o.estado, o.tipo, o.categoria, o.prioridad, o.severidad,
          o.responsable, o.supervisor, o.activoPrincipal?.activoId ?? null, o.ubicacion?.ubicacionId ?? null,
          JSON.stringify(ordenADatos(o)), o.version, o.createdBy, o.createdAt, o.updatedAt,
        ],
      );
      return ok(o);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "23505") {
        return fail(KernelErrors.conflict(`OT duplicada (${o.id} / ${codigoDe(o)})`));
      }
      return fail(KernelErrors.infrastructure("Repository insert falló", err));
    }
  }

  async update(uow: UnitOfWork, o: OrdenTrabajo, expectedVersion: number): Promise<Result<OrdenTrabajo, KernelError>> {
    try {
      await setTenant(uow, o.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.ord_ordenes
         SET codigo=$4, titulo=$5, estado=$6, tipo=$7, categoria=$8, prioridad=$9, severidad=$10,
             responsable=$11, supervisor=$12, activo_principal_id=$13, ubicacion_id=$14,
             datos=$15, version=$16, updated_at=$17
         WHERE tenant_id=$1 AND id=$2 AND version=$3`,
        [
          o.tenantId, o.id, expectedVersion, codigoDe(o), o.titulo, o.estado, o.tipo, o.categoria, o.prioridad,
          o.severidad, o.responsable, o.supervisor, o.activoPrincipal?.activoId ?? null,
          o.ubicacion?.ubicacionId ?? null, JSON.stringify(ordenADatos(o)), o.version, o.updatedAt,
        ],
      );
      if (res.rowCount === 0) {
        return fail(KernelErrors.conflict(`Conflicto de versión en ${o.id} (esperada v${expectedVersion})`));
      }
      return ok(o);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository update falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<OrdenTrabajo | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query<PgOrdenRow>(`SELECT * FROM deltaops.ord_ordenes WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? datosAOrden(r.tenant_id, r.id, r.version, r.updated_at, r.datos) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository findById falló", err));
    }
  }

  async list(tenantId: TenantId, filtro: OrdenFiltro): Promise<Result<OrdenTrabajo[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query<PgOrdenRow>(
          `SELECT * FROM deltaops.ord_ordenes
           WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2)
           ORDER BY updated_at DESC LIMIT $3`,
          [tenantId, filtro.estado ?? null, filtro.limit ?? 100],
        ),
      );
      return ok(res.rows.map((r) => datosAOrden(r.tenant_id, r.id, r.version, r.updated_at, r.datos)));
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository list falló", err));
    }
  }
}

/* ------------------------- Repositorio Fake (memoria) -------------------- */

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const key = (t: string, id: string) => `${t}::${id}`;

/* ============================ READ MODEL (listado/detalle) =============== */

export interface OrdenReadRow {
  readonly tenantId: string;
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoOrdenEfectivo;
  readonly tipo: string;
  readonly categoria: string | null;
  readonly prioridad: string | null;
  readonly severidad: string | null;
  readonly responsable: string | null;
  readonly supervisor: string | null;
  readonly activoPrincipalId: string | null;
  readonly ubicacionId: string | null;
  readonly datos: Record<string, unknown>;
  readonly version: number;
  readonly lastEventId: string;
  readonly actualizadoAt: Date;
}

export interface OrdenReadFiltro {
  readonly estado?: string;
  readonly tipo?: string;
  readonly responsable?: string;
  readonly activoPrincipalId?: string;
  readonly limit?: number;
}

export interface OrdenReadModel {
  apply(uow: UnitOfWork, row: OrdenReadRow): Promise<Result<boolean, KernelError>>;
  /**
   * DGP-020.1 (E2E) · Refleja el RESPONSABLE (texto de presentación) en el read
   * model de listado/detalle a partir de la asignación FUERTE de persona
   * (evento operacional). Actualización DIRIGIDA que NO toca los demás campos
   * del agregado; no-op si la OT aún no está proyectada.
   */
  actualizarResponsable(uow: UnitOfWork, tenantId: string, ordenId: string, responsable: string | null): Promise<Result<boolean, KernelError>>;
  get(tenantId: string, id: string): Promise<Result<OrdenReadRow | null, KernelError>>;
  list(tenantId: string, filtro: OrdenReadFiltro): Promise<Result<OrdenReadRow[], KernelError>>;
  stats(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  lastEventId(tenantId: string): Promise<Result<string | null, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

export class FakeOrdenReadModel implements OrdenReadModel {
  private readonly rows = new Map<string, OrdenReadRow>();
  private readonly applied = new Set<string>();
  async apply(_uow: UnitOfWork, row: OrdenReadRow): Promise<Result<boolean, KernelError>> {
    if (this.applied.has(row.lastEventId)) return ok(false);
    const current = this.rows.get(key(row.tenantId, row.id));
    if (current && current.version > row.version) return ok(false);
    this.applied.add(row.lastEventId);
    this.rows.set(key(row.tenantId, row.id), row);
    return ok(true);
  }
  async actualizarResponsable(_uow: UnitOfWork, tenantId: string, ordenId: string, responsable: string | null) {
    const current = this.rows.get(key(tenantId, ordenId));
    if (!current) return ok(false); // OT aún no proyectada: no-op.
    this.rows.set(key(tenantId, ordenId), { ...current, responsable });
    return ok(true);
  }
  async get(tenantId: string, id: string) {
    return ok(this.rows.get(key(tenantId, id)) ?? null);
  }
  async list(tenantId: string, filtro: OrdenReadFiltro) {
    const all = [...this.rows.values()]
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          (!filtro.estado || r.estado === filtro.estado) &&
          (!filtro.tipo || r.tipo === filtro.tipo) &&
          (!filtro.responsable || r.responsable === filtro.responsable) &&
          (!filtro.activoPrincipalId || r.activoPrincipalId === filtro.activoPrincipalId),
      )
      .sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return ok(all.slice(0, filtro.limit ?? 100));
  }
  async stats(tenantId: string) {
    const s: Record<string, number> = {};
    for (const r of this.rows.values()) if (r.tenantId === tenantId) s[r.estado] = (s[r.estado] ?? 0) + 1;
    return ok(s);
  }
  async lastEventId(tenantId: string) {
    let latest: OrdenReadRow | null = null;
    for (const r of this.rows.values()) {
      if (r.tenantId === tenantId && (!latest || r.actualizadoAt.getTime() >= latest.actualizadoAt.getTime())) latest = r;
    }
    return ok(latest ? latest.lastEventId : null);
  }
  async clear(_uow: UnitOfWork, tenantId: string) {
    for (const [k, r] of this.rows) {
      if (r.tenantId === tenantId) {
        this.applied.delete(r.lastEventId);
        this.rows.delete(k);
      }
    }
    return ok(undefined);
  }
}

export class PgOrdenReadModel implements OrdenReadModel {
  constructor(private readonly pool: Pool) {}
  async apply(uow: UnitOfWork, row: OrdenReadRow): Promise<Result<boolean, KernelError>> {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_ordenes_read
           (tenant_id, id, codigo, titulo, estado, tipo, categoria, prioridad, severidad,
            responsable, supervisor, activo_principal_id, ubicacion_id, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (tenant_id, id) DO UPDATE
           SET codigo=EXCLUDED.codigo, titulo=EXCLUDED.titulo, estado=EXCLUDED.estado, tipo=EXCLUDED.tipo,
               categoria=EXCLUDED.categoria, prioridad=EXCLUDED.prioridad, severidad=EXCLUDED.severidad,
               responsable=EXCLUDED.responsable, supervisor=EXCLUDED.supervisor,
               activo_principal_id=EXCLUDED.activo_principal_id, ubicacion_id=EXCLUDED.ubicacion_id,
               datos=EXCLUDED.datos, version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id,
               actualizado_at=EXCLUDED.actualizado_at
           WHERE deltaops.ord_ordenes_read.last_event_id <> EXCLUDED.last_event_id
             AND deltaops.ord_ordenes_read.version <= EXCLUDED.version`,
        [
          row.tenantId, row.id, row.codigo, row.titulo, row.estado, row.tipo, row.categoria, row.prioridad,
          row.severidad, row.responsable, row.supervisor, row.activoPrincipalId, row.ubicacionId,
          JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt,
        ],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel apply falló", err));
    }
  }
  async actualizarResponsable(uow: UnitOfWork, tenantId: string, ordenId: string, responsable: string | null) {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.ord_ordenes_read SET responsable=$3 WHERE tenant_id=$1 AND id=$2`,
        [tenantId, ordenId, responsable],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel actualizarResponsable falló", err));
    }
  }
  async get(tenantId: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_ordenes_read WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? this.toRow(r) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel get falló", err));
    }
  }
  async list(tenantId: string, filtro: OrdenReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.ord_ordenes_read
           WHERE tenant_id=$1
             AND ($2::text IS NULL OR estado=$2)
             AND ($3::text IS NULL OR tipo=$3)
             AND ($4::text IS NULL OR responsable=$4)
             AND ($5::text IS NULL OR activo_principal_id=$5)
           ORDER BY actualizado_at DESC, id ASC LIMIT $6`,
          [tenantId, filtro.estado ?? null, filtro.tipo ?? null, filtro.responsable ?? null, filtro.activoPrincipalId ?? null, filtro.limit ?? 100],
        ),
      );
      return ok(res.rows.map((r) => this.toRow(r)));
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel list falló", err));
    }
  }
  async stats(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT estado, count(*)::int AS n FROM deltaops.ord_ordenes_read WHERE tenant_id=$1 GROUP BY estado`, [tenantId]),
      );
      const s: Record<string, number> = {};
      for (const r of res.rows) s[String(r.estado)] = Number(r.n);
      return ok(s);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel stats falló", err));
    }
  }
  async lastEventId(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT last_event_id FROM deltaops.ord_ordenes_read WHERE tenant_id=$1 ORDER BY actualizado_at DESC LIMIT 1`, [tenantId]),
      );
      return ok(res.rows[0] ? String(res.rows[0]["last_event_id"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel lastEventId falló", err));
    }
  }
  async clear(uow: UnitOfWork, tenantId: string) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(`DELETE FROM deltaops.ord_ordenes_read WHERE tenant_id=$1`, [tenantId]);
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel clear falló", err));
    }
  }
  private toRow(r: Record<string, unknown>): OrdenReadRow {
    const datos = typeof r["datos"] === "string" ? JSON.parse(r["datos"] as string) : (r["datos"] as Record<string, unknown>);
    return {
      tenantId: String(r["tenant_id"]),
      id: String(r["id"]),
      codigo: String(r["codigo"] ?? ""),
      titulo: String(r["titulo"] ?? ""),
      estado: r["estado"] as EstadoOrdenEfectivo,
      tipo: String(r["tipo"] ?? ""),
      categoria: (r["categoria"] as string | null) ?? null,
      prioridad: (r["prioridad"] as string | null) ?? null,
      severidad: (r["severidad"] as string | null) ?? null,
      responsable: (r["responsable"] as string | null) ?? null,
      supervisor: (r["supervisor"] as string | null) ?? null,
      activoPrincipalId: (r["activo_principal_id"] as string | null) ?? null,
      ubicacionId: (r["ubicacion_id"] as string | null) ?? null,
      datos: datos ?? {},
      version: Number(r["version"] ?? 1),
      lastEventId: String(r["last_event_id"] ?? ""),
      actualizadoAt: r["actualizado_at"] as Date,
    };
  }
}

/* =============== Adaptadores PG de puertos de SOPORTE ==================== */
// Recibos de idempotencia de comando, catálogos configurables y consecutivos.
// Los Fakes en memoria viven en `fakes.ts`; aquí están los adaptadores PG.

const RESERVADO_EXTENSION = "__extension__";

export class PgReciboStore implements ReciboPort {
  constructor(private readonly pool: Pool) {}
  async buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>> {
    return withTenantRead(this.pool, tenantId, async (c) => {
      // Sólo recibos SELLADOS cuentan como aplicación completa (los `pendiente`
      // son claims en curso, aún sin resultado).
      const r = await c.query(
        `SELECT comando, op_id, resultado FROM deltaops.ord_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3 AND estado='sellado'`,
        [tenantId, comando, opId],
      );
      const row = r.rows[0];
      if (!row) return ok(null);
      return ok({ opId: String(row["op_id"]), comando: String(row["comando"]), resultado: (row["resultado"] as Record<string, unknown>) ?? {} });
    });
  }
  async reclamar(uow: UnitOfWork, tenantId: TenantId, comando: string, opId: string, actorId: string): Promise<Result<ReciboClaim, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const c = pgSessionOf(uow);
      // Claim atómico y DURABLE: si nadie lo tenía, insertamos 'pendiente' y
      // somos dueños. Un intento concurrente con el mismo (tenant, comando,
      // op_id) se BLOQUEA en la fila hasta que ESTA transacción confirma;
      // entonces observa el conflicto (DO NOTHING ⇒ 0 filas) y NO es dueño.
      const ins = await c.query(
        `INSERT INTO deltaops.ord_recibos (tenant_id, comando, op_id, resultado, created_by, estado)
         VALUES ($1,$2,$3,'{}'::jsonb,$4,'pendiente')
         ON CONFLICT (tenant_id, comando, op_id) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        [tenantId, comando, opId, actorId],
      );
      if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true });
      // Ya reclamado (por otro): leemos el estado/resultado ya COMMITTED.
      const ex = await c.query(
        `SELECT estado, resultado FROM deltaops.ord_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`,
        [tenantId, comando, opId],
      );
      const row = ex.rows[0];
      if (row && String(row["estado"]) === "sellado") {
        return ok({ duenio: false, resultado: (row["resultado"] as Record<string, unknown>) ?? {} });
      }
      return ok({ duenio: false, pendiente: true });
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo reclamar falló", err));
    }
  }
  async sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>> {
    await setTenant(uow, tenantId);
    // Finaliza el recibo reclamado: pendiente → sellado con resultado. Si por
    // compatibilidad no existía la fila (recibo legado sin claim), la crea.
    await pgSessionOf(uow).query(
      `INSERT INTO deltaops.ord_recibos (tenant_id, comando, op_id, resultado, created_by, estado, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,'sellado',now())
       ON CONFLICT (tenant_id, comando, op_id) DO UPDATE SET
         resultado=EXCLUDED.resultado, estado='sellado', updated_at=now()
         WHERE deltaops.ord_recibos.estado <> 'sellado'`,
      [tenantId, recibo.comando, recibo.opId, JSON.stringify(recibo.resultado ?? {}), actorId],
    );
    return ok(undefined);
  }
}

export class PgConsecutivoStore implements ConsecutivoPort {
  constructor(private readonly pool: Pool) {}
  async siguiente(uow: UnitOfWork, tenantId: TenantId, cfg: ConfigCodigo, _actorId: string): Promise<Result<CodigoOrden, KernelError>> {
    await setTenant(uow, tenantId);
    const r = await pgSessionOf(uow).query(
      `INSERT INTO deltaops.ord_secuencias (tenant_id, serie, valor) VALUES ($1,$2,1)
       ON CONFLICT (tenant_id, serie)
       DO UPDATE SET valor = deltaops.ord_secuencias.valor + 1, updated_at = now()
       RETURNING valor`,
      [tenantId, cfg.serie],
    );
    const secuencia = Number(r.rows[0]?.["valor"] ?? 1);
    const relleno = String(secuencia).padStart(cfg.padding, "0");
    return crearCodigoOrden({ valor: `${cfg.prefijo}${cfg.separador}${relleno}`, prefijo: cfg.prefijo, secuencia });
  }
}

export class PgCatalogoStore implements CatalogoPort {
  constructor(private readonly pool: Pool) {}
  async upsert(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, entrada: EntradaCatalogo, actorId: string): Promise<Result<void, KernelError>> {
    await setTenant(uow, tenantId);
    await pgSessionOf(uow).query(
      `INSERT INTO deltaops.ord_catalogos (tenant_id, catalogo, clave, etiqueta, posicion, padre, habilitado, datos, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7::jsonb,$8, now())
       ON CONFLICT (tenant_id, catalogo, clave)
       DO UPDATE SET etiqueta=EXCLUDED.etiqueta, posicion=EXCLUDED.posicion, padre=EXCLUDED.padre, datos=EXCLUDED.datos, updated_at=now()`,
      [tenantId, catalogo, entrada.clave, entrada.etiqueta, entrada.posicion ?? null, entrada.padre ?? null, JSON.stringify(entrada), actorId],
    );
    return ok(undefined);
  }
  async habilitar(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, clave: string, habilitado: boolean): Promise<Result<void, KernelError>> {
    await setTenant(uow, tenantId);
    const r = await pgSessionOf(uow).query(
      `UPDATE deltaops.ord_catalogos SET habilitado=$4, updated_at=now() WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`,
      [tenantId, catalogo, clave, habilitado],
    );
    if (r.rowCount === 0) return fail(KernelErrors.notFound(`catalogo:${catalogo}`, clave));
    return ok(undefined);
  }
  async opciones(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>> {
    return withTenantRead(this.pool, tenantId, async (c) => {
      const r = await c.query(
        `SELECT clave, etiqueta, posicion, padre FROM deltaops.ord_catalogos
         WHERE tenant_id=$1 AND catalogo=$2 AND habilitado=true AND clave <> $3
         ORDER BY COALESCE(posicion, 0), clave`,
        [tenantId, catalogo, RESERVADO_EXTENSION],
      );
      return ok(r.rows.map((x, i) => ({ value: String(x["clave"]), label: String(x["etiqueta"]), posicion: Number(x["posicion"] ?? i), padre: (x["padre"] as string | null) ?? null })));
    });
  }
  async contarEntradas(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<number, KernelError>> {
    return withTenantRead(this.pool, tenantId, async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM deltaops.ord_catalogos WHERE tenant_id=$1 AND catalogo=$2 AND clave <> $3`, [tenantId, catalogo, RESERVADO_EXTENSION]);
      return ok(Number(r.rows[0]?.["n"] ?? 0));
    });
  }
  async validarReferencia(tenantId: TenantId, catalogo: NombreCatalogo, clave: string | null | undefined, obligatorio: boolean): Promise<Result<void, KernelError>> {
    const valor = clave ?? "";
    if (valor === "") return obligatorio ? fail(KernelErrors.validation(`La referencia a "${catalogo}" es obligatoria`)) : ok(undefined);
    return withTenantRead(this.pool, tenantId, async (c) => {
      const total = await c.query(`SELECT count(*)::int AS n FROM deltaops.ord_catalogos WHERE tenant_id=$1 AND catalogo=$2 AND clave <> $3`, [tenantId, catalogo, RESERVADO_EXTENSION]);
      if (Number(total.rows[0]?.["n"] ?? 0) === 0) {
        const canonicos = CANONICOS_POR_CATALOGO[catalogo];
        if (!canonicos || canonicos.length === 0) return ok(undefined);
        return canonicos.includes(valor) ? ok(undefined) : fail(KernelErrors.validation(`"${valor}" no es un valor canónico de "${catalogo}"`));
      }
      const e = await c.query(`SELECT habilitado FROM deltaops.ord_catalogos WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`, [tenantId, catalogo, valor]);
      const row = e.rows[0];
      if (!row) return fail(KernelErrors.validation(`"${valor}" no existe en el catálogo "${catalogo}"`));
      if (row["habilitado"] !== true) return fail(KernelErrors.validation(`"${valor}" está deshabilitado en "${catalogo}"`));
      return ok(undefined);
    });
  }
  async estadosDeclarados(tenantId: TenantId): Promise<Result<string[], KernelError>> {
    return withTenantRead(this.pool, tenantId, async (c) => {
      const r = await c.query(`SELECT clave FROM deltaops.ord_catalogos WHERE tenant_id=$1 AND catalogo='estados' AND habilitado=true AND clave <> $2`, [tenantId, RESERVADO_EXTENSION]);
      return ok(r.rows.map((x) => String(x["clave"])));
    });
  }
  async extensionMaquina(tenantId: TenantId): Promise<Result<ExtensionMaquina, KernelError>> {
    return withTenantRead(this.pool, tenantId, async (c) => {
      const r = await c.query(`SELECT datos FROM deltaops.ord_catalogos WHERE tenant_id=$1 AND catalogo='estados' AND clave=$2`, [tenantId, RESERVADO_EXTENSION]);
      const datos = r.rows[0]?.["datos"] as { extension?: ExtensionMaquina } | undefined;
      return ok(datos?.extension ?? EXTENSION_VACIA);
    });
  }
}
