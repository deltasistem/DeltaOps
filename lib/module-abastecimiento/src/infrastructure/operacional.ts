/**
 * DGP-013.2 · Módulo Enterprise Procurement — Infraestructura OPERACIONAL + CQRS.
 *
 * Puertos + adaptadores (Fake/PG) para: recibos de sincronización durables
 * (protocolo de reclamación offline), bitácora de eventos durable del módulo
 * (fuente de verdad del replay, `abs_eventos`), read models especializados
 * (artículos, proveedores, solicitudes, cotizaciones, órdenes de compra,
 * recepciones, historial y COSTOS) y la consola técnica (diagnóstico del outbox
 * del Kernel filtrado al módulo). RLS por tenant en lecturas y escrituras.
 * Mismo patrón que module-planes (DGP-012.2) / module-inventario (DGP-011.2).
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
          `INSERT INTO deltaops.abs_sync_receipts (tenant_id, op_id, cliente_id, comando, estado, resultado)
           VALUES ($1,$2,$3,$4,'pendiente','null'::jsonb)
           ON CONFLICT (tenant_id, op_id) DO NOTHING
           RETURNING (xmax = 0) AS inserted`,
          [tenantId, opId, clienteId, comando],
        );
        if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true }) as Result<ClaimResult, KernelError>;
        const ex = await c.query(`SELECT * FROM deltaops.abs_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]);
        const r = ex.rows[0];
        return ok({ duenio: false, recibo: r ? this.toReceipt(r) : undefined }) as Result<ClaimResult, KernelError>;
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt claim falló", err));
    }
  }
  async find(tenantId: string, opId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.abs_sync_receipts WHERE tenant_id=$1 AND op_id=$2`, [tenantId, opId]));
      return ok(res.rows[0] ? this.toReceipt(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt find falló", err));
    }
  }
  async finalize(tenantId: string, r: SyncReceipt) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `UPDATE deltaops.abs_sync_receipts SET estado=$3, resultado=$4, comando=$5, updated_at=now()
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
      await withTenantRead(this.pool, tenantId, (c) => c.query(`DELETE FROM deltaops.abs_sync_receipts WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`, [tenantId, opId]));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt release falló", err));
    }
  }
  async listByTenant(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT * FROM deltaops.abs_sync_receipts WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]));
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
        `INSERT INTO deltaops.abs_eventos (tenant_id, event_id, tipo, payload, occurred_at)
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
      c.query(`SELECT tenant_id, event_id, tipo, payload, occurred_at FROM deltaops.abs_eventos WHERE tenant_id=$1 ORDER BY occurred_at ASC, event_id ASC`, [tenantId]),
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
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT count(*)::int AS n FROM deltaops.abs_eventos WHERE tenant_id=$1`, [tenantId]));
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog contar falló", err));
    }
  }
}

/* ================= Read models especializados (CQRS) ==================== */

