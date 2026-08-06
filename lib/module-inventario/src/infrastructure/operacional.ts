/**
 * DGP-011.2 · Módulo Enterprise Inventory — Infraestructura OPERACIONAL + CQRS.
 *
 * Puertos + adaptadores (Fake/PG) para: recibos de sincronización durables
 * (protocolo de reclamación offline), bitácora de eventos durable del módulo
 * (fuente de verdad del replay, `inv_eventos`), read models especializados
 * (items, existencias/disponibilidad, movimientos, reservas, transferencias,
 * conteos, ajustes, lotes, series, bodegas, ubicaciones) y la consola técnica
 * (diagnóstico del outbox del Kernel filtrado al módulo). RLS por tenant en
 * lecturas y escrituras. Mismo patrón que module-ordenes (DGP-009.2).
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

const parseJson = (v: unknown): Record<string, unknown> =>
  (typeof v === "string" ? JSON.parse(v) : (v as Record<string, unknown>)) ?? {};

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
          `INSERT INTO deltaops.inv_sync_receipts (tenant_id, op_id, cliente_id, comando, estado, resultado)
           VALUES ($1,$2,$3,$4,'pendiente','null'::jsonb)
           ON CONFLICT (tenant_id, op_id) DO NOTHING
           RETURNING (xmax = 0) AS inserted`,
          [tenantId, opId, clienteId, comando],
        );
        if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true }) as Result<ClaimResult, KernelError>;
        const ex = await c.query(`SELECT * FROM deltaops.inv_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]);
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
        c.query(`SELECT * FROM deltaops.inv_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]),
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
          `UPDATE deltaops.inv_sync_receipts
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
        c.query(`DELETE FROM deltaops.inv_sync_receipts WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`, [tenantId, opId]),
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt release falló", err));
    }
  }
  async listByTenant(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.inv_sync_receipts WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]),
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
  private seq = 0;
  private readonly orden = new Map<string, number>();
  private k(t: string, e: string) { return `${t}::${e}`; }
  async append(_uow: UnitOfWork, ev: EventoBitacora) {
    const k = this.k(ev.tenantId, ev.eventId);
    if (this.log.has(k)) return ok(false);
    this.log.set(k, ev);
    this.orden.set(k, this.seq++);
    return ok(true);
  }
  async stream(tenantId: string) {
    return ok(
      [...this.log.entries()]
        .filter(([, r]) => r.tenantId === tenantId)
        .sort((a, b) => {
          const t = a[1].occurredAt.getTime() - b[1].occurredAt.getTime();
          if (t !== 0) return t;
          return (this.orden.get(a[0]) ?? 0) - (this.orden.get(b[0]) ?? 0);
        })
        .map(([, r]) => r),
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
        `INSERT INTO deltaops.inv_eventos (tenant_id, event_id, tipo, payload, occurred_at)
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
          `SELECT tenant_id, event_id, tipo, payload, occurred_at FROM deltaops.inv_eventos
           WHERE tenant_id=$1 ORDER BY occurred_at ASC, event_id ASC`,
          [tenantId],
        ),
      );
      return ok(
        res.rows.map((r) => ({
          tenantId: String(r["tenant_id"]),
          eventId: String(r["event_id"]),
          tipo: String(r["tipo"]),
          payload: parseJson(r["payload"]),
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
        c.query(`SELECT count(*)::int AS n FROM deltaops.inv_eventos WHERE tenant_id=$1`, [tenantId]),
      );
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog contar falló", err));
    }
  }
}

/* ================= Read models especializados (CQRS) ==================== */

