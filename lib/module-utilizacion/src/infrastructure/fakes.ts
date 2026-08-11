/**
 * DGP-019.1 · Módulo de Utilización — Adaptadores FAKE en memoria.
 *
 * Determinismo total para pruebas y para el ensamblaje offline (sin `pool`).
 * Misma semántica que los adaptadores PG.
 */
import { fail, KernelErrors, ok, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import { CANONICOS_POR_CATALOGO, ESTADO_DESHABILITADO, ESTADO_HABILITADO, type EntradaCatalogo, type NombreCatalogo } from "../domain/catalogos";
import type {
  CatalogoPort,
  EventLogStore,
  EventoDurable,
  LecturaFiltro,
  LecturaRepository,
  OpcionCatalogo,
  Recibo,
  ReciboClaim,
  ReciboPort,
  TanqueoFiltro,
  TanqueoRepository,
  TenantId,
} from "../domain/ports";
import type { Lectura, Tanqueo, TipoMedidor } from "../domain/value-objects";

const t0 = (s: string) => new Date(s).getTime();

export class FakeLecturaRepository implements LecturaRepository {
  private readonly rows = new Map<string, Lectura>();
  private k(t: string, id: string) { return `${t}::${id}`; }
  async insert(_uow: UnitOfWork, l: Lectura) {
    const k = this.k(l.tenantId, l.id);
    if (this.rows.has(k)) return fail(KernelErrors.conflict(`lectura ${l.id} ya existe`));
    this.rows.set(k, l);
    return ok(l);
  }
  async replace(_uow: UnitOfWork, l: Lectura) {
    const k = this.k(l.tenantId, l.id);
    if (!this.rows.has(k)) return fail(KernelErrors.notFound("lectura", l.id));
    this.rows.set(k, l);
    return ok(l);
  }
  async findById(t: TenantId, id: string) { return ok(this.rows.get(this.k(t, id)) ?? null); }
  async ultimaValida(t: TenantId, activoId: string, tipoMedidor: TipoMedidor) {
    const rows = [...this.rows.values()]
      .filter((r) => r.tenantId === t && r.activoId === activoId && r.tipoMedidor === tipoMedidor && r.estado === "vigente" && !r.inconsistente)
      .sort((a, b) => t0(b.fechaHora) - t0(a.fechaHora));
    return ok(rows[0] ?? null);
  }
  async list(t: TenantId, f: LecturaFiltro) {
    let rows = [...this.rows.values()].filter((r) => r.tenantId === t);
    if (f.activoId) rows = rows.filter((r) => r.activoId === f.activoId);
    if (f.tipoMedidor) rows = rows.filter((r) => r.tipoMedidor === f.tipoMedidor);
    if (f.desde) rows = rows.filter((r) => t0(r.fechaHora) >= t0(f.desde!));
    if (f.hasta) rows = rows.filter((r) => t0(r.fechaHora) <= t0(f.hasta!));
    rows.sort((a, b) => t0(b.fechaHora) - t0(a.fechaHora) || (a.id < b.id ? 1 : -1));
    const offset = f.offset ?? 0;
    return ok(rows.slice(offset, offset + (f.limit ?? 100)));
  }
}

export class FakeTanqueoRepository implements TanqueoRepository {
  private readonly rows = new Map<string, Tanqueo>();
  private k(t: string, id: string) { return `${t}::${id}`; }
  async insert(_uow: UnitOfWork, tq: Tanqueo) {
    const k = this.k(tq.tenantId, tq.id);
    if (this.rows.has(k)) return fail(KernelErrors.conflict(`tanqueo ${tq.id} ya existe`));
    this.rows.set(k, tq);
    return ok(tq);
  }
  async replace(_uow: UnitOfWork, tq: Tanqueo) {
    const k = this.k(tq.tenantId, tq.id);
    if (!this.rows.has(k)) return fail(KernelErrors.notFound("tanqueo", tq.id));
    this.rows.set(k, tq);
    return ok(tq);
  }
  async findById(t: TenantId, id: string) { return ok(this.rows.get(this.k(t, id)) ?? null); }
  async list(t: TenantId, f: TanqueoFiltro) {
    let rows = [...this.rows.values()].filter((r) => r.tenantId === t);
    if (f.activoId) rows = rows.filter((r) => r.activoId === f.activoId);
    if (f.desde) rows = rows.filter((r) => t0(r.fechaHora) >= t0(f.desde!));
    if (f.hasta) rows = rows.filter((r) => t0(r.fechaHora) <= t0(f.hasta!));
    rows.sort((a, b) => t0(b.fechaHora) - t0(a.fechaHora) || (a.id < b.id ? 1 : -1));
    const offset = f.offset ?? 0;
    return ok(rows.slice(offset, offset + (f.limit ?? 100)));
  }
}

export class FakeCatalogoStore implements CatalogoPort {
  private readonly rows = new Map<string, { clave: string; etiqueta: string; posicion: number; padre: string | null; estado: string }>();
  private k(t: string, catalogo: string, clave: string) { return `${t}::${catalogo}::${clave}`; }
  async upsert(_uow: UnitOfWork, t: TenantId, catalogo: NombreCatalogo, e: EntradaCatalogo, _actor: string) {
    this.rows.set(this.k(t, catalogo, e.clave), { clave: e.clave, etiqueta: e.etiqueta, posicion: e.posicion ?? 0, padre: e.padre ?? null, estado: ESTADO_HABILITADO });
    return ok(undefined);
  }
  async habilitar(_uow: UnitOfWork, t: TenantId, catalogo: NombreCatalogo, clave: string, habilitado: boolean) {
    const cur = this.rows.get(this.k(t, catalogo, clave));
    if (!cur) return fail(KernelErrors.notFound("catalogo-entrada", `${catalogo}/${clave}`));
    this.rows.set(this.k(t, catalogo, clave), { ...cur, estado: habilitado ? ESTADO_HABILITADO : ESTADO_DESHABILITADO });
    return ok(undefined);
  }
  async opciones(t: TenantId, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>> {
    const prefix = `${t}::${catalogo}::`;
    const out: OpcionCatalogo[] = [];
    for (const [k, v] of this.rows) if (k.startsWith(prefix)) out.push({ ...v });
    out.sort((a, b) => a.posicion - b.posicion || (a.clave < b.clave ? -1 : 1));
    return ok(out);
  }
  async contarEntradas(t: TenantId, catalogo: NombreCatalogo) {
    const prefix = `${t}::${catalogo}::`;
    let n = 0;
    for (const k of this.rows.keys()) if (k.startsWith(prefix)) n++;
    return ok(n);
  }
  async validarReferencia(t: TenantId, catalogo: NombreCatalogo, clave: string | null | undefined, obligatorio: boolean) {
    if (clave == null || clave === "") return obligatorio ? fail(KernelErrors.validation(`El valor del catálogo "${catalogo}" es obligatorio`)) : ok(undefined);
    const total = await this.contarEntradas(t, catalogo);
    if (!total.ok) return total;
    if (total.value === 0) {
      const canonicos = CANONICOS_POR_CATALOGO[catalogo];
      if (!canonicos || canonicos.includes(clave)) return ok(undefined);
      return fail(KernelErrors.validation(`"${clave}" no es un valor canónico del catálogo "${catalogo}"`));
    }
    const ops = await this.opciones(t, catalogo);
    if (!ops.ok) return ops;
    const habil = ops.value.find((o) => o.clave === clave && o.estado === ESTADO_HABILITADO);
    if (!habil) return fail(KernelErrors.validation(`"${clave}" no existe o está deshabilitado en el catálogo "${catalogo}"`));
    return ok(undefined);
  }
}

export class FakeRecibos implements ReciboPort {
  private readonly rows = new Map<string, { recibo: Recibo; estado: "pendiente" | "sellado" }>();
  private k(t: string, comando: string, opId: string) { return `${t}::${comando}::${opId}`; }
  async buscar(t: TenantId, comando: string, opId: string) {
    const r = this.rows.get(this.k(t, comando, opId));
    return ok(r && r.estado === "sellado" ? r.recibo : null);
  }
  async reclamar(_uow: UnitOfWork, t: TenantId, comando: string, opId: string, _actor: string): Promise<Result<ReciboClaim, KernelError>> {
    const k = this.k(t, comando, opId);
    const existente = this.rows.get(k);
    if (!existente) {
      this.rows.set(k, { recibo: { opId, comando, resultado: {} }, estado: "pendiente" });
      return ok({ duenio: true });
    }
    if (existente.estado === "sellado") return ok({ duenio: false, resultado: existente.recibo.resultado });
    return ok({ duenio: false, pendiente: true });
  }
  async sellar(_uow: UnitOfWork, t: TenantId, recibo: Recibo, _actor: string) {
    const k = this.k(t, recibo.comando, recibo.opId);
    this.rows.set(k, { recibo, estado: "sellado" });
    return ok(undefined);
  }
}

export class FakeEventLogStore implements EventLogStore {
  private readonly rows: EventoDurable[] = [];
  async append(_uow: UnitOfWork, e: EventoDurable) {
    if (!this.rows.some((r) => r.tenantId === e.tenantId && r.eventId === e.eventId)) this.rows.push(e);
    return ok(undefined);
  }
  async listPorTenant(t: TenantId) {
    return ok(this.rows.filter((r) => r.tenantId === t).slice().sort((a, b) => t0(a.occurredAt) - t0(b.occurredAt) || (a.eventId < b.eventId ? -1 : 1)));
  }
}

export interface FakeAdapters {
  readonly lecturas: FakeLecturaRepository;
  readonly tanqueos: FakeTanqueoRepository;
  readonly catalogos: FakeCatalogoStore;
  readonly recibos: FakeRecibos;
  readonly eventLog: FakeEventLogStore;
}

export function crearFakeAdapters(): FakeAdapters {
  return {
    lecturas: new FakeLecturaRepository(),
    tanqueos: new FakeTanqueoRepository(),
    catalogos: new FakeCatalogoStore(),
    recibos: new FakeRecibos(),
    eventLog: new FakeEventLogStore(),
  };
}
