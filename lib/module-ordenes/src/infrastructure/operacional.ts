/**
 * DGP-009.2 · Módulo Órdenes de Trabajo — Infraestructura OPERACIONAL + CQRS.
 *
 * Puertos + adaptadores (Fake/PG) para: recibos de sincronización durables
 * (protocolo de reclamación offline), bitácora de eventos durable del módulo
 * (fuente de verdad del replay, `ord_eventos`), read models especializados
 * (agenda/calendario, asignaciones, responsables, relaciones, historial,
 * bitácora operacional, documentación), stores operacionales fuente-de-verdad
 * (planificación, asignaciones, recursos, SLA, relaciones) y la consola técnica
 * (diagnóstico del outbox del Kernel filtrado al módulo). RLS por tenant.
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

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

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
  async find(tenantId: string, opId: string) {
    return ok(this.rows.get(this.k(tenantId, opId)) ?? null);
  }
  async finalize(tenantId: string, r: SyncReceipt) {
    const k = this.k(tenantId, r.opId);
    const existente = this.rows.get(k);
    if (!existente || existente.estado !== "pendiente") return ok(false);
    this.rows.set(k, { ...existente, comando: r.comando, estado: r.estado, resultado: r.resultado });
    return ok(true);
  }
  async release(tenantId: string, opId: string) {
    this.rows.delete(this.k(tenantId, opId));
    return ok(undefined);
  }
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
          `INSERT INTO deltaops.ord_sync_receipts (tenant_id, op_id, cliente_id, comando, estado, resultado)
           VALUES ($1,$2,$3,$4,'pendiente','null'::jsonb)
           ON CONFLICT (tenant_id, op_id) DO NOTHING
           RETURNING (xmax = 0) AS inserted`,
          [tenantId, opId, clienteId, comando],
        );
        if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true }) as Result<ClaimResult, KernelError>;
        const ex = await c.query(`SELECT * FROM deltaops.ord_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]);
        const r = ex.rows[0];
        return ok({ duenio: false, recibo: r ? this.toReceipt(r) : undefined }) as Result<ClaimResult, KernelError>;
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt claim falló", err));
    }
  }
  async find(tenantId: string, opId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]),
      );
      return ok(res.rows[0] ? this.toReceipt(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt find falló", err));
    }
  }
  async finalize(tenantId: string, r: SyncReceipt) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `UPDATE deltaops.ord_sync_receipts
           SET estado=$3, resultado=$4, comando=$5, updated_at=now()
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
      await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`DELETE FROM deltaops.ord_sync_receipts WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`, [tenantId, opId]),
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt release falló", err));
    }
  }
  async listByTenant(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_sync_receipts WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]),
      );
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

export interface EventoBitacora {
  readonly tenantId: string;
  readonly eventId: string;
  readonly tipo: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface EventLogStore {
  append(uow: UnitOfWork, ev: EventoBitacora): Promise<Result<boolean, KernelError>>;
  stream(tenantId: string): Promise<Result<EventoBitacora[], KernelError>>;
  contar(tenantId: string): Promise<Result<number, KernelError>>;
}

export class FakeEventLogStore implements EventLogStore {
  private readonly log = new Map<string, EventoBitacora>();
  private k(t: string, e: string) { return `${t}::${e}`; }
  async append(_uow: UnitOfWork, ev: EventoBitacora) {
    const k = this.k(ev.tenantId, ev.eventId);
    if (this.log.has(k)) return ok(false);
    this.log.set(k, ev);
    return ok(true);
  }
  async stream(tenantId: string) {
    return ok(
      [...this.log.values()]
        .filter((r) => r.tenantId === tenantId)
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.eventId.localeCompare(b.eventId)),
    );
  }
  async contar(tenantId: string) {
    return ok([...this.log.values()].filter((r) => r.tenantId === tenantId).length);
  }
}

export class PgEventLogStore implements EventLogStore {
  constructor(private readonly pool: Pool) {}
  async append(uow: UnitOfWork, ev: EventoBitacora) {
    try {
      await setTenant(uow, ev.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_eventos (tenant_id, event_id, tipo, payload, occurred_at)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [ev.tenantId, ev.eventId, ev.tipo, JSON.stringify(ev.payload), ev.occurredAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog append falló", err));
    }
  }
  async stream(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT tenant_id, event_id, tipo, payload, occurred_at FROM deltaops.ord_eventos
           WHERE tenant_id=$1 ORDER BY occurred_at ASC, event_id ASC`,
          [tenantId],
        ),
      );
      return ok(
        res.rows.map((r) => ({
          tenantId: String(r["tenant_id"]),
          eventId: String(r["event_id"]),
          tipo: String(r["tipo"]),
          payload: (typeof r["payload"] === "string" ? JSON.parse(r["payload"] as string) : (r["payload"] as Record<string, unknown>)) ?? {},
          occurredAt: r["occurred_at"] as Date,
        })),
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog stream falló", err));
    }
  }
  async contar(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT count(*)::int AS n FROM deltaops.ord_eventos WHERE tenant_id=$1`, [tenantId]),
      );
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog contar falló", err));
    }
  }
}

/* ================= Read models especializados (CQRS) ==================== */

