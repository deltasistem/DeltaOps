/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Infra OPERACIONAL + CQRS.
 *
 * Puertos + adaptadores (Fake/PG) para: recibos de sincronización durables
 * (protocolo de reclamación offline), bitácora de eventos durable del módulo
 * (fuente de verdad del replay, `cor_eventos`), read models especializados
 * (solicitudes, diagnósticos, intervenciones, generaciones, eventos-de-activo
 * para historial de fallas/reincidencias, consumos de inventario e historial) y
 * la consola técnica (diagnóstico del outbox del Kernel filtrado al módulo). RLS
 * por tenant en lecturas y escrituras. Mismo patrón que module-preventivo (0024).
 */
import type { Pool } from "pg";
import {
  fail,
  KernelErrors,
  ok,
  pgSessionOf,
  type KernelError,
  type OutboxRecord,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { setTenant, withTenantRead } from "./repository";
import type { EventLogStore as DomainEventLogStore, EventoDurable, TenantId } from "../domain/ports";

const parseJson = (v: unknown): Record<string, unknown> => (typeof v === "string" ? JSON.parse(v) : (v as Record<string, unknown>)) ?? {};

/* =========================== Recibos de sync ============================= */

export interface SyncReceipt {
  readonly opId: string;
  readonly clienteId: string | null;
  readonly comando: string;
  readonly estado: string;
  readonly resultado: unknown;
  readonly createdAt?: Date;
}

export interface ClaimResult {
  readonly duenio: boolean;
  readonly recibo?: SyncReceipt;
}

export interface SyncReceiptStore {
  claim(tenantId: string, opId: string, clienteId: string | null, comando: string): Promise<Result<ClaimResult, KernelError>>;
  find(tenantId: string, opId: string): Promise<Result<SyncReceipt | null, KernelError>>;
  finalize(tenantId: string, r: SyncReceipt): Promise<Result<boolean, KernelError>>;
  release(tenantId: string, opId: string): Promise<Result<void, KernelError>>;
  listByTenant(tenantId: string): Promise<Result<SyncReceipt[], KernelError>>;
}

export class FakeSyncReceiptStore implements SyncReceiptStore {
  private readonly rows = new Map<string, SyncReceipt & { createdAt: Date }>();
  now = Date.now();
  private k(t: string, o: string) { return `${t}::${o}`; }
  async claim(tenantId: string, opId: string, clienteId: string | null, comando: string): Promise<Result<ClaimResult, KernelError>> {
    const k = this.k(tenantId, opId);
    const existente = this.rows.get(k);
    if (existente) return ok({ duenio: false, recibo: existente });
    this.rows.set(k, { opId, clienteId, comando, estado: "pendiente", resultado: null, createdAt: new Date(this.now) });
    return ok({ duenio: true });
  }
  async find(tenantId: string, opId: string) { return ok(this.rows.get(this.k(tenantId, opId)) ?? null); }
  async finalize(tenantId: string, r: SyncReceipt) {
    const k = this.k(tenantId, r.opId);
    const existente = this.rows.get(k);
    if (!existente || existente.estado !== "pendiente") return ok(false);
    this.rows.set(k, { ...existente, comando: r.comando, estado: r.estado, resultado: r.resultado });
    return ok(true);
  }
  async release(tenantId: string, opId: string) { this.rows.delete(this.k(tenantId, opId)); return ok(undefined); }
  async listByTenant(tenantId: string) {
    const prefix = `${tenantId}::`;
    const out: SyncReceipt[] = [];
    for (const [k, r] of this.rows) if (k.startsWith(prefix)) out.push(r);
    out.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    return ok(out);
  }
}

export class PgSyncReceiptStore implements SyncReceiptStore {
  constructor(private readonly pool: Pool) {}
  async claim(tenantId: string, opId: string, clienteId: string | null, comando: string): Promise<Result<ClaimResult, KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const ins = await c.query(
          `INSERT INTO deltaops.cor_sync_receipts (tenant_id, op_id, cliente_id, comando, estado, resultado)
           VALUES ($1,$2,$3,$4,'pendiente','null'::jsonb)
           ON CONFLICT (tenant_id, op_id) DO NOTHING
           RETURNING (xmax = 0) AS inserted`,
          [tenantId, opId, clienteId, comando],
        );
        if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true }) as Result<ClaimResult, KernelError>;
        const ex = await c.query(`SELECT * FROM deltaops.cor_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]);
        const r = ex.rows[0];
        return ok({ duenio: false, recibo: r ? this.toReceipt(r) : undefined }) as Result<ClaimResult, KernelError>;
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt claim falló", err));
    }
  }
  async find(tenantId: string, opId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.cor_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]));
      return ok(res.rows[0] ? this.toReceipt(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt find falló", err));
    }
  }
  async finalize(tenantId: string, r: SyncReceipt) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `UPDATE deltaops.cor_sync_receipts SET estado=$3, resultado=$4, comando=$5, updated_at=now()
           WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`,
          [tenantId, r.opId, r.estado, JSON.stringify(r.resultado ?? null), r.comando],
        ),
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt finalize falló", err));
    }
  }
  async release(tenantId: string, opId: string) {
    try {
      await withTenantRead(this.pool, tenantId, (c) => c.query(`DELETE FROM deltaops.cor_sync_receipts WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`, [tenantId, opId]));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt release falló", err));
    }
  }
  async listByTenant(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.cor_sync_receipts WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]));
      return ok(res.rows.map((r) => this.toReceipt(r)));
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt listByTenant falló", err));
    }
  }
  private toReceipt(r: Record<string, unknown>): SyncReceipt {
    const resultado = typeof r["resultado"] === "string" ? JSON.parse(r["resultado"] as string) : r["resultado"];
    return {
      opId: String(r["op_id"]),
      clienteId: (r["cliente_id"] as string | null) ?? null,
      comando: String(r["comando"] ?? ""),
      estado: String(r["estado"] ?? ""),
      resultado,
      createdAt: r["created_at"] as Date,
    };
  }
}

/* ==================== Bitácora de eventos durable ======================== */

export interface EventLogOperacional extends DomainEventLogStore {
  stream(tenantId: string): Promise<Result<EventoDurable[], KernelError>>;
  contar(tenantId: string): Promise<Result<number, KernelError>>;
}

export class PgEventLogStore implements EventLogOperacional {
  constructor(private readonly pool: Pool) {}
  async append(uow: UnitOfWork, e: EventoDurable): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, e.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_eventos (tenant_id, event_id, tipo, payload, occurred_at)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [e.tenantId, e.eventId, e.tipo, JSON.stringify(e.payload), new Date(e.occurredAt)],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog append falló", err));
    }
  }
  private async leer(tenantId: string): Promise<EventoDurable[]> {
    const res = await withTenantRead(this.pool, tenantId, (c) =>
      c.query(`SELECT tenant_id, event_id, tipo, payload, occurred_at FROM deltaops.cor_eventos WHERE tenant_id=$1 ORDER BY occurred_at ASC, event_id ASC`, [tenantId]),
    );
    return res.rows.map((r) => ({
      tenantId: String(r["tenant_id"]),
      eventId: String(r["event_id"]),
      tipo: String(r["tipo"]),
      payload: parseJson(r["payload"]),
      occurredAt: (r["occurred_at"] as Date).toISOString(),
    }));
  }
  async listPorTenant(tenantId: TenantId): Promise<Result<EventoDurable[], KernelError>> {
    try { return ok(await this.leer(tenantId)); } catch (err) { return fail(KernelErrors.infrastructure("EventLog listPorTenant falló", err)); }
  }
  async stream(tenantId: string): Promise<Result<EventoDurable[], KernelError>> {
    return this.listPorTenant(tenantId);
  }
  async contar(tenantId: string): Promise<Result<number, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT count(*)::int AS n FROM deltaops.cor_eventos WHERE tenant_id=$1`, [tenantId]));
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog contar falló", err));
    }
  }
}

