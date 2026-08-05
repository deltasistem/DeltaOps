/**
 * DGP-010 · Gestión de dependencias OT↔OT (lógica PURA, testeable).
 *
 * Clasifica las relaciones de categoría `orden` que ya expone la API (DGP-009.2,
 * `GET /:id/dependencias`) en tres grupos operativos —bloqueantes, dependientes
 * y relacionadas—, deriva el impacto («qué bloquea a qué»), una secuencia de
 * ejecución sugerida y las alertas (p.ej. «OT lista pero bloqueada»). No abre
 * API nueva: interpreta el `tipo` de cada `RelacionOrden`.
 */
import type { RelacionOrden, OrdenRow } from "../ordenes/tipos";

/** Tipos que indican que ESTA orden está bloqueada / debe esperar a la destino. */
const BLOQUEANTES = new Set(["bloqueada-por", "bloqueada_por", "depende-de", "depende_de", "sigue-a", "sigue_a", "sucede-a", "posterior-a"]);
/** Tipos que indican que ESTA orden bloquea / precede a la destino. */
const DEPENDIENTES = new Set(["bloquea", "precede", "precede-a", "requerida-por", "anterior-a"]);

export type ClaseDependencia = "bloqueante" | "dependiente" | "relacionada";

export interface DependenciaClasificada {
  readonly relacion: RelacionOrden;
  readonly clase: ClaseDependencia;
  /** Descripción legible del vínculo, orientada al operador. */
  readonly descripcion: string;
}

export interface AnalisisDependencias {
  readonly bloqueantes: DependenciaClasificada[];
  readonly dependientes: DependenciaClasificada[];
  readonly relacionadas: DependenciaClasificada[];
  /** ¿La orden está bloqueada por al menos una dependencia? */
  readonly bloqueada: boolean;
  /** ¿La orden está lista para ejecutar (estado) PERO bloqueada por dependencia? */
  readonly listaPeroBloqueada: boolean;
  /** IDs destino que esta orden bloquea (impacto aguas abajo). */
  readonly impacto: readonly string[];
}

const ESTADOS_LISTA = new Set(["ABIERTA", "PLANIFICADA", "PROGRAMADA", "ASIGNADA", "EN_EJECUCION"]);
const ESTADOS_CERRADOS = new Set(["CERRADA", "CANCELADA"]);

function clasificar(tipo: string): ClaseDependencia {
  const t = (tipo ?? "").toLowerCase();
  if (BLOQUEANTES.has(t)) return "bloqueante";
  if (DEPENDIENTES.has(t)) return "dependiente";
  return "relacionada";
}

function etiquetaDestino(r: RelacionOrden): string {
  return r.destinoCodigo || r.destinoNombre || r.destinoId;
}

/**
 * Analiza las dependencias de una orden.
 * @param dependencias relaciones de categoría `orden` de la OT.
 * @param orden orden analizada (para el estado); opcional.
 */
export function analizarDependencias(
  dependencias: readonly RelacionOrden[] | null | undefined,
  orden?: Pick<OrdenRow, "estado"> | null,
): AnalisisDependencias {
  const bloqueantes: DependenciaClasificada[] = [];
  const dependientes: DependenciaClasificada[] = [];
  const relacionadas: DependenciaClasificada[] = [];

  for (const relacion of dependencias ?? []) {
    const clase = clasificar(relacion.tipo);
    const destino = etiquetaDestino(relacion);
    if (clase === "bloqueante") {
      bloqueantes.push({ relacion, clase, descripcion: `Debe completarse primero: ${destino}` });
    } else if (clase === "dependiente") {
      dependientes.push({ relacion, clase, descripcion: `Bloquea a: ${destino}` });
    } else {
      relacionadas.push({ relacion, clase, descripcion: `Relacionada con: ${destino}` });
    }
  }

  const bloqueada = bloqueantes.length > 0;
  const estado = orden?.estado ?? "";
  const listaPeroBloqueada = bloqueada && ESTADOS_LISTA.has(estado) && !ESTADOS_CERRADOS.has(estado);
  const impacto = dependientes.map((d) => d.relacion.destinoId);

  return { bloqueantes, dependientes, relacionadas, bloqueada, listaPeroBloqueada, impacto };
}

export interface PasoSecuencia {
  readonly etiqueta: string;
  readonly ordenId: string;
  readonly rol: "predecesora" | "actual" | "sucesora";
}

/**
 * Secuencia de ejecución sugerida: predecesoras (bloqueantes) → orden actual →
 * sucesoras (dependientes). Pura, sin efectos.
 */
export function secuenciaEjecucion(
  analisis: AnalisisDependencias,
  actual: { id: string; codigo: string },
): PasoSecuencia[] {
  const pre = analisis.bloqueantes.map<PasoSecuencia>((d) => ({
    etiqueta: etiquetaDestino(d.relacion), ordenId: d.relacion.destinoId, rol: "predecesora",
  }));
  const post = analisis.dependientes.map<PasoSecuencia>((d) => ({
    etiqueta: etiquetaDestino(d.relacion), ordenId: d.relacion.destinoId, rol: "sucesora",
  }));
  return [...pre, { etiqueta: actual.codigo, ordenId: actual.id, rol: "actual" }, ...post];
}
