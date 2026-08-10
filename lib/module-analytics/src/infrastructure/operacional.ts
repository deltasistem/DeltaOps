/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — Infra OPERACIONAL + CQRS.
 *
 * Puertos + adaptadores (Fake/PG) para: recibos de sincronización durables
 * (protocolo de reclamación offline), bitácora de eventos durable del módulo
 * (fuente de verdad del replay, `an_eventos`), read models especializados
 * (definiciones de indicador, dashboards, snapshots de evaluación) y la consola
 * técnica (diagnóstico del outbox del Kernel filtrado al módulo). RLS por tenant
 * en lecturas y escrituras. Mismo patrón que module-correctivo (0027).
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
          `INSERT INTO deltaops.an_sync_receipts (tenant_id, op_id, cliente_id, comando, estado, resultado)
           VALUES ($1,$2,$3,$4,'pendiente','null'::jsonb)
           ON CONFLICT (tenant_id, op_id) DO NOTHING
           RETURNING (xmax = 0) AS inserted`,
          [tenantId, opId, clienteId, comando],
        );
        if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true }) as Result<ClaimResult, KernelError>;
        const ex = await c.query(`SELECT * FROM deltaops.an_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]);
        const r = ex.rows[0];
        return ok({ duenio: false, recibo: r ? this.toReceipt(r) : undefined }) as Result<ClaimResult, KernelError>;
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt claim falló", err));
    }
  }
  async find(tenantId: string, opId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.an_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]));
      return ok(res.rows[0] ? this.toReceipt(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt find falló", err));
    }
  }
  async finalize(tenantId: string, r: SyncReceipt) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `UPDATE deltaops.an_sync_receipts SET estado=$3, resultado=$4, comando=$5, updated_at=now()
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
      await withTenantRead(this.pool, tenantId, (c) => c.query(`DELETE FROM deltaops.an_sync_receipts WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`, [tenantId, opId]));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt release falló", err));
    }
  }
  async listByTenant(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.an_sync_receipts WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]));
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
        `INSERT INTO deltaops.an_eventos (tenant_id, event_id, tipo, payload, occurred_at)
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
      c.query(`SELECT tenant_id, event_id, tipo, payload, occurred_at FROM deltaops.an_eventos WHERE tenant_id=$1 ORDER BY occurred_at ASC, event_id ASC`, [tenantId]),
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
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT count(*)::int AS n FROM deltaops.an_eventos WHERE tenant_id=$1`, [tenantId]));
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog contar falló", err));
    }
  }
}

/* ================= Read models especializados (CQRS) ==================== */

