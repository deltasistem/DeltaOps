/**
 * DGP-021.1 · Adaptadores FAKE en memoria (para pruebas de dominio/aplicación).
 *
 * Reproducen fielmente las invariantes de los adaptadores PG: idempotencia por
 * (tenant, opId) en hechos, unicidad de opId en recibos. NO simulan RLS (el
 * aislamiento se prueba con PG real).
 *
 * LECCIÓN R1 (DGP-021.0): el fake de costo exacto es string-only. El seeder
 * `set()` LANZA `TypeError` si recibe un `number` en cualquier importe: derivar
 * strings desde number (toFixed/Number/parseFloat) fue un hallazgo MAYOR. El
 * respaldo guarda EXACTAMENTE la cadena provista, sin transformarla.
 */
import { ok, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import type { HechoEconomico } from "../domain/hecho";
import type {
  CostoExactoArticulo,
  CostoExactoPort,
  FiltroHechos,
  HechoRepository,
  IdentidadPort,
  IdentidadResuelta,
  OrdenesPort,
  OrdenSnapshot,
  Recibo,
  ReciboClaim,
  ReciboPort,
} from "../domain/ports";
import type { EventLogPort } from "../module";

const key = (tenant: string, id: string) => `${tenant}::${id}`;

/** Falla cerrado si un importe monetario/cantidad llega como number (lección R1). */
function exigirCadena(campo: string, valor: unknown): string {
  if (typeof valor === "number") {
    throw new TypeError(`FakeCostoExactoPort: '${campo}' debe ser CADENA decimal, no number (perdería precisión)`);
  }
  if (typeof valor !== "string") {
    throw new TypeError(`FakeCostoExactoPort: '${campo}' debe ser CADENA decimal`);
  }
  return valor;
}

export class FakeHechoRepository implements HechoRepository {
  private readonly data = new Map<string, HechoEconomico>();
  /** Índice de idempotencia por (tenant, opId), como el índice único PG. */
  private readonly porOpId = new Map<string, string>();

  async buscar(tenantId: string, costoId: string) {
    const h = this.data.get(key(tenantId, costoId));
    return ok(h && h.tenantId === tenantId ? h : null);
  }
  async materializar(_uow: UnitOfWork, h: HechoEconomico): Promise<Result<{ insertado: boolean }, KernelError>> {
    const opKey = key(h.tenantId, h.opId);
    if (this.porOpId.has(opKey)) return ok({ insertado: false });
    this.porOpId.set(opKey, h.costoId);
    this.data.set(key(h.tenantId, h.costoId), h);
    return ok({ insertado: true });
  }
  async anular(_uow: UnitOfWork, h: HechoEconomico): Promise<Result<void, KernelError>> {
    this.data.set(key(h.tenantId, h.costoId), h);
    return ok(undefined);
  }
  async listar(tenantId: string, filtro: FiltroHechos) {
    let rows = [...this.data.values()].filter((h) => h.tenantId === tenantId);
    if (filtro.otId) rows = rows.filter((h) => h.otId === filtro.otId);
    if (filtro.activoId) rows = rows.filter((h) => h.activoId === filtro.activoId);
    if (filtro.movimientoId) rows = rows.filter((h) => h.movimientoId === filtro.movimientoId);
    if (filtro.articuloId) rows = rows.filter((h) => h.articuloId === filtro.articuloId);
    if (filtro.tipo) rows = rows.filter((h) => h.tipo === filtro.tipo);
    if (filtro.moneda) rows = rows.filter((h) => h.snapshot.moneda === filtro.moneda);
    if (filtro.estado) rows = rows.filter((h) => h.estado === filtro.estado);
    if (filtro.desde) rows = rows.filter((h) => h.snapshot.ocurridoAt >= filtro.desde!);
    if (filtro.hasta) rows = rows.filter((h) => h.snapshot.ocurridoAt < filtro.hasta!);
    rows.sort((a, b) => (a.snapshot.ocurridoAt < b.snapshot.ocurridoAt ? 1 : a.snapshot.ocurridoAt > b.snapshot.ocurridoAt ? -1 : a.costoId.localeCompare(b.costoId)));
    if (filtro.limit && filtro.limit > 0) rows = rows.slice(0, filtro.limit);
    return ok(rows);
  }
}

export class FakeReciboPort implements ReciboPort {
  private readonly data = new Map<string, { recibo: Recibo; sellado: boolean }>();
  private k(tenant: string, comando: string, opId: string) {
    return `${tenant}::${comando}::${opId}`;
  }
  async buscar(tenantId: string, comando: string, opId: string) {
    const e = this.data.get(this.k(tenantId, comando, opId));
    return ok(e && e.sellado ? e.recibo : null);
  }
  async reclamar(_uow: UnitOfWork, tenantId: string, comando: string, opId: string, _actorId: string): Promise<Result<ReciboClaim, KernelError>> {
    const k = this.k(tenantId, comando, opId);
    const e = this.data.get(k);
    if (!e) {
      this.data.set(k, { recibo: { opId, comando }, sellado: false });
      return ok({ duenio: true });
    }
    if (e.sellado) return ok({ duenio: false, resultado: e.recibo.resultado });
    return ok({ duenio: false, pendiente: true });
  }
  async sellar(_uow: UnitOfWork, tenantId: string, recibo: Recibo, _actorId: string) {
    this.data.set(this.k(tenantId, recibo.comando, recibo.opId), { recibo, sellado: true });
    return ok(undefined);
  }
}

export class FakeEventLog implements EventLogPort {
  readonly eventos: { tenantId: string; eventId: string; tipo: string; payload: Record<string, unknown> }[] = [];
  async append(_uow: UnitOfWork, e: { tenantId: string; eventId: string; tipo: string; payload: Record<string, unknown>; occurredAt: Date }) {
    if (this.eventos.some((x) => x.eventId === e.eventId)) return ok(undefined);
    this.eventos.push({ tenantId: e.tenantId, eventId: e.eventId, tipo: e.tipo, payload: e.payload });
    return ok(undefined);
  }
}

export class FakeIdentidadPort implements IdentidadPort {
  constructor(private readonly nombres: Map<string, string> = new Map()) {}
  registrar(tenantId: string, identityId: string, nombre: string) {
    this.nombres.set(key(tenantId, identityId), nombre);
  }
  async resolver(tenantId: string, identityId: string): Promise<Result<IdentidadResuelta | null, KernelError>> {
    const nombre = this.nombres.get(key(tenantId, identityId));
    return ok(nombre ? { identityId, nombre } : null);
  }
  async resolverVarios(tenantId: string, identityIds: readonly string[]) {
    const out: Record<string, string> = {};
    for (const id of identityIds) {
      const n = this.nombres.get(key(tenantId, id));
      if (n) out[id] = n;
    }
    return ok(out);
  }
}

export class FakeOrdenesPort implements OrdenesPort {
  private readonly data = new Map<string, { tenantId: string; ot: OrdenSnapshot }>();
  set(tenantId: string, ot: OrdenSnapshot) {
    this.data.set(key(tenantId, ot.ordenId), { tenantId, ot });
  }
  async obtener(tenantId: string, ordenId: string) {
    const e = this.data.get(key(tenantId, ordenId));
    return ok(e && e.tenantId === tenantId ? e.ot : null);
  }
}

export class FakeCostoExactoPort implements CostoExactoPort {
  private readonly data = new Map<string, CostoExactoArticulo[]>();
  /**
   * Siembra el costo exacto de un artículo (string-only). LANZA si algún importe
   * llega como number. Guarda la cadena tal cual (sin normalizar/toFixed).
   */
  set(tenantId: string, articuloId: string, costos: readonly CostoExactoArticulo[]) {
    const limpios = costos.map((c) => ({
      articuloId: c.articuloId,
      moneda: c.moneda,
      metodoValoracion: c.metodoValoracion,
      costoUnitario: exigirCadena("costoUnitario", c.costoUnitario),
      cantidadAcumulada: exigirCadena("cantidadAcumulada", c.cantidadAcumulada),
      actualizadoAt: c.actualizadoAt,
    }));
    this.data.set(key(tenantId, articuloId), limpios);
  }
  async costosDeArticulo(tenantId: string, articuloId: string): Promise<Result<CostoExactoArticulo[], KernelError>> {
    return ok(this.data.get(key(tenantId, articuloId)) ?? []);
  }
}
