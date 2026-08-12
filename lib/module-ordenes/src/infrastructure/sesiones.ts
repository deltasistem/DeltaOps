/**
 * DGP-020.2 · Módulo Órdenes de Trabajo — Infraestructura de SESIONES DE TRABAJO.
 *
 * Puerto + adaptadores (Fake/PG) para:
 *  - la CABECERA de sesión (`ord_sesiones`, fuente de verdad del estado),
 *  - los TRAMOS APPEND-ONLY (`ord_sesion_tramos`, fuente de verdad de la
 *    duración; sólo INSERT, jamás UPDATE),
 *  - los READ MODELS CQRS (`ord_sesiones_read`, `ord_sesion_tramos_read`,
 *    `ord_sesion_duraciones_read`), proyectados SÓLO desde el payload de eventos.
 *
 * INVARIANTE DURABLE (§16): una sola sesión NO cerrada por (tenant, OT,
 * identidad). Se garantiza con el índice único parcial `uq_ord_sesiones_abierta`;
 * la carrera concurrente de dos aperturas la RESUELVE la base (violación de
 * unicidad ⇒ conflicto de negocio determinista), no la aplicación.
 *
 * RLS por tenant en TODAS las tablas (escritura via `setTenant`; lectura via
 * `withTenantRead`). NUNCA relee el workflow/bitácora/Timeline.
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
import { setTenant, withTenantRead } from "./repository";
import type { AnomaliaReloj, EstadoSesion, OrigenTramo, TipoTramo } from "../domain/sesion";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/* -------------------------------- Modelos -------------------------------- */

/** Cabecera de sesión (fuente de verdad del estado). */
export interface SesionCabecera {
  readonly id: string;
  readonly ordenId: string;
  readonly activoId: string | null;
  readonly identityId: string;
  readonly estado: EstadoSesion;
  readonly origen: string;
  readonly iniciadoAt: Date;
  readonly cerradoAt: Date | null;
  readonly registradoAt: Date;
  readonly actualizadoAt: Date;
  readonly opId: string | null;
}

/** Tramo append-only (fuente de verdad de la duración). */
export interface TramoFila {
  readonly sesionId: string;
  readonly secuencia: number;
  readonly tipo: TipoTramo;
  readonly origen: OrigenTramo;
  readonly ocurridoAt: Date;
  readonly registradoAt: Date;
  readonly anomaliaReloj: AnomaliaReloj | null;
  readonly identityId: string;
  readonly opId: string | null;
  readonly eventId: string;
}

/* --------------------------- Filas de read model ------------------------- */

export interface SesionReadRow {
  readonly id: string;
  readonly ordenId: string;
  readonly activoId: string | null;
  readonly identityId: string;
  readonly estado: string;
  readonly origen: string;
  readonly iniciadoAt: Date;
  readonly cerradoAt: Date | null;
  readonly registradoAt: Date;
  readonly lastEventId: string;
  readonly actualizadoAt: Date;
}

export interface TramoReadRow {
  readonly eventId: string;
  readonly sesionId: string;
  readonly ordenId: string;
  readonly secuencia: number;
  readonly tipo: string;
  readonly origen: string;
  readonly ocurridoAt: Date;
  readonly registradoAt: Date;
  readonly anomaliaReloj: AnomaliaReloj | null;
  readonly identityId: string;
}

export interface DuracionesReadRow {
  readonly sesionId: string;
  readonly ordenId: string;
  readonly activoId: string | null;
  readonly identityId: string;
  readonly estado: string;
  readonly efectivoMs: number;
  readonly pausadoMs: number;
  readonly transcurridoMs: number;
  readonly pausas: number;
  readonly abierta: boolean;
  readonly iniciadoAt: Date;
  readonly cerradoAt: Date | null;
  readonly lastEventId: string;
  readonly actualizadoAt: Date;
}

/* --------------------------------- Puerto -------------------------------- */