export interface ArticuloReadRow {
  readonly tenantId: string; readonly id: string; readonly codigo: string; readonly nombre: string;
  readonly tipo: string; readonly unidad: string; readonly familia: string | null; readonly metodoValoracion: string;
  readonly moneda: string; readonly activo: boolean; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface ArticuloReadFiltro { readonly tipo?: string; readonly familia?: string; readonly activo?: boolean; readonly limit?: number; }

export interface ProveedorReadRow {
  readonly tenantId: string; readonly id: string; readonly codigo: string; readonly razonSocial: string;
  readonly tipo: string; readonly calificacionPromedio: number; readonly activo: boolean;
  readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface ProveedorReadFiltro { readonly tipo?: string; readonly activo?: boolean; readonly limit?: number; }

export interface SolicitudReadRow {
  readonly tenantId: string; readonly id: string; readonly codigo: string; readonly titulo: string;
  readonly estado: string; readonly prioridad: string; readonly origenTipo: string;
  readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface SolicitudReadFiltro { readonly estado?: string; readonly limit?: number; }

export interface CotizacionReadRow {
  readonly tenantId: string; readonly id: string; readonly solicitudId: string; readonly proveedorId: string;
  readonly moneda: string; readonly total: number; readonly plazoEntregaDias: number; readonly seleccionada: boolean;
  readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}

export interface OrdenCompraReadRow {
  readonly tenantId: string; readonly id: string; readonly codigo: string; readonly proveedorId: string;
  readonly solicitudId: string | null; readonly cotizacionId: string | null; readonly moneda: string; readonly estado: string;
  readonly total: number; readonly datos: Record<string, unknown>; readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}
export interface OrdenCompraReadFiltro { readonly estado?: string; readonly proveedorId?: string; readonly limit?: number; }

export interface RecepcionReadRow {
  readonly tenantId: string; readonly id: string; readonly ordenCompraId: string; readonly consecutivo: number;
  readonly completaOrden: boolean; readonly conNovedades: boolean; readonly estadoOrden: string | null;
  readonly datos: Record<string, unknown>; readonly recibidoPor: string; readonly recibidoEn: Date;
  readonly lastEventId: string; readonly registradoAt: Date;
}

export interface HistorialReadRow {
  readonly tenantId: string; readonly id: string; readonly entityRef: string; readonly hito: string; readonly version: number;
  readonly detalle: Record<string, unknown>; readonly actorId: string; readonly ocurridoAt: Date; readonly lastEventId: string;
}

export interface CostoReadRow {
  readonly tenantId: string; readonly articuloId: string; readonly moneda: string; readonly metodoValoracion: string;
  readonly costoUnitario: number; readonly cantidadAcumulada: number; readonly datos: Record<string, unknown>;
  readonly version: number; readonly lastEventId: string; readonly actualizadoAt: Date;
}

export interface ReadModelsStore {
  aplicarArticulo(uow: UnitOfWork, row: ArticuloReadRow): Promise<Result<boolean, KernelError>>;
  articuloGet(tenantId: string, id: string): Promise<Result<ArticuloReadRow | null, KernelError>>;
  articuloList(tenantId: string, filtro: ArticuloReadFiltro): Promise<Result<ArticuloReadRow[], KernelError>>;
  aplicarProveedor(uow: UnitOfWork, row: ProveedorReadRow): Promise<Result<boolean, KernelError>>;
  proveedorGet(tenantId: string, id: string): Promise<Result<ProveedorReadRow | null, KernelError>>;
  proveedorList(tenantId: string, filtro: ProveedorReadFiltro): Promise<Result<ProveedorReadRow[], KernelError>>;
  aplicarSolicitud(uow: UnitOfWork, row: SolicitudReadRow): Promise<Result<boolean, KernelError>>;
  solicitudGet(tenantId: string, id: string): Promise<Result<SolicitudReadRow | null, KernelError>>;
  solicitudList(tenantId: string, filtro: SolicitudReadFiltro): Promise<Result<SolicitudReadRow[], KernelError>>;
  aplicarCotizacion(uow: UnitOfWork, row: CotizacionReadRow): Promise<Result<boolean, KernelError>>;
  marcarCotizacionSeleccionada(uow: UnitOfWork, tenantId: string, solicitudId: string, cotizacionId: string, lastEventId: string): Promise<Result<boolean, KernelError>>;
  cotizacionesPorSolicitud(tenantId: string, solicitudId: string, limit?: number): Promise<Result<CotizacionReadRow[], KernelError>>;
  aplicarOrdenCompra(uow: UnitOfWork, row: OrdenCompraReadRow): Promise<Result<boolean, KernelError>>;
  ordenCompraGet(tenantId: string, id: string): Promise<Result<OrdenCompraReadRow | null, KernelError>>;
  ordenCompraList(tenantId: string, filtro: OrdenCompraReadFiltro): Promise<Result<OrdenCompraReadRow[], KernelError>>;
  aplicarRecepcion(uow: UnitOfWork, row: RecepcionReadRow): Promise<Result<boolean, KernelError>>;
  recepcionesPorOrden(tenantId: string, ordenCompraId: string, limit?: number): Promise<Result<RecepcionReadRow[], KernelError>>;
  aplicarHistorial(uow: UnitOfWork, row: HistorialReadRow): Promise<Result<boolean, KernelError>>;
  historialPorEntidad(tenantId: string, entityRef: string, limit?: number): Promise<Result<HistorialReadRow[], KernelError>>;
  aplicarCosto(uow: UnitOfWork, row: CostoReadRow): Promise<Result<boolean, KernelError>>;
  costosPorArticulo(tenantId: string, articuloId: string): Promise<Result<CostoReadRow[], KernelError>>;
  contar(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/* --------------------------- Fake de read models ------------------------- */

export class FakeReadModelsStore implements ReadModelsStore {
  private readonly articulos = new Map<string, ArticuloReadRow>();
  private readonly proveedores = new Map<string, ProveedorReadRow>();
  private readonly solicitudes = new Map<string, SolicitudReadRow>();
  private readonly cotizaciones = new Map<string, CotizacionReadRow>();
  private readonly ordenes = new Map<string, OrdenCompraReadRow>();
  private readonly recepciones = new Map<string, RecepcionReadRow>();
  private readonly historial = new Map<string, HistorialReadRow>();
  private readonly costos = new Map<string, CostoReadRow>();
  private k(t: string, id: string) { return `${t}::${id}`; }

  private aplicarVersionado<T extends { tenantId: string; id: string; version: number; lastEventId: string }>(m: Map<string, T>, row: T): Result<boolean, KernelError> {
    const cur = m.get(this.k(row.tenantId, row.id));
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    m.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }

  async aplicarArticulo(_uow: UnitOfWork, row: ArticuloReadRow) { return this.aplicarVersionado(this.articulos, row); }
  async articuloGet(t: string, id: string) { return ok(this.articulos.get(this.k(t, id)) ?? null); }
  async articuloList(t: string, f: ArticuloReadFiltro) {
    let rows = [...this.articulos.values()].filter((r) => r.tenantId === t);
    if (f.tipo) rows = rows.filter((r) => r.tipo === f.tipo);
    if (f.familia) rows = rows.filter((r) => r.familia === f.familia);
    if (f.activo !== undefined) rows = rows.filter((r) => r.activo === f.activo);
    rows.sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 200));
  }