/* ================= Read models especializados (CQRS) ==================== */

export interface SolicitudReadRow {
  readonly tenantId: string; readonly id: string; readonly codigo: string; readonly titulo: string;
  readonly origen: string; readonly activoId: string | null; readonly prioridad: string; readonly criticidad: string | null;
  readonly estado: string; readonly diagnosticoId: string | null; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface SolicitudReadFiltro { readonly estado?: string; readonly origen?: string; readonly activoId?: string; readonly limit?: number; }

export interface DiagnosticoReadRow {
  readonly tenantId: string; readonly id: string; readonly solicitudId: string; readonly plantillaId: string;
  readonly plantillaVersion: number; readonly causaRaiz: string | null; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}

export interface IntervencionReadRow {
  readonly tenantId: string; readonly id: string; readonly solicitudId: string; readonly ordenTrabajoId: string;
  readonly activoId: string; readonly mayor: boolean; readonly estado: string; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface IntervencionReadFiltro { readonly estado?: string; readonly limit?: number; }

export interface GeneracionReadRow {
  readonly tenantId: string; readonly id: string; readonly solicitudId: string; readonly activoId: string;
  readonly claveDedup: string; readonly ordenTrabajoId: string | null; readonly estado: string;
  readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}

export interface EventoActivoReadRow {
  readonly tenantId: string; readonly id: string; readonly activoId: string; readonly solicitudId: string | null;
  readonly ordenTrabajoId: string | null; readonly tipo: string; readonly modoFalla: string | null;
  readonly reincidente: boolean; readonly datos: Record<string, unknown>; readonly ocurridoAt: Date; readonly lastEventId: string;
}

export interface ConsumoReadRow {
  readonly tenantId: string; readonly id: string; readonly intervencionId: string | null; readonly ordenTrabajoId: string | null;
  readonly tipo: string; readonly inventarioId: string | null; readonly articuloId: string | null;
  readonly cantidad: number | null; readonly unidad: string | null; readonly datos: Record<string, unknown>;
  readonly ocurridoAt: Date; readonly lastEventId: string;
}

export interface HistorialReadRow {
  readonly tenantId: string; readonly id: string; readonly entityRef: string; readonly hito: string; readonly version: number;
  readonly detalle: Record<string, unknown>; readonly actorId: string; readonly ocurridoAt: Date; readonly lastEventId: string;
}

export interface ReadModelsStore {
  aplicarSolicitud(uow: UnitOfWork, row: SolicitudReadRow): Promise<Result<boolean, KernelError>>;
  solicitudGet(tenantId: string, id: string): Promise<Result<SolicitudReadRow | null, KernelError>>;
  solicitudList(tenantId: string, filtro: SolicitudReadFiltro): Promise<Result<SolicitudReadRow[], KernelError>>;
  aplicarDiagnostico(uow: UnitOfWork, row: DiagnosticoReadRow): Promise<Result<boolean, KernelError>>;
  diagnosticoGet(tenantId: string, id: string): Promise<Result<DiagnosticoReadRow | null, KernelError>>;
  diagnosticoPorSolicitud(tenantId: string, solicitudId: string): Promise<Result<DiagnosticoReadRow | null, KernelError>>;
  aplicarIntervencion(uow: UnitOfWork, row: IntervencionReadRow): Promise<Result<boolean, KernelError>>;
  intervencionGet(tenantId: string, id: string): Promise<Result<IntervencionReadRow | null, KernelError>>;
  intervencionList(tenantId: string, filtro: IntervencionReadFiltro): Promise<Result<IntervencionReadRow[], KernelError>>;
  intervencionPorSolicitud(tenantId: string, solicitudId: string): Promise<Result<IntervencionReadRow | null, KernelError>>;
  aplicarGeneracion(uow: UnitOfWork, row: GeneracionReadRow): Promise<Result<boolean, KernelError>>;
  generacionGet(tenantId: string, id: string): Promise<Result<GeneracionReadRow | null, KernelError>>;
  generacionPorSolicitud(tenantId: string, solicitudId: string): Promise<Result<GeneracionReadRow[], KernelError>>;
  aplicarEventoActivo(uow: UnitOfWork, row: EventoActivoReadRow): Promise<Result<boolean, KernelError>>;
  eventosPorActivo(tenantId: string, activoId: string, limit?: number): Promise<Result<EventoActivoReadRow[], KernelError>>;
  aplicarConsumo(uow: UnitOfWork, row: ConsumoReadRow): Promise<Result<boolean, KernelError>>;
  consumosPorIntervencion(tenantId: string, intervencionId: string, limit?: number): Promise<Result<ConsumoReadRow[], KernelError>>;
  aplicarHistorial(uow: UnitOfWork, row: HistorialReadRow): Promise<Result<boolean, KernelError>>;
  historialPorEntidad(tenantId: string, entityRef: string, limit?: number): Promise<Result<HistorialReadRow[], KernelError>>;
  contar(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/* --------------------------- Fake de read models ------------------------- */

export class FakeReadModelsStore implements ReadModelsStore {
  private readonly solicitudes = new Map<string, SolicitudReadRow>();
  private readonly diagnosticos = new Map<string, DiagnosticoReadRow>();
  private readonly intervenciones = new Map<string, IntervencionReadRow>();
  private readonly generaciones = new Map<string, GeneracionReadRow>();
  private readonly eventosActivo = new Map<string, EventoActivoReadRow>();
  private readonly consumos = new Map<string, ConsumoReadRow>();
  private readonly historial = new Map<string, HistorialReadRow>();
  private k(t: string, id: string) { return `${t}::${id}`; }

  private aplicarVersionado<T extends { tenantId: string; id: string; version: number; lastEventId: string }>(m: Map<string, T>, row: T): Result<boolean, KernelError> {
    const cur = m.get(this.k(row.tenantId, row.id));
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    m.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  private aplicarAppend<T extends { tenantId: string; id: string }>(m: Map<string, T>, row: T): Result<boolean, KernelError> {
    const k = this.k(row.tenantId, row.id);
    if (m.has(k)) return ok(false);
    m.set(k, row);
    return ok(true);
  }

  async aplicarSolicitud(_uow: UnitOfWork, row: SolicitudReadRow) { return this.aplicarVersionado(this.solicitudes, row); }
  async solicitudGet(t: string, id: string) { return ok(this.solicitudes.get(this.k(t, id)) ?? null); }
  async solicitudList(t: string, f: SolicitudReadFiltro) {
    let rows = [...this.solicitudes.values()].filter((r) => r.tenantId === t);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    if (f.origen) rows = rows.filter((r) => r.origen === f.origen);
    if (f.activoId) rows = rows.filter((r) => r.activoId === f.activoId);
    rows.sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 200));
  }

  async aplicarDiagnostico(_uow: UnitOfWork, row: DiagnosticoReadRow) { return this.aplicarVersionado(this.diagnosticos, row); }
  async diagnosticoGet(t: string, id: string) { return ok(this.diagnosticos.get(this.k(t, id)) ?? null); }
  async diagnosticoPorSolicitud(t: string, solicitudId: string) {
    const rows = [...this.diagnosticos.values()].filter((r) => r.tenantId === t && r.solicitudId === solicitudId)
      .sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime());
    return ok(rows[0] ?? null);
  }