export interface SesionStore {
  /* --- Fuente de verdad (escritura durable, dentro de la UoW del comando) --- */
  /**
   * Inserta la cabecera de una sesión ABIERTA. El índice único parcial garantiza
   * que NO exista otra no cerrada para (tenant, OT, identidad); una violación de
   * unicidad ⇒ conflicto de NEGOCIO determinista.
   */
  abrirCabecera(uow: UnitOfWork, tenantId: string, s: SesionCabecera): Promise<Result<void, KernelError>>;
  /** Actualiza estado/cerradoAt/actualizadoAt de una sesión existente. */
  actualizarCabecera(
    uow: UnitOfWork,
    tenantId: string,
    id: string,
    cambios: { estado: EstadoSesion; cerradoAt: Date | null; actualizadoAt: Date },
  ): Promise<Result<void, KernelError>>;
  /** Añade un tramo APPEND-ONLY (sólo INSERT). */
  agregarTramo(uow: UnitOfWork, tenantId: string, t: TramoFila): Promise<Result<void, KernelError>>;

  /* ------------------------------ Lecturas -------------------------------- */
  getCabecera(tenantId: string, id: string): Promise<Result<SesionCabecera | null, KernelError>>;
  /** Sesión NO cerrada (ABIERTA|PAUSADA) para (OT, identidad), o null. */
  getAbierta(tenantId: string, ordenId: string, identityId: string): Promise<Result<SesionCabecera | null, KernelError>>;
  /** Tramos de una sesión ORDENADOS por secuencia asc (para recomputar duración). */
  tramosDe(tenantId: string, sesionId: string): Promise<Result<TramoFila[], KernelError>>;

  /* --------------------- Proyección CQRS (payload-only) ------------------- */
  aplicarSesionRead(uow: UnitOfWork, tenantId: string, row: SesionReadRow): Promise<Result<void, KernelError>>;
  aplicarTramoRead(uow: UnitOfWork, tenantId: string, row: TramoReadRow): Promise<Result<void, KernelError>>;
  aplicarDuracionesRead(uow: UnitOfWork, tenantId: string, row: DuracionesReadRow): Promise<Result<void, KernelError>>;

  /* ------------------------- Consultas de read model ---------------------- */
  sesionActiva(tenantId: string, ordenId: string, identityId: string | null): Promise<Result<SesionReadRow | null, KernelError>>;
  sesionesPorOrden(tenantId: string, ordenId: string): Promise<Result<SesionReadRow[], KernelError>>;
  sesionesPorIdentidad(tenantId: string, identityId: string): Promise<Result<SesionReadRow[], KernelError>>;
  sesionesPorActivo(tenantId: string, activoId: string): Promise<Result<SesionReadRow[], KernelError>>;
  tramosRead(tenantId: string, sesionId: string): Promise<Result<TramoReadRow[], KernelError>>;
  duracionesDeSesion(tenantId: string, sesionId: string): Promise<Result<DuracionesReadRow | null, KernelError>>;
  duracionesPorOrden(tenantId: string, ordenId: string): Promise<Result<DuracionesReadRow[], KernelError>>;

  /* --------------------------- Replay / pruebas --------------------------- */
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
  contar(tenantId: string): Promise<Result<{ sesiones: number; tramos: number }, KernelError>>;
}

/* =============================== Fake (memoria) ========================== */

export class FakeSesionStore implements SesionStore {
  private readonly cab = new Map<string, SesionCabecera>();
  private readonly tramos = new Map<string, TramoFila[]>();
  private readonly sesRead = new Map<string, SesionReadRow & { tenantId: string }>();
  private readonly tramoRead = new Map<string, TramoReadRow & { tenantId: string; sesionId: string }>();
  private readonly durRead = new Map<string, DuracionesReadRow & { tenantId: string }>();
  private k(t: string, id: string) { return `${t}::${id}`; }

