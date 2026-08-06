/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Infra OPERACIONAL + CQRS.
 *
 * Puertos + adaptadores (Fake/PG) para: recibos de sincronización durables
 * (protocolo de reclamación offline), bitácora de eventos durable del módulo
 * (fuente de verdad del replay, `prv_eventos`), read models especializados
 * (programas, versiones, actividades, generaciones/calendario, programaciones —
 * reprogramaciones/suspensiones/exclusiones — e historial) y la consola técnica
 * (diagnóstico del outbox del Kernel filtrado al módulo). RLS por tenant en
 * lecturas y escrituras. Mismo patrón que module-abastecimiento (DGP-013.2).
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
          `INSERT INTO deltaops.prv_sync_receipts (tenant_id, op_id, cliente_id, comando, estado, resultado)
           VALUES ($1,$2,$3,$4,'pendiente','null'::jsonb)
           ON CONFLICT (tenant_id, op_id) DO NOTHING
           RETURNING (xmax = 0) AS inserted`,
          [tenantId, opId, clienteId, comando],
        );
        if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true }) as Result<ClaimResult, KernelError>;
        const ex = await c.query(`SELECT * FROM deltaops.prv_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]);
        const r = ex.rows[0];
        return ok({ duenio: false, recibo: r ? this.toReceipt(r) : undefined }) as Result<ClaimResult, KernelError>;
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt claim falló", err));
    }
  }
  async find(tenantId: string, opId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.prv_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]));
      return ok(res.rows[0] ? this.toReceipt(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt find falló", err));
    }
  }
  async finalize(tenantId: string, r: SyncReceipt) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `UPDATE deltaops.prv_sync_receipts SET estado=$3, resultado=$4, comando=$5, updated_at=now()
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
      await withTenantRead(this.pool, tenantId, (c) => c.query(`DELETE FROM deltaops.prv_sync_receipts WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`, [tenantId, opId]));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt release falló", err));
    }
  }
  async listByTenant(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.prv_sync_receipts WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]));
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
        `INSERT INTO deltaops.prv_eventos (tenant_id, event_id, tipo, payload, occurred_at)
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
      c.query(`SELECT tenant_id, event_id, tipo, payload, occurred_at FROM deltaops.prv_eventos WHERE tenant_id=$1 ORDER BY occurred_at ASC, event_id ASC`, [tenantId]),
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
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT count(*)::int AS n FROM deltaops.prv_eventos WHERE tenant_id=$1`, [tenantId]));
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog contar falló", err));
    }
  }
}

/* ================= Read models especializados (CQRS) ==================== */