  async aplicarIntervencion(_uow: UnitOfWork, row: IntervencionReadRow) { return this.aplicarVersionado(this.intervenciones, row); }
  async intervencionGet(t: string, id: string) { return ok(this.intervenciones.get(this.k(t, id)) ?? null); }
  async intervencionList(t: string, f: IntervencionReadFiltro) {
    let rows = [...this.intervenciones.values()].filter((r) => r.tenantId === t);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    rows.sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 200));
  }
  async intervencionPorSolicitud(t: string, solicitudId: string) {
    const rows = [...this.intervenciones.values()].filter((r) => r.tenantId === t && r.solicitudId === solicitudId)
      .sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime());
    return ok(rows[0] ?? null);
  }

  async aplicarGeneracion(_uow: UnitOfWork, row: GeneracionReadRow) { return this.aplicarVersionado(this.generaciones, row); }
  async generacionGet(t: string, id: string) { return ok(this.generaciones.get(this.k(t, id)) ?? null); }
  async generacionPorSolicitud(t: string, solicitudId: string) {
    return ok([...this.generaciones.values()].filter((r) => r.tenantId === t && r.solicitudId === solicitudId)
      .sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime()));
  }

  async aplicarEventoActivo(_uow: UnitOfWork, row: EventoActivoReadRow) {
    const k = this.k(row.tenantId, row.id);
    const cur = this.eventosActivo.get(k);
    if (cur) {
      // La reincidencia (mismo id que el evento base) sólo eleva el flag; nunca
      // duplica el renglón (append-only). Idempotente.
      if (row.reincidente && !cur.reincidente) { this.eventosActivo.set(k, { ...cur, reincidente: true }); return ok(true); }
      return ok(false);
    }
    this.eventosActivo.set(k, row);
    return ok(true);
  }
  async eventosPorActivo(t: string, activoId: string, limit = 500) {
    return ok([...this.eventosActivo.values()].filter((r) => r.tenantId === t && r.activoId === activoId)
      .sort((a, b) => a.ocurridoAt.getTime() - b.ocurridoAt.getTime()).slice(0, limit));
  }

  async aplicarConsumo(_uow: UnitOfWork, row: ConsumoReadRow) { return this.aplicarAppend(this.consumos, row); }
  async consumosPorIntervencion(t: string, intervencionId: string, limit = 500) {
    return ok([...this.consumos.values()].filter((r) => r.tenantId === t && r.intervencionId === intervencionId)
      .sort((a, b) => a.ocurridoAt.getTime() - b.ocurridoAt.getTime()).slice(0, limit));
  }

  async aplicarHistorial(_uow: UnitOfWork, row: HistorialReadRow) { return this.aplicarAppend(this.historial, row); }
  async historialPorEntidad(t: string, entityRef: string, limit = 500) {
    return ok([...this.historial.values()].filter((r) => r.tenantId === t && r.entityRef === entityRef)
      .sort((a, b) => a.ocurridoAt.getTime() - b.ocurridoAt.getTime()).slice(0, limit));
  }

  async contar(t: string) {
    return ok({
      cor_solicitudes_read: [...this.solicitudes.values()].filter((r) => r.tenantId === t).length,
      cor_diagnosticos_read: [...this.diagnosticos.values()].filter((r) => r.tenantId === t).length,
      cor_intervenciones_read: [...this.intervenciones.values()].filter((r) => r.tenantId === t).length,
      cor_generaciones_read: [...this.generaciones.values()].filter((r) => r.tenantId === t).length,
      cor_eventos_activo_read: [...this.eventosActivo.values()].filter((r) => r.tenantId === t).length,
      cor_consumos_read: [...this.consumos.values()].filter((r) => r.tenantId === t).length,
      cor_historial_read: [...this.historial.values()].filter((r) => r.tenantId === t).length,
    });
  }
  async clear(_uow: UnitOfWork, t: string) {
    for (const m of [this.solicitudes, this.diagnosticos, this.intervenciones, this.generaciones, this.eventosActivo, this.consumos, this.historial] as Map<string, { tenantId: string }>[]) {
      for (const [k, r] of m) if (r.tenantId === t) m.delete(k);
    }
    return ok(undefined);
  }
}

