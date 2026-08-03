/**
 * DGP-007 · Dynamic Forms Engine — Guardarraíl de vocabulario neutro.
 *
 * El motor es 100% neutro respecto al negocio. Este módulo detecta vocabulario
 * de negocio prohibido en cualquier definición/plantilla importada, para
 * rechazar contenido que acople el motor a un dominio concreto. La comprobación
 * es estructural (recorre todas las cadenas del JSON) y case-insensitive.
 */

/**
 * Términos de negocio prohibidos por el mandato DGP-007. El motor debe
 * permanecer neutro: los ejemplos y las plantillas usan términos genéricos
 * (revisión, solicitud, expediente, proceso demo). Estos términos NO pueden
 * aparecer en definiciones/plantillas importadas ni en la API pública del
 * paquete (ver el test de "grep negativo" en __tests__).
 *
 * Criterio anti falsos-positivos: la detección exige **palabra completa**
 * (fronteras `\b...\b`), es case-insensitive y opera sobre texto con acentos
 * NORMALIZADOS (NFD, sin diacríticos). Por tanto:
 *   - `ot` (abreviatura de negocio) solo matchea el token aislado "ot"/"OT";
 *     NO matchea dentro de "robot", "piloto", "nota", etc. (no hay frontera de
 *     palabra ahí).
 *   - `equipo`/`empleado`/`proveedor`/`activo`/`orden`/`compra` matchean solo
 *     como palabra suelta, no como subcadena (p. ej. "activos" SÍ matchea por
 *     plural, pero "reactivo" NO — la frontera exige inicio de palabra).
 *   - Se normalizan acentos para que "revisión" no evada nada, pero también
 *     para no producir falsos negativos con variantes acentuadas de prohibidos.
 */
export const VOCABULARIO_PROHIBIDO: readonly string[] = [
  "activo",
  "inventario",
  "orden",
  "compra",
  "combustible",
  "sst",
  "empleado",
  "proveedor",
  "equipo",
  "ot",
];

/** Normaliza a minúsculas y elimina diacríticos (NFD) para comparación estable. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Construye la expresión regular de detección (palabra completa, sin acentos). */
function construirRegex(): RegExp {
  const alternativas = VOCABULARIO_PROHIBIDO.map((t) =>
    normalizar(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`\\b(${alternativas.join("|")})\\b`, "i");
}

const REGEX = construirRegex();

/** Recorre recursivamente un valor JSON acumulando las cadenas encontradas. */
function* cadenasDe(valor: unknown): Generator<string> {
  if (typeof valor === "string") {
    yield valor;
  } else if (Array.isArray(valor)) {
    for (const v of valor) yield* cadenasDe(v);
  } else if (valor && typeof valor === "object") {
    for (const [clave, v] of Object.entries(valor)) {
      yield clave;
      yield* cadenasDe(v);
    }
  }
}

/**
 * Devuelve la lista de términos prohibidos hallados en un objeto (vacía si es
 * neutro). Se usa para rechazar importaciones no neutras.
 */
export function detectarVocabularioProhibido(entrada: unknown): string[] {
  const hallados = new Set<string>();
  for (const cadena of cadenasDe(entrada)) {
    const m = normalizar(cadena).match(REGEX);
    if (m && m[1]) hallados.add(m[1].toLowerCase());
  }
  return [...hallados];
}

/** `true` si el objeto es neutro (sin vocabulario de negocio prohibido). */
export function esNeutro(entrada: unknown): boolean {
  return detectarVocabularioProhibido(entrada).length === 0;
}