export interface ProgramaReadRow {
  readonly tenantId: string; readonly id: string; readonly codigo: string; readonly nombre: string;
  readonly tipo: string; readonly clasificacion: string | null; readonly padreId: string | null;
  readonly estado: string; readonly versionPrograma: number; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface ProgramaReadFiltro { readonly estado?: string; readonly tipo?: string; readonly limit?: number; }

export interface ProgramaVersionReadRow {
  readonly tenantId: string; readonly programaId: string; readonly versionPrograma: number;
  readonly datos: Record<string, unknown>; readonly lastEventId: string; readonly actualizadoAt: Date;
}

export interface ActividadReadRow {
  readonly tenantId: string; readonly id: string; readonly programaId: string; readonly nombre: string;
  readonly orden: number; readonly moneda: string; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}

export interface GeneracionReadRow {
  readonly tenantId: string; readonly id: string; readonly programaId: string; readonly actividadId: string;
  readonly activoId: string; readonly ventana: string; readonly claveDedup: string; readonly origen: string;
  readonly fechaObjetivo: Date; readonly ordenTrabajoId: string | null; readonly estado: string;
  readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface GeneracionReadFiltro { readonly estado?: string; readonly limit?: number; }

export type TipoProgramacion = "reprogramacion" | "suspension" | "exclusion";

export interface ProgramacionReadRow {
  readonly tenantId: string; readonly id: string; readonly tipo: TipoProgramacion;
  readonly programaId: string | null; readonly actividadId: string | null; readonly activoId: string | null;
  readonly ventana: string | null; readonly motivo: string | null;
  readonly desde: Date | null; readonly hasta: Date | null;
  readonly datos: Record<string, unknown>; readonly lastEventId: string; readonly ocurridoAt: Date;
}

export interface HistorialReadRow {
  readonly tenantId: string; readonly id: string; readonly entityRef: string; readonly hito: string; readonly version: number;
  readonly detalle: Record<string, unknown>; readonly actorId: string; readonly ocurridoAt: Date; readonly lastEventId: string;
}

export interface ReadModelsStore {
  aplicarPrograma(uow: UnitOfWork, row: ProgramaReadRow): Promise<Result<boolean, KernelError>>;
  programaGet(tenantId: string, id: string): Promise<Result<ProgramaReadRow | null, KernelError>>;
  programaList(tenantId: string, filtro: ProgramaReadFiltro): Promise<Result<ProgramaReadRow[], KernelError>>;
  aplicarVersion(uow: UnitOfWork, row: ProgramaVersionReadRow): Promise<Result<boolean, KernelError>>;
  versionesPorPrograma(tenantId: string, programaId: string): Promise<Result<ProgramaVersionReadRow[], KernelError>>;
  aplicarActividad(uow: UnitOfWork, row: ActividadReadRow): Promise<Result<boolean, KernelError>>;
  actividadesPorPrograma(tenantId: string, programaId: string): Promise<Result<ActividadReadRow[], KernelError>>;
  aplicarGeneracion(uow: UnitOfWork, row: GeneracionReadRow): Promise<Result<boolean, KernelError>>;
  generacionesPorPrograma(tenantId: string, programaId: string, filtro?: GeneracionReadFiltro): Promise<Result<GeneracionReadRow[], KernelError>>;
  aplicarProgramacion(uow: UnitOfWork, row: ProgramacionReadRow): Promise<Result<boolean, KernelError>>;
  programacionesPorPrograma(tenantId: string, programaId: string, limit?: number): Promise<Result<ProgramacionReadRow[], KernelError>>;
  aplicarHistorial(uow: UnitOfWork, row: HistorialReadRow): Promise<Result<boolean, KernelError>>;
  historialPorEntidad(tenantId: string, entityRef: string, limit?: number): Promise<Result<HistorialReadRow[], KernelError>>;
  contar(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/* --------------------------- Fake de read models ------------------------- */

export class FakeReadModelsStore implements ReadModelsStore {
  private readonly programas = new Map<string, ProgramaReadRow>();
  private readonly versiones = new Map<string, ProgramaVersionReadRow>();
  private readonly actividades = new Map<string, ActividadReadRow>();
  private readonly generaciones = new Map<string, GeneracionReadRow>();
  private readonly programaciones = new Map<string, ProgramacionReadRow>();
  private readonly historial = new Map<string, HistorialReadRow>();
  private k(t: string, id: string) { return `${t}::${id}`; }

  private aplicarVersionado<T extends { tenantId: string; id: string; version: number; lastEventId: string }>(m: Map<string, T>, row: T): Result<boolean, KernelError> {
    const cur = m.get(this.k(row.tenantId, row.id));
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    m.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }

  async aplicarPrograma(_uow: UnitOfWork, row: ProgramaReadRow) { return this.aplicarVersionado(this.programas, row); }
  async programaGet(t: string, id: string) { return ok(this.programas.get(this.k(t, id)) ?? null); }
  async programaList(t: string, f: ProgramaReadFiltro) {
    let rows = [...this.programas.values()].filter((r) => r.tenantId === t);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    if (f.tipo) rows = rows.filter((r) => r.tipo === f.tipo);
    rows.sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 200));
  }