/* --------------------------- PG de read models --------------------------- */

export class PgReadModelsStore implements ReadModelsStore {
  constructor(private readonly pool: Pool) {}

  /* ------------------------------ Solicitud ------------------------------ */
  async aplicarSolicitud(uow: UnitOfWork, row: SolicitudReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_solicitudes_read
           (tenant_id, id, codigo, titulo, origen, activo_id, prioridad, criticidad, estado, diagnostico_id, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           codigo=EXCLUDED.codigo, titulo=EXCLUDED.titulo, origen=EXCLUDED.origen, activo_id=EXCLUDED.activo_id,
           prioridad=EXCLUDED.prioridad, criticidad=EXCLUDED.criticidad, estado=EXCLUDED.estado, diagnostico_id=EXCLUDED.diagnostico_id,
           datos=EXCLUDED.datos, version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.cor_solicitudes_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.cor_solicitudes_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.codigo, row.titulo, row.origen, row.activoId, row.prioridad, row.criticidad, row.estado, row.diagnosticoId, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("solicitud read apply falló", err)); }
  }
  async solicitudGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.cor_solicitudes_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toSolicitud(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("solicitud read get falló", err)); }
  }
  async solicitudList(t: string, f: SolicitudReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.cor_solicitudes_read
           WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2) AND ($3::text IS NULL OR origen=$3) AND ($4::text IS NULL OR activo_id=$4)
           ORDER BY actualizado_at DESC, id ASC LIMIT $5`,
          [t, f.estado ?? null, f.origen ?? null, f.activoId ?? null, f.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => this.toSolicitud(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("solicitud read list falló", err)); }
  }
  private toSolicitud(r: Record<string, unknown>): SolicitudReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), codigo: String(r["codigo"] ?? ""), titulo: String(r["titulo"] ?? ""),
      origen: String(r["origen"] ?? ""), activoId: (r["activo_id"] as string | null) ?? null, prioridad: String(r["prioridad"] ?? ""),
      criticidad: (r["criticidad"] as string | null) ?? null, estado: String(r["estado"] ?? ""), diagnosticoId: (r["diagnostico_id"] as string | null) ?? null,
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  /* ------------------------------ Diagnóstico ---------------------------- */
  async aplicarDiagnostico(uow: UnitOfWork, row: DiagnosticoReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_diagnosticos_read
           (tenant_id, id, solicitud_id, plantilla_id, plantilla_version, causa_raiz, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           solicitud_id=EXCLUDED.solicitud_id, plantilla_id=EXCLUDED.plantilla_id, plantilla_version=EXCLUDED.plantilla_version,
           causa_raiz=EXCLUDED.causa_raiz, datos=EXCLUDED.datos, version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.cor_diagnosticos_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.cor_diagnosticos_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.solicitudId, row.plantillaId, row.plantillaVersion, row.causaRaiz, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("diagnostico read apply falló", err)); }
  }
  async diagnosticoGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.cor_diagnosticos_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toDiagnostico(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("diagnostico read get falló", err)); }
  }
  async diagnosticoPorSolicitud(t: string, solicitudId: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.cor_diagnosticos_read WHERE tenant_id=$1 AND solicitud_id=$2 ORDER BY actualizado_at DESC, id ASC LIMIT 1`, [t, solicitudId]),
      );
      return ok(res.rows[0] ? this.toDiagnostico(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("diagnostico read porSolicitud falló", err)); }
  }
  private toDiagnostico(r: Record<string, unknown>): DiagnosticoReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), solicitudId: String(r["solicitud_id"] ?? ""), plantillaId: String(r["plantilla_id"] ?? ""),
      plantillaVersion: Number(r["plantilla_version"] ?? 1), causaRaiz: (r["causa_raiz"] as string | null) ?? null, datos: parseJson(r["datos"]),
      version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  /* ------------------------------ Intervención --------------------------- */
  async aplicarIntervencion(uow: UnitOfWork, row: IntervencionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_intervenciones_read
           (tenant_id, id, solicitud_id, orden_trabajo_id, activo_id, mayor, estado, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           solicitud_id=EXCLUDED.solicitud_id, orden_trabajo_id=EXCLUDED.orden_trabajo_id, activo_id=EXCLUDED.activo_id, mayor=EXCLUDED.mayor,
           estado=EXCLUDED.estado, datos=EXCLUDED.datos, version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.cor_intervenciones_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.cor_intervenciones_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.solicitudId, row.ordenTrabajoId, row.activoId, row.mayor, row.estado, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("intervencion read apply falló", err)); }
  }
  async intervencionGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.cor_intervenciones_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toIntervencion(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("intervencion read get falló", err)); }
  }
  async intervencionList(t: string, f: IntervencionReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.cor_intervenciones_read
           WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2)
           ORDER BY actualizado_at DESC, id ASC LIMIT $3`,
          [t, f.estado ?? null, f.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => this.toIntervencion(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("intervencion read list falló", err)); }
  }
  async intervencionPorSolicitud(t: string, solicitudId: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.cor_intervenciones_read WHERE tenant_id=$1 AND solicitud_id=$2 ORDER BY actualizado_at DESC, id ASC LIMIT 1`, [t, solicitudId]),
      );
      return ok(res.rows[0] ? this.toIntervencion(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("intervencion read porSolicitud falló", err)); }
  }
  private toIntervencion(r: Record<string, unknown>): IntervencionReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), solicitudId: String(r["solicitud_id"] ?? ""), ordenTrabajoId: String(r["orden_trabajo_id"] ?? ""),
      activoId: String(r["activo_id"] ?? ""), mayor: r["mayor"] === true, estado: String(r["estado"] ?? ""), datos: parseJson(r["datos"]),
      version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  /* ------------------------------ Generación ----------------------------- */
  async aplicarGeneracion(uow: UnitOfWork, row: GeneracionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_generaciones_read
           (tenant_id, id, solicitud_id, activo_id, clave_dedup, orden_trabajo_id, estado, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           solicitud_id=EXCLUDED.solicitud_id, activo_id=EXCLUDED.activo_id, clave_dedup=EXCLUDED.clave_dedup, orden_trabajo_id=EXCLUDED.orden_trabajo_id,
           estado=EXCLUDED.estado, datos=EXCLUDED.datos, version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.cor_generaciones_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.cor_generaciones_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.solicitudId, row.activoId, row.claveDedup, row.ordenTrabajoId, row.estado, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("generacion read apply falló", err)); }
  }
  async generacionGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.cor_generaciones_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toGeneracion(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("generacion read get falló", err)); }
  }
  async generacionPorSolicitud(t: string, solicitudId: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.cor_generaciones_read WHERE tenant_id=$1 AND solicitud_id=$2 ORDER BY actualizado_at DESC, id ASC`, [t, solicitudId]),
      );
      return ok(res.rows.map((r) => this.toGeneracion(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("generacion read porSolicitud falló", err)); }
  }
  private toGeneracion(r: Record<string, unknown>): GeneracionReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), solicitudId: String(r["solicitud_id"] ?? ""), activoId: String(r["activo_id"] ?? ""),
      claveDedup: String(r["clave_dedup"] ?? ""), ordenTrabajoId: (r["orden_trabajo_id"] as string | null) ?? null, estado: String(r["estado"] ?? ""),
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  /* ---------------------------- Eventos de activo ------------------------ */
  async aplicarEventoActivo(uow: UnitOfWork, row: EventoActivoReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_eventos_activo_read
           (tenant_id, id, activo_id, solicitud_id, orden_trabajo_id, tipo, modo_falla, reincidente, datos, ocurrido_at, last_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, id) DO UPDATE SET reincidente=true
         WHERE deltaops.cor_eventos_activo_read.reincidente = false AND EXCLUDED.reincidente = true`,
        [row.tenantId, row.id, row.activoId, row.solicitudId, row.ordenTrabajoId, row.tipo, row.modoFalla, row.reincidente, JSON.stringify(row.datos), row.ocurridoAt, row.lastEventId],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("evento-activo read apply falló", err)); }
  }
  async eventosPorActivo(t: string, activoId: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.cor_eventos_activo_read WHERE tenant_id=$1 AND activo_id=$2 ORDER BY ocurrido_at ASC, id ASC LIMIT $3`, [t, activoId, limit]),
      );
      return ok(res.rows.map((r) => this.toEventoActivo(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("evento-activo read list falló", err)); }
  }
  private toEventoActivo(r: Record<string, unknown>): EventoActivoReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), activoId: String(r["activo_id"] ?? ""), solicitudId: (r["solicitud_id"] as string | null) ?? null,
      ordenTrabajoId: (r["orden_trabajo_id"] as string | null) ?? null, tipo: String(r["tipo"] ?? ""), modoFalla: (r["modo_falla"] as string | null) ?? null,
      reincidente: r["reincidente"] === true, datos: parseJson(r["datos"]), ocurridoAt: r["ocurrido_at"] as Date, lastEventId: String(r["last_event_id"] ?? ""),
    };
  }

  /* ------------------------------- Consumos ------------------------------ */
  async aplicarConsumo(uow: UnitOfWork, row: ConsumoReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_consumos_read
           (tenant_id, id, intervencion_id, orden_trabajo_id, tipo, inventario_id, articulo_id, cantidad, unidad, datos, ocurrido_at, last_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tenant_id, id) DO NOTHING`,
        [row.tenantId, row.id, row.intervencionId, row.ordenTrabajoId, row.tipo, row.inventarioId, row.articuloId, row.cantidad, row.unidad, JSON.stringify(row.datos), row.ocurridoAt, row.lastEventId],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("consumo read apply falló", err)); }
  }
  async consumosPorIntervencion(t: string, intervencionId: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.cor_consumos_read WHERE tenant_id=$1 AND intervencion_id=$2 ORDER BY ocurrido_at ASC, id ASC LIMIT $3`, [t, intervencionId, limit]),
      );
      return ok(res.rows.map((r) => this.toConsumo(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("consumo read list falló", err)); }
  }
  private toConsumo(r: Record<string, unknown>): ConsumoReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), intervencionId: (r["intervencion_id"] as string | null) ?? null,
      ordenTrabajoId: (r["orden_trabajo_id"] as string | null) ?? null, tipo: String(r["tipo"] ?? ""), inventarioId: (r["inventario_id"] as string | null) ?? null,
      articuloId: (r["articulo_id"] as string | null) ?? null, cantidad: r["cantidad"] != null ? Number(r["cantidad"]) : null, unidad: (r["unidad"] as string | null) ?? null,
      datos: parseJson(r["datos"]), ocurridoAt: r["ocurrido_at"] as Date, lastEventId: String(r["last_event_id"] ?? ""),
    };
  }

  /* ------------------------------- Historial ----------------------------- */
  async aplicarHistorial(uow: UnitOfWork, row: HistorialReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cor_historial_read (tenant_id, id, entity_ref, hito, version, detalle, actor_id, ocurrido_at, last_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [row.tenantId, row.id, row.entityRef, row.hito, row.version, JSON.stringify(row.detalle), row.actorId, row.ocurridoAt, row.lastEventId],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("historial read apply falló", err)); }
  }
  async historialPorEntidad(t: string, entityRef: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.cor_historial_read WHERE tenant_id=$1 AND entity_ref=$2 ORDER BY ocurrido_at ASC, id ASC LIMIT $3`, [t, entityRef, limit]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), entityRef: String(r["entity_ref"]), hito: String(r["hito"]),
        version: Number(r["version"] ?? 0), detalle: parseJson(r["detalle"]), actorId: String(r["actor_id"]),
        ocurridoAt: r["ocurrido_at"] as Date, lastEventId: String(r["last_event_id"] ?? ""),
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("historial read list falló", err)); }
  }

  private readonly tablas = [
    "cor_solicitudes_read", "cor_diagnosticos_read", "cor_intervenciones_read",
    "cor_generaciones_read", "cor_eventos_activo_read", "cor_consumos_read", "cor_historial_read",
  ];
  async contar(t: string) {
    try {
      const out: Record<string, number> = {};
      await withTenantRead(this.pool, t, async (c) => {
        for (const tabla of this.tablas) {
          const r = await c.query(`SELECT count(*)::int AS n FROM deltaops.${tabla} WHERE tenant_id=$1`, [t]);
          out[tabla] = Number(r.rows[0]?.["n"] ?? 0);
        }
      });
      return ok(out);
    } catch (err) { return fail(KernelErrors.infrastructure("read models contar falló", err)); }
  }
  async clear(uow: UnitOfWork, t: string) {
    try {
      await setTenant(uow, t);
      for (const tabla of this.tablas) {
        await pgSessionOf(uow).query(`DELETE FROM deltaops.${tabla} WHERE tenant_id=$1`, [t]);
      }
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("read models clear falló", err)); }
  }
}

