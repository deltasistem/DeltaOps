/**
 * DGP-019.1 · Módulo de Utilización — Infra OPERACIONAL + CQRS.
 *
 * Puertos + adaptadores (Fake/PG) para: recibos de sincronización durables
 * (protocolo de reclamación offline, `utl_sync_receipts`), bitácora de eventos
 * durable (fuente del replay, `utl_eventos`), read models especializados
 * (lecturas `utl_lecturas_read`, tanqueos `utl_tanqueos_read`) y la consola
 * técnica (outbox del Kernel filtrado al módulo). RLS por tenant en lecturas y
 * escrituras. Mismo patrón que module-correctivo (DGP-015).
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
          `INSERT INTO deltaops.utl_sync_receipts (tenant_id, op_id, cliente_id, comando, estado, resultado)
           VALUES ($1,$2,$3,$4,'pendiente','null'::jsonb)
           ON CONFLICT (tenant_id, op_id) DO NOTHING
           RETURNING (xmax = 0) AS inserted`,
          [tenantId, opId, clienteId, comando],
        );
        if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true }) as Result<ClaimResult, KernelError>;
        const ex = await c.query(`SELECT * FROM deltaops.utl_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]);
        const r = ex.rows[0];
        return ok({ duenio: false, recibo: r ? this.toReceipt(r) : undefined }) as Result<ClaimResult, KernelError>;
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt claim falló", err));
    }
  }
  async find(tenantId: string, opId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.utl_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]));
      return ok(res.rows[0] ? this.toReceipt(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt find falló", err));
    }
  }
  async finalize(tenantId: string, r: SyncReceipt) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `UPDATE deltaops.utl_sync_receipts SET estado=$3, resultado=$4, comando=$5, updated_at=now()
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
      await withTenantRead(this.pool, tenantId, (c) => c.query(`DELETE FROM deltaops.utl_sync_receipts WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`, [tenantId, opId]));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt release falló", err));
    }
  }
  async listByTenant(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.utl_sync_receipts WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]));
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
  contar(tenantId: string): Promise<Result<number, KernelError>>;
}

export class PgEventLogStore implements EventLogOperacional {
  constructor(private readonly pool: Pool) {}
  async append(uow: UnitOfWork, e: EventoDurable): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, e.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.utl_eventos (tenant_id, event_id, tipo, payload, occurred_at)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [e.tenantId, e.eventId, e.tipo, JSON.stringify(e.payload), new Date(e.occurredAt)],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog append falló", err));
    }
  }
  async listPorTenant(tenantId: TenantId): Promise<Result<EventoDurable[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT tenant_id, event_id, tipo, payload, occurred_at FROM deltaops.utl_eventos WHERE tenant_id=$1 ORDER BY occurred_at ASC, event_id ASC`, [tenantId]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]),
        eventId: String(r["event_id"]),
        tipo: String(r["tipo"]),
        payload: parseJson(r["payload"]),
        occurredAt: (r["occurred_at"] as Date).toISOString(),
      })));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog listPorTenant falló", err));
    }
  }
  async contar(tenantId: string): Promise<Result<number, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT count(*)::int AS n FROM deltaops.utl_eventos WHERE tenant_id=$1`, [tenantId]));
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog contar falló", err));
    }
  }
}

/* ================= Read models especializados (CQRS) ==================== */

export interface LecturaReadRow {
  readonly tenantId: string;
  readonly id: string;
  readonly activoId: string;
  readonly tipoMedidor: string;
  readonly valor: number;
  readonly unidad: string;
  readonly fechaHora: Date;
  readonly identityId: string;
  readonly origen: string;
  readonly estado: string;
  readonly inconsistente: boolean;
  readonly sincronizacionActivo: string;
  readonly datos: Record<string, unknown>;
  readonly lastEventId: string;
  readonly actualizadoAt: Date;
}

