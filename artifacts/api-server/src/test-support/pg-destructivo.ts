/**
 * DELTAOPS LITE-11 · §2/§3/§4 — soporte vitest para suites PostgreSQL DESTRUCTIVAS.
 *
 * Adaptador FINO sobre el guard centralizado de `@workspace/db` (fuente única de
 * verdad, sin copy-paste). Provee:
 *
 *   - `suiteDestructiva()` — gate FAIL-CLOSED del `describe` (usa el `describe`
 *     de vitest de este paquete). Reemplaza `DATABASE_URL ? describe : describe.skip`.
 *   - `poolDestructivo` — drop-in del `pool` de runtime (`.connect/.query/.end`)
 *     que jamás usa `DATABASE_URL`; resuelve el guard perezosamente al primer uso.
 *
 * Ver `lib/db/src/test-guard.ts` para las barreras B1–B4.
 */
import { describe } from "vitest";
// LITE-11 (code-review MENOR): el guard se importa por el SUBPATH sin efectos
// `@workspace/db/test-guard`, NO por el índice del paquete: el índice crea el
// `pool` de runtime y exige `DATABASE_URL` al cargar, lo que impediría siquiera
// cargar estas suites con sólo `DATABASE_TEST_URL`.
import {
  suiteDestructiva as gateDestructivo,
  crearPoolDestructivo,
  type ResultadoGuardTest,
} from "@workspace/db/test-guard";

type PoolResuelto = Extract<ResultadoGuardTest, { ok: true }>["pool"];

/** Gate FAIL-CLOSED del `describe` para suites destructivas de api-server. */
export function suiteDestructiva(): typeof describe {
  return gateDestructivo(
    describe as unknown as Parameters<typeof gateDestructivo>[0],
  ) as unknown as typeof describe;
}

/** Pool destructivo dedicado a DATABASE_TEST_URL (drop-in del pool de runtime). */
export const poolDestructivo = crearPoolDestructivo() as unknown as PoolResuelto;

/** Alias explícito para runtimes que reciben `{ pool }`. */
export const poolTest = poolDestructivo;
