/**
 * DGP-007 · Dynamic Forms Engine — Resolutor de plantillas.
 *
 * Implementación por defecto de ResolutorPlantillas: resuelve la definición y
 * el contrato de validación de una plantilla a partir de las VERSIONES
 * INMUTABLES persistidas en el Record Store. Resuelve tanto una versión exacta
 * `(tenant, clave, version)` — para revalidar respuestas históricas N/N-1 —
 * como la versión ACTIVA `(tenant, clave)`.
 */
import type { RecordStorePort } from "@workspace/platform";
import type { DefinicionFormulario } from "./definicion";
import type { ContratoValidacion } from "./validacion";
import type { ContenidoPlantilla } from "./plantillas";
import { RECORD_PLANTILLA, SERVICIO, idIndice, idVersion } from "./plantillas";
import type { ResolutorPlantillas, ResueltoFormulario } from "./respuestas";

function esPlantilla(record: { service: string; recordType: string }): boolean {
  return record.service === SERVICIO && record.recordType === RECORD_PLANTILLA;
}

/**
 * Resolutor respaldado por el Record Store. Resuelve por id determinista
 * `<clave>:v<version>` (versión exacta) o vía el índice `idx:<clave>` (activa).
 * El store se inyecta perezosamente vía `conectar(store)` al montar el runtime.
 */
export class ResolutorPlantillaStore implements ResolutorPlantillas {
  private store?: RecordStorePort;

  /** Conecta el store (llamado por el motor al disponer de `deps`). */
  conectar(store: RecordStorePort): void {
    this.store = store;
  }

  constructor(store?: RecordStorePort) {
    this.store = store;
  }

  private extraer(data: Record<string, unknown>): ResueltoFormulario | { ok: false; mensaje: string } {
    const contenido = data["contenido"] as ContenidoPlantilla | undefined;
    if (!contenido?.definicion) return { ok: false, mensaje: "plantilla sin definición" };
    return { ok: true, definicion: contenido.definicion, contrato: contenido.contrato ?? {} };
  }

  /** Resuelve la definición/contrato de una versión EXACTA (histórica N/N-1). */
  async resolver(
    tenantId: string,
    plantillaClave: string,
    plantillaVersion: number,
  ): Promise<ResueltoFormulario | { ok: false; mensaje: string }> {
    if (!this.store) return { ok: false, mensaje: "resolutor sin store conectado" };
    const found = await this.store.findById(tenantId, idVersion(plantillaClave, plantillaVersion));
    if (!found.ok) return { ok: false, mensaje: found.error.message };
    if (!found.value) {
      return { ok: false, mensaje: `versión ${plantillaVersion} de la plantilla '${plantillaClave}' no encontrada` };
    }
    if (!esPlantilla(found.value)) return { ok: false, mensaje: "el registro no es una plantilla de formulario" };
    return this.extraer(found.value.data);
  }

  /** Resuelve la definición/contrato + versión de la plantilla ACTIVA por clave. */
  async resolverActiva(
    tenantId: string,
    plantillaClave: string,
  ): Promise<(ResueltoFormulario & { version: number }) | { ok: false; mensaje: string }> {
    if (!this.store) return { ok: false, mensaje: "resolutor sin store conectado" };
    const indice = await this.store.findById(tenantId, idIndice(plantillaClave));
    if (!indice.ok) return { ok: false, mensaje: indice.error.message };
    const activa = indice.value?.data["activa"] as number | null | undefined;
    if (indice.value == null || activa == null) {
      return { ok: false, mensaje: `la plantilla '${plantillaClave}' no tiene versión activa` };
    }
    const resuelto = await this.resolver(tenantId, plantillaClave, activa);
    if (!resuelto.ok) return resuelto;
    return { ...resuelto, version: activa };
  }
}

/**
 * Resolutor en memoria (útil para pruebas): resuelve por (clave, version) y
 * mantiene un índice de la versión activa por clave. Preserva versiones
 * históricas (una respuesta con versión N sigue resolviéndose tras publicar N+1).
 */
export class ResolutorPlantillaMemoria implements ResolutorPlantillas {
  private readonly versiones = new Map<string, { definicion: DefinicionFormulario; contrato: ContratoValidacion }>();
  private readonly activa = new Map<string, number>();

  /** Registra una versión inmutable; márcala activa (por defecto) o no. */
  registrar(
    clave: string,
    version: number,
    definicion: DefinicionFormulario,
    contrato: ContratoValidacion = {},
    activar = true,
  ): void {
    this.versiones.set(`${clave}:v${version}`, { definicion, contrato });
    if (activar) this.activa.set(clave, version);
  }

  async resolver(
    _tenantId: string,
    plantillaClave: string,
    plantillaVersion: number,
  ): Promise<ResueltoFormulario | { ok: false; mensaje: string }> {
    const entrada = this.versiones.get(`${plantillaClave}:v${plantillaVersion}`);
    if (!entrada) {
      return { ok: false, mensaje: `versión ${plantillaVersion} de la plantilla '${plantillaClave}' no registrada` };
    }
    return { ok: true, definicion: entrada.definicion, contrato: entrada.contrato };
  }

  async resolverActiva(
    tenantId: string,
    plantillaClave: string,
  ): Promise<(ResueltoFormulario & { version: number }) | { ok: false; mensaje: string }> {
    const version = this.activa.get(plantillaClave);
    if (version == null) return { ok: false, mensaje: `la plantilla '${plantillaClave}' no tiene versión activa` };
    const resuelto = await this.resolver(tenantId, plantillaClave, version);
    if (!resuelto.ok) return resuelto;
    return { ...resuelto, version };
  }
}
