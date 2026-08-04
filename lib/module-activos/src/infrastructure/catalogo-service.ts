/**
 * DGP-008.1 · Módulo Activos — Servicio de Catálogos sobre el Record Store.
 *
 * Los catálogos se persisten en deltaops.platform_records (multitenant + RLS),
 * SIN tablas ad hoc. Este servicio encapsula el alta, habilitación/
 * deshabilitación y validación de referencias del agregado contra valores
 * HABILITADOS del catálogo. Opera dentro del UoW del comando (escrituras) o
 * con lectura directa del store (validaciones).
 */
import { fail, KernelErrors, ok, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import type { RecordStorePort } from "@workspace/platform";
import { MODULO } from "../module-name";
import {
  ESTADO_DESHABILITADO,
  ESTADO_HABILITADO,
  recordTypeCatalogo,
  type EntradaCatalogo,
  type NombreCatalogo,
} from "../domain/catalogos";

export class CatalogoService {
  constructor(private readonly store: RecordStorePort) {}

  /** Alta idempotente de una entrada de catálogo (clave única por tenant). */
  async upsert(
    uow: UnitOfWork,
    tenantId: string,
    catalogo: NombreCatalogo,
    entrada: EntradaCatalogo,
    actorId: string,
  ): Promise<Result<void, KernelError>> {
    const recordType = recordTypeCatalogo(catalogo);
    const existente = await this.buscar(tenantId, catalogo, entrada.clave);
    if (!existente.ok) return existente;
    const data = {
      clave: entrada.clave,
      etiqueta: entrada.etiqueta,
      posicion: entrada.posicion ?? 0,
      padre: entrada.padre ?? null,
    };
    if (existente.value) {
      const r = await this.store.update(uow, tenantId, existente.value.id, existente.value.version, { data });
      return r.ok ? ok(undefined) : r;
    }
    const r = await this.store.insert(uow, {
      id: `${catalogo}:${entrada.clave}`,
      tenantId,
      service: MODULO,
      recordType,
      status: ESTADO_HABILITADO,
      data,
      createdBy: actorId,
    });
    return r.ok ? ok(undefined) : r;
  }

  async habilitar(
    uow: UnitOfWork,
    tenantId: string,
    catalogo: NombreCatalogo,
    clave: string,
    habilitado: boolean,
  ): Promise<Result<void, KernelError>> {
    const found = await this.buscar(tenantId, catalogo, clave);
    if (!found.ok) return found;
    if (!found.value) return fail(KernelErrors.notFound("catalogo", `${catalogo}:${clave}`));
    const r = await this.store.update(uow, tenantId, found.value.id, found.value.version, {
      status: habilitado ? ESTADO_HABILITADO : ESTADO_DESHABILITADO,
    });
    return r.ok ? ok(undefined) : r;
  }

  /** Busca una entrada por clave (habilitada o no). */
  async buscar(tenantId: string, catalogo: NombreCatalogo, clave: string) {
    const list = await this.store.list(tenantId, {
      service: MODULO,
      recordType: recordTypeCatalogo(catalogo),
    });
    if (!list.ok) return list;
    return ok(list.value.find((r) => String(r.data["clave"]) === clave) ?? null);
  }

  /** Nº de entradas configuradas (habilitadas o no) de un catálogo. */
  async contarEntradas(tenantId: string, catalogo: NombreCatalogo): Promise<Result<number, KernelError>> {
    const list = await this.store.list(tenantId, {
      service: MODULO,
      recordType: recordTypeCatalogo(catalogo),
    });
    if (!list.ok) return list;
    return ok(list.value.length);
  }

  async opciones(tenantId: string, catalogo: NombreCatalogo) {
    const list = await this.store.list(tenantId, {
      service: MODULO,
      recordType: recordTypeCatalogo(catalogo),
      status: ESTADO_HABILITADO,
    });
    if (!list.ok) return list;
    const opciones = list.value
      .map((r) => ({
        value: String(r.data["clave"] ?? ""),
        label: String(r.data["etiqueta"] ?? ""),
        posicion: Number(r.data["posicion"] ?? 0),
        padre: r.data["padre"] == null ? null : String(r.data["padre"]),
      }))
      .sort((a, b) => a.posicion - b.posicion || a.label.localeCompare(b.label));
    return ok(opciones);
  }

  /**
   * Valida que una clave esté HABILITADA en el catálogo. Si `obligatorio` es
   * false, un valor nulo/indefinido se acepta.
   */
  async validarReferencia(
    tenantId: string,
    catalogo: NombreCatalogo,
    clave: string | null | undefined,
    obligatorio: boolean,
  ): Promise<Result<void, KernelError>> {
    if (clave == null || clave === "") {
      return obligatorio
        ? fail(KernelErrors.validation(`El catálogo "${catalogo}" es obligatorio`))
        : ok(undefined);
    }
    const found = await this.buscar(tenantId, catalogo, clave);
    if (!found.ok) return found;
    if (!found.value) {
      return fail(KernelErrors.validation(`Valor "${clave}" inexistente en el catálogo "${catalogo}"`));
    }
    if (found.value.status !== ESTADO_HABILITADO) {
      return fail(KernelErrors.validation(`Valor "${clave}" deshabilitado en el catálogo "${catalogo}"`));
    }
    return ok(undefined);
  }
}