/* ============================ Consola técnica ============================ */

export interface OutboxResumen {
  readonly pendientes: number;
  readonly procesados: number;
  readonly ultimos: Array<{ id: string; tipo: string; processedAt: string | null; occurredAt: string }>;
}

export interface ConsolaStore {
  outboxDelModulo(tenantId: string, limit?: number): Promise<Result<OutboxResumen, KernelError>>;
}

const PREFIJO_EVENTO = "modulo.correctivo.";

export class FakeConsolaStore implements ConsolaStore {
  constructor(private readonly records: () => readonly OutboxRecord[]) {}
  async outboxDelModulo(tenantId: string, limit = 10): Promise<Result<OutboxResumen, KernelError>> {
    const propios = this.records().filter(
      (r) => r.eventType.startsWith(PREFIJO_EVENTO) && String((r.payload as Record<string, unknown>)["tenantId"] ?? "") === tenantId,
    );
    const pendientes = propios.filter((r) => r.processedAt === null).length;
    const ultimos = [...propios]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, limit)
      .map((r) => ({
        id: r.id, tipo: r.eventType,
        processedAt: r.processedAt ? new Date(r.processedAt).toISOString() : null,
        occurredAt: new Date(r.occurredAt).toISOString(),
      }));
    return ok({ pendientes, procesados: propios.length - pendientes, ultimos });
  }
}

