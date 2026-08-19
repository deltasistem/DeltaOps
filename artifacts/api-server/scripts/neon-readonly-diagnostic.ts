/**
 * Diagnóstico manual y READ-ONLY de Neon production.
 *
 * Uso:
 *   pnpm --filter @workspace/api-server neon:diagnostic
 *
 * Requiere NEON_DATABASE_URL. Nunca imprime la URL ni credenciales y no carga
 * Drizzle, migraciones, seeds ni el pool normal del API.
 */
import { runNeonReadonlyDiagnostic } from "@workspace/db/neon-readonly-diagnostic";

async function main(): Promise<void> {
  if (!process.env.NEON_DATABASE_URL) {
    console.error(
      "NEON DIAGNOSTIC: NO EJECUTADO. Falta el secret NEON_DATABASE_URL.",
    );
    process.exitCode = 2;
    return;
  }

  const result = await runNeonReadonlyDiagnostic(process.env.NEON_DATABASE_URL);

  console.log("=== DeltaOps · diagnóstico Neon (READ-ONLY) ===");
  console.log("Protección de sesión: default_transaction_read_only=on");
  console.log(`current_database: ${result.currentDatabase}`);
  console.log(`current_user: ${result.currentUser}`);
  console.log(`current_schema: ${result.currentSchema ?? "(null)"}`);
  console.log(`version: ${result.version}`);
  console.log(
    `schema deltaops: ${result.deltaopsSchemaExists ? "EXISTE" : "NO EXISTE"}`,
  );
  console.log(`tablas en deltaops: ${result.deltaopsTableCount}`);

  if (result.exampleTables.length > 0) {
    console.log(`ejemplos: ${result.exampleTables.join(", ")}`);
  }

  if (!result.deltaopsSchemaExists) {
    console.log(
      "Neon está conectado correctamente, pero el schema deltaops todavía no ha sido desplegado.",
    );
  } else if (result.deltaopsTableCount === 0) {
    console.log(
      "Neon está conectado correctamente; el schema deltaops existe pero está vacío.",
    );
  }

  if (!result.connectionAccepted) {
    console.error(
      "NEON CONNECTION: FAIL. Se esperaba current_database=neondb y current_user=deltaops_app.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("NEON CONNECTION: PASS");
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "[neon-diagnostic] Error no identificado.";
  console.error(message);
  process.exitCode = 1;
});
