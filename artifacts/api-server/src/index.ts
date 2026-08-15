import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

/**
 * DELTAOPS LITE-10 §27 · Apagado ELEGANTE (graceful shutdown).
 *
 * Ante SIGTERM/SIGINT (el orquestador de despliegue reemplaza/escala instancias)
 * se dejan de aceptar conexiones nuevas, se espera a que terminen las en curso y
 * se cierra el pool de PostgreSQL para no dejar conexiones colgadas. Un timeout
 * de seguridad fuerza la salida si algo se atasca, para no bloquear el rollout.
 * Idempotente: una segunda señal no relanza el proceso.
 */
const APAGADO_TIMEOUT_MS = 10_000;
let apagando = false;

async function apagar(senal: NodeJS.Signals): Promise<void> {
  if (apagando) return;
  apagando = true;
  logger.info({ senal }, "Apagado elegante iniciado");

  // Red de seguridad: si el cierre ordenado no termina a tiempo, salir igual.
  const forzar = setTimeout(() => {
    logger.error({ senal }, "Apagado forzado: timeout excedido");
    process.exit(1);
  }, APAGADO_TIMEOUT_MS);
  forzar.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    logger.info("Servidor HTTP cerrado; sin nuevas conexiones");
    await pool.end();
    logger.info("Pool de PostgreSQL cerrado");
    clearTimeout(forzar);
    process.exit(0);
  } catch (err) {
    logger.error({ err, senal }, "Error durante el apagado elegante");
    clearTimeout(forzar);
    process.exit(1);
  }
}

for (const senal of ["SIGTERM", "SIGINT"] as const) {
  process.on(senal, () => {
    void apagar(senal);
  });
}