export class PgConsolaStore implements ConsolaStore {
  constructor(private readonly pool: Pool) {}
  async outboxDelModulo(tenantId: string, limit = 10): Promise<Result<OutboxResumen, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, async (c) => {
        const conteo = await c.query(
          `SELECT
             count(*) FILTER (WHERE processed_at IS NULL)::int AS pendientes,
             count(*) FILTER (WHERE processed_at IS NOT NULL)::int AS procesados
           FROM deltaops.kernel_outbox
           WHERE event_type LIKE $1 AND payload->>'tenantId' = $2`,
          [`${PREFIJO_EVENTO}%`, tenantId],
        );
        const ultimos = await c.query(
          `SELECT id, event_type, processed_at, occurred_at FROM deltaops.kernel_outbox
           WHERE event_type LIKE $1 AND payload->>'tenantId' = $2 ORDER BY occurred_at DESC LIMIT $3`,
          [`${PREFIJO_EVENTO}%`, tenantId, limit],
        );
        return { conteo: conteo.rows[0], ultimos: ultimos.rows };
      });
      return ok({
        pendientes: Number(res.conteo?.["pendientes"] ?? 0),
        procesados: Number(res.conteo?.["procesados"] ?? 0),
        ultimos: res.ultimos.map((r) => ({
          id: String(r["id"]), tipo: String(r["event_type"]),
          processedAt: r["processed_at"] ? new Date(r["processed_at"] as string).toISOString() : null,
          occurredAt: new Date(r["occurred_at"] as string).toISOString(),
        })),
      });
    } catch (err) { return fail(KernelErrors.infrastructure("consola outbox falló", err)); }
  }
}