/* ---- Agenda / calendario ---- */
export interface AgendaRow {
  readonly tenantId: string; readonly id: string; readonly codigo: string; readonly titulo: string;
  readonly estado: string; readonly responsable: string | null;
  readonly inicioPlanificado: Date | null; readonly finPlanificado: Date | null;
  readonly ventanaInicio: Date | null; readonly ventanaFin: Date | null;
  readonly programacionEstado: string; readonly enConflicto: boolean;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface AgendaReadModel {
  apply(uow: UnitOfWork, row: AgendaRow): Promise<Result<boolean, KernelError>>;
  rango(tenantId: string, desde: Date | null, hasta: Date | null, limit?: number): Promise<Result<AgendaRow[], KernelError>>;
  contar(tenantId: string): Promise<Result<number, KernelError>>;
  lastEventId(tenantId: string): Promise<Result<string | null, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/* ---- Fila append-only genérica (asignaciones/responsables/historial/bitácora) ---- */
export interface FilaAppend {
  readonly tenantId: string; readonly eventId: string; readonly ordenId: string;
  readonly registradoAt: Date; readonly [k: string]: unknown;
}

/* ---- Documentación (formularios/checklists/evidencias) ---- */
export interface DocRow {
  readonly tenantId: string; readonly id: string; readonly ordenId: string; readonly clase: string;
  readonly referenciaClave: string | null; readonly referenciaVersion: number | null;
  readonly respuestaId: string | null; readonly titulo: string | null;
  readonly datos: Record<string, unknown>; readonly lastEventId: string; readonly actualizadoAt: Date;
}

/* ---- Relaciones (grafo tipado) ---- */
export interface RelacionRow {
  readonly tenantId: string; readonly id: string; readonly categoria: string; readonly tipo: string;
  readonly ordenId: string; readonly destinoId: string; readonly destinoCodigo: string | null;
  readonly destinoNombre: string | null; readonly datos: Record<string, unknown>;
  readonly lastEventId: string; readonly actualizadoAt: Date;
}

/**
 * Read models append-only + los proyectados. Se agrupan en un ÚNICO puerto
 * `ProyeccionesStore` para simplificar la inyección; cada método es idempotente
 * por su clave (eventId append-only; (tenant,id) para proyectados) y se limpia
 * en `clear` para permitir replay.
 */
export interface ProyeccionesStore {
  // agenda
  aplicarAgenda(uow: UnitOfWork, row: AgendaRow): Promise<Result<boolean, KernelError>>;
  agendaRango(tenantId: string, desde: Date | null, hasta: Date | null, limit?: number): Promise<Result<AgendaRow[], KernelError>>;
  // append-only
  aplicarAsignacion(uow: UnitOfWork, row: FilaAppend): Promise<Result<boolean, KernelError>>;
  aplicarResponsable(uow: UnitOfWork, row: FilaAppend): Promise<Result<boolean, KernelError>>;
  aplicarHistorial(uow: UnitOfWork, row: FilaAppend): Promise<Result<boolean, KernelError>>;
  aplicarBitacora(uow: UnitOfWork, row: FilaAppend): Promise<Result<boolean, KernelError>>;
  // proyectados por (tenant,id)
  aplicarRelacion(uow: UnitOfWork, row: RelacionRow): Promise<Result<boolean, KernelError>>;
  eliminarRelacion(uow: UnitOfWork, tenantId: string, id: string): Promise<Result<boolean, KernelError>>;
  aplicarDocumentacion(uow: UnitOfWork, row: DocRow): Promise<Result<boolean, KernelError>>;
  // lecturas de consulta
  listarAsignaciones(tenantId: string, ordenId: string): Promise<Result<FilaAppend[], KernelError>>;
  listarResponsables(tenantId: string, ordenId: string): Promise<Result<FilaAppend[], KernelError>>;
  listarHistorial(tenantId: string, ordenId: string, limit?: number): Promise<Result<FilaAppend[], KernelError>>;
  listarBitacora(tenantId: string, ordenId: string, limit?: number): Promise<Result<FilaAppend[], KernelError>>;
  listarRelaciones(tenantId: string, ordenId: string, categoria?: string): Promise<Result<RelacionRow[], KernelError>>;
  listarDocumentacion(tenantId: string, ordenId: string, clase?: string): Promise<Result<DocRow[], KernelError>>;
  // diagnóstico
  contar(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/* ------------------------- Fake de proyecciones -------------------------- */

export class FakeProyeccionesStore implements ProyeccionesStore {
  private readonly agenda = new Map<string, AgendaRow>();
  private readonly asignaciones = new Map<string, FilaAppend>();
  private readonly responsables = new Map<string, FilaAppend>();
  private readonly historial = new Map<string, FilaAppend>();
  private readonly bitacora = new Map<string, FilaAppend>();
  private readonly relaciones = new Map<string, RelacionRow>();
  private readonly documentacion = new Map<string, DocRow>();
  // Idempotencia por (mapa, tenant, eventId): un mismo evento puede alimentar
  // varias proyecciones append-only (p.ej. bitácora + historial) sin colisión.
  private readonly applied = new Map<Map<string, FilaAppend>, Set<string>>();
  private k(t: string, id: string) { return `${t}::${id}`; }

  async aplicarAgenda(_uow: UnitOfWork, row: AgendaRow) {
    const cur = this.agenda.get(this.k(row.tenantId, row.id));
    if (cur && cur.version > row.version) return ok(false);
    if (cur && cur.lastEventId === row.lastEventId) return ok(false);
    this.agenda.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  async agendaRango(tenantId: string, desde: Date | null, hasta: Date | null, limit = 500) {
    const rows = [...this.agenda.values()]
      .filter((r) => r.tenantId === tenantId)
      .filter((r) => {
        const t = r.inicioPlanificado?.getTime();
        if (desde && (t == null || t < desde.getTime())) return false;
        if (hasta && (t == null || t > hasta.getTime())) return false;
        return true;
      })
      .sort((a, b) => (a.inicioPlanificado?.getTime() ?? 0) - (b.inicioPlanificado?.getTime() ?? 0));
    return ok(rows.slice(0, limit));
  }
  private appendGuard(map: Map<string, FilaAppend>, row: FilaAppend): Result<boolean, KernelError> {
    const k = this.k(row.tenantId, row.eventId);
    let seen = this.applied.get(map);
    if (!seen) { seen = new Set(); this.applied.set(map, seen); }
    if (seen.has(k)) return ok(false);
    seen.add(k);
    map.set(k, row);
    return ok(true);
  }
  async aplicarAsignacion(_uow: UnitOfWork, row: FilaAppend) { return this.appendGuard(this.asignaciones, row); }
  async aplicarResponsable(_uow: UnitOfWork, row: FilaAppend) { return this.appendGuard(this.responsables, row); }
  async aplicarHistorial(_uow: UnitOfWork, row: FilaAppend) { return this.appendGuard(this.historial, row); }
  async aplicarBitacora(_uow: UnitOfWork, row: FilaAppend) { return this.appendGuard(this.bitacora, row); }
  async aplicarRelacion(_uow: UnitOfWork, row: RelacionRow) {
    this.relaciones.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  async eliminarRelacion(_uow: UnitOfWork, tenantId: string, id: string) {
    return ok(this.relaciones.delete(this.k(tenantId, id)));
  }
  async aplicarDocumentacion(_uow: UnitOfWork, row: DocRow) {
    this.documentacion.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  private lista(map: Map<string, FilaAppend>, tenantId: string, ordenId: string, limit = 500) {
    return [...map.values()]
      .filter((r) => r.tenantId === tenantId && r.ordenId === ordenId)
      .sort((a, b) => b.registradoAt.getTime() - a.registradoAt.getTime() || a.eventId.localeCompare(b.eventId))
      .slice(0, limit);
  }
  async listarAsignaciones(t: string, o: string) { return ok(this.lista(this.asignaciones, t, o)); }
  async listarResponsables(t: string, o: string) { return ok(this.lista(this.responsables, t, o)); }
  async listarHistorial(t: string, o: string, limit?: number) { return ok(this.lista(this.historial, t, o, limit)); }
  async listarBitacora(t: string, o: string, limit?: number) { return ok(this.lista(this.bitacora, t, o, limit)); }
  async listarRelaciones(t: string, o: string, categoria?: string) {
    return ok([...this.relaciones.values()].filter((r) => r.tenantId === t && r.ordenId === o && (!categoria || r.categoria === categoria)));
  }
  async listarDocumentacion(t: string, o: string, clase?: string) {
    return ok([...this.documentacion.values()].filter((r) => r.tenantId === t && r.ordenId === o && (!clase || r.clase === clase)));
  }
  async contar(tenantId: string) {
    const c = (m: Map<string, { tenantId: string }>) => [...m.values()].filter((r) => r.tenantId === tenantId).length;
    return ok({
      agenda: c(this.agenda), asignaciones: c(this.asignaciones), responsables: c(this.responsables),
      historial: c(this.historial), bitacora: c(this.bitacora), relaciones: c(this.relaciones), documentacion: c(this.documentacion),
    });
  }
  async clear(_uow: UnitOfWork, tenantId: string) {
    for (const m of [this.agenda, this.relaciones, this.documentacion]) {
      for (const [k, r] of m as Map<string, { tenantId: string }>) if (r.tenantId === tenantId) m.delete(k);
    }
    for (const m of [this.asignaciones, this.responsables, this.historial, this.bitacora]) {
      const seen = this.applied.get(m);
      for (const [k, r] of m) if (r.tenantId === tenantId) { seen?.delete(this.k(r.tenantId, r.eventId)); m.delete(k); }
    }
    return ok(undefined);
  }
}

/* -------------------------- PG de proyecciones --------------------------- */

const parseJson = (v: unknown): Record<string, unknown> =>
  (typeof v === "string" ? JSON.parse(v) : (v as Record<string, unknown>)) ?? {};

export class PgProyeccionesStore implements ProyeccionesStore {
  constructor(private readonly pool: Pool) {}

  async aplicarAgenda(uow: UnitOfWork, row: AgendaRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_agenda_read
           (tenant_id, id, codigo, titulo, estado, responsable, inicio_planificado, fin_planificado,
            ventana_inicio, ventana_fin, programacion_estado, en_conflicto, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (tenant_id, id) DO UPDATE
           SET codigo=EXCLUDED.codigo, titulo=EXCLUDED.titulo, estado=EXCLUDED.estado, responsable=EXCLUDED.responsable,
               inicio_planificado=EXCLUDED.inicio_planificado, fin_planificado=EXCLUDED.fin_planificado,
               ventana_inicio=EXCLUDED.ventana_inicio, ventana_fin=EXCLUDED.ventana_fin,
               programacion_estado=EXCLUDED.programacion_estado, en_conflicto=EXCLUDED.en_conflicto,
               version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
           WHERE deltaops.ord_agenda_read.last_event_id <> EXCLUDED.last_event_id
             AND deltaops.ord_agenda_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.codigo, row.titulo, row.estado, row.responsable, row.inicioPlanificado,
         row.finPlanificado, row.ventanaInicio, row.ventanaFin, row.programacionEstado, row.enConflicto,
         row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("agenda apply falló", err)); }
  }
  async agendaRango(tenantId: string, desde: Date | null, hasta: Date | null, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.ord_agenda_read
           WHERE tenant_id=$1
             AND ($2::timestamptz IS NULL OR inicio_planificado >= $2)
             AND ($3::timestamptz IS NULL OR inicio_planificado <= $3)
           ORDER BY inicio_planificado ASC NULLS LAST, id ASC LIMIT $4`,
          [tenantId, desde, hasta, limit],
        ),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), codigo: String(r["codigo"] ?? ""),
        titulo: String(r["titulo"] ?? ""), estado: String(r["estado"] ?? ""),
        responsable: (r["responsable"] as string | null) ?? null,
        inicioPlanificado: (r["inicio_planificado"] as Date | null) ?? null,
        finPlanificado: (r["fin_planificado"] as Date | null) ?? null,
        ventanaInicio: (r["ventana_inicio"] as Date | null) ?? null,
        ventanaFin: (r["ventana_fin"] as Date | null) ?? null,
        programacionEstado: String(r["programacion_estado"] ?? "sin-programar"),
        enConflicto: Boolean(r["en_conflicto"]), version: Number(r["version"] ?? 1),
        lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("agendaRango falló", err)); }
  }

  private async appendGeneric(uow: UnitOfWork, tabla: string, cols: string[], row: FilaAppend): Promise<Result<boolean, KernelError>> {
    await setTenant(uow, row.tenantId);
    const values = cols.map((c) => this.colValue(row, c));
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
    const res = await pgSessionOf(uow).query(
      `INSERT INTO ${tabla} (${cols.join(",")}) VALUES (${placeholders}) ON CONFLICT (tenant_id, event_id) DO NOTHING`,
      values,
    );
    return ok((res.rowCount ?? 0) > 0);
  }
  private colValue(row: FilaAppend, col: string): unknown {
    switch (col) {
      case "tenant_id": return row.tenantId;
      case "event_id": return row.eventId;
      case "orden_id": return row.ordenId;
      case "registrado_at": return row.registradoAt;
      case "detalle": return JSON.stringify(row["detalle"] ?? {});
      case "vigente": return row["vigente"] ?? true;
      case "version": return row["version"] ?? 1;
      default: return (row[toCamel(col)] as unknown) ?? null;
    }
  }

  async aplicarAsignacion(uow: UnitOfWork, row: FilaAppend) {
    try {
      return await this.appendGeneric(uow, "deltaops.ord_asignaciones_read",
        ["tenant_id", "event_id", "orden_id", "tipo", "asignado_id", "asignado_identity_id", "asignado_nombre", "asignado_email", "rol", "vigente", "version", "actor_id", "registrado_at"], row);
    } catch (err) { return fail(KernelErrors.infrastructure("asignacion apply falló", err)); }
  }
  async aplicarResponsable(uow: UnitOfWork, row: FilaAppend) {
    try {
      return await this.appendGeneric(uow, "deltaops.ord_responsables_read",
        ["tenant_id", "event_id", "orden_id", "responsable", "supervisor", "version", "actor_id", "registrado_at"], row);
    } catch (err) { return fail(KernelErrors.infrastructure("responsable apply falló", err)); }
  }
  async aplicarHistorial(uow: UnitOfWork, row: FilaAppend) {
    try {
      return await this.appendGeneric(uow, "deltaops.ord_historial_read",
        ["tenant_id", "event_id", "orden_id", "tipo", "resumen", "actor_id", "registrado_at"], row);
    } catch (err) { return fail(KernelErrors.infrastructure("historial apply falló", err)); }
  }
  async aplicarBitacora(uow: UnitOfWork, row: FilaAppend) {
    try {
      return await this.appendGeneric(uow, "deltaops.ord_bitacora_read",
        ["tenant_id", "event_id", "orden_id", "accion", "detalle", "actor_id", "ocurrido_at", "registrado_at"], row);
    } catch (err) { return fail(KernelErrors.infrastructure("bitacora apply falló", err)); }
  }

  async aplicarRelacion(uow: UnitOfWork, row: RelacionRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_relaciones_read
           (tenant_id, id, categoria, tipo, orden_id, destino_id, destino_codigo, destino_nombre, datos, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, id) DO UPDATE
           SET categoria=EXCLUDED.categoria, tipo=EXCLUDED.tipo, orden_id=EXCLUDED.orden_id, destino_id=EXCLUDED.destino_id,
               destino_codigo=EXCLUDED.destino_codigo, destino_nombre=EXCLUDED.destino_nombre, datos=EXCLUDED.datos,
               last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
           WHERE deltaops.ord_relaciones_read.last_event_id <> EXCLUDED.last_event_id`,
        [row.tenantId, row.id, row.categoria, row.tipo, row.ordenId, row.destinoId, row.destinoCodigo,
         row.destinoNombre, JSON.stringify(row.datos), row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("relacion apply falló", err)); }
  }
  async eliminarRelacion(uow: UnitOfWork, tenantId: string, id: string) {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(`DELETE FROM deltaops.ord_relaciones_read WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("relacion eliminar falló", err)); }
  }
  async aplicarDocumentacion(uow: UnitOfWork, row: DocRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_documentacion_read
           (tenant_id, id, orden_id, clase, referencia_clave, referencia_version, respuesta_id, titulo, datos, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, id) DO UPDATE
           SET orden_id=EXCLUDED.orden_id, clase=EXCLUDED.clase, referencia_clave=EXCLUDED.referencia_clave,
               referencia_version=EXCLUDED.referencia_version, respuesta_id=EXCLUDED.respuesta_id, titulo=EXCLUDED.titulo,
               datos=EXCLUDED.datos, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
           WHERE deltaops.ord_documentacion_read.last_event_id <> EXCLUDED.last_event_id`,
        [row.tenantId, row.id, row.ordenId, row.clase, row.referenciaClave, row.referenciaVersion, row.respuestaId,
         row.titulo, JSON.stringify(row.datos), row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("documentacion apply falló", err)); }
  }

  private async listAppend(tenantId: string, tabla: string, ordenId: string, orderCol: string, limit = 500): Promise<Result<FilaAppend[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM ${tabla} WHERE tenant_id=$1 AND orden_id=$2 ORDER BY ${orderCol} DESC, event_id ASC LIMIT $3`, [tenantId, ordenId, limit]),
      );
      return ok(res.rows.map((r) => this.toAppend(r)));
    } catch (err) { return fail(KernelErrors.infrastructure(`list ${tabla} falló`, err)); }
  }
  private toAppend(r: Record<string, unknown>): FilaAppend {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[toCamel(k)] = v;
    if (r["detalle"] !== undefined) out["detalle"] = parseJson(r["detalle"]);
    return {
      ...out,
      tenantId: String(r["tenant_id"]),
      eventId: String(r["event_id"]),
      ordenId: String(r["orden_id"]),
      registradoAt: r["registrado_at"] as Date,
    };
  }
  async listarAsignaciones(t: string, o: string) { return this.listAppend(t, "deltaops.ord_asignaciones_read", o, "registrado_at"); }
  async listarResponsables(t: string, o: string) { return this.listAppend(t, "deltaops.ord_responsables_read", o, "registrado_at"); }
  async listarHistorial(t: string, o: string, limit?: number) { return this.listAppend(t, "deltaops.ord_historial_read", o, "registrado_at", limit); }
  async listarBitacora(t: string, o: string, limit?: number) { return this.listAppend(t, "deltaops.ord_bitacora_read", o, "ocurrido_at", limit); }
  async listarRelaciones(t: string, o: string, categoria?: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.ord_relaciones_read WHERE tenant_id=$1 AND orden_id=$2 AND ($3::text IS NULL OR categoria=$3) ORDER BY actualizado_at DESC`,
          [t, o, categoria ?? null],
        ),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), categoria: String(r["categoria"]), tipo: String(r["tipo"]),
        ordenId: String(r["orden_id"]), destinoId: String(r["destino_id"]),
        destinoCodigo: (r["destino_codigo"] as string | null) ?? null, destinoNombre: (r["destino_nombre"] as string | null) ?? null,
        datos: parseJson(r["datos"]), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("listarRelaciones falló", err)); }
  }
  async listarDocumentacion(t: string, o: string, clase?: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.ord_documentacion_read WHERE tenant_id=$1 AND orden_id=$2 AND ($3::text IS NULL OR clase=$3) ORDER BY actualizado_at DESC`,
          [t, o, clase ?? null],
        ),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), ordenId: String(r["orden_id"]), clase: String(r["clase"]),
        referenciaClave: (r["referencia_clave"] as string | null) ?? null,
        referenciaVersion: r["referencia_version"] == null ? null : Number(r["referencia_version"]),
        respuestaId: (r["respuesta_id"] as string | null) ?? null, titulo: (r["titulo"] as string | null) ?? null,
        datos: parseJson(r["datos"]), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("listarDocumentacion falló", err)); }
  }
  async contar(tenantId: string) {
    try {
      const tablas: Array<[string, string]> = [
        ["agenda", "ord_agenda_read"], ["asignaciones", "ord_asignaciones_read"], ["responsables", "ord_responsables_read"],
        ["historial", "ord_historial_read"], ["bitacora", "ord_bitacora_read"], ["relaciones", "ord_relaciones_read"],
        ["documentacion", "ord_documentacion_read"],
      ];
      const out: Record<string, number> = {};
      await withTenantRead(this.pool, tenantId, async (c) => {
        for (const [nombre, tabla] of tablas) {
          const r = await c.query(`SELECT count(*)::int AS n FROM deltaops.${tabla} WHERE tenant_id=$1`, [tenantId]);
          out[nombre] = Number(r.rows[0]?.["n"] ?? 0);
        }
      });
      return ok(out);
    } catch (err) { return fail(KernelErrors.infrastructure("contar proyecciones falló", err)); }
  }
  async clear(uow: UnitOfWork, tenantId: string) {
    try {
      await setTenant(uow, tenantId);
      for (const tabla of ["ord_agenda_read", "ord_asignaciones_read", "ord_responsables_read", "ord_historial_read", "ord_bitacora_read", "ord_relaciones_read", "ord_documentacion_read"]) {
        await pgSessionOf(uow).query(`DELETE FROM deltaops.${tabla} WHERE tenant_id=$1`, [tenantId]);
      }
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("clear proyecciones falló", err)); }
  }
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/* ==================== Stores operacionales (fuente de verdad) ============ */

export interface Planificacion {
  readonly ordenId: string;
  readonly inicioPlanificado: Date | null; readonly finPlanificado: Date | null;
  readonly ventanaInicio: Date | null; readonly ventanaFin: Date | null;
  readonly estado: string; readonly bloqueoMotivo: string | null;
  readonly enConflicto: boolean; readonly reprogramaciones: number;
  readonly datos: Record<string, unknown>; readonly version: number;
  readonly updatedBy: string; readonly updatedAt: Date;
}
export interface Asignacion {
  readonly id: string; readonly ordenId: string; readonly tipo: string; readonly asignadoId: string;
  /**
   * DGP-020.1 — Referencia FUERTE a la identidad canónica (`idn_identities`).
   * Presente y validado cuando `tipo='persona'`; null para tipos no-persona
   * (grupo/cuadrilla/contratista) y para asignaciones históricas por texto libre.
   */
  readonly asignadoIdentityId: string | null;
  readonly rol: string | null; readonly vigente: boolean; readonly datos: Record<string, unknown>;
  readonly createdBy: string; readonly createdAt: Date;
}
export interface Recurso {
  readonly id: string; readonly ordenId: string; readonly clase: string; readonly referenciaId: string;
  readonly descripcion: string | null; readonly cantidad: number | null; readonly unidad: string | null;
  readonly datos: Record<string, unknown>; readonly createdBy: string; readonly createdAt: Date;
}
export interface Sla {
  readonly ordenId: string; readonly politica: string | null; readonly inicioAt: Date | null;
  readonly vencimientoAt: Date | null; readonly minutosObjetivo: number | null; readonly minutosPausados: number;
  readonly minutosRestantes: number | null; readonly suspendido: boolean; readonly suspendidoDesde: Date | null;
  readonly estado: string; readonly datos: Record<string, unknown>; readonly version: number;
  readonly updatedBy: string; readonly updatedAt: Date;
}
export interface RelacionArista {
  readonly id: string; readonly categoria: string; readonly tipo: string; readonly ordenId: string;
  readonly destinoId: string; readonly datos: Record<string, unknown>; readonly createdBy: string; readonly createdAt: Date;
}

export interface MotorStore {
  planificacionGet(tenantId: string, ordenId: string): Promise<Result<Planificacion | null, KernelError>>;
  planificacionUpsert(uow: UnitOfWork, tenantId: string, p: Planificacion, expectedVersion: number | null): Promise<Result<void, KernelError>>;
  asignacionInsert(uow: UnitOfWork, tenantId: string, a: Asignacion): Promise<Result<void, KernelError>>;
  asignacionCerrarVigentes(uow: UnitOfWork, tenantId: string, ordenId: string, rol: string | null): Promise<Result<void, KernelError>>;
  recursoInsert(uow: UnitOfWork, tenantId: string, r: Recurso): Promise<Result<void, KernelError>>;
  slaGet(tenantId: string, ordenId: string): Promise<Result<Sla | null, KernelError>>;
  slaUpsert(uow: UnitOfWork, tenantId: string, s: Sla, expectedVersion: number | null): Promise<Result<void, KernelError>>;
  relacionExiste(tenantId: string, categoria: string, tipo: string, ordenId: string, destinoId: string): Promise<Result<boolean, KernelError>>;
  relacionInsert(uow: UnitOfWork, tenantId: string, r: RelacionArista): Promise<Result<void, KernelError>>;
}

export class FakeMotorStore implements MotorStore {
  private readonly planif = new Map<string, Planificacion>();
  private readonly asign = new Map<string, Asignacion>();
  private readonly recursos = new Map<string, Recurso>();
  private readonly sla = new Map<string, Sla>();
  private readonly relaciones = new Map<string, RelacionArista>();
  private k(t: string, id: string) { return `${t}::${id}`; }

  async planificacionGet(t: string, o: string) { return ok(this.planif.get(this.k(t, o)) ?? null); }
  async planificacionUpsert(_u: UnitOfWork, t: string, p: Planificacion, expected: number | null) {
    const cur = this.planif.get(this.k(t, p.ordenId));
    if (cur && expected !== null && cur.version !== expected) return fail(KernelErrors.conflict(`Conflicto de versión en planificación de ${p.ordenId}`));
    this.planif.set(this.k(t, p.ordenId), p);
    return ok(undefined);
  }
  async asignacionInsert(_u: UnitOfWork, t: string, a: Asignacion) {
    if (this.asign.has(this.k(t, a.id))) return fail(KernelErrors.conflict(`Asignación ${a.id} ya existe`));
    this.asign.set(this.k(t, a.id), a);
    return ok(undefined);
  }
  async asignacionCerrarVigentes(_u: UnitOfWork, t: string, ordenId: string, rol: string | null) {
    for (const [k, a] of this.asign) {
      if (a.ordenId === ordenId && a.vigente && (rol === null || a.rol === rol) && k.startsWith(`${t}::`)) {
        this.asign.set(k, { ...a, vigente: false });
      }
    }
    return ok(undefined);
  }
  async recursoInsert(_u: UnitOfWork, t: string, r: Recurso) {
    if (this.recursos.has(this.k(t, r.id))) return fail(KernelErrors.conflict(`Recurso ${r.id} ya existe`));
    this.recursos.set(this.k(t, r.id), r);
    return ok(undefined);
  }
  async slaGet(t: string, o: string) { return ok(this.sla.get(this.k(t, o)) ?? null); }
  async slaUpsert(_u: UnitOfWork, t: string, s: Sla, expected: number | null) {
    const cur = this.sla.get(this.k(t, s.ordenId));
    if (cur && expected !== null && cur.version !== expected) return fail(KernelErrors.conflict(`Conflicto de versión en SLA de ${s.ordenId}`));
    this.sla.set(this.k(t, s.ordenId), s);
    return ok(undefined);
  }
  async relacionExiste(t: string, categoria: string, tipo: string, ordenId: string, destinoId: string) {
    for (const r of this.relaciones.values()) {
      if (r.ordenId === ordenId && r.destinoId === destinoId && r.categoria === categoria && r.tipo === tipo) {
        const anyMatch = [...this.relaciones.entries()].some(([k, x]) => x === r && k.startsWith(`${t}::`));
        if (anyMatch) return ok(true);
      }
    }
    return ok(false);
  }
  async relacionInsert(_u: UnitOfWork, t: string, r: RelacionArista) {
    if (this.relaciones.has(this.k(t, r.id))) return fail(KernelErrors.conflict(`Relación ${r.id} ya existe`));
    this.relaciones.set(this.k(t, r.id), r);
    return ok(undefined);
  }
}

export class PgMotorStore implements MotorStore {
  constructor(private readonly pool: Pool) {}
  async planificacionGet(tenantId: string, ordenId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_planificacion WHERE tenant_id=$1 AND orden_id=$2`, [tenantId, ordenId]),
      );
      const r = res.rows[0];
      if (!r) return ok(null);
      return ok({
        ordenId: String(r["orden_id"]), inicioPlanificado: (r["inicio_planificado"] as Date | null) ?? null,
        finPlanificado: (r["fin_planificado"] as Date | null) ?? null, ventanaInicio: (r["ventana_inicio"] as Date | null) ?? null,
        ventanaFin: (r["ventana_fin"] as Date | null) ?? null, estado: String(r["estado"]),
        bloqueoMotivo: (r["bloqueo_motivo"] as string | null) ?? null, enConflicto: Boolean(r["en_conflicto"]),
        reprogramaciones: Number(r["reprogramaciones"] ?? 0), datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1),
        updatedBy: String(r["updated_by"] ?? ""), updatedAt: r["updated_at"] as Date,
      });
    } catch (err) { return fail(KernelErrors.infrastructure("planificacionGet falló", err)); }
  }
  async planificacionUpsert(uow: UnitOfWork, tenantId: string, p: Planificacion, expected: number | null) {
    try {
      await setTenant(uow, tenantId);
      if (expected === null) {
        await pgSessionOf(uow).query(
          `INSERT INTO deltaops.ord_planificacion
             (tenant_id, orden_id, inicio_planificado, fin_planificado, ventana_inicio, ventana_fin, estado, bloqueo_motivo, en_conflicto, reprogramaciones, datos, version, updated_by, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [tenantId, p.ordenId, p.inicioPlanificado, p.finPlanificado, p.ventanaInicio, p.ventanaFin, p.estado, p.bloqueoMotivo, p.enConflicto, p.reprogramaciones, JSON.stringify(p.datos), p.version, p.updatedBy, p.updatedAt],
        );
        return ok(undefined);
      }
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.ord_planificacion
         SET inicio_planificado=$3, fin_planificado=$4, ventana_inicio=$5, ventana_fin=$6, estado=$7, bloqueo_motivo=$8,
             en_conflicto=$9, reprogramaciones=$10, datos=$11, version=$12, updated_by=$13, updated_at=$14
         WHERE tenant_id=$1 AND orden_id=$2 AND version=$15`,
        [tenantId, p.ordenId, p.inicioPlanificado, p.finPlanificado, p.ventanaInicio, p.ventanaFin, p.estado, p.bloqueoMotivo, p.enConflicto, p.reprogramaciones, JSON.stringify(p.datos), p.version, p.updatedBy, p.updatedAt, expected],
      );
      if (res.rowCount === 0) return fail(KernelErrors.conflict(`Conflicto de versión en planificación de ${p.ordenId}`));
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("planificacionUpsert falló", err)); }
  }
  async asignacionInsert(uow: UnitOfWork, tenantId: string, a: Asignacion) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_asignaciones (tenant_id, id, orden_id, tipo, asignado_id, asignado_identity_id, rol, vigente, datos, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tenantId, a.id, a.ordenId, a.tipo, a.asignadoId, a.asignadoIdentityId, a.rol, a.vigente, JSON.stringify(a.datos), a.createdBy, a.createdAt],
      );
      return ok(undefined);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`Asignación ${a.id} ya existe`));
      return fail(KernelErrors.infrastructure("asignacionInsert falló", err));
    }
  }
  async asignacionCerrarVigentes(uow: UnitOfWork, tenantId: string, ordenId: string, rol: string | null) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `UPDATE deltaops.ord_asignaciones SET vigente=false WHERE tenant_id=$1 AND orden_id=$2 AND vigente=true AND ($3::text IS NULL OR rol=$3)`,
        [tenantId, ordenId, rol],
      );
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("asignacionCerrarVigentes falló", err)); }
  }
  async recursoInsert(uow: UnitOfWork, tenantId: string, r: Recurso) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_recursos (tenant_id, id, orden_id, clase, referencia_id, descripcion, cantidad, unidad, datos, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tenantId, r.id, r.ordenId, r.clase, r.referenciaId, r.descripcion, r.cantidad, r.unidad, JSON.stringify(r.datos), r.createdBy, r.createdAt],
      );
      return ok(undefined);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`Recurso ${r.id} ya existe`));
      return fail(KernelErrors.infrastructure("recursoInsert falló", err));
    }
  }
  async slaGet(tenantId: string, ordenId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.ord_sla WHERE tenant_id=$1 AND orden_id=$2`, [tenantId, ordenId]),
      );
      const r = res.rows[0];
      if (!r) return ok(null);
      return ok({
        ordenId: String(r["orden_id"]), politica: (r["politica"] as string | null) ?? null,
        inicioAt: (r["inicio_at"] as Date | null) ?? null, vencimientoAt: (r["vencimiento_at"] as Date | null) ?? null,
        minutosObjetivo: r["minutos_objetivo"] == null ? null : Number(r["minutos_objetivo"]),
        minutosPausados: Number(r["minutos_pausados"] ?? 0),
        minutosRestantes: r["minutos_restantes"] == null ? null : Number(r["minutos_restantes"]),
        suspendido: Boolean(r["suspendido"]), suspendidoDesde: (r["suspendido_desde"] as Date | null) ?? null,
        estado: String(r["estado"] ?? "vigente"), datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1),
        updatedBy: String(r["updated_by"] ?? ""), updatedAt: r["updated_at"] as Date,
      });
    } catch (err) { return fail(KernelErrors.infrastructure("slaGet falló", err)); }
  }
  async slaUpsert(uow: UnitOfWork, tenantId: string, s: Sla, expected: number | null) {
    try {
      await setTenant(uow, tenantId);
      if (expected === null) {
        await pgSessionOf(uow).query(
          `INSERT INTO deltaops.ord_sla
             (tenant_id, orden_id, politica, inicio_at, vencimiento_at, minutos_objetivo, minutos_pausados, minutos_restantes, suspendido, suspendido_desde, estado, datos, version, updated_by, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [tenantId, s.ordenId, s.politica, s.inicioAt, s.vencimientoAt, s.minutosObjetivo, s.minutosPausados, s.minutosRestantes, s.suspendido, s.suspendidoDesde, s.estado, JSON.stringify(s.datos), s.version, s.updatedBy, s.updatedAt],
        );
        return ok(undefined);
      }
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.ord_sla
         SET politica=$3, inicio_at=$4, vencimiento_at=$5, minutos_objetivo=$6, minutos_pausados=$7, minutos_restantes=$8,
             suspendido=$9, suspendido_desde=$10, estado=$11, datos=$12, version=$13, updated_by=$14, updated_at=$15
         WHERE tenant_id=$1 AND orden_id=$2 AND version=$16`,
        [tenantId, s.ordenId, s.politica, s.inicioAt, s.vencimientoAt, s.minutosObjetivo, s.minutosPausados, s.minutosRestantes, s.suspendido, s.suspendidoDesde, s.estado, JSON.stringify(s.datos), s.version, s.updatedBy, s.updatedAt, expected],
      );
      if (res.rowCount === 0) return fail(KernelErrors.conflict(`Conflicto de versión en SLA de ${s.ordenId}`));
      return ok(undefined);
    } catch (err) { return fail(KernelErrors.infrastructure("slaUpsert falló", err)); }
  }
  async relacionExiste(tenantId: string, categoria: string, tipo: string, ordenId: string, destinoId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT 1 FROM deltaops.ord_relaciones WHERE tenant_id=$1 AND categoria=$2 AND tipo=$3 AND orden_id=$4 AND destino_id=$5`,
          [tenantId, categoria, tipo, ordenId, destinoId],
        ),
      );
      return ok(res.rows.length > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("relacionExiste falló", err)); }
  }
  async relacionInsert(uow: UnitOfWork, tenantId: string, r: RelacionArista) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ord_relaciones (tenant_id, id, categoria, tipo, orden_id, destino_id, datos, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tenantId, r.id, r.categoria, r.tipo, r.ordenId, r.destinoId, JSON.stringify(r.datos), r.createdBy, r.createdAt],
      );
      return ok(undefined);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`Relación duplicada (${r.categoria}/${r.tipo} ${r.ordenId}→${r.destinoId})`));
      return fail(KernelErrors.infrastructure("relacionInsert falló", err));
    }
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

const PREFIJO_EVENTO = "modulo.ordenes.";

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
           WHERE event_type LIKE $1 AND payload->>'tenantId' = $2
           ORDER BY occurred_at DESC LIMIT $3`,
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

void clone;
