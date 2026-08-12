/**
 * DGP-020.3 · Servicio de Catálogos de Mano de Obra sobre el Record Store.
 *
 * Las categorías se persisten en deltaops.platform_records (multitenant + RLS),
 * SIN tablas ad hoc (mismo mecanismo que module-activos). Semántica de catálogo
 * VACÍO ⇒ se admiten/exponen las categorías CANÓNICAS por defecto (§ decisión).
 */
import { fail, KernelErrors, ok, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import type { RecordStorePort } from "@workspace/platform";
import { MODULO } from "../module-name";
import {
  CATEGORIAS_CANONICAS,
  ESTADO_DESHABILITADO,
  ESTADO_HABILITADO,
  recordTypeCatalogo,
  type EntradaCatalogo,
  type NombreCatalogo,
  type OpcionCatalogo,
} from "../domain/catalogos";

export class CatalogoService {
  constructor(private readonly store: RecordStorePort) {}

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
    const data = { clave: entrada.clave, etiqueta: entrada.etiqueta, posicion: entrada.posicion ?? 0, padre: entrada.padre ?? null };
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

  async habilitar(uow: UnitOfWork, tenantId: string, catalogo: NombreCatalogo, clave: string, habilitado: boolean): Promise<Result<void, KernelError>> {
    const found = await this.buscar(tenantId, catalogo, clave);
    if (!found.ok) return found;
    if (!found.value) return fail(KernelErrors.notFound("catalogo", `${catalogo}:${clave}`));
    const r = await this.store.update(uow, tenantId, found.value.id, found.value.version, {
      status: habilitado ? ESTADO_HABILITADO : ESTADO_DESHABILITADO,
    });
    return r.ok ? ok(undefined) : r;
  }

  async buscar(tenantId: string, catalogo: NombreCatalogo, clave: string) {
    const list = await this.store.list(tenantId, { service: MODULO, recordType: recordTypeCatalogo(catalogo) });
    if (!list.ok) return list;
    return ok(list.value.find((r) => String(r.data["clave"]) === clave) ?? null);
  }

  async contarEntradas(tenantId: string, catalogo: NombreCatalogo): Promise<Result<number, KernelError>> {
    const list = await this.store.list(tenantId, { service: MODULO, recordType: recordTypeCatalogo(catalogo) });
    if (!list.ok) return list;
    return ok(list.value.length);
  }

  /**
   * Opciones habilitadas. Si el catálogo está VACÍO, expone las categorías
   * CANÓNICAS por defecto (§ decisión).
   */
  async opciones(tenantId: string, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>> {
    const all = await this.store.list(tenantId, { service: MODULO, recordType: recordTypeCatalogo(catalogo) });
    if (!all.ok) return all;
    if (all.value.length === 0 && catalogo === "categorias-mdo") {
      return ok(
        CATEGORIAS_CANONICAS.map((c) => ({ value: c.clave, label: c.etiqueta, posicion: c.posicion, padre: null })).sort(
          (a, b) => a.posicion - b.posicion || a.label.localeCompare(b.label),
        ),
      );
    }
    const opciones = all.value
      .filter((r) => r.status === ESTADO_HABILITADO)
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
   * Valida que una clave sea aceptable como categoría. Catálogo VACÍO ⇒ acepta
   * las claves CANÓNICAS. Catálogo NO VACÍO ⇒ debe existir y estar HABILITADA.
   */
  async validarReferencia(
    tenantId: string,
    catalogo: NombreCatalogo,
    clave: string | null | undefined,
    obligatorio: boolean,
  ): Promise<Result<void, KernelError>> {
    if (clave == null || clave === "") {
      return obligatorio ? fail(KernelErrors.validation(`El catálogo "${catalogo}" es obligatorio`)) : ok(undefined);
    }
    const all = await this.store.list(tenantId, { service: MODULO, recordType: recordTypeCatalogo(catalogo) });
    if (!all.ok) return all;
    if (all.value.length === 0 && catalogo === "categorias-mdo") {
      const esCanonica = CATEGORIAS_CANONICAS.some((c) => c.clave === clave);
      return esCanonica ? ok(undefined) : fail(KernelErrors.validation(`Categoría "${clave}" no es canónica ni está configurada`));
    }
    const found = all.value.find((r) => String(r.data["clave"]) === clave) ?? null;
    if (!found) return fail(KernelErrors.validation(`Valor "${clave}" inexistente en el catálogo "${catalogo}"`));
    if (found.status !== ESTADO_HABILITADO) return fail(KernelErrors.validation(`Valor "${clave}" deshabilitado en el catálogo "${catalogo}"`));
    return ok(undefined);
  }
}
