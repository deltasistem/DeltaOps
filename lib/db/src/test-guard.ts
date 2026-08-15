/**
 * DELTAOPS LITE-11 · §2/§3/§4 — GUARD DE AISLAMIENTO DE BASE DE DATOS DE TEST.
 *
 * CONTEXTO (incidente LITE-10): las suites de integración PostgreSQL, al gatear
 * únicamente con la presencia de `DATABASE_URL` e importar el `pool` de runtime
 * (`@workspace/db`), se ejecutaron contra la BD de DESARROLLO compartida y
 * borraron el tenant demo con los datos históricos reales importados en LITE-09.
 *
 * Este módulo centraliza, en un ÚNICO lugar reutilizable por todos los setups PG,
 * una protección FAIL-CLOSED de varias barreras. Ninguna suite destructiva debe
 * volver a poder tocar una BD que no sea INEQUÍVOCAMENTE de test.
 *
 * BARRERAS (todas deben cumplirse; si no, se ABORTA o se OMITE, jamás se cae a
 * `DATABASE_URL`):
 *
 *   B1 — PRODUCCIÓN NUNCA ES DESTINO DE TEST (§4). Si `NODE_ENV=production`
 *        (o la conexión se identifica como producción) se lanza SIEMPRE, incluso
 *        aunque hubiese `DATABASE_TEST_URL`. Es un error duro, no un skip.
 *
 *   B2 — `DATABASE_TEST_URL` OBLIGATORIA (§3). Las suites destructivas SOLO se
 *        conectan a la cadena explícita de test. Nunca a `DATABASE_URL`. Si falta,
 *        la suite se OMITE limpiamente con un mensaje claro (no falla el runner en
 *        entornos sin BD de test, p.ej. CI unitario o el entorno de desarrollo).
 *
 *   B3 — NO REUTILIZAR LA BD DE RUNTIME. Si `DATABASE_TEST_URL` coincide con
 *        `DATABASE_URL` (misma cadena o misma base host/puerto/nombre), se ABORTA:
 *        sería la BD de desarrollo disfrazada de test.
 *
 *   B4 — MARCADOR EXPLÍCITO DE BD DE TEST (verificación EN VIVO). Antes de
 *        permitir cualquier operación destructiva se consulta la propia base y
 *        debe cumplirse AL MENOS UNO (en orden de preferencia):
 *          (a) un ajuste de servidor `deltaops.is_test_database = 'true'`
 *              (`ALTER DATABASE <db> SET deltaops.is_test_database = 'true'`)
 *              — vía PREFERENTE, inequívoca y explícita; o
 *          (b) el nombre de la base pertenece a la allowlist EXPLÍCITA
 *              `DATABASE_TEST_ALLOWED_NAMES` (CSV de nombres exactos); o
 *          (c) el nombre casa el patrón ESTRICTO por defecto: «test»/«tests»
 *              como TOKEN delimitado por inicio/fin o por `-`/`_`
 *              (`/(^|[-_])tests?([-_]|$)/i`). Acepta p.ej. `test`,
 *              `deltaops_test`, `deltaops-test`; RECHAZA subcadenas como
 *              `latest`, `contest`, `attestation` (LITE-11 MENOR-2: se eliminó
 *              el fallback amplio `/test/i` que casaba cualquier subcadena).
 *        Si ninguno se cumple, se ABORTA sin ejecutar nada destructivo.
 *
 * NINGÚN secreto se registra ni se incluye en los mensajes de error: solo se
 * reportan el NOMBRE de la base y el motivo.
 */
import pg from "pg";

const { Pool } = pg;

export type ResultadoGuardTest =
  | { ok: true; pool: pg.Pool; dbName: string; motivo: string }
  | { ok: false; abortar: true; motivo: string }
  | { ok: false; abortar: false; motivo: string };