export interface ItemReadRow {
  readonly tenantId: string; readonly id: string; readonly codigo: string; readonly sku: string;
  readonly nombre: string; readonly descripcion: string | null; readonly estado: string; readonly tipoItem: string;
  readonly categoria: string | null; readonly modoTrazabilidad: string; readonly eliminado: boolean;
  readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface ItemReadFiltro { readonly estado?: string; readonly tipoItem?: string; readonly incluirEliminados?: boolean; readonly limit?: number; }

export interface ExistenciaReadRow {
  readonly tenantId: string; readonly id: string; readonly itemId: string; readonly bodegaId: string; readonly ubicacionId: string;
  readonly loteCodigo: string | null; readonly serieNumero: string | null;
  readonly disponible: number; readonly reservado: number; readonly comprometido: number; readonly enTransito: number;
  readonly enInspeccion: number; readonly bloqueado: number; readonly vencido: number; readonly total: number;
  readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}

export interface MovimientoReadRow {
  readonly tenantId: string; readonly eventId: string; readonly inventarioId: string; readonly itemId: string | null;
  readonly tipo: string; readonly familia: string | null; readonly datos: Record<string, unknown>; readonly registradoAt: Date;
}

/** Fila proyectada genérica por (tenant,id) con idempotencia por (last_event_id, version). */
export interface ProyRow {
  readonly tenantId: string; readonly id: string; readonly estado: string;
  readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
  readonly [k: string]: unknown;
}

/**
 * Puerto único de read models (CQRS). Cada método es idempotente por su clave
 * (last_event_id/version para proyectados; event_id append-only para
 * movimientos) y se limpia en `clear` para permitir replay determinista.
 */
export interface ReadModelsStore {
  // items (listado/detalle)
  aplicarItem(uow: UnitOfWork, row: ItemReadRow): Promise<Result<boolean, KernelError>>;
  itemGet(tenantId: string, id: string): Promise<Result<ItemReadRow | null, KernelError>>;
  itemList(tenantId: string, filtro: ItemReadFiltro): Promise<Result<ItemReadRow[], KernelError>>;
  itemStats(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  itemLastEventId(tenantId: string): Promise<Result<string | null, KernelError>>;
  // existencias / disponibilidad
  aplicarExistencia(uow: UnitOfWork, row: ExistenciaReadRow): Promise<Result<boolean, KernelError>>;
  existenciaGet(tenantId: string, id: string): Promise<Result<ExistenciaReadRow | null, KernelError>>;
  existenciasPorItem(tenantId: string, itemId: string): Promise<Result<ExistenciaReadRow[], KernelError>>;
  // movimientos / histórico (append-only)
  aplicarMovimiento(uow: UnitOfWork, row: MovimientoReadRow): Promise<Result<boolean, KernelError>>;
  movimientosDe(tenantId: string, inventarioId: string, limit?: number): Promise<Result<MovimientoReadRow[], KernelError>>;
  // proyectados genéricos por (tenant,id)
  aplicarProy(uow: UnitOfWork, tabla: ProyTabla, row: ProyRow): Promise<Result<boolean, KernelError>>;
  proyGet(tenantId: string, tabla: ProyTabla, id: string): Promise<Result<ProyRow | null, KernelError>>;
  proyList(tenantId: string, tabla: ProyTabla, limit?: number): Promise<Result<ProyRow[], KernelError>>;
  // diagnóstico + replay
  contar(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

export type ProyTabla =
  | "inv_reservas_read"
  | "inv_transferencias_read"
  | "inv_conteos_read"
  | "inv_ajustes_read"
  | "inv_lotes_read"
  | "inv_series_read"
  | "inv_bodegas_read"
  | "inv_ubicaciones_read";

const PROY_TABLAS: ProyTabla[] = [
  "inv_reservas_read", "inv_transferencias_read", "inv_conteos_read", "inv_ajustes_read",
  "inv_lotes_read", "inv_series_read", "inv_bodegas_read", "inv_ubicaciones_read",
];

/* --------------------------- Fake de read models ------------------------- */

export class FakeReadModelsStore implements ReadModelsStore {
  private readonly items = new Map<string, ItemReadRow>();
  private readonly existencias = new Map<string, ExistenciaReadRow>();
  private readonly movimientos = new Map<string, MovimientoReadRow>();
  private readonly proy = new Map<ProyTabla, Map<string, ProyRow>>();
  private k(t: string, id: string) { return `${t}::${id}`; }
  private mapProy(tabla: ProyTabla): Map<string, ProyRow> {
    let m = this.proy.get(tabla);
    if (!m) { m = new Map(); this.proy.set(tabla, m); }
    return m;
  }

  async aplicarItem(_uow: UnitOfWork, row: ItemReadRow) {
    const cur = this.items.get(this.k(row.tenantId, row.id));
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    this.items.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  async itemGet(t: string, id: string) { return ok(this.items.get(this.k(t, id)) ?? null); }
  async itemList(t: string, f: ItemReadFiltro) {
    let rows = [...this.items.values()].filter((r) => r.tenantId === t);
    if (!f.incluirEliminados) rows = rows.filter((r) => !r.eliminado);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    if (f.tipoItem) rows = rows.filter((r) => r.tipoItem === f.tipoItem);
    rows.sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 200));
  }
  async itemStats(t: string) {
    const s: Record<string, number> = {};
    for (const r of this.items.values()) if (r.tenantId === t) s[r.estado] = (s[r.estado] ?? 0) + 1;
    return ok(s);
  }
  async itemLastEventId(t: string) {
    let latest: ItemReadRow | null = null;
    for (const r of this.items.values()) if (r.tenantId === t && (!latest || r.actualizadoAt.getTime() >= latest.actualizadoAt.getTime())) latest = r;
    return ok(latest ? latest.lastEventId : null);
  }
  async aplicarExistencia(_uow: UnitOfWork, row: ExistenciaReadRow) {
    const cur = this.existencias.get(this.k(row.tenantId, row.id));
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    this.existencias.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  async existenciaGet(t: string, id: string) { return ok(this.existencias.get(this.k(t, id)) ?? null); }
  async existenciasPorItem(t: string, itemId: string) {
    return ok([...this.existencias.values()].filter((r) => r.tenantId === t && r.itemId === itemId).sort((a, b) => (a.id < b.id ? -1 : 1)));
  }
  async aplicarMovimiento(_uow: UnitOfWork, row: MovimientoReadRow) {
    const k = this.k(row.tenantId, row.eventId);
    if (this.movimientos.has(k)) return ok(false);
    this.movimientos.set(k, row);
    return ok(true);
  }
  async movimientosDe(t: string, inventarioId: string, limit = 500) {
    // Orden CRONOLÓGICO (asc): el último elemento es el más reciente. El Map
    // preserva el orden de inserción (causal por proyección), y `sort` es
    // estable ⇒ los empates de timestamp conservan el orden de inserción.
    return ok(
      [...this.movimientos.values()]
        .filter((r) => r.tenantId === t && r.inventarioId === inventarioId)
        .sort((a, b) => a.registradoAt.getTime() - b.registradoAt.getTime())
        .slice(0, limit),
    );
  }
  async aplicarProy(_uow: UnitOfWork, tabla: ProyTabla, row: ProyRow) {
    const m = this.mapProy(tabla);
    const cur = m.get(this.k(row.tenantId, row.id));
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    m.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  async proyGet(t: string, tabla: ProyTabla, id: string) { return ok(this.mapProy(tabla).get(this.k(t, id)) ?? null); }
  async proyList(t: string, tabla: ProyTabla, limit = 500) {
    return ok(
      [...this.mapProy(tabla).values()]
        .filter((r) => r.tenantId === t)
        .sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1))
        .slice(0, limit),
    );
  }
  async contar(t: string) {
    const out: Record<string, number> = {
      items: [...this.items.values()].filter((r) => r.tenantId === t).length,
      existencias: [...this.existencias.values()].filter((r) => r.tenantId === t).length,
      movimientos: [...this.movimientos.values()].filter((r) => r.tenantId === t).length,
    };
    for (const tabla of PROY_TABLAS) out[tabla] = [...this.mapProy(tabla).values()].filter((r) => r.tenantId === t).length;
    return ok(out);
  }
  async clear(_uow: UnitOfWork, t: string) {
    for (const m of [this.items, this.existencias, this.movimientos] as Map<string, { tenantId: string }>[]) {
      for (const [k, r] of m) if (r.tenantId === t) m.delete(k);
    }
    for (const tabla of PROY_TABLAS) {
      const m = this.mapProy(tabla);
      for (const [k, r] of m) if (r.tenantId === t) m.delete(k);
    }
    return ok(undefined);
  }
}

/* --------------------------- PG de read models --------------------------- */

const PROY_EXTRA_COLS: Record<ProyTabla, string[]> = {
  inv_reservas_read: ["item_id", "tipo", "demanda_id"],
  inv_transferencias_read: [],
  inv_conteos_read: ["tipo"],
  inv_ajustes_read: ["tipo"],
  inv_lotes_read: ["item_id", "codigo", "vencimiento_at"],
  inv_series_read: ["item_id", "numero"],
  inv_bodegas_read: ["nombre", "tipo"],
  inv_ubicaciones_read: ["bodega_id", "nivel"],
};

// Tablas cuyo read model no tiene columna `estado` real (usan '' proyectado).
const SIN_ESTADO: Set<ProyTabla> = new Set(["inv_lotes_read", "inv_bodegas_read", "inv_ubicaciones_read"]);

const toCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

export class PgReadModelsStore implements ReadModelsStore {
  constructor(private readonly pool: Pool) {}

  async aplicarItem(uow: UnitOfWork, row: ItemReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.inv_items_read
           (tenant_id, id, codigo, sku, nombre, descripcion, estado, tipo_item, categoria, modo_trazabilidad, eliminado, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           codigo=EXCLUDED.codigo, sku=EXCLUDED.sku, nombre=EXCLUDED.nombre, descripcion=EXCLUDED.descripcion,
           estado=EXCLUDED.estado, tipo_item=EXCLUDED.tipo_item, categoria=EXCLUDED.categoria,
           modo_trazabilidad=EXCLUDED.modo_trazabilidad, eliminado=EXCLUDED.eliminado, datos=EXCLUDED.datos,
           version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.inv_items_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.inv_items_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.codigo, row.sku, row.nombre, row.descripcion, row.estado, row.tipoItem, row.categoria,
         row.modoTrazabilidad, row.eliminado, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("item read apply falló", err)); }
  }
  async itemGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.inv_items_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toItem(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("item read get falló", err)); }
  }
  async itemList(t: string, f: ItemReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.inv_items_read
           WHERE tenant_id=$1 AND ($2::boolean IS TRUE OR eliminado=false)
             AND ($3::text IS NULL OR estado=$3) AND ($4::text IS NULL OR tipo_item=$4)
           ORDER BY actualizado_at DESC, id ASC LIMIT $5`,
          [t, f.incluirEliminados ?? false, f.estado ?? null, f.tipoItem ?? null, f.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => this.toItem(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("item read list falló", err)); }
  }
  async itemStats(t: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT estado, count(*)::int AS n FROM deltaops.inv_items_read WHERE tenant_id=$1 GROUP BY estado`, [t]),
      );
      const s: Record<string, number> = {};
      for (const r of res.rows) s[String(r["estado"])] = Number(r["n"]);
      return ok(s);
    } catch (err) { return fail(KernelErrors.infrastructure("item read stats falló", err)); }
  }
  async itemLastEventId(t: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT last_event_id FROM deltaops.inv_items_read WHERE tenant_id=$1 ORDER BY actualizado_at DESC LIMIT 1`, [t]),
      );
      return ok(res.rows[0] ? String(res.rows[0]["last_event_id"]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("item read lastEventId falló", err)); }
  }
  private toItem(r: Record<string, unknown>): ItemReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), codigo: String(r["codigo"] ?? ""), sku: String(r["sku"] ?? ""),
      nombre: String(r["nombre"] ?? ""), descripcion: (r["descripcion"] as string | null) ?? null, estado: String(r["estado"] ?? ""),
      tipoItem: String(r["tipo_item"] ?? ""), categoria: (r["categoria"] as string | null) ?? null,
      modoTrazabilidad: String(r["modo_trazabilidad"] ?? ""), eliminado: Boolean(r["eliminado"]),
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""),
      actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarExistencia(uow: UnitOfWork, row: ExistenciaReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.inv_existencias_read
           (tenant_id, id, item_id, bodega_id, ubicacion_id, lote_codigo, serie_numero,
            disponible, reservado, comprometido, en_transito, en_inspeccion, bloqueado, vencido, total,
            datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           item_id=EXCLUDED.item_id, bodega_id=EXCLUDED.bodega_id, ubicacion_id=EXCLUDED.ubicacion_id,
           lote_codigo=EXCLUDED.lote_codigo, serie_numero=EXCLUDED.serie_numero,
           disponible=EXCLUDED.disponible, reservado=EXCLUDED.reservado, comprometido=EXCLUDED.comprometido,
           en_transito=EXCLUDED.en_transito, en_inspeccion=EXCLUDED.en_inspeccion, bloqueado=EXCLUDED.bloqueado,
           vencido=EXCLUDED.vencido, total=EXCLUDED.total, datos=EXCLUDED.datos, version=EXCLUDED.version,
           last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.inv_existencias_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.inv_existencias_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.itemId, row.bodegaId, row.ubicacionId, row.loteCodigo, row.serieNumero,
         row.disponible, row.reservado, row.comprometido, row.enTransito, row.enInspeccion, row.bloqueado, row.vencido, row.total,
         JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("existencia read apply falló", err)); }
  }
  async existenciaGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.inv_existencias_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toExistencia(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("existencia read get falló", err)); }
  }
  async existenciasPorItem(t: string, itemId: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.inv_existencias_read WHERE tenant_id=$1 AND item_id=$2 ORDER BY id ASC`, [t, itemId]));
      return ok(res.rows.map((r) => this.toExistencia(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("existencia read porItem falló", err)); }
  }
  private toExistencia(r: Record<string, unknown>): ExistenciaReadRow {
    const num = (k: string) => Number(r[k] ?? 0);
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), itemId: String(r["item_id"]), bodegaId: String(r["bodega_id"]),
      ubicacionId: String(r["ubicacion_id"]), loteCodigo: (r["lote_codigo"] as string | null) ?? null,
      serieNumero: (r["serie_numero"] as string | null) ?? null,
      disponible: num("disponible"), reservado: num("reservado"), comprometido: num("comprometido"),
      enTransito: num("en_transito"), enInspeccion: num("en_inspeccion"), bloqueado: num("bloqueado"), vencido: num("vencido"), total: num("total"),
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarMovimiento(uow: UnitOfWork, row: MovimientoReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.inv_movimientos_read (tenant_id, event_id, inventario_id, item_id, tipo, familia, datos, registrado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [row.tenantId, row.eventId, row.inventarioId, row.itemId, row.tipo, row.familia, JSON.stringify(row.datos), row.registradoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("movimiento read apply falló", err)); }
  }
  async movimientosDe(t: string, inventarioId: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.inv_movimientos_read WHERE tenant_id=$1 AND inventario_id=$2 ORDER BY registrado_at ASC, event_id ASC LIMIT $3`, [t, inventarioId, limit]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), eventId: String(r["event_id"]), inventarioId: String(r["inventario_id"]),
        itemId: (r["item_id"] as string | null) ?? null, tipo: String(r["tipo"] ?? ""), familia: (r["familia"] as string | null) ?? null,
        datos: parseJson(r["datos"]), registradoAt: r["registrado_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("movimiento read list falló", err)); }
  }

  async aplicarProy(uow: UnitOfWork, tabla: ProyTabla, row: ProyRow) {
    try {
      await setTenant(uow, row.tenantId);
      const extra = PROY_EXTRA_COLS[tabla];
      const baseCols = ["tenant_id", "id", ...(SIN_ESTADO.has(tabla) ? [] : ["estado"]), ...extra, "datos", "version", "last_event_id", "actualizado_at"];
      const baseVals: unknown[] = [
        row.tenantId, row.id, ...(SIN_ESTADO.has(tabla) ? [] : [row.estado]),
        ...extra.map((c) => (row[toCamel(c)] as unknown) ?? null),
        JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt,
      ];
      const ph = baseCols.map((_, i) => `$${i + 1}`).join(",");
      const updatable = baseCols.filter((c) => c !== "tenant_id" && c !== "id");
      const setSql = updatable.map((c) => `${c}=EXCLUDED.${c}`).join(", ");
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.${tabla} (${baseCols.join(",")}) VALUES (${ph})
         ON CONFLICT (tenant_id, id) DO UPDATE SET ${setSql}
         WHERE deltaops.${tabla}.last_event_id <> EXCLUDED.last_event_id AND deltaops.${tabla}.version <= EXCLUDED.version`,
        baseVals,
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure(`${tabla} apply falló`, err)); }
  }
  async proyGet(t: string, tabla: ProyTabla, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.${tabla} WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toProy(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure(`${tabla} get falló`, err)); }
  }
  async proyList(t: string, tabla: ProyTabla, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.${tabla} WHERE tenant_id=$1 ORDER BY actualizado_at DESC, id ASC LIMIT $2`, [t, limit]));
      return ok(res.rows.map((r) => this.toProy(r)));
    } catch (err) { return fail(KernelErrors.infrastructure(`${tabla} list falló`, err)); }
  }
  private toProy(r: Record<string, unknown>): ProyRow {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[toCamel(k)] = v;
    return {
      ...out,
      tenantId: String(r["tenant_id"]), id: String(r["id"]), estado: String(r["estado"] ?? ""),
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""),
      actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async contar(t: string) {
    try {
      const tablas = ["inv_items_read", "inv_existencias_read", "inv_movimientos_read", ...PROY_TABLAS];
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
      for (const tabla of ["inv_items_read", "inv_existencias_read", "inv_movimientos_read", ...PROY_TABLAS]) {
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

const PREFIJO_EVENTO = "modulo.inventario.";

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