export interface DefinicionReadRow {
  readonly tenantId: string; readonly id: string; readonly clave: string; readonly nombre: string;
  readonly categoria: string; readonly fuenteModulo: string; readonly fuenteDataset: string;
  readonly habilitado: boolean; readonly delSistema: boolean; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface DefinicionReadFiltro { readonly categoria?: string; readonly habilitado?: boolean; readonly delSistema?: boolean; readonly limit?: number; }

export interface DashboardReadRow {
  readonly tenantId: string; readonly id: string; readonly clave: string; readonly nombre: string;
  readonly delSistema: boolean; readonly propietarioId: string | null; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface DashboardReadFiltro { readonly delSistema?: boolean; readonly propietarioId?: string; readonly limit?: number; }

export interface SnapshotReadRow {
  readonly tenantId: string; readonly id: string; readonly claveSnapshot: string; readonly target: string;
  readonly targetClave: string; readonly valor: number | null; readonly muestras: number | null;
  readonly datos: Record<string, unknown>; readonly evaluadoEn: Date; readonly lastEventId: string;
}

export interface ReadModelsStore {
  aplicarDefinicion(uow: UnitOfWork, row: DefinicionReadRow): Promise<Result<boolean, KernelError>>;
  eliminarDefinicion(uow: UnitOfWork, tenantId: string, id: string): Promise<Result<boolean, KernelError>>;
  definicionGet(tenantId: string, clave: string): Promise<Result<DefinicionReadRow | null, KernelError>>;
  definicionGetPorId(tenantId: string, id: string): Promise<Result<DefinicionReadRow | null, KernelError>>;
  definicionList(tenantId: string, filtro: DefinicionReadFiltro): Promise<Result<DefinicionReadRow[], KernelError>>;
  aplicarDashboard(uow: UnitOfWork, row: DashboardReadRow): Promise<Result<boolean, KernelError>>;
  eliminarDashboard(uow: UnitOfWork, tenantId: string, id: string): Promise<Result<boolean, KernelError>>;
  dashboardGet(tenantId: string, id: string): Promise<Result<DashboardReadRow | null, KernelError>>;
  dashboardGetPorClave(tenantId: string, clave: string): Promise<Result<DashboardReadRow | null, KernelError>>;
  dashboardList(tenantId: string, filtro: DashboardReadFiltro): Promise<Result<DashboardReadRow[], KernelError>>;
  aplicarSnapshot(uow: UnitOfWork, row: SnapshotReadRow): Promise<Result<boolean, KernelError>>;
  snapshotList(tenantId: string, targetClave: string, limit?: number): Promise<Result<SnapshotReadRow[], KernelError>>;
  contar(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/* --------------------------- Fake de read models ------------------------- */

export class FakeReadModelsStore implements ReadModelsStore {
  private readonly definiciones = new Map<string, DefinicionReadRow>();
  private readonly dashboards = new Map<string, DashboardReadRow>();
  private readonly snapshots = new Map<string, SnapshotReadRow>();
  private k(t: string, id: string) { return `${t}::${id}`; }

  private aplicarVersionado<T extends { tenantId: string; id: string; version: number; lastEventId: string }>(m: Map<string, T>, row: T): Result<boolean, KernelError> {
    const cur = m.get(this.k(row.tenantId, row.id));
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    m.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }

  async aplicarDefinicion(_uow: UnitOfWork, row: DefinicionReadRow) { return this.aplicarVersionado(this.definiciones, row); }
  async eliminarDefinicion(_uow: UnitOfWork, t: string, id: string) { return ok(this.definiciones.delete(this.k(t, id))); }
  async definicionGet(t: string, clave: string) {
    const row = [...this.definiciones.values()].find((r) => r.tenantId === t && r.clave.toLowerCase() === clave.toLowerCase());
    return ok(row ?? null);
  }
  async definicionGetPorId(t: string, id: string) { return ok(this.definiciones.get(this.k(t, id)) ?? null); }
  async definicionList(t: string, f: DefinicionReadFiltro) {
    let rows = [...this.definiciones.values()].filter((r) => r.tenantId === t);
    if (f.categoria) rows = rows.filter((r) => r.categoria === f.categoria);
    if (f.habilitado !== undefined) rows = rows.filter((r) => r.habilitado === f.habilitado);
    if (f.delSistema !== undefined) rows = rows.filter((r) => r.delSistema === f.delSistema);
    rows.sort((a, b) => (a.clave < b.clave ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 500));
  }

  async aplicarDashboard(_uow: UnitOfWork, row: DashboardReadRow) { return this.aplicarVersionado(this.dashboards, row); }
  async eliminarDashboard(_uow: UnitOfWork, t: string, id: string) { return ok(this.dashboards.delete(this.k(t, id))); }
  async dashboardGet(t: string, id: string) { return ok(this.dashboards.get(this.k(t, id)) ?? null); }
  async dashboardGetPorClave(t: string, clave: string) {
    const row = [...this.dashboards.values()].find((r) => r.tenantId === t && r.clave.toLowerCase() === clave.toLowerCase());
    return ok(row ?? null);
  }
  async dashboardList(t: string, f: DashboardReadFiltro) {
    let rows = [...this.dashboards.values()].filter((r) => r.tenantId === t);
    if (f.delSistema !== undefined) rows = rows.filter((r) => r.delSistema === f.delSistema);
    if (f.propietarioId) rows = rows.filter((r) => r.propietarioId === f.propietarioId);
    rows.sort((a, b) => (a.clave < b.clave ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 500));
  }

  async aplicarSnapshot(_uow: UnitOfWork, row: SnapshotReadRow) {
    const k = this.k(row.tenantId, row.id);
    if (this.snapshots.has(k)) return ok(false);
    // Idempotencia adicional por clave determinista (append-only).
    for (const s of this.snapshots.values()) if (s.tenantId === row.tenantId && s.claveSnapshot === row.claveSnapshot) return ok(false);
    this.snapshots.set(k, row);
    return ok(true);
  }
  async snapshotList(t: string, targetClave: string, limit = 500) {
    return ok([...this.snapshots.values()].filter((r) => r.tenantId === t && r.targetClave === targetClave)
      .sort((a, b) => b.evaluadoEn.getTime() - a.evaluadoEn.getTime()).slice(0, limit));
  }

  async contar(t: string) {
    return ok({
      an_definiciones_read: [...this.definiciones.values()].filter((r) => r.tenantId === t).length,
      an_dashboards_read: [...this.dashboards.values()].filter((r) => r.tenantId === t).length,
      an_snapshots_read: [...this.snapshots.values()].filter((r) => r.tenantId === t).length,
    });
  }
  async clear(_uow: UnitOfWork, t: string) {
    for (const m of [this.definiciones, this.dashboards, this.snapshots] as Map<string, { tenantId: string }>[]) {
      for (const [k, r] of m) if (r.tenantId === t) m.delete(k);
    }
    return ok(undefined);
  }
}

/* --------------------------- PG de read models --------------------------- */

export class PgReadModelsStore implements ReadModelsStore {
  constructor(private readonly pool: Pool) {}

  /* ----------------------------- Definiciones ---------------------------- */
  async aplicarDefinicion(uow: UnitOfWork, row: DefinicionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.an_definiciones_read
           (tenant_id, id, clave, nombre, categoria, fuente_modulo, fuente_dataset, habilitado, del_sistema, datos, version, last_event_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           clave=EXCLUDED.clave, nombre=EXCLUDED.nombre, categoria=EXCLUDED.categoria,
           fuente_modulo=EXCLUDED.fuente_modulo, fuente_dataset=EXCLUDED.fuente_dataset,
           habilitado=EXCLUDED.habilitado, del_sistema=EXCLUDED.del_sistema, datos=EXCLUDED.datos,
           version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, updated_at=EXCLUDED.updated_at
         WHERE deltaops.an_definiciones_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.an_definiciones_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.clave, row.nombre, row.categoria, row.fuenteModulo, row.fuenteDataset, row.habilitado, row.delSistema, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("definicion read apply falló", err)); }
  }
  async eliminarDefinicion(uow: UnitOfWork, tenantId: string, id: string) {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(`DELETE FROM deltaops.an_definiciones_read WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("definicion read delete falló", err)); }
  }
  async definicionGet(t: string, clave: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.an_definiciones_read WHERE tenant_id=$1 AND lower(clave)=lower($2)`, [t, clave]));
      return ok(res.rows[0] ? this.toDefinicion(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("definicion read get falló", err)); }
  }
  async definicionGetPorId(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.an_definiciones_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toDefinicion(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("definicion read getPorId falló", err)); }
  }
  async definicionList(t: string, f: DefinicionReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.an_definiciones_read
           WHERE tenant_id=$1 AND ($2::text IS NULL OR categoria=$2)
             AND ($3::boolean IS NULL OR habilitado=$3) AND ($4::boolean IS NULL OR del_sistema=$4)
           ORDER BY clave ASC LIMIT $5`,
          [t, f.categoria ?? null, f.habilitado ?? null, f.delSistema ?? null, f.limit ?? 500],
        ),
      );
      return ok(res.rows.map((r) => this.toDefinicion(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("definicion read list falló", err)); }
  }
  private toDefinicion(r: Record<string, unknown>): DefinicionReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), clave: String(r["clave"] ?? ""), nombre: String(r["nombre"] ?? ""),
      categoria: String(r["categoria"] ?? ""), fuenteModulo: String(r["fuente_modulo"] ?? ""), fuenteDataset: String(r["fuente_dataset"] ?? ""),
      habilitado: r["habilitado"] === true, delSistema: r["del_sistema"] === true, datos: parseJson(r["datos"]),
      version: Number(r["version"] ?? 0), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["updated_at"] as Date,
    };
  }

  /* ------------------------------ Dashboards ----------------------------- */
  async aplicarDashboard(uow: UnitOfWork, row: DashboardReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.an_dashboards_read
           (tenant_id, id, clave, nombre, del_sistema, propietario_id, datos, version, last_event_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           clave=EXCLUDED.clave, nombre=EXCLUDED.nombre, del_sistema=EXCLUDED.del_sistema,
           propietario_id=EXCLUDED.propietario_id, datos=EXCLUDED.datos, version=EXCLUDED.version,
           last_event_id=EXCLUDED.last_event_id, updated_at=EXCLUDED.updated_at
         WHERE deltaops.an_dashboards_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.an_dashboards_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.clave, row.nombre, row.delSistema, row.propietarioId, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("dashboard read apply falló", err)); }
  }
  async eliminarDashboard(uow: UnitOfWork, tenantId: string, id: string) {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(`DELETE FROM deltaops.an_dashboards_read WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("dashboard read delete falló", err)); }
  }
  async dashboardGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.an_dashboards_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toDashboard(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("dashboard read get falló", err)); }
  }
  async dashboardGetPorClave(t: string, clave: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.an_dashboards_read WHERE tenant_id=$1 AND lower(clave)=lower($2)`, [t, clave]));
      return ok(res.rows[0] ? this.toDashboard(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("dashboard read getPorClave falló", err)); }
  }
  async dashboardList(t: string, f: DashboardReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.an_dashboards_read
           WHERE tenant_id=$1 AND ($2::boolean IS NULL OR del_sistema=$2) AND ($3::text IS NULL OR propietario_id=$3)
           ORDER BY clave ASC LIMIT $4`,
          [t, f.delSistema ?? null, f.propietarioId ?? null, f.limit ?? 500],
        ),
      );
      return ok(res.rows.map((r) => this.toDashboard(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("dashboard read list falló", err)); }
  }
  private toDashboard(r: Record<string, unknown>): DashboardReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), clave: String(r["clave"] ?? ""), nombre: String(r["nombre"] ?? ""),
      delSistema: r["del_sistema"] === true, propietarioId: (r["propietario_id"] as string | null) ?? null, datos: parseJson(r["datos"]),
      version: Number(r["version"] ?? 0), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["updated_at"] as Date,
    };
  }

  /* ------------------------------- Snapshots ----------------------------- */
  async aplicarSnapshot(uow: UnitOfWork, row: SnapshotReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.an_snapshots_read
           (tenant_id, id, clave_snapshot, target, target_clave, valor, muestras, datos, evaluado_en, last_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, id) DO NOTHING`,
        [row.tenantId, row.id, row.claveSnapshot, row.target, row.targetClave, row.valor, row.muestras, JSON.stringify(row.datos), row.evaluadoEn, row.lastEventId],
      );
      if ((res.rowCount ?? 0) > 0) return ok(true);
      return ok(false);
    } catch (err) { return fail(KernelErrors.infrastructure("snapshot read apply falló", err)); }
  }
  async snapshotList(t: string, targetClave: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.an_snapshots_read WHERE tenant_id=$1 AND target_clave=$2 ORDER BY evaluado_en DESC, id ASC LIMIT $3`, [t, targetClave, limit]),
      );
      return ok(res.rows.map((r) => this.toSnapshot(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("snapshot read list falló", err)); }
  }
  private toSnapshot(r: Record<string, unknown>): SnapshotReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), claveSnapshot: String(r["clave_snapshot"] ?? ""),
      target: String(r["target"] ?? ""), targetClave: String(r["target_clave"] ?? ""),
      valor: r["valor"] != null ? Number(r["valor"]) : null, muestras: r["muestras"] != null ? Number(r["muestras"]) : null,
      datos: parseJson(r["datos"]), evaluadoEn: r["evaluado_en"] as Date, lastEventId: String(r["last_event_id"] ?? ""),
    };
  }

  private readonly tablas = ["an_definiciones_read", "an_dashboards_read", "an_snapshots_read"];
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

const PREFIJO_EVENTO = "modulo.analytics.";

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