  async aplicarVersion(_uow: UnitOfWork, row: ProgramaVersionReadRow) {
    const k = `${row.tenantId}::${row.programaId}::v${row.versionPrograma}`;
    const cur = this.versiones.get(k);
    if (cur && cur.lastEventId === row.lastEventId) return ok(false);
    this.versiones.set(k, row);
    return ok(true);
  }
  async versionesPorPrograma(t: string, programaId: string) {
    return ok([...this.versiones.values()].filter((r) => r.tenantId === t && r.programaId === programaId).sort((a, b) => a.versionPrograma - b.versionPrograma));
  }

  async aplicarActividad(_uow: UnitOfWork, row: ActividadReadRow) { return this.aplicarVersionado(this.actividades, row); }
  async actividadesPorPrograma(t: string, programaId: string) {
    return ok([...this.actividades.values()].filter((r) => r.tenantId === t && r.programaId === programaId).sort((a, b) => a.orden - b.orden || (a.id < b.id ? -1 : 1)));
  }

  async aplicarGeneracion(_uow: UnitOfWork, row: GeneracionReadRow) { return this.aplicarVersionado(this.generaciones, row); }
  async generacionesPorPrograma(t: string, programaId: string, f: GeneracionReadFiltro = {}) {
    let rows = [...this.generaciones.values()].filter((r) => r.tenantId === t && r.programaId === programaId);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    rows.sort((a, b) => a.fechaObjetivo.getTime() - b.fechaObjetivo.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 500));
  }

  async aplicarProgramacion(_uow: UnitOfWork, row: ProgramacionReadRow) {
    const k = this.k(row.tenantId, row.id);
    if (this.programaciones.has(k)) return ok(false);
    this.programaciones.set(k, row);
    return ok(true);
  }
  async programacionesPorPrograma(t: string, programaId: string, limit = 500) {
    return ok([...this.programaciones.values()].filter((r) => r.tenantId === t && r.programaId === programaId).sort((a, b) => b.ocurridoAt.getTime() - a.ocurridoAt.getTime()).slice(0, limit));
  }

  async aplicarHistorial(_uow: UnitOfWork, row: HistorialReadRow) {
    const k = this.k(row.tenantId, row.id);
    if (this.historial.has(k)) return ok(false);
    this.historial.set(k, row);
    return ok(true);
  }
  async historialPorEntidad(t: string, entityRef: string, limit = 500) {
    return ok([...this.historial.values()].filter((r) => r.tenantId === t && r.entityRef === entityRef).sort((a, b) => a.ocurridoAt.getTime() - b.ocurridoAt.getTime()).slice(0, limit));
  }

  async contar(t: string) {
    return ok({
      prv_programas_read: [...this.programas.values()].filter((r) => r.tenantId === t).length,
      prv_programa_versiones_read: [...this.versiones.values()].filter((r) => r.tenantId === t).length,
      prv_actividades_read: [...this.actividades.values()].filter((r) => r.tenantId === t).length,
      prv_generaciones_read: [...this.generaciones.values()].filter((r) => r.tenantId === t).length,
      prv_programaciones_read: [...this.programaciones.values()].filter((r) => r.tenantId === t).length,
      prv_historial_read: [...this.historial.values()].filter((r) => r.tenantId === t).length,
    });
  }
  async clear(_uow: UnitOfWork, t: string) {
    for (const m of [this.programas, this.actividades, this.generaciones, this.historial] as Map<string, { tenantId: string }>[]) {
      for (const [k, r] of m) if (r.tenantId === t) m.delete(k);
    }
    for (const [k, r] of this.versiones) if (r.tenantId === t) this.versiones.delete(k);
    for (const [k, r] of this.programaciones) if (r.tenantId === t) this.programaciones.delete(k);
    return ok(undefined);
  }
}

/* --------------------------- PG de read models --------------------------- */

export class PgReadModelsStore implements ReadModelsStore {
  constructor(private readonly pool: Pool) {}