  async aplicarProveedor(_uow: UnitOfWork, row: ProveedorReadRow) { return this.aplicarVersionado(this.proveedores, row); }
  async proveedorGet(t: string, id: string) { return ok(this.proveedores.get(this.k(t, id)) ?? null); }
  async proveedorList(t: string, f: ProveedorReadFiltro) {
    let rows = [...this.proveedores.values()].filter((r) => r.tenantId === t);
    if (f.tipo) rows = rows.filter((r) => r.tipo === f.tipo);
    if (f.activo !== undefined) rows = rows.filter((r) => r.activo === f.activo);
    rows.sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 200));
  }

  async aplicarSolicitud(_uow: UnitOfWork, row: SolicitudReadRow) { return this.aplicarVersionado(this.solicitudes, row); }
  async solicitudGet(t: string, id: string) { return ok(this.solicitudes.get(this.k(t, id)) ?? null); }
  async solicitudList(t: string, f: SolicitudReadFiltro) {
    let rows = [...this.solicitudes.values()].filter((r) => r.tenantId === t);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    rows.sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 200));
  }

  async aplicarCotizacion(_uow: UnitOfWork, row: CotizacionReadRow) { return this.aplicarVersionado(this.cotizaciones, row); }
  async marcarCotizacionSeleccionada(_uow: UnitOfWork, t: string, solicitudId: string, cotizacionId: string, _lastEventId: string) {
    let cambio = false;
    for (const [k, r] of this.cotizaciones) {
      if (r.tenantId !== t || r.solicitudId !== solicitudId) continue;
      const sel = r.id === cotizacionId;
      if (r.seleccionada !== sel) { this.cotizaciones.set(k, { ...r, seleccionada: sel }); cambio = true; }
    }
    return ok(cambio);
  }
  async cotizacionesPorSolicitud(t: string, solicitudId: string, limit = 500) {
    return ok([...this.cotizaciones.values()].filter((r) => r.tenantId === t && r.solicitudId === solicitudId).sort((a, b) => a.total - b.total).slice(0, limit));
  }

  async aplicarOrdenCompra(_uow: UnitOfWork, row: OrdenCompraReadRow) { return this.aplicarVersionado(this.ordenes, row); }
  async ordenCompraGet(t: string, id: string) { return ok(this.ordenes.get(this.k(t, id)) ?? null); }
  async ordenCompraList(t: string, f: OrdenCompraReadFiltro) {
    let rows = [...this.ordenes.values()].filter((r) => r.tenantId === t);
    if (f.estado) rows = rows.filter((r) => r.estado === f.estado);
    if (f.proveedorId) rows = rows.filter((r) => r.proveedorId === f.proveedorId);
    rows.sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || (a.id < b.id ? -1 : 1));
    return ok(rows.slice(0, f.limit ?? 200));
  }

  async aplicarRecepcion(_uow: UnitOfWork, row: RecepcionReadRow) {
    const k = this.k(row.tenantId, row.id);
    if (this.recepciones.has(k)) return ok(false);
    this.recepciones.set(k, row);
    return ok(true);
  }
  async recepcionesPorOrden(t: string, ordenCompraId: string, limit = 500) {
    return ok([...this.recepciones.values()].filter((r) => r.tenantId === t && r.ordenCompraId === ordenCompraId).sort((a, b) => a.consecutivo - b.consecutivo).slice(0, limit));
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

  async aplicarCosto(_uow: UnitOfWork, row: CostoReadRow) {
    const k = `${row.tenantId}::${row.articuloId}::${row.moneda}`;
    const cur = this.costos.get(k);
    if (cur && (cur.lastEventId === row.lastEventId || cur.version > row.version)) return ok(false);
    this.costos.set(k, row);
    return ok(true);
  }
  async costosPorArticulo(t: string, articuloId: string) {
    return ok([...this.costos.values()].filter((r) => r.tenantId === t && r.articuloId === articuloId).sort((a, b) => (a.moneda < b.moneda ? -1 : 1)));
  }

  async contar(t: string) {
    return ok({
      abs_articulos_read: [...this.articulos.values()].filter((r) => r.tenantId === t).length,
      abs_proveedores_read: [...this.proveedores.values()].filter((r) => r.tenantId === t).length,
      abs_solicitudes_read: [...this.solicitudes.values()].filter((r) => r.tenantId === t).length,
      abs_cotizaciones_read: [...this.cotizaciones.values()].filter((r) => r.tenantId === t).length,
      abs_ordenes_compra_read: [...this.ordenes.values()].filter((r) => r.tenantId === t).length,
      abs_recepciones_read: [...this.recepciones.values()].filter((r) => r.tenantId === t).length,
      abs_historial_read: [...this.historial.values()].filter((r) => r.tenantId === t).length,
      abs_costos_read: [...this.costos.values()].filter((r) => r.tenantId === t).length,
    });
  }
  async clear(_uow: UnitOfWork, t: string) {
    for (const m of [this.articulos, this.proveedores, this.solicitudes, this.cotizaciones, this.ordenes, this.recepciones, this.historial, this.costos] as Map<string, { tenantId: string }>[]) {
      for (const [k, r] of m) if (r.tenantId === t) m.delete(k);
    }
    return ok(undefined);
  }
}

