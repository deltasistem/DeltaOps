/**
 * DeltaOps · Smoke test REAL de Microsoft 365 (SMTP + OAuth).
 *
 * Uso:
 *   tsx artifacts/api-server/scripts/m365-smoke.ts [destino]
 *
 * Ejecuta la prueba de conexión por etapas usando `fetch` y `nodemailer`
 * REALES (requiere M365_* en el entorno). Reporta SOLO PASS/FAIL por etapa;
 * JAMÁS imprime secretos. Si faltan variables, lista sus NOMBRES y termina.
 *
 * Este script es la vía segura del mandato: no expone credenciales, no depende
 * de la UI y verifica configuración → OAuth → SMTP → correo de prueba.
 */
import { probarConexionM365 } from "../src/deltaops/identity/m365-connection-test";
import { resolverConfigM365 } from "../src/deltaops/identity/m365-email";

async function main(): Promise<void> {
  const destino = process.argv[2];

  const cfg = resolverConfigM365(process.env);
  if (!cfg.ok) {
    console.error("Microsoft 365 NO está configurado. Variables ausentes/ inválidas:");
    for (const i of cfg.issues) console.error(`  - ${i.campo}: ${i.motivo}`);
    console.error(
      "\nDefina las variables M365_* en el entorno seguro y reintente. " +
        "Ver docs/deltaops/identidad-tenancy/email-m365.md",
    );
    process.exitCode = 2;
    return;
  }

  const r = await probarConexionM365({ destinoPrueba: destino });
  const nombre: Record<string, string> = {
    config: "M365 connection",
    oauth: "OAuth",
    smtp: "SMTP/Exchange",
    "test-email": "Test email",
  };
  console.log("=== DeltaOps · Smoke test Microsoft 365 ===");
  for (const e of r.etapas) {
    // Solo PASS/FAIL + detalle NO sensible (la etapa ya redacta).
    console.log(`${nombre[e.etapa] ?? e.etapa}: ${e.estado}`);
  }
  console.log(`RESULTADO: ${r.ok ? "PASS" : "FAIL"}`);
  process.exitCode = r.ok ? 0 : 1;
}

main().catch((err) => {
  // No imprime el objeto de error crudo (puede llevar detalles); solo mensaje.
  console.error(`Smoke test M365 abortado: ${(err as Error).message}`);
  process.exitCode = 1;
});
