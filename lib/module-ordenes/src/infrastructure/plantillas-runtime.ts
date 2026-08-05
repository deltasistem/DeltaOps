/**
 * DGP-009.1 · Módulo Órdenes de Trabajo — Adaptador de PRUEBA del puerto de
 * Dynamic Forms sobre el motor REAL (`modulo.formularios`).
 *
 * Este adaptador NO es infraestructura de producción (esa llega en DGP-009.2):
 * consulta el Template/Response Runtime REAL montado en el harness de pruebas
 * para validar existencia/clase/versión (N/N-1) y anclar respuestas. Se apoya
 * en las consultas públicas del motor:
 *   - `modulo.formularios.plantilla.obtener`   (versión exacta)
 *   - `modulo.formularios.plantilla.compatibilidad` (versión activa)
 *   - `modulo.formularios.respuesta.obtener`   (anclaje de respuesta)
 *
 * La CLASE (formulario/checklist) se infiere de la definición: es "checklist"
 * cuando contiene algún nodo de tipo `checklist`; en otro caso "formulario".
 */
import { fail, KernelErrors, ok, type ExecutionContext, type KernelError, type Result } from "@workspace/kernel";
import type { PlatformRuntime } from "@workspace/platform";
import { recorrerNodos, type DefinicionFormulario } from "@workspace/dynamic-forms";
import type { ClasePlantilla, PlantillaVerificada, PlantillasPort } from "../domain/ports";

const SERVICIO_FORMS = "modulo.formularios";

function inferirClase(def: DefinicionFormulario): ClasePlantilla {
  for (const nodo of recorrerNodos(def.nodos)) {
    if (nodo.clase === "campo" && nodo.tipo === "checklist") return "checklist";
  }
  return "formulario";
}

/**
 * Construye un `PlantillasPort` respaldado por el motor real de Dynamic Forms.
 * `ctxDe` produce el ExecutionContext (con tenant) a partir del tenantId; suele
 * ser el propio contexto del comando en el harness de pruebas.
 */
export function plantillasDesdeRuntime(
  runtime: PlatformRuntime,
  ctxDe: (tenantId: string) => ExecutionContext,
): PlantillasPort {
  return {
    async verificar(tenantId: string, clase: ClasePlantilla, clave: string, version: number): Promise<Result<PlantillaVerificada, KernelError>> {
      const ctx = ctxDe(tenantId);
      const r = await runtime.kernel.queries.execute(ctx, `${SERVICIO_FORMS}.plantilla.obtener`, { clave, version });
      if (!r.ok) return r;
      const rec = r.value as { data?: Record<string, unknown> } | null;
      if (!rec?.data) return fail(KernelErrors.notFound("plantilla-formulario", `${clave}:${version}`));
      const contenido = rec.data["contenido"] as { definicion: DefinicionFormulario } | undefined;
      if (!contenido?.definicion) return fail(KernelErrors.validation(`La plantilla ${clave}:${version} no tiene definición`));
      const inferida = inferirClase(contenido.definicion);
      if (inferida !== clase) {
        return fail(KernelErrors.validation(`La plantilla ${clave}:${version} es de clase "${inferida}", se esperaba "${clase}"`));
      }
      const compat = await runtime.kernel.queries.execute(ctx, `${SERVICIO_FORMS}.plantilla.compatibilidad`, { clave, version });
      const versionActiva = compat.ok ? ((compat.value as { versionActiva?: number | null }).versionActiva ?? null) : null;
      return ok({ clave, version, clase: inferida, titulo: String(rec.data["titulo"] ?? clave), versionActiva });
    },

    async verificarRespuesta(tenantId: string, respuestaId: string, plantillaClave: string): Promise<Result<{ respuestaId: string; plantillaClave: string; plantillaVersion: number }, KernelError>> {
      const ctx = ctxDe(tenantId);
      const r = await runtime.kernel.queries.execute(ctx, `${SERVICIO_FORMS}.respuesta.obtener`, { id: respuestaId });
      if (!r.ok) return r;
      const rec = r.value as { data?: Record<string, unknown> } | null;
      if (!rec?.data) return fail(KernelErrors.notFound("respuesta-formulario", respuestaId));
      const claveResp = String(rec.data["plantillaClave"] ?? "");
      const versionResp = Number(rec.data["plantillaVersion"] ?? 0);
      if (claveResp !== plantillaClave) {
        return fail(KernelErrors.validation(`La respuesta ${respuestaId} pertenece a "${claveResp}", no a "${plantillaClave}"`));
      }
      return ok({ respuestaId, plantillaClave: claveResp, plantillaVersion: versionResp });
    },
  };
}