/* --------------------------- PG de read models --------------------------- */

export class PgReadModelsStore implements ReadModelsStore {
  constructor(private readonly pool: Pool) {}

  async aplicarArticulo(uow: UnitOfWork, row: ArticuloReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_articulos_read
           (tenant_id, id, codigo, nombre, tipo, unidad, familia, metodo_valoracion, moneda, activo, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           codigo=EXCLUDED.codigo, nombre=EXCLUDED.nombre, tipo=EXCLUDED.tipo, unidad=EXCLUDED.unidad, familia=EXCLUDED.familia,
           metodo_valoracion=EXCLUDED.metodo_valoracion, moneda=EXCLUDED.moneda, activo=EXCLUDED.activo, datos=EXCLUDED.datos,
           version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.abs_articulos_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.abs_articulos_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.codigo, row.nombre, row.tipo, row.unidad, row.familia, row.metodoValoracion, row.moneda,
         row.activo, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("articulo read apply falló", err)); }
  }
  async articuloGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.abs_articulos_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toArticulo(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("articulo read get falló", err)); }
  }
  async articuloList(t: string, f: ArticuloReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.abs_articulos_read
           WHERE tenant_id=$1 AND ($2::text IS NULL OR tipo=$2) AND ($3::text IS NULL OR familia=$3) AND ($4::boolean IS NULL OR activo=$4)
           ORDER BY actualizado_at DESC, id ASC LIMIT $5`,
          [t, f.tipo ?? null, f.familia ?? null, f.activo ?? null, f.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => this.toArticulo(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("articulo read list falló", err)); }
  }
  private toArticulo(r: Record<string, unknown>): ArticuloReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), codigo: String(r["codigo"] ?? ""), nombre: String(r["nombre"] ?? ""),
      tipo: String(r["tipo"] ?? ""), unidad: String(r["unidad"] ?? ""), familia: (r["familia"] as string | null) ?? null,
      metodoValoracion: String(r["metodo_valoracion"] ?? ""), moneda: String(r["moneda"] ?? ""), activo: r["activo"] === true,
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarProveedor(uow: UnitOfWork, row: ProveedorReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_proveedores_read
           (tenant_id, id, codigo, razon_social, tipo, calificacion_promedio, activo, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           codigo=EXCLUDED.codigo, razon_social=EXCLUDED.razon_social, tipo=EXCLUDED.tipo, calificacion_promedio=EXCLUDED.calificacion_promedio,
           activo=EXCLUDED.activo, datos=EXCLUDED.datos, version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.abs_proveedores_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.abs_proveedores_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.codigo, row.razonSocial, row.tipo, row.calificacionPromedio, row.activo, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("proveedor read apply falló", err)); }
  }
  async proveedorGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.abs_proveedores_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toProveedor(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("proveedor read get falló", err)); }
  }
  async proveedorList(t: string, f: ProveedorReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.abs_proveedores_read
           WHERE tenant_id=$1 AND ($2::text IS NULL OR tipo=$2) AND ($3::boolean IS NULL OR activo=$3)
           ORDER BY actualizado_at DESC, id ASC LIMIT $4`,
          [t, f.tipo ?? null, f.activo ?? null, f.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => this.toProveedor(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("proveedor read list falló", err)); }
  }
  private toProveedor(r: Record<string, unknown>): ProveedorReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), codigo: String(r["codigo"] ?? ""), razonSocial: String(r["razon_social"] ?? ""),
      tipo: String(r["tipo"] ?? ""), calificacionPromedio: Number(r["calificacion_promedio"] ?? 0), activo: r["activo"] === true,
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarSolicitud(uow: UnitOfWork, row: SolicitudReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_solicitudes_read
           (tenant_id, id, codigo, titulo, estado, prioridad, origen_tipo, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           codigo=EXCLUDED.codigo, titulo=EXCLUDED.titulo, estado=EXCLUDED.estado, prioridad=EXCLUDED.prioridad, origen_tipo=EXCLUDED.origen_tipo,
           datos=EXCLUDED.datos, version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.abs_solicitudes_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.abs_solicitudes_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.codigo, row.titulo, row.estado, row.prioridad, row.origenTipo, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("solicitud read apply falló", err)); }
  }
  async solicitudGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.abs_solicitudes_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toSolicitud(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("solicitud read get falló", err)); }
  }
  async solicitudList(t: string, f: SolicitudReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.abs_solicitudes_read WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2)
           ORDER BY actualizado_at DESC, id ASC LIMIT $3`,
          [t, f.estado ?? null, f.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => this.toSolicitud(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("solicitud read list falló", err)); }
  }
  private toSolicitud(r: Record<string, unknown>): SolicitudReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), codigo: String(r["codigo"] ?? ""), titulo: String(r["titulo"] ?? ""),
      estado: String(r["estado"] ?? ""), prioridad: String(r["prioridad"] ?? ""), origenTipo: String(r["origen_tipo"] ?? ""),
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarCotizacion(uow: UnitOfWork, row: CotizacionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_cotizaciones_read
           (tenant_id, id, solicitud_id, proveedor_id, moneda, total, plazo_entrega_dias, seleccionada, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           moneda=EXCLUDED.moneda, total=EXCLUDED.total, plazo_entrega_dias=EXCLUDED.plazo_entrega_dias, seleccionada=EXCLUDED.seleccionada,
           datos=EXCLUDED.datos, version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.abs_cotizaciones_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.abs_cotizaciones_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.solicitudId, row.proveedorId, row.moneda, row.total, row.plazoEntregaDias, row.seleccionada, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("cotizacion read apply falló", err)); }
  }
  async marcarCotizacionSeleccionada(uow: UnitOfWork, t: string, solicitudId: string, cotizacionId: string, lastEventId: string) {
    try {
      await setTenant(uow, t);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.abs_cotizaciones_read
           SET seleccionada = (id = $3), last_event_id = $4
         WHERE tenant_id=$1 AND solicitud_id=$2 AND last_event_id <> $4`,
        [t, solicitudId, cotizacionId, lastEventId],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("cotizacion seleccionada apply falló", err)); }
  }
  async cotizacionesPorSolicitud(t: string, solicitudId: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.abs_cotizaciones_read WHERE tenant_id=$1 AND solicitud_id=$2 ORDER BY total ASC, id ASC LIMIT $3`, [t, solicitudId, limit]),
      );
      return ok(res.rows.map((r) => this.toCotizacion(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("cotizacion read list falló", err)); }
  }
  private toCotizacion(r: Record<string, unknown>): CotizacionReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), solicitudId: String(r["solicitud_id"]), proveedorId: String(r["proveedor_id"]),
      moneda: String(r["moneda"] ?? ""), total: Number(r["total"] ?? 0), plazoEntregaDias: Number(r["plazo_entrega_dias"] ?? 0), seleccionada: r["seleccionada"] === true,
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarOrdenCompra(uow: UnitOfWork, row: OrdenCompraReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_ordenes_compra_read
           (tenant_id, id, codigo, proveedor_id, solicitud_id, cotizacion_id, moneda, estado, total, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           codigo=EXCLUDED.codigo, proveedor_id=EXCLUDED.proveedor_id, solicitud_id=EXCLUDED.solicitud_id, cotizacion_id=EXCLUDED.cotizacion_id,
           moneda=EXCLUDED.moneda, estado=EXCLUDED.estado, total=EXCLUDED.total, datos=EXCLUDED.datos, version=EXCLUDED.version,
           last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.abs_ordenes_compra_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.abs_ordenes_compra_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.codigo, row.proveedorId, row.solicitudId, row.cotizacionId, row.moneda, row.estado, row.total, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("orden-compra read apply falló", err)); }
  }
  async ordenCompraGet(t: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) => c.query(`SELECT * FROM deltaops.abs_ordenes_compra_read WHERE tenant_id=$1 AND id=$2`, [t, id]));
      return ok(res.rows[0] ? this.toOrden(res.rows[0]) : null);
    } catch (err) { return fail(KernelErrors.infrastructure("orden-compra read get falló", err)); }
  }
  async ordenCompraList(t: string, f: OrdenCompraReadFiltro) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(
          `SELECT * FROM deltaops.abs_ordenes_compra_read
           WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2) AND ($3::text IS NULL OR proveedor_id=$3)
           ORDER BY actualizado_at DESC, id ASC LIMIT $4`,
          [t, f.estado ?? null, f.proveedorId ?? null, f.limit ?? 200],
        ),
      );
      return ok(res.rows.map((r) => this.toOrden(r)));
    } catch (err) { return fail(KernelErrors.infrastructure("orden-compra read list falló", err)); }
  }
  private toOrden(r: Record<string, unknown>): OrdenCompraReadRow {
    return {
      tenantId: String(r["tenant_id"]), id: String(r["id"]), codigo: String(r["codigo"] ?? ""), proveedorId: String(r["proveedor_id"]),
      solicitudId: (r["solicitud_id"] as string | null) ?? null, cotizacionId: (r["cotizacion_id"] as string | null) ?? null,
      moneda: String(r["moneda"] ?? ""), estado: String(r["estado"] ?? ""), total: Number(r["total"] ?? 0),
      datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
    };
  }

  async aplicarRecepcion(uow: UnitOfWork, row: RecepcionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_recepciones_read
           (tenant_id, id, orden_compra_id, consecutivo, completa_orden, con_novedades, estado_orden, datos, recibido_por, recibido_en, last_event_id, registrado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [row.tenantId, row.id, row.ordenCompraId, row.consecutivo, row.completaOrden, row.conNovedades, row.estadoOrden, JSON.stringify(row.datos), row.recibidoPor, row.recibidoEn, row.lastEventId, row.registradoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("recepcion read apply falló", err)); }
  }
  async recepcionesPorOrden(t: string, ordenCompraId: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.abs_recepciones_read WHERE tenant_id=$1 AND orden_compra_id=$2 ORDER BY consecutivo ASC LIMIT $3`, [t, ordenCompraId, limit]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), ordenCompraId: String(r["orden_compra_id"]), consecutivo: Number(r["consecutivo"] ?? 0),
        completaOrden: r["completa_orden"] === true, conNovedades: r["con_novedades"] === true, estadoOrden: (r["estado_orden"] as string | null) ?? null,
        datos: parseJson(r["datos"]), recibidoPor: String(r["recibido_por"]), recibidoEn: r["recibido_en"] as Date,
        lastEventId: String(r["last_event_id"] ?? ""), registradoAt: r["registrado_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("recepcion read list falló", err)); }
  }

  async aplicarHistorial(uow: UnitOfWork, row: HistorialReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_historial_read (tenant_id, id, entity_ref, hito, version, detalle, actor_id, ocurrido_at, last_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tenant_id, id) DO NOTHING`,
        [row.tenantId, row.id, row.entityRef, row.hito, row.version, JSON.stringify(row.detalle), row.actorId, row.ocurridoAt, row.lastEventId],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("historial read apply falló", err)); }
  }
  async historialPorEntidad(t: string, entityRef: string, limit = 500) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.abs_historial_read WHERE tenant_id=$1 AND entity_ref=$2 ORDER BY ocurrido_at ASC, id ASC LIMIT $3`, [t, entityRef, limit]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), id: String(r["id"]), entityRef: String(r["entity_ref"]), hito: String(r["hito"]),
        version: Number(r["version"] ?? 0), detalle: parseJson(r["detalle"]), actorId: String(r["actor_id"]),
        ocurridoAt: r["ocurrido_at"] as Date, lastEventId: String(r["last_event_id"] ?? ""),
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("historial read list falló", err)); }
  }

  async aplicarCosto(uow: UnitOfWork, row: CostoReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.abs_costos_read
           (tenant_id, articulo_id, moneda, metodo_valoracion, costo_unitario, cantidad_acumulada, datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, articulo_id, moneda) DO UPDATE SET
           metodo_valoracion=EXCLUDED.metodo_valoracion, costo_unitario=EXCLUDED.costo_unitario, cantidad_acumulada=EXCLUDED.cantidad_acumulada,
           datos=EXCLUDED.datos, version=EXCLUDED.version, last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
         WHERE deltaops.abs_costos_read.last_event_id <> EXCLUDED.last_event_id
           AND deltaops.abs_costos_read.version <= EXCLUDED.version`,
        [row.tenantId, row.articuloId, row.moneda, row.metodoValoracion, row.costoUnitario, row.cantidadAcumulada, JSON.stringify(row.datos), row.version, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) { return fail(KernelErrors.infrastructure("costo read apply falló", err)); }
  }
  async costosPorArticulo(t: string, articuloId: string) {
    try {
      const res = await withTenantRead(this.pool, t, (c) =>
        c.query(`SELECT * FROM deltaops.abs_costos_read WHERE tenant_id=$1 AND articulo_id=$2 ORDER BY moneda ASC`, [t, articuloId]),
      );
      return ok(res.rows.map((r) => ({
        tenantId: String(r["tenant_id"]), articuloId: String(r["articulo_id"]), moneda: String(r["moneda"]), metodoValoracion: String(r["metodo_valoracion"] ?? ""),
        costoUnitario: Number(r["costo_unitario"] ?? 0), cantidadAcumulada: Number(r["cantidad_acumulada"] ?? 0),
        datos: parseJson(r["datos"]), version: Number(r["version"] ?? 1), lastEventId: String(r["last_event_id"] ?? ""), actualizadoAt: r["actualizado_at"] as Date,
      })));
    } catch (err) { return fail(KernelErrors.infrastructure("costo read list falló", err)); }
  }

  async contar(t: string) {
    try {
      const tablas = [
        "abs_articulos_read", "abs_proveedores_read", "abs_solicitudes_read", "abs_cotizaciones_read",
        "abs_ordenes_compra_read", "abs_recepciones_read", "abs_historial_read", "abs_costos_read",
      ];
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
      for (const tabla of [
        "abs_articulos_read", "abs_proveedores_read", "abs_solicitudes_read", "abs_cotizaciones_read",
        "abs_ordenes_compra_read", "abs_recepciones_read", "abs_historial_read", "abs_costos_read",
      ]) {
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

const PREFIJO_EVENTO = "modulo.abastecimiento.";

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
