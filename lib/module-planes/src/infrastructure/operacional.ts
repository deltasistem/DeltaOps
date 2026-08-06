/**
 * DGP-012.2 · Módulo Enterprise Maintenance Plans — Infraestructura OPERACIONAL + CQRS.
 *
 * Puertos + adaptadores (Fake/PG) para: recibos de sincronización durables
 * (protocolo de reclamación offline), bitácora de eventos durable del módulo
 * (fuente de verdad del replay, `pln_eventos`), read models especializados
 * (planes, calendarios, generaciones, historial) y la consola técnica
 * (diagnóstico del outbox del Kernel filtrado al módulo). RLS por tenant en
 * lecturas y escrituras. Mismo patrón que module-inventario (DGP-011.2).
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
          `INSERT INTO deltaops.pln_sync_receipts (tenant_id, op_id, cliente_id, comando, estado, resultado)
           VALUES ($1,$2,$3,$4,'pendiente','null'::jsonb)
           ON CONFLICT (tenant_id, op_id) DO NOTHING
           RETURNING (xmax = 0) AS inserted`,
          [tenantId, opId, clienteId, comando],
        );
        if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true }) as Result<ClaimResult, KernelError>;
        const ex = await c.query(`SELECT * FROM deltaops.pln_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]);
        const r = ex.rows[0];
        return ok({ duenio: false, recibo: r ? this.toReceipt(r) : undefined }) as Result<ClaimResult, KernelError>;
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt claim falló", err));
    }
  }
  async find(tenantId: string, opId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.pln_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]));
      return ok(res.rows[0] ? this.toReceipt(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt find falló", err));
    }
  }
  async finalize(tenantId: string, r: SyncReceipt) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `UPDATE deltaops.pln_sync_receipts SET estado=$3, resultado=$4, comando=$5, updated_at=now()
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
      await withTenantRead(this.pool, tenantId, (c) => c.query(`DELETE FROM deltaops.pln_sync_receipts WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`, [tenantId, opId]));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt release falló", err));
    }
  }
  async listByTenant(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.pln_sync_receipts WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]));
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
// El PUERTO canónico es el `EventLogStore` de DOMINIO (append/listPorTenant con
// EventoDurable.occurredAt: string). Aquí se añade `stream`/`contar` para el
// REPLAY determinista de read models.

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
        `INSERT INTO deltaops.pln_eventos (tenant_id, event_id, tipo, payload, occurred_at)
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
      c.query(`SELECT tenant_id, event_id, tipo, payload, occurred_at FROM deltaops.pln_eventos WHERE tenant_id=$1 ORDER BY occurred_at ASC, event_id ASC`, [tenantId]),
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
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT count(*)::int AS n FROM deltaops.pln_eventos WHERE tenant_id=$1`, [tenantId]));
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog contar falló", err));
    }
  }
}

/* ================= Read models especializados (CQRS) ==================== */