export interface LecturaReadFiltro {
  readonly activoId?: string;
  readonly tipoMedidor?: string;
  readonly estado?: string;
  readonly desde?: string;
  readonly hasta?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TanqueoReadRow {
  readonly tenantId: string;
  readonly id: string;
  readonly activoId: string;
  readonly fechaHora: Date;
  readonly litros: number;
  readonly tipoCombustible: string;
  readonly costoTotal: number | null;
  readonly moneda: string | null;
  readonly estado: string;
  readonly datos: Record<string, unknown>;
  readonly lastEventId: string;
  readonly actualizadoAt: Date;
}

export interface TanqueoReadFiltro {
  readonly activoId?: string;
  readonly estado?: string;
  readonly desde?: string;
  readonly hasta?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ReadModelsStore {
  aplicarLectura(uow: UnitOfWork, row: LecturaReadRow): Promise<Result<boolean, KernelError>>;
  lecturaGet(tenantId: string, id: string): Promise<Result<LecturaReadRow | null, KernelError>>;
  lecturaList(tenantId: string, filtro: LecturaReadFiltro): Promise<Result<LecturaReadRow[], KernelError>>;
  /** Última lectura VIGENTE y NO inconsistente del medidor (por fechaHora). */
  ultimaLectura(tenantId: string, activoId: string, tipoMedidor: string): Promise<Result<LecturaReadRow | null, KernelError>>;
  aplicarTanqueo(uow: UnitOfWork, row: TanqueoReadRow): Promise<Result<boolean, KernelError>>;
  tanqueoGet(tenantId: string, id: string): Promise<Result<TanqueoReadRow | null, KernelError>>;
  tanqueoList(tenantId: string, filtro: TanqueoReadFiltro): Promise<Result<TanqueoReadRow[], KernelError>>;
  contar(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/* --------------------------- Fake de read models ------------------------- */

export class FakeReadModelsStore implements ReadModelsStore {
  private readonly lecturas = new Map<string, LecturaReadRow>();
  private readonly tanqueos = new Map<string, TanqueoReadRow>();
  private k(t: string, id: string) { return `${t}::${id}`; }

  private aplicar<T extends { tenantId: string; id: string; lastEventId: string; actualizadoAt: Date }>(m: Map<string, T>, row: T): Result<boolean, KernelError> {
    const k = this.k(row.tenantId, row.id);
    const cur = m.get(k);
    // Idempotencia por eventId; una re-proyección con el MISMO evento no reescribe.
    if (cur && cur.lastEventId === row.lastEventId) return ok(false);
    // No retroceder a un snapshot más viejo (por actualizadoAt) salvo evento nuevo.
    if (cur && cur.actualizadoAt.getTime() > row.actualizadoAt.getTime()) return ok(false);
    m.set(k, row);
    return ok(true);
  }

  async aplicarLectura(_uow: UnitOfWork, row: LecturaReadRow) { return this.aplicar(this.lecturas, row); }
  async lecturaGet(t: string, id: string) { return ok(this.lecturas.get(this.k(t, id)) ?? null); }
  async lecturaList(t: string, f: LecturaReadFiltro) {
    let rows = [...this.lecturas.values()].filter((r) => r.tenantId === t);
    if (f.activoId) rows = rows.filter((r) => r.activoId === f.activoId);
    if (f.tipoMedidor) rows = rows.filter((r) => r.tipoMedidor === f.tipoMedidor);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    if (f.desde) rows = rows.filter((r) => r.fechaHora.getTime() >= new Date(f.desde!).getTime());
    if (f.hasta) rows = rows.filter((r) => r.fechaHora.getTime() <= new Date(f.hasta!).getTime());
    rows.sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime() || (a.id < b.id ? 1 : -1));
    const offset = f.offset ?? 0;
    return ok(rows.slice(offset, offset + (f.limit ?? 100)));
  }
  async ultimaLectura(t: string, activoId: string, tipoMedidor: string) {
    const rows = [...this.lecturas.values()]
      .filter((r) => r.tenantId === t && r.activoId === activoId && r.tipoMedidor === tipoMedidor && r.estado === "vigente" && !r.inconsistente)
      .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime());
    return ok(rows[0] ?? null);
  }

  async aplicarTanqueo(_uow: UnitOfWork, row: TanqueoReadRow) { return this.aplicar(this.tanqueos, row); }
  async tanqueoGet(t: string, id: string) { return ok(this.tanqueos.get(this.k(t, id)) ?? null); }
  async tanqueoList(t: string, f: TanqueoReadFiltro) {
    let rows = [...this.tanqueos.values()].filter((r) => r.tenantId === t);
    if (f.activoId) rows = rows.filter((r) => r.activoId === f.activoId);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    if (f.desde) rows = rows.filter((r) => r.fechaHora.getTime() >= new Date(f.desde!).getTime());
    if (f.hasta) rows = rows.filter((r) => r.fechaHora.getTime() <= new Date(f.hasta!).getTime());
    rows.sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime() || (a.id < b.id ? 1 : -1));
    const offset = f.offset ?? 0;
    return ok(rows.slice(offset, offset + (f.limit ?? 100)));
  }

  async contar(t: string) {
    return ok({
      utl_lecturas_read: [...this.lecturas.values()].filter((r) => r.tenantId === t).length,
      utl_tanqueos_read: [...this.tanqueos.values()].filter((r) => r.tenantId === t).length,
    });
  }
  async clear(_uow: UnitOfWork, t: string) {
    for (const m of [this.lecturas, this.tanqueos] as Map<string, { tenantId: string }>[]) {
      for (const [k, r] of m) if (r.tenantId === t) m.delete(k);
    }
    return ok(undefined);
  }
}

/* --------------------------- PG de read models --------------------------- */

export class PgReadModelsStore implements ReadModelsStore {
  constructor(private readonly pool: Pool) {}