  async abrirCabecera(_u: UnitOfWork, t: string, s: SesionCabecera) {
    // Invariante §16: no dos NO cerradas por (tenant, OT, identidad).
    for (const [k, c] of this.cab) {
      if (k.startsWith(`${t}::`) && c.ordenId === s.ordenId && c.identityId === s.identityId && c.estado !== "CERRADA") {
        return fail(KernelErrors.conflict(`Ya existe una sesión abierta para la OT ${s.ordenId} y la identidad ${s.identityId}`));
      }
    }
    if (this.cab.has(this.k(t, s.id))) return fail(KernelErrors.conflict(`Sesión ${s.id} ya existe`));
    this.cab.set(this.k(t, s.id), clone(s));
    this.tramos.set(this.k(t, s.id), []);
    return ok(undefined);
  }
  async actualizarCabecera(_u: UnitOfWork, t: string, id: string, c: { estado: EstadoSesion; cerradoAt: Date | null; actualizadoAt: Date }) {
    const cur = this.cab.get(this.k(t, id));
    if (!cur) return fail(KernelErrors.notFound("sesion", id));
    this.cab.set(this.k(t, id), { ...cur, estado: c.estado, cerradoAt: c.cerradoAt, actualizadoAt: c.actualizadoAt });
    return ok(undefined);
  }
  async agregarTramo(_u: UnitOfWork, t: string, tr: TramoFila) {
    const arr = this.tramos.get(this.k(t, tr.sesionId)) ?? [];
    if (arr.some((x) => x.secuencia === tr.secuencia)) return fail(KernelErrors.conflict(`Tramo ${tr.secuencia} ya existe en la sesión ${tr.sesionId}`));
    arr.push(clone(tr));
    this.tramos.set(this.k(t, tr.sesionId), arr);
    return ok(undefined);
  }
  async getCabecera(t: string, id: string) { return ok(this.cab.get(this.k(t, id)) ? clone(this.cab.get(this.k(t, id))!) : null); }
  async getAbierta(t: string, ordenId: string, identityId: string) {
    for (const [k, c] of this.cab) {
      if (k.startsWith(`${t}::`) && c.ordenId === ordenId && c.identityId === identityId && c.estado !== "CERRADA") return ok(clone(c));
    }
    return ok(null);
  }
  async tramosDe(t: string, sesionId: string) {
    const arr = [...(this.tramos.get(this.k(t, sesionId)) ?? [])].sort((a, b) => a.secuencia - b.secuencia);
    return ok(arr.map(clone));
  }
  async aplicarSesionRead(_u: UnitOfWork, t: string, row: SesionReadRow) {
    this.sesRead.set(this.k(t, row.id), { ...clone(row), tenantId: t });
    return ok(undefined);
  }
  async aplicarTramoRead(_u: UnitOfWork, t: string, row: TramoReadRow) {
    this.tramoRead.set(this.k(t, row.eventId), { ...clone(row), tenantId: t, sesionId: row.sesionId });
    return ok(undefined);
  }
  async aplicarDuracionesRead(_u: UnitOfWork, t: string, row: DuracionesReadRow) {
    this.durRead.set(this.k(t, row.sesionId), { ...clone(row), tenantId: t });
    return ok(undefined);
  }
  async sesionActiva(t: string, ordenId: string, identityId: string | null) {
    const rows = [...this.sesRead.values()].filter(
      (r) => r.tenantId === t && r.ordenId === ordenId && r.estado !== "CERRADA" && (identityId === null || r.identityId === identityId),
    );
    rows.sort((a, b) => b.iniciadoAt.getTime() - a.iniciadoAt.getTime());
    return ok(rows[0] ? clone(this.strip(rows[0])) : null);
  }
  async sesionesPorOrden(t: string, ordenId: string) {
    return ok(this.filtrarSes((r) => r.tenantId === t && r.ordenId === ordenId));
  }
  async sesionesPorIdentidad(t: string, identityId: string) {
    return ok(this.filtrarSes((r) => r.tenantId === t && r.identityId === identityId));
  }
  async sesionesPorActivo(t: string, activoId: string) {
    return ok(this.filtrarSes((r) => r.tenantId === t && r.activoId === activoId));
  }
  async tramosRead(t: string, sesionId: string) {
    const rows = [...this.tramoRead.values()].filter((r) => r.tenantId === t && r.sesionId === sesionId);
    rows.sort((a, b) => a.secuencia - b.secuencia);
    return ok(rows.map((r) => clone(this.stripTramo(r))));
  }
  async duracionesDeSesion(t: string, sesionId: string) {
    const r = this.durRead.get(this.k(t, sesionId));
    return ok(r ? clone(this.stripDur(r)) : null);
  }
  async duracionesPorOrden(t: string, ordenId: string) {
    const rows = [...this.durRead.values()].filter((r) => r.tenantId === t && r.ordenId === ordenId);
    return ok(rows.map((r) => clone(this.stripDur(r))));
  }
  async clear(_u: UnitOfWork, t: string) {
    for (const m of [this.cab, this.tramos]) for (const k of [...m.keys()]) if (k.startsWith(`${t}::`)) m.delete(k);
    for (const r of [...this.sesRead.entries()]) if (r[1].tenantId === t) this.sesRead.delete(r[0]);
    for (const r of [...this.tramoRead.entries()]) if (r[1].tenantId === t) this.tramoRead.delete(r[0]);
    for (const r of [...this.durRead.entries()]) if (r[1].tenantId === t) this.durRead.delete(r[0]);
    return ok(undefined);
  }
  async contar(t: string) {
    let sesiones = 0;
    let tramos = 0;
    for (const [k] of this.cab) if (k.startsWith(`${t}::`)) sesiones += 1;
    for (const [k, arr] of this.tramos) if (k.startsWith(`${t}::`)) tramos += arr.length;
    return ok({ sesiones, tramos });
  }
  private strip(r: SesionReadRow & { tenantId: string }): SesionReadRow {
    const { tenantId: _t, ...rest } = r;
    return rest;
  }
  private stripTramo(r: TramoReadRow & { tenantId: string }): TramoReadRow {
    const { tenantId: _t, ...rest } = r;
    return rest;
  }
  private stripDur(r: DuracionesReadRow & { tenantId: string }): DuracionesReadRow {
    const { tenantId: _t, ...rest } = r;
    return rest;
  }
  private filtrarSes(pred: (r: SesionReadRow & { tenantId: string }) => boolean): SesionReadRow[] {
    const rows = [...this.sesRead.values()].filter(pred);
    rows.sort((a, b) => b.iniciadoAt.getTime() - a.iniciadoAt.getTime());
    return rows.map((r) => clone(this.strip(r)));
  }
}