  async aplicarPrograma(uow: UnitOfWork, row: ProgramaReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_programas_read
           (tenant_id, id, codigo, nombre, tipo, clasificacion, padre_id, estado, version_programa, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           codigo=EXCLUDED.codigo, nombre=EXCLUDED.nombre, tipo=EXCLUDED.tipo, clasificacion=EXCLUDED.clasificacion,
           padre_id=EXCLUDED.padre_id, estado=EXCLUDED.estado, version_programa=EXCLUDED.version_programa, datos=EXCLUDED.datos,
           version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.prv_programas_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.prv_programas_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.codigo, row.nombre, row.tipo, row.clasificacion, row.padreId, row.estado, row.versionPrograma, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("programa read apply falló", err)); }
  }
  async programaGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.prv_programas_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toPrograma(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("programa read get falló", err)); }
  }
  async programaList(t: string, f: ProgramaReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.prv_programas_read
           WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2) AND ($3::text IS NULL OR tipo=$3)
           ORDER BY actualizado_at DESC, id ASC LIMIT $4`,
          [t, f.estado ?? null, f.tipo ?? null, f.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => this.toPrograma(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("programa read list falló", err)); }
  }
  private toPrograma(r: Record<string, unknown>): ProgramaReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), codigo: String(r["codigo"] ?? ""), nombre: String(r["nombre"] ?? ""),
      tipo: String(r["tipo"] ?? ""), clasificacion: (r["clasificacion"] as string | null) ?? null, padreId: (r["padre_id"] as string | null) ?? null,
      estado: String(r["estado"] ?? ""), versionPrograma: Number(r["version_programa"] ?? 1), datos: parseJson(r["datos"]),
      version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarVersion(uow: UnitOfWork, row: ProgramaVersionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_programa_versiones_read (tenant_id, programa_id, version_programa, datos, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (tenant_id, programa_id, version_programa) DO UPDATE SET
           datos=EXCLUDED.datos, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.prv_programa_versiones_read.last_event_id <> EXCLUDED.last_event_id`,
        [row.tenantId, row.programaId, row.versionPrograma, JSON.stringify(row.datos), row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("version read apply falló", err)); }
  }
  async versionesPorPrograma(t: string, programaId: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.prv_programa_versiones_read WHERE tenant_id=$1 AND programa_id=$2 ORDER BY version_programa ASC`, [t, programaId]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), programaId: String(r["programa_id"]), versionPrograma: Number(r["version_programa"] ?? 1),
        datos: parseJson(r["datos"]), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("version read list falló", err)); }
  }

  async aplicarActividad(uow: UnitOfWork, row: ActividadReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_actividades_read (tenant_id, id, programa_id, nombre, orden, moneda, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           programa_id=EXCLUDED.programa_id, nombre=EXCLUDED.nombre, orden=EXCLUDED.orden, moneda=EXCLUDED.moneda, datos=EXCLUDED.datos,
           version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.prv_actividades_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.prv_actividades_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.programaId, row.nombre, row.orden, row.moneda, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("actividad read apply falló", err)); }
  }
  async actividadesPorPrograma(t: string, programaId: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.prv_actividades_read WHERE tenant_id=$1 AND programa_id=$2 ORDER BY orden ASC, id ASC`, [t, programaId]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), programaId: String(r["programa_id"]), nombre: String(r["nombre"] ?? ""),
        orden: Number(r["orden"] ?? 0), moneda: String(r["moneda"] ?? ""), datos: parseJson(r["datos"]),
        version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("actividad read list falló", err)); }
  }

  async aplicarGeneracion(uow: UnitOfWork, row: GeneracionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_generaciones_read
           (tenant_id, id, programa_id, actividad_id, activo_id, ventana, clave_dedup, origen, fecha_objetivo, orden_trabajo_id, estado, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           orden_trabajo_id=EXCLUDED.orden_trabajo_id, estado=EXCLUDED.estado, datos=EXCLUDED.datos,
           version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.prv_generaciones_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.prv_generaciones_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.programaId, row.actividadId, row.activoId, row.ventana, row.claveDedup, row.origen, row.fechaObjetivo, row.ordenTrabajoId, row.estado, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("generacion read apply falló", err)); }
  }
  async generacionesPorPrograma(t: string, programaId: string, f: GeneracionReadFiltro = {}) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.prv_generaciones_read
           WHERE tenant_id=$1 AND programa_id=$2 AND ($3::text IS NULL OR estado=$3)
           ORDER BY fecha_objetivo ASC, id ASC LIMIT $4`,
          [t, programaId, f.estado ?? null, f.limit ?? 500],
        ),
      );
      return ok(res.rows.map((r) => this.toGeneracion(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("generacion read list falló", err)); }
  }
  private toGeneracion(r: Record<string, unknown>): GeneracionReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), programaId: String(r["programa_id"]), actividadId: String(r["actividad_id"]),
      activoId: String(r["activo_id"]), ventana: String(r["ventana"] ?? ""), claveDedup: String(r["clave_dedup"] ?? ""), origen: String(r["origen"] ?? ""),
      fechaObjetivo: r["fecha_objetivo"] as Date, ordenTrabajoId: (r["orden_trabajo_id"] as string | null) ?? null, estado: String(r["estado"] ?? ""),
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarProgramacion(uow: UnitOfWork, row: ProgramacionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_programaciones_read
           (tenant_id, id, tipo, programa_id, actividad_id, activo_id, ventana, motivo, desde, hasta, datos, last_event_id, ocurrido_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (tenant_id, id) DO NOTHING`,
        [row.tenantId, row.id, row.tipo, row.programaId, row.actividadId, row.activoId, row.ventana, row.motivo, row.desde, row.hasta, JSON.stringify(row.datos), row.lastEventId, row.ocurridoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("programacion read apply falló", err)); }
  }
  async programacionesPorPrograma(t: string, programaId: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.prv_programaciones_read WHERE tenant_id=$1 AND programa_id=$2 ORDER BY ocurrido_at DESC, id ASC LIMIT $3`, [t, programaId, limit]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), tipo: String(r["tipo"]) as TipoProgramacion,
        programaId: (r["programa_id"] as string | null) ?? null, actividadId: (r["actividad_id"] as string | null) ?? null,
        activoId: (r["activo_id"] as string | null) ?? null, ventana: (r["ventana"] as string | null) ?? null,
        motivo: (r["motivo"] as string | null) ?? null, desde: (r["desde"] as Date | null) ?? null, hasta: (r["hasta"] as Date | null) ?? null,
        datos: parseJson(r["datos"]), lastEventId: String(r["last_event_id"] ?? ""), ocurridoAt: r["ocurrido_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("programacion read list falló", err)); }
  }

  async aplicarHistorial(uow: UnitOfWork, row: HistorialReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.prv_historial_read (tenant_id, id, entity_ref, hito, version, detalle, actor_id, ocurrido_at, last_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [row.tenantId, row.id, row.entityRef, row.hito, row.version, JSON.stringify(row.detalle), row.actorId, row.ocurridoAt, row.lastEventId],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("historial read apply falló", err)); }
  }
  async historialPorEntidad(t: string, entityRef: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.prv_historial_read WHERE tenant_id=$1 AND entity_ref=$2 ORDER BY ocurrido_at ASC, id ASC LIMIT $3`, [t, entityRef, limit]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), entityRef: String(r["entity_ref"]), hito: String(r["hito"]),
        version: Number(r["version"] ?? 0), detalle: parseJson(r["detalle"]), actorId: String(r["actor_id"]),
        ocurridoAt: r["ocurrido_at"] as Date, lastEventId: String(r["last_event_id"] ?? ""),
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("historial read list falló", err)); }
  }

  private readonly tablas = [
    "prv_programas_read", "prv_programa_versiones_read", "prv_actividades_read",
    "prv_generaciones_read", "prv_programaciones_read", "prv_historial_read",
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

const PREFIJO_EVENTO = "modulo.preventivo.";

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