  async aplicarLectura(uow: UnitOfWork, row: LecturaReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.utl_lecturas_read
           (tenant_id, id, activo_id, tipo_medidor, valor, unidad, fecha_hora, identity_id, origen, estado, inconsistente, sincronizacion_activo, datos, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           activo_id=EXCLUDED.activo_id, tipo_medidor=EXCLUDED.tipo_medidor, valor=EXCLUDED.valor, unidad=EXCLUDED.unidad,
           fecha_hora=EXCLUDED.fecha_hora, identity_id=EXCLUDED.identity_id, origen=EXCLUDED.origen, estado=EXCLUDED.estado,
           inconsistente=EXCLUDED.inconsistente, sincronizacion_activo=EXCLUDED.sincronizacion_activo, datos=EXCLUDED.datos,
           last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.utl_lecturas_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.utl_lecturas_read.actualizado_at <= EXCLUDED.actualizado_at`,
        [row.tenantId, row.id, row.activoId, row.tipoMedidor, row.valor, row.unidad, row.fechaHora, row.identityId, row.origen, row.estado, row.inconsistente, row.sincronizacionActivo, JSON.stringify(row.datos), row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel aplicarLectura falló", err));
    }
  }
  async lecturaGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.utl_lecturas_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toLectura(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel lecturaGet falló", err));
    }
  }
  async lecturaList(t: string, f: LecturaReadFiltro) {
    try {
      const cond: string[] = ["tenant_id=$1"];
      const params: unknown[] = [t];
      if (f.activoId) { params.push(f.activoId); cond.push(`activo_id=$${params.length}`); }
      if (f.tipoMedidor) { params.push(f.tipoMedidor); cond.push(`tipo_medidor=$${params.length}`); }
      if (f.estado) { params.push(f.estado); cond.push(`estado=$${params.length}`); }
      if (f.desde) { params.push(new Date(f.desde)); cond.push(`fecha_hora>=$${params.length}`); }
      if (f.hasta) { params.push(new Date(f.hasta)); cond.push(`fecha_hora<=$${params.length}`); }
      params.push(f.limit ?? 100); const limIdx = params.length;
      params.push(f.offset ?? 0); const offIdx = params.length;
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.utl_lecturas_read WHERE ${cond.join(" AND ")} ORDER BY fecha_hora DESC, id DESC LIMIT $${limIdx} OFFSET $${offIdx}`, params),
      );
      return ok(res.rows.map((r) => this.toLectura(r)));
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel lecturaList falló", err));
    }
  }
  async ultimaLectura(t: string, activoId: string, tipoMedidor: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.utl_lecturas_read
           WHERE tenant_id=$1 AND activo_id=$2 AND tipo_medidor=$3 AND estado='vigente' AND inconsistente=false
           ORDER BY fecha_hora DESC LIMIT 1`,
          [t, activoId, tipoMedidor],
        ),
      );
      return ok(res.rows[0] ? this.toLectura(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel ultimaLectura falló", err));
    }
  }

  async aplicarTanqueo(uow: UnitOfWork, row: TanqueoReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.utl_tanqueos_read
           (tenant_id, id, activo_id, fecha_hora, litros, tipo_combustible, costo_total, moneda, estado, datos, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           activo_id=EXCLUDED.activo_id, fecha_hora=EXCLUDED.fecha_hora, litros=EXCLUDED.litros, tipo_combustible=EXCLUDED.tipo_combustible,
           costo_total=EXCLUDED.costo_total, moneda=EXCLUDED.moneda, estado=EXCLUDED.estado, datos=EXCLUDED.datos,
           last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.utl_tanqueos_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.utl_tanqueos_read.actualizado_at <= EXCLUDED.actualizado_at`,
        [row.tenantId, row.id, row.activoId, row.fechaHora, row.litros, row.tipoCombustible, row.costoTotal, row.moneda, row.estado, JSON.stringify(row.datos), row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel aplicarTanqueo falló", err));
    }
  }
  async tanqueoGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.utl_tanqueos_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toTanqueo(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel tanqueoGet falló", err));
    }
  }
  async tanqueoList(t: string, f: TanqueoReadFiltro) {
    try {
      const cond: string[] = ["tenant_id=$1"];
      const params: unknown[] = [t];
      if (f.activoId) { params.push(f.activoId); cond.push(`activo_id=$${params.length}`); }
      if (f.estado) { params.push(f.estado); cond.push(`estado=$${params.length}`); }
      if (f.desde) { params.push(new Date(f.desde)); cond.push(`fecha_hora>=$${params.length}`); }
      if (f.hasta) { params.push(new Date(f.hasta)); cond.push(`fecha_hora<=$${params.length}`); }
      params.push(f.limit ?? 100); const limIdx = params.length;
      params.push(f.offset ?? 0); const offIdx = params.length;
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.utl_tanqueos_read WHERE ${cond.join(" AND ")} ORDER BY fecha_hora DESC, id DESC LIMIT $${limIdx} OFFSET $${offIdx}`, params),
      );
      return ok(res.rows.map((r) => this.toTanqueo(r)));
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel tanqueoList falló", err));
    }
  }

  async contar(t: string) {
    try {
      const res = await withTenantRead(this.pool, t, async (c) => {
        const a = await c.query(`SELECT count(*)::int AS n FROM deltaops.utl_lecturas_read WHERE tenant_id=$1`, [t]);
        const b = await c.query(`SELECT count(*)::int AS n FROM deltaops.utl_tanqueos_read WHERE tenant_id=$1`, [t]);
        return { utl_lecturas_read: Number(a.rows[0]?.["n"] ?? 0), utl_tanqueos_read: Number(b.rows[0]?.["n"] ?? 0) };
      });
      return ok(res);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel contar falló", err));
    }
  }
  async clear(uow: UnitOfWork, t: string) {
    try {
      await setTenant(uow, t);
      await pgSessionOf(uow).query(`DELETE FROM deltaops.utl_lecturas_read WHERE tenant_id=$1`, [t]);
      await pgSessionOf(uow).query(`DELETE FROM deltaops.utl_tanqueos_read WHERE tenant_id=$1`, [t]);
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel clear falló", err));
    }
  }

  private toLectura(r: Record<string, unknown>): LecturaReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), activoId: String(r["activo_id"]),
      tipoMedidor: String(r["tipo_medidor"]), valor: Number(r["valor"]), unidad: String(r["unidad"]),
      fechaHora: r["fecha_hora"] as Date, identityId: String(r["identity_id"]), origen: String(r["origen"]),
      estado: String(r["estado"]), inconsistente: r["inconsistente"] === true, sincronizacionActivo: String(r["sincronizacion_activo"]),
      datos: parseJson(r["datos"]), lastEventId: String(r["last_event_id"]), actualizadoAt: r["actualizado_at"] as Date,
    };
  }
  private toTanqueo(r: Record<string, unknown>): TanqueoReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), activoId: String(r["activo_id"]),
      fechaHora: r["fecha_hora"] as Date, litros: Number(r["litros"]), tipoCombustible: String(r["tipo_combustible"]),
      costoTotal: r["costo_total"] == null ? null : Number(r["costo_total"]), moneda: (r["moneda"] as string | null) ?? null,
      estado: String(r["estado"]), datos: parseJson(r["datos"]), lastEventId: String(r["last_event_id"]), actualizadoAt: r["actualizado_at"] as Date,
    };
  }
}

/* ============================ Consola técnica =========================== */

const PREFIJO_EVENTO = "modulo.utilizacion.";

export interface ConsolaResumen {
  readonly pendientes: number;
  readonly procesados: number;
  readonly ultimos: readonly Record<string, unknown>[];
}

export interface ConsolaStore {
  outboxDelModulo(tenantId: string, limit?: number): Promise<Result<ConsolaResumen, KernelError>>;
}

export class FakeConsolaStore implements ConsolaStore {
  constructor(private readonly records: () => readonly OutboxRecord[]) {}
  async outboxDelModulo(tenantId: string, limit = 10): Promise<Result<ConsolaResumen, KernelError>> {
    const relevantes = this.records().filter(
      (r) => String(r.eventType ?? "").startsWith(PREFIJO_EVENTO) && String((r.payload as Record<string, unknown> | undefined)?.["tenantId"] ?? "") === tenantId,
    );
    const pendientes = relevantes.filter((r) => r.processedAt == null).length;
    return ok({
      pendientes,
      procesados: relevantes.length - pendientes,
      ultimos: relevantes.slice(0, limit).map((r) => ({ id: r.id, tipo: r.eventType, processedAt: r.processedAt ?? null })),
    });
  }
}

export class PgConsolaStore implements ConsolaStore {
  constructor(private readonly pool: Pool) {}
  async outboxDelModulo(tenantId: string, limit = 10): Promise<Result<ConsolaResumen, KernelError>> {
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
          id: String(r["id"]),
          tipo: String(r["event_type"]),
          processedAt: r["processed_at"] ? new Date(r["processed_at"] as string).toISOString() : null,
          occurredAt: new Date(r["occurred_at"] as string).toISOString(),
        })),
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("Consola outboxDelModulo falló", err));
    }
  }
}