/* ================================== PG ================================== */

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));
const dOrNull = (v: unknown): Date | null => (v == null ? null : (v as Date));
const parseAnom = (v: unknown): AnomaliaReloj | null => {
  if (v == null) return null;
  return (typeof v === "string" ? JSON.parse(v) : v) as AnomaliaReloj;
};

function toCabecera(r: Row): SesionCabecera {
  return {
    id: String(r["id"]),
    ordenId: String(r["orden_id"]),
    activoId: s(r["activo_id"]),
    identityId: String(r["identity_id"]),
    estado: String(r["estado"]) as EstadoSesion,
    origen: String(r["origen"]),
    iniciadoAt: r["iniciado_at"] as Date,
    cerradoAt: dOrNull(r["cerrado_at"]),
    registradoAt: r["registrado_at"] as Date,
    actualizadoAt: r["actualizado_at"] as Date,
    opId: s(r["op_id"]),
  };
}
function toTramo(r: Row): TramoFila {
  return {
    sesionId: String(r["sesion_id"]),
    secuencia: Number(r["secuencia"]),
    tipo: String(r["tipo"]) as TipoTramo,
    origen: String(r["origen"]) as OrigenTramo,
    ocurridoAt: r["ocurrido_at"] as Date,
    registradoAt: r["registrado_at"] as Date,
    anomaliaReloj: parseAnom(r["anomalia_reloj"]),
    identityId: String(r["identity_id"]),
    opId: s(r["op_id"]),
    eventId: String(r["event_id"]),
  };
}
function toSesionRead(r: Row): SesionReadRow {
  return {
    id: String(r["id"]),
    ordenId: String(r["orden_id"]),
    activoId: s(r["activo_id"]),
    identityId: String(r["identity_id"]),
    estado: String(r["estado"]),
    origen: String(r["origen"]),
    iniciadoAt: r["iniciado_at"] as Date,
    cerradoAt: dOrNull(r["cerrado_at"]),
    registradoAt: r["registrado_at"] as Date,
    lastEventId: String(r["last_event_id"]),
    actualizadoAt: r["actualizado_at"] as Date,
  };
}
function toTramoRead(r: Row): TramoReadRow {
  return {
    eventId: String(r["event_id"]),
    sesionId: String(r["sesion_id"]),
    ordenId: String(r["orden_id"]),
    secuencia: Number(r["secuencia"]),
    tipo: String(r["tipo"]),
    origen: String(r["origen"]),
    ocurridoAt: r["ocurrido_at"] as Date,
    registradoAt: r["registrado_at"] as Date,
    anomaliaReloj: parseAnom(r["anomalia_reloj"]),
    identityId: String(r["identity_id"]),
  };
}
function toDuracionesRead(r: Row): DuracionesReadRow {
  return {
    sesionId: String(r["sesion_id"]),
    ordenId: String(r["orden_id"]),
    activoId: s(r["activo_id"]),
    identityId: String(r["identity_id"]),
    estado: String(r["estado"]),
    efectivoMs: Number(r["efectivo_ms"]),
    pausadoMs: Number(r["pausado_ms"]),
    transcurridoMs: Number(r["transcurrido_ms"]),
    pausas: Number(r["pausas"]),
    abierta: Boolean(r["abierta"]),
    iniciadoAt: r["iniciado_at"] as Date,
    cerradoAt: dOrNull(r["cerrado_at"]),
    lastEventId: String(r["last_event_id"]),
    actualizadoAt: r["actualizado_at"] as Date,
  };
}