export interface PlanReadRow {
  readonly tenantId: string; readonly id: string; readonly codigo: string; readonly nombre: string;
  readonly descripcion: string | null; readonly estado: string; readonly tipoPlan: string; readonly estrategia: string;
  readonly prioridad: string; readonly versionActiva: number; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface PlanReadFiltro { readonly estado?: string; readonly tipoPlan?: string; readonly limit?: number; }

export interface CalendarioReadRow {
  readonly tenantId: string; readonly id: string; readonly tipo: string; readonly ambito: string; readonly nombre: string;
  readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}

export interface GeneracionReadRow {
  readonly tenantId: string; readonly id: string; readonly planId: string; readonly version: number; readonly activoId: string;
  readonly ocurrencia: string; readonly claveDedup: string; readonly origen: string; readonly ordenTrabajoId: string | null;
  readonly fechaObjetivo: Date; readonly datos: Record<string, unknown>; readonly lastEventId: string; readonly registradoAt: Date;
}

export interface HistorialReadRow {
  readonly tenantId: string; readonly id: string; readonly planId: string; readonly hito: string; readonly version: number;
  readonly detalle: Record<string, unknown>; readonly actorId: string; readonly ocurridoAt: Date; readonly lastEventId: string;
}

export interface ReadModelsStore {
  aplicarPlan(uow: UnitOfWork, row: PlanReadRow): Promise<Result<boolean, KernelError>>;
  planGet(tenantId: string, id: string): Promise<Result<PlanReadRow | null, KernelError>>;
  planList(tenantId: string, filtro: PlanReadFiltro): Promise<Result<PlanReadRow[], KernelError>>;
  aplicarCalendario(uow: UnitOfWork, row: CalendarioReadRow): Promise<Result<boolean, KernelError>>;
  calendarioGet(tenantId: string, id: string): Promise<Result<CalendarioReadRow | null, KernelError>>;
  aplicarGeneracion(uow: UnitOfWork, row: GeneracionReadRow): Promise<Result<boolean, KernelError>>;
  generacionesPorPlan(tenantId: string, planId: string, limit?: number): Promise<Result<GeneracionReadRow[], KernelError>>;
  aplicarHistorial(uow: UnitOfWork, row: HistorialReadRow): Promise<Result<boolean, KernelError>>;
  historialPorPlan(tenantId: string, planId: string, limit?: number): Promise<Result<HistorialReadRow[], KernelError>>;
  contar(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/* --------------------------- Fake de read models ------------------------- */

export class FakeReadModelsStore implements ReadModelsStore {
  private readonly planes = new Map<string, PlanReadRow>();
  private readonly calendarios = new Map<string, CalendarioReadRow>();
  private readonly generaciones = new Map<string, GeneracionReadRow>();
  private readonly historial = new Map<string, HistorialReadRow>();
  private k(t: string, id: string) { return `${t}::${id}`; }

  async aplicarPlan(_uow: UnitOfWork, row: PlanReadRow) {
    const cur = this.planes.get(this.k(row.tenantId, row.id));
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    this.planes.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  async planGet(t: string, id: string) { return ok(this.planes.get(this.k(t, id)) ?? null); }
  async planList(t: string, f: PlanReadFiltro) {
    let rows = [...this.planes.values()].filter((r) => r.tenantId === t);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    if (f.tipoPlan) rows = rows.filter((r) => r.tipoPlan === f.tipoPlan);
    rows.sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 200));
  }
  async aplicarCalendario(_uow: UnitOfWork, row: CalendarioReadRow) {
    const cur = this.calendarios.get(this.k(row.tenantId, row.id));
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    this.calendarios.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  async calendarioGet(t: string, id: string) { return ok(this.calendarios.get(this.k(t, id)) ?? null); }
  async aplicarGeneracion(_uow: UnitOfWork, row: GeneracionReadRow) {
    const k = this.k(row.tenantId, row.id);
    const cur = this.generaciones.get(k);
    if (!cur) { this.generaciones.set(k, row); return ok(true); }
    // Ya existe: sólo re-aplica si el evento aporta el VÍNCULO a la OT
    // (materialización) que aún no está proyectado. Idempotente en otro caso.
    if (row.ordenTrabajoId && cur.ordenTrabajoId !== row.ordenTrabajoId) {
      this.generaciones.set(k, row);
      return ok(true);
    }
    return ok(false);
  }
  async generacionesPorPlan(t: string, planId: string, limit = 500) {
    return ok([...this.generaciones.values()].filter((r) => r.tenantId === t && r.planId === planId).sort((a, b) => b.registradoAt.getTime() - a.registradoAt.getTime()).slice(0, limit));
  }
  async aplicarHistorial(_uow: UnitOfWork, row: HistorialReadRow) {
    const k = this.k(row.tenantId, row.id);
    if (this.historial.has(k)) return ok(false);
    this.historial.set(k, row);
    return ok(true);
  }
  async historialPorPlan(t: string, planId: string, limit = 500) {
    return ok([...this.historial.values()].filter((r) => r.tenantId === t && r.planId === planId).sort((a, b) => a.ocurridoAt.getTime() - b.ocurridoAt.getTime()).slice(0, limit));
  }
  async contar(t: string) {
    return ok({
      pln_planes_read: [...this.planes.values()].filter((r) => r.tenantId === t).length,
      pln_calendarios_read: [...this.calendarios.values()].filter((r) => r.tenantId === t).length,
      pln_generaciones_read: [...this.generaciones.values()].filter((r) => r.tenantId === t).length,
      pln_historial_read: [...this.historial.values()].filter((r) => r.tenantId === t).length,
    });
  }
  async clear(_uow: UnitOfWork, t: string) {
    for (const m of [this.planes, this.calendarios, this.generaciones, this.historial] as Map<string, { tenantId: string }>[]) {
      for (const [k, r] of m) if (r.tenantId === t) m.delete(k);
    }
    return ok(undefined);
  }
}

/* --------------------------- PG de read models --------------------------- */

export class PgReadModelsStore implements ReadModelsStore {
  constructor(private readonly pool: Pool) {}

  async aplicarPlan(uow: UnitOfWork, row: PlanReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.pln_planes_read
           (tenant_id, id, codigo, nombre, descripcion, estado, tipo_plan, estrategia, prioridad, version_activa, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           codigo=EXCLUDED.codigo, nombre=EXCLUDED.nombre, descripcion=EXCLUDED.descripcion, estado=EXCLUDED.estado,
           tipo_plan=EXCLUDED.tipo_plan, estrategia=EXCLUDED.estrategia, prioridad=EXCLUDED.prioridad,
           version_activa=EXCLUDED.version_activa, datos=EXCLUDED.datos, version=EXCLUDED.version,
           last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.pln_planes_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.pln_planes_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.codigo, row.nombre, row.descripcion, row.estado, row.tipoPlan, row.estrategia,
         row.prioridad, row.versionActiva, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("plan read apply falló", err)); }
  }
  async planGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.pln_planes_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toPlan(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("plan read get falló", err)); }
  }
  async planList(t: string, f: PlanReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.pln_planes_read
           WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2) AND ($3::text IS NULL OR tipo_plan=$3)
           ORDER BY actualizado_at DESC, id ASC LIMIT $4`,
          [t, f.estado ?? null, f.tipoPlan ?? null, f.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => this.toPlan(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("plan read list falló", err)); }
  }
  private toPlan(r: Record<string, unknown>): PlanReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), codigo: String(r["codigo"] ?? ""), nombre: String(r["nombre"] ?? ""),
      descripcion: (r["descripcion"] as string | null) ?? null, estado: String(r["estado"] ?? ""), tipoPlan: String(r["tipo_plan"] ?? ""),
      estrategia: String(r["estrategia"] ?? ""), prioridad: String(r["prioridad"] ?? ""), versionActiva: Number(r["version_activa"] ?? 0),
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarCalendario(uow: UnitOfWork, row: CalendarioReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.pln_calendarios_read (tenant_id, id, tipo, ambito, nombre, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           tipo=EXCLUDED.tipo, ambito=EXCLUDED.ambito, nombre=EXCLUDED.nombre, datos=EXCLUDED.datos,
           version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.pln_calendarios_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.pln_calendarios_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.tipo, row.ambito, row.nombre, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("calendario read apply falló", err)); }
  }
  async calendarioGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.pln_calendarios_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      const r = res.rows[0];
      if (!r) return ok(null);
      return ok({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), tipo: String(r["tipo"] ?? ""), ambito: String(r["ambito"] ?? ""),
        nombre: String(r["nombre"] ?? ""), datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1),
        lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
      });
    } catch (err) { return fail(KernelErrors.infrastructure("calendario read get falló", err)); }
  }

  async aplicarGeneracion(uow: UnitOfWork, row: GeneracionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.pln_generaciones_read
           (tenant_id, id, plan_id, version, activo_id, ocurrencia, clave_dedup, origen, orden_trabajo_id, fecha_objetivo, datos, last_event_id, registrado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           orden_trabajo_id=EXCLUDED.orden_trabajo_id, datos=EXCLUDED.datos, last_event_id=EXCLUDED.last_event_id
         WHERE deltaops.pln_generaciones_read.orden_trabajo_id IS NULL
           AND EXCLUDED.orden_trabajo_id IS NOT NULL`,
        [row.tenantId, row.id, row.planId, row.version, row.activoId, row.ocurrencia, row.claveDedup, row.origen,
         row.ordenTrabajoId, row.fechaObjetivo, JSON.stringify(row.datos), row.lastEventId, row.registradoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("generacion read apply falló", err)); }
  }
  async generacionesPorPlan(t: string, planId: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.pln_generaciones_read WHERE tenant_id=$1 AND plan_id=$2 ORDER BY registrado_at DESC, id ASC LIMIT $3`, [t, planId, limit]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), planId: String(r["plan_id"]), version: Number(r["version"] ?? 0),
        activoId: String(r["activo_id"]), ocurrencia: String(r["ocurrencia"]), claveDedup: String(r["clave_dedup"]), origen: String(r["origen"]),
        ordenTrabajoId: (r["orden_trabajo_id"] as string | null) ?? null, fechaObjetivo: r["fecha_objetivo"] as Date,
        datos: parseJson(r["datos"]), lastEventId: String(r["last_event_id"] ?? ""), registradoAt: r["registrado_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("generacion read list falló", err)); }
  }

  async aplicarHistorial(uow: UnitOfWork, row: HistorialReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.pln_historial_read (tenant_id, id, plan_id, hito, version, detalle, actor_id, ocurrido_at, last_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [row.tenantId, row.id, row.planId, row.hito, row.version, JSON.stringify(row.detalle), row.actorId, row.ocurridoAt, row.lastEventId],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("historial read apply falló", err)); }
  }
  async historialPorPlan(t: string, planId: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.pln_historial_read WHERE tenant_id=$1 AND plan_id=$2 ORDER BY ocurrido_at ASC, id ASC LIMIT $3`, [t, planId, limit]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), planId: String(r["plan_id"]), hito: String(r["hito"]),
        version: Number(r["version"] ?? 0), detalle: parseJson(r["detalle"]), actorId: String(r["actor_id"]),
        ocurridoAt: r["ocurrido_at"] as Date, lastEventId: String(r["last_event_id"] ?? ""),
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("historial read list falló", err)); }
  }

  async contar(t: string) {
    try {
      const tablas = ["pln_planes_read", "pln_calendarios_read", "pln_generaciones_read", "pln_historial_read"];
      const out: Record<string, number> = {};
      await withTenantRead(this.pool, t, async (c) => {
        for (const tabla of tablas) {
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
      for (const tabla of ["pln_planes_read", "pln_calendarios_read", "pln_generaciones_read", "pln_historial_read"]) {
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

const PREFIJO_EVENTO = "modulo.planes.";

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