/** Extrae el nombre de base de una cadena de conexión, sin exponer credenciales. */
function nombreDeBase(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return decodeURIComponent(u.pathname.replace(/^\//, "")) || "(desconocida)";
  } catch {
    return "(cadena no parseable)";
  }
}

/** Identidad host+puerto+base para comparar dos cadenas sin credenciales. */
function identidadDeBase(connectionString: string): string | null {
  try {
    const u = new URL(connectionString);
    const base = decodeURIComponent(u.pathname.replace(/^\//, ""));
    return `${u.hostname}:${u.port || "5432"}/${base}`.toLowerCase();
  } catch {
    return null;
  }
}

function esProduccion(): boolean {
  const env = (process.env.NODE_ENV ?? "").toLowerCase();
  return env === "production" || env === "prod";
}

/**
 * Patrón ESTRICTO por defecto (LITE-11 MENOR-2). La palabra «test»/«tests» debe
 * aparecer como TOKEN delimitado por inicio/fin o por `-`/`_`, no como
 * subcadena arbitraria. Así se aceptan `test`, `test_deltaops`, `deltaops_test`,
 * `deltaops-test`, `deltaops_test_ci`; y se RECHAZAN `latest`, `contest`,
 * `attestation`, `greatest`, etc. Se eliminó el fallback amplio `/test/i` que
 * casaba cualquier subcadena.
 */
const PATRON_NOMBRE_TEST = /(^|[-_])tests?([-_]|$)/i;

/**
 * Predicado PURO del patrón estricto de nombre de BD de test (B4.c). Exportado
 * para pruebas unitarias sin conexión. No consulta el entorno ni la base.
 */
export function nombreCasaPatronTest(dbName: string): boolean {
  return PATRON_NOMBRE_TEST.test(dbName);
}

function nombreEnAllowlist(dbName: string): boolean {
  const csv = process.env.DATABASE_TEST_ALLOWED_NAMES;
  if (csv) {
    const permitidos = csv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (permitidos.includes(dbName.toLowerCase())) return true;
  }
  // Patrón por defecto ESTRICTO: la base debe declarar «test» como token, no
  // como subcadena arbitraria. El marcador en vivo deltaops.is_test_database o
  // la allowlist explícita siguen siendo la vía preferente.
  return nombreCasaPatronTest(dbName);
}

/**
 * Verifica EN VIVO, contra la base ya conectada, que sea inequívocamente de test.
 * Consulta el marcador de servidor y, en su defecto, la allowlist/patrón de nombre.
 */
async function verificarMarcadorEnVivo(
  p: pg.Pool,
  dbName: string,
): Promise<{ ok: boolean; motivo: string }> {
  const c = await p.connect();
  try {
    const marcador = await c.query<{ v: string | null }>(
      "SELECT current_setting('deltaops.is_test_database', true) AS v",
    );
    const flag = (marcador.rows[0]?.v ?? "").toLowerCase();
    if (flag === "true" || flag === "on" || flag === "1") {
      return {
        ok: true,
        motivo: `marcador de servidor deltaops.is_test_database=true en «${dbName}»`,
      };
    }
    if (nombreEnAllowlist(dbName)) {
      return { ok: true, motivo: `nombre de base «${dbName}» en allowlist/patrón de test` };
    }
    return {
      ok: false,
      motivo:
        `la base «${dbName}» NO está marcada como de test: falta el ajuste ` +
        `deltaops.is_test_database=true y su nombre no está en ` +
        `DATABASE_TEST_ALLOWED_NAMES ni casa el patrón de test`,
    };
  } finally {
    c.release();
  }
}

/**
 * Punto de entrada único para los setups de suites DESTRUCTIVAS.
 *
 * Devuelve un `pg.Pool` DEDICADO a `DATABASE_TEST_URL` (nunca el pool de runtime)
 * si — y solo si — se superan todas las barreras. En caso contrario:
 *   - lanza (fail-closed) cuando el destino es peligroso (producción / BD de
 *     runtime / marcador ausente);
 *   - devuelve `{ ok:false, abortar:false }` (para OMITIR la suite) cuando
 *     simplemente no hay `DATABASE_TEST_URL` en el entorno.
 */
export async function resolverPoolDeTest(): Promise<ResultadoGuardTest> {
  // B1 — Producción NUNCA es destino de test.
  if (esProduccion()) {
    throw new Error(
      "[test-guard] ABORTADO (fail-closed): NODE_ENV es producción. " +
        "Las suites destructivas jamás deben ejecutarse en producción.",
    );
  }

  const testUrl = process.env.DATABASE_TEST_URL;

  // B2 — DATABASE_TEST_URL obligatoria; sin ella se OMITE (nunca fallback a DATABASE_URL).
  if (!testUrl) {
    return {
      ok: false,
      abortar: false,
      motivo:
        "DATABASE_TEST_URL ausente: la suite destructiva se OMITE. " +
        "Nunca se usa DATABASE_URL como destino de tests destructivos.",
    };
  }

  const dbName = nombreDeBase(testUrl);

  // B3 — DATABASE_TEST_URL no puede ser la BD de runtime/desarrollo.
  const idTest = identidadDeBase(testUrl);
  const idRuntime = process.env.DATABASE_URL
    ? identidadDeBase(process.env.DATABASE_URL)
    : null;
  if (idTest && idRuntime && idTest === idRuntime) {
    throw new Error(
      "[test-guard] ABORTADO (fail-closed): DATABASE_TEST_URL apunta a la MISMA " +
        `base que DATABASE_URL (${dbName}). La BD de test debe ser una base ` +
        "aislada, distinta de la de desarrollo/producción.",
    );
  }

  // Conexión al destino de test para la verificación en vivo (B4).
  const p = new Pool({ connectionString: testUrl });
  let marcador: { ok: boolean; motivo: string };
  try {
    marcador = await verificarMarcadorEnVivo(p, dbName);
  } catch (e) {
    await p.end().catch(() => undefined);
    throw new Error(
      `[test-guard] ABORTADO (fail-closed): no se pudo verificar el marcador de ` +
        `BD de test en «${dbName}»: ${(e as Error).message}`,
    );
  }

  if (!marcador.ok) {
    await p.end().catch(() => undefined);
    throw new Error(`[test-guard] ABORTADO (fail-closed): ${marcador.motivo}.`);
  }

  return { ok: true, pool: p, dbName, motivo: marcador.motivo };
}

/**
 * Caso especial: suites que escriben a través del `pool`/`db` de RUNTIME de
 * `@workspace/db` (p.ej. el seed oficial, hard-wired a ese pool) y que NO pueden
 * redirigirse a un pool inyectado sin refactor mayor.
 *
 * Para estas, la única protección segura es NO EJECUTARLAS salvo que la propia
 * BD de runtime sea INEQUÍVOCAMENTE de test. Este verificador consulta EN VIVO,
 * contra el pool de runtime recibido, el mismo marcador/allowlist que `B4`.
 *
 * Devuelve:
 *   - { ok:true }  → el runtime apunta a una BD de test: la suite puede correr.
 *   - { ok:false } → NO es de test: la suite debe OMITIRSE (nunca ejecutar seed).
 * Lanza SIEMPRE si `NODE_ENV=production`.
 */
export async function runtimeEsBdDeTest(
  runtimePool: pg.Pool,
): Promise<{ ok: boolean; motivo: string }> {
  if (esProduccion()) {
    throw new Error(
      "[test-guard] ABORTADO (fail-closed): NODE_ENV es producción; una suite " +
        "que escribe sobre el pool de runtime jamás puede ejecutarse aquí.",
    );
  }
  let dbName = "(runtime)";
  try {
    const r = await runtimePool.query<{ db: string }>(
      "SELECT current_database() AS db",
    );
    dbName = r.rows[0]?.db ?? dbName;
  } catch {
    return { ok: false, motivo: "no se pudo determinar current_database() del runtime" };
  }
  return verificarMarcadorEnVivo(runtimePool, dbName);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR REUTILIZABLE PARA SUITES DESTRUCTIVAS (vitest)
 *
 * Los paquetes `lib/*` crean su propio `new pg.Pool({ connectionString:
 * DATABASE_URL })` y gatean con `DATABASE_URL ? describe : describe.skip`. Para
 * migrarlos SIN copy-paste ni añadir vitest como dependencia de `@workspace/db`,
 * exponemos aquí dos piezas neutras al runner:
 *
 *   - `suiteDestructiva(describe)` — devuelve el `describe` correcto: normal si
 *     hay `DATABASE_TEST_URL`, `describe.skip` (anotado) si falta, y LANZA si
 *     `NODE_ENV=production`. El paquete pasa SU propio `describe` (su versión de
 *     vitest), evitando acoplar `@workspace/db` a vitest.
 *
 *   - `crearPoolDestructivo()` — drop-in de `new pg.Pool({ connectionString:
 *     DATABASE_URL })`. Es un pool DEDICADO a `DATABASE_TEST_URL` que aplica el
 *     guard completo de forma PEREZOSA en el primer `connect()`/`query()`/`end()`.
 *     Jamás usa `DATABASE_URL`.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Contrato mínimo de `describe` de vitest que necesitamos (evita depender de
 * vitest). Soporta la forma con opciones `describe(nombre, { timeout }, fn)`.
 */
export interface DescribeLike {
  (nombre: string, fn: () => void): unknown;
  (nombre: string, opciones: unknown, fn: () => void): unknown;
  skip: {
    (nombre: string, fn: () => void): unknown;
    (nombre: string, opciones: unknown, fn: () => void): unknown;
  };
}

/**
 * Gate FAIL-CLOSED para suites destructivas de los paquetes `lib/*`.
 * Uso:  `const suite = suiteDestructiva(describe);  suite("...", () => { ... });`
 */
export function suiteDestructiva(describe: DescribeLike): DescribeLike {
  if (esProduccion()) {
    throw new Error(
      "[test-guard] ABORTADO (fail-closed): NODE_ENV es producción; las suites " +
        "destructivas no pueden ejecutarse en este entorno.",
    );
  }
  if (!process.env.DATABASE_TEST_URL) {
    const anotar = (nombre: string) =>
      `${nombre} [OMITIDA · sin DATABASE_TEST_URL — nunca se usa DATABASE_URL]`;
    const skip = ((nombre: string, b: unknown, c?: unknown) => {
      const skipFn = describe.skip as (...a: unknown[]) => unknown;
      // Soporta describe.skip(nombre, fn) y describe.skip(nombre, opciones, fn).
      return c === undefined
        ? skipFn(anotar(nombre), b)
        : skipFn(anotar(nombre), b, c);
    }) as unknown as DescribeLike;
    skip.skip = describe.skip;
    return skip;
  }
  return describe;
}

/**
 * Pool DEDICADO a la BD de test con verificación FAIL-CLOSED perezosa. Es un
 * drop-in de `new pg.Pool({ connectionString: DATABASE_URL })` para los call
 * sites `.connect()`/`.query()`/`.end()`.
 */
class PoolDestructivo {
  private resuelto: pg.Pool | null = null;
  private resolviendo: Promise<pg.Pool> | null = null;

  private async resolver(): Promise<pg.Pool> {
    if (this.resuelto) return this.resuelto;
    if (!this.resolviendo) {
      this.resolviendo = (async () => {
        const r = await resolverPoolDeTest();
        if (!r.ok) {
          throw new Error(
            `[test-guard] ABORTADO: ${r.motivo} — la suite destructiva no puede ` +
              "continuar sin una BD de test inequívoca.",
          );
        }
        // eslint-disable-next-line no-console
        console.info(
          `[test-guard] pool destructivo autorizado contra BD de test: ${r.motivo}`,
        );
        this.resuelto = r.pool;
        return r.pool;
      })();
    }
    return this.resolviendo;
  }

  async connect(): Promise<pg.PoolClient> {
    const p = await this.resolver();
    return p.connect();
  }

  async query(...args: unknown[]): Promise<unknown> {
    const p = await this.resolver();
    return (p.query as (...a: unknown[]) => Promise<unknown>)(...args);
  }

  async end(): Promise<void> {
    if (this.resuelto) {
      const p = this.resuelto;
      this.resuelto = null;
      this.resolviendo = null;
      await p.end();
    }
  }
}

/**
 * Crea un pool destructivo guardado. Devuelve el proxy tipado como `pg.Pool`
 * (solo se usan `.connect()`/`.query()`/`.end()`), para encajar en las firmas
 * existentes sin cambios de tipos en cada paquete.
 */
export function crearPoolDestructivo(): pg.Pool {
  return new PoolDestructivo() as unknown as pg.Pool;
}