export class PgSesionStore implements SesionStore {
  constructor(private readonly pool: Pool) {}

  async abrirCabecera(uow: UnitOfWork, tenantId: string, sn: SesionCabecera) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_sesiones
           (tenant_id, id, orden_id, activo_id, identity_id, estado, origen, iniciado_at, cerrado_at, registrado_at, actualizado_at, op_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [tenantId, sn.id, sn.ordenId, sn.activoId, sn.identityId, sn.estado, sn.origen, sn.iniciadoAt, sn.cerradoAt, sn.registradoAt, sn.actualizadoAt, sn.opId],
      );
      return ok(undefined);
    } catch (err) {
      // 23505: violación del índice único parcial ⇒ sesión duplicada (o id repetido).
      if ((err as { code?: string }).code === "23505") {
        return fail(KernelErrors.conflict(`Ya existe una sesión abierta para la OT ${sn.ordenId} y la identidad ${sn.identityId}`));
      }
      return fail(KernelErrors.infrastructure("abrirCabecera falló", err));
    }
  }
  async actualizarCabecera(uow: UnitOfWork, tenantId: string, id: string, c: { estado: EstadoSesion; cerradoAt: Date | null; actualizadoAt: Date }) {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.ord_sesiones SET estado=$3, cerrado_at=$4, actualizado_at=$5 WHERE tenant_id=$1 AND id=$2`,
        [tenantId, id, c.estado, c.cerradoAt, c.actualizadoAt],
      );
      if (res.rowCount === 0) return fail(KernelErrors.notFound("sesion", id));
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("actualizarCabecera falló", err)); }
  }
  async agregarTramo(uow: UnitOfWork, tenantId: string, t: TramoFila) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_sesion_tramos
           (tenant_id, sesion_id, secuencia, tipo, origen, ocurrido_at, registrado_at, anomalia_reloj, identity_id, op_id, event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
        [tenantId, t.sesionId, t.secuencia, t.tipo, t.origen, t.ocurridoAt, t.registradoAt, t.anomaliaReloj ? JSON.stringify(t.anomaliaReloj) : null, t.identityId, t.opId, t.eventId],
      );
      return ok(undefined);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`Tramo ${t.secuencia} ya existe en la sesión ${t.sesionId}`));
      return fail(KernelErrors.infrastructure("agregarTramo falló", err));
    }
  }
  async getCabecera(tenantId: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_sesiones WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      return ok(res.rows[0] ? toCabecera(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("getCabecera falló", err)); }
  }
  async getAbierta(tenantId: string, ordenId: string, identityId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.ord_sesiones WHERE tenant_id=$1 AND orden_id=$2 AND identity_id=$3 AND estado <> 'CERRADA' LIMIT 1`,
          [tenantId, ordenId, identityId],
        ),
      );
      return ok(res.rows[0] ? toCabecera(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("getAbierta falló", err)); }
  }
  async tramosDe(tenantId: string, sesionId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_sesion_tramos WHERE tenant_id=$1 AND sesion_id=$2 ORDER BY secuencia ASC`, [tenantId, sesionId]),
      );
      return ok(res.rows.map(toTramo));
    } catch (err) { return fail(KernelErrors.infrastructure("tramosDe falló", err)); }
  }
  async aplicarSesionRead(uow: UnitOfWork, tenantId: string, row: SesionReadRow) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_sesiones_read
           (tenant_id, id, orden_id, activo_id, identity_id, estado, origen, iniciado_at, cerrado_at, registrado_at, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           estado=EXCLUDED.estado, cerrado_at=EXCLUDED.cerrado_at, activo_id=EXCLUDED.activo_id,
           last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.ord_sesiones_read.last_event_id <> EXCLUDED.last_event_id`,
        [tenantId, row.id, row.ordenId, row.activoId, row.identityId, row.estado, row.origen, row.iniciadoAt, row.cerradoAt, row.registradoAt, row.lastEventId, row.actualizadoAt],
      );
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("aplicarSesionRead falló", err)); }
  }
  async aplicarTramoRead(uow: UnitOfWork, tenantId: string, row: TramoReadRow) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_sesion_tramos_read
           (tenant_id, event_id, sesion_id, orden_id, secuencia, tipo, origen, ocurrido_at, registrado_at, anomalia_reloj, identity_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
         ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [tenantId, row.eventId, row.sesionId, row.ordenId, row.secuencia, row.tipo, row.origen, row.ocurridoAt, row.registradoAt, row.anomaliaReloj ? JSON.stringify(row.anomaliaReloj) : null, row.identityId],
      );
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("aplicarTramoRead falló", err)); }
  }
  async aplicarDuracionesRead(uow: UnitOfWork, tenantId: string, row: DuracionesReadRow) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_sesion_duraciones_read
           (tenant_id, sesion_id, orden_id, activo_id, identity_id, estado, efectivo_ms, pausado_ms, transcurrido_ms, pausas, abierta, iniciado_at, cerrado_at, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (tenant_id, sesion_id) DO UPDATE SET
           estado=EXCLUDED.estado, efectivo_ms=EXCLUDED.efectivo_ms, pausado_ms=EXCLUDED.pausado_ms,
           transcurrido_ms=EXCLUDED.transcurrido_ms, pausas=EXCLUDED.pausas, abierta=EXCLUDED.abierta,
           cerrado_at=EXCLUDED.cerrado_at, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.ord_sesion_duraciones_read.last_event_id <> EXCLUDED.last_event_id`,
        [tenantId, row.sesionId, row.ordenId, row.activoId, row.identityId, row.estado, row.efectivoMs, row.pausadoMs, row.transcurridoMs, row.pausas, row.abierta, row.iniciadoAt, row.cerradoAt, row.lastEventId, row.actualizadoAt],
      );
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("aplicarDuracionesRead falló", err)); }
  }
  async sesionActiva(tenantId: string, ordenId: string, identityId: string | null) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.ord_sesiones_read
           WHERE tenant_id=$1 AND orden_id=$2 AND estado <> 'CERRADA' AND ($3::text IS NULL OR identity_id=$3)
           ORDER BY iniciado_at DESC LIMIT 1`,
          [tenantId, ordenId, identityId],
        ),
      );
      return ok(res.rows[0] ? toSesionRead(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("sesionActiva falló", err)); }
  }
  async sesionesPorOrden(tenantId: string, ordenId: string) {
    return this.listSes(tenantId, `orden_id=$2`, [ordenId]);
  }
  async sesionesPorIdentidad(tenantId: string, identityId: string) {
    return this.listSes(tenantId, `identity_id=$2`, [identityId]);
  }
  async sesionesPorActivo(tenantId: string, activoId: string) {
    return this.listSes(tenantId, `activo_id=$2`, [activoId]);
  }
  private async listSes(tenantId: string, cond: string, params: unknown[]): Promise<Result<SesionReadRow[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_sesiones_read WHERE tenant_id=$1 AND ${cond} ORDER BY iniciado_at DESC`, [tenantId, ...params]),
      );
      return ok(res.rows.map(toSesionRead));
    } catch (err) { return fail(KernelErrors.infrastructure("listSes falló", err)); }
  }
  async tramosRead(tenantId: string, sesionId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_sesion_tramos_read WHERE tenant_id=$1 AND sesion_id=$2 ORDER BY secuencia ASC`, [tenantId, sesionId]),
      );
      return ok(res.rows.map(toTramoRead));
    } catch (err) { return fail(KernelErrors.infrastructure("tramosRead falló", err)); }
  }
  async duracionesDeSesion(tenantId: string, sesionId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_sesion_duraciones_read WHERE tenant_id=$1 AND sesion_id=$2`, [tenantId, sesionId]),
      );
      return ok(res.rows[0] ? toDuracionesRead(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("duracionesDeSesion falló", err)); }
  }
  async duracionesPorOrden(tenantId: string, ordenId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_sesion_duraciones_read WHERE tenant_id=$1 AND orden_id=$2 ORDER BY iniciado_at DESC`, [tenantId, ordenId]),
      );
      return ok(res.rows.map(toDuracionesRead));
    } catch (err) { return fail(KernelErrors.infrastructure("duracionesPorOrden falló", err)); }
  }
  async clear(uow: UnitOfWork, tenantId: string) {
    try {
      await setTenant(uow, tenantId);
      const c = pgSessionOf(uow);
      for (const tabla of ["ord_sesiones_read", "ord_sesion_tramos_read", "ord_sesion_duraciones_read"]) {
        await c.query(`DELETE FROM deltaops.${tabla} WHERE tenant_id=$1`, [tenantId]);
      }
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("clear sesiones falló", err)); }
  }
  async contar(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, async (c) => {
        const a = await c.query(`SELECT count(*)::int AS n FROM deltaops.ord_sesiones WHERE tenant_id=$1`, [tenantId]);
        const b = await c.query(`SELECT count(*)::int AS n FROM deltaops.ord_sesion_tramos WHERE tenant_id=$1`, [tenantId]);
        return { a, b };
      });
      return ok({ sesiones: Number(res.a.rows[0]?.["n"] ?? 0), tramos: Number(res.b.rows[0]?.["n"] ?? 0) });
    } catch (err) { return fail(KernelErrors.infrastructure("contar sesiones falló", err)); }
  }
}
