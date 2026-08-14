/**
 * DGP-020.3 · Adaptadores FAKE en memoria (para pruebas de dominio/aplicación).
 *
 * Reproducen fielmente las invariantes de los adaptadores PG: idempotencia por
 * (tenant, sesionId) en valoraciones, unicidad de opId en recibos, unicidad de
 * recurso por identityId. NO simulan RLS (el aislamiento se prueba con PG real).
 */
import { ok, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import type { RecursoHumano, EstadoRecurso } from "../domain/recurso";
import type { Tarifa } from "../domain/tarifa";
import type { EstadoValoracion, Valoracion } from "../domain/valoracion";
import type {
  DuracionSesion,
  IdentidadPort,
  IdentidadResuelta,
  OrdenesSesionPort,
  Recibo,
  ReciboClaim,
  ReciboPort,
  RecursoRepository,
  TarifaRepository,
  ValoracionRepository,
} from "../domain/ports";
import type { EventLogPort } from "../module";

const key = (tenant: string, id: string) => `${tenant}::${id}`;

export class FakeRecursoRepository implements RecursoRepository {
  private readonly data = new Map<string, RecursoHumano>();
  async buscar(tenantId: string, identityId: string) {
    return ok(this.data.get(key(tenantId, identityId)) ?? null);
  }
  async upsert(_uow: UnitOfWork, recurso: RecursoHumano) {
    this.data.set(key(recurso.tenantId, recurso.identityId), recurso);
    return ok(undefined);
  }
  async listar(tenantId: string, filtro?: { estado?: EstadoRecurso }) {
    const rows = [...this.data.values()].filter((r) => r.tenantId === tenantId && (!filtro?.estado || r.estado === filtro.estado));
    return ok(rows);
  }
}

export class FakeTarifaRepository implements TarifaRepository {
  private readonly data = new Map<string, Tarifa>();
  async buscarPorId(tenantId: string, id: string) {
    const t = this.data.get(key(tenantId, id));
    return ok(t && t.tenantId === tenantId ? t : null);
  }
  async listarPorSujeto(tenantId: string, sujetoTipo: string, sujetoId: string) {
    const rows = [...this.data.values()]
      .filter((t) => t.tenantId === tenantId && t.sujetoTipo === sujetoTipo && t.sujetoId === sujetoId)
      .sort((a, b) => a.vigenciaDesde.getTime() - b.vigenciaDesde.getTime());
    return ok(rows);
  }
  async insertar(_uow: UnitOfWork, tarifa: Tarifa) {
    this.data.set(key(tarifa.tenantId, tarifa.id), tarifa);
    return ok(undefined);
  }
  async actualizar(_uow: UnitOfWork, tarifa: Tarifa) {
    this.data.set(key(tarifa.tenantId, tarifa.id), tarifa);
    return ok(undefined);
  }
}

export class FakeValoracionRepository implements ValoracionRepository {
  private readonly data = new Map<string, Valoracion>();
  async buscar(tenantId: string, sesionId: string) {
    return ok(this.data.get(key(tenantId, sesionId)) ?? null);
  }
  async registrar(_uow: UnitOfWork, v: Valoracion): Promise<Result<{ insertada: boolean }, KernelError>> {
    const k = key(v.tenantId, v.sesionId);
    if (this.data.has(k)) return ok({ insertada: false });
    this.data.set(k, v);
    return ok({ insertada: true });
  }
  async reemplazar(_uow: UnitOfWork, v: Valoracion) {
    this.data.set(key(v.tenantId, v.sesionId), v);
    return ok(undefined);
  }
  async listarPorOrden(tenantId: string, ordenId: string) {
    return ok([...this.data.values()].filter((v) => v.tenantId === tenantId && v.ordenId === ordenId));
  }
  async listarPorActivo(tenantId: string, activoId: string) {
    return ok([...this.data.values()].filter((v) => v.tenantId === tenantId && v.activoId === activoId));
  }
  async listarPorIdentidad(tenantId: string, identityId: string) {
    return ok([...this.data.values()].filter((v) => v.tenantId === tenantId && v.identityId === identityId));
  }
  async listarPorEstado(tenantId: string, estados: readonly EstadoValoracion[]) {
    return ok([...this.data.values()].filter((v) => v.tenantId === tenantId && estados.includes(v.estado)));
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

export class FakeOrdenesSesionPort implements OrdenesSesionPort {
  private readonly data = new Map<string, { tenantId: string; sesion: DuracionSesion }>();
  set(tenantId: string, s: DuracionSesion) {
    this.data.set(key(tenantId, s.sesionId), { tenantId, sesion: s });
  }
  async duracionesDeSesion(tenantId: string, sesionId: string) {
    return ok(this.data.get(key(tenantId, sesionId))?.sesion ?? null);
  }
  async duracionesPorOrden(tenantId: string, ordenId: string) {
    return ok([...this.data.values()].filter((e) => e.tenantId === tenantId && e.sesion.ordenId === ordenId).map((e) => e.sesion));
  }
  async duracionesPorActivo(tenantId: string, activoId: string) {
    return ok([...this.data.values()].filter((e) => e.tenantId === tenantId && e.sesion.activoId === activoId).map((e) => e.sesion));
  }
}
