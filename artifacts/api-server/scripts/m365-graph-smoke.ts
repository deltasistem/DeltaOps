/**
 * DeltaOps · Smoke test REAL de Microsoft Graph (Mail.Send).
 *
 * Uso:
 *   tsx artifacts/api-server/scripts/m365-graph-smoke.ts [destino]
 *   pnpm --filter @workspace/api-server m365:graph:smoke [destino]
 *
 * Ejecuta config → token → validación → conexión Graph → envío REAL → resultado
 * usando `fetch` real (requiere GRAPH_* en el entorno). El destinatario es
 * opcional (default GRAPH_SENDER). Reporta SOLO PASS/FAIL/ACCEPTED por etapa;
 * en fallo, etapa + HTTP status + código de error Graph (redactado) +
 * diagnóstico + siguiente acción. JAMÁS imprime secretos.
 */
import { probarConexionGraph } from "../src/deltaops/identity/m365-graph-connection-test";
import { resolverConfigGraph } from "../src/deltaops/identity/m365-graph-email";

const ETIQUETA: Record<string, string> = {
  config: "GRAPH CONFIGURATION",
  oauth: "OAUTH",
  "graph-connection": "GRAPH CONNECTION",
  "mail-send": "MAIL.SEND",
  "test-email": "TEST EMAIL",
};

function siguienteAccion(status?: number, graphCode?: string): string {
  switch (status) {
    case 401:
      return "Verifique GRAPH_CLIENT_ID/SECRET/TENANT_ID y el token (401 autenticación).";
    case 403:
      return "Falta consentimiento admin de Mail.Send o RBAC de Exchange acotado al buzón (403).";
    case 404:
      return "GRAPH_SENDER no existe o no es accesible (404).";
    case 429:
      return "Throttling de Graph (429): reintente más tarde.";
    default:
      if (status && status >= 500) return "Error temporal de Graph (5xx): reintente.";
      return graphCode ? `Revise el código de error de Graph: ${graphCode}.` : "Revise la configuración.";
  }
}

async function main(): Promise<void> {
  const destino = process.argv[2];

  const cfg = resolverConfigGraph(process.env);
  if (!cfg.ok) {
    console.error("Microsoft Graph NO está configurado. Variables ausentes/inválidas:");
    for (const i of cfg.issues) console.error(`  - ${i.campo}: ${i.motivo}`);
    console.error(
      "\nDefina los Secrets GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_SENDER " +
        "y reintente. Ver docs/deltaops/identidad-tenancy/email-m365-graph.md",
    );
    process.exitCode = 2;
    return;
  }

  const r = await probarConexionGraph({ destinoPrueba: destino });
  console.log("=== DeltaOps · Smoke test Microsoft Graph ===");
  for (const e of r.etapas) {
    const etiqueta = ETIQUETA[e.etapa] ?? e.etapa;
    console.log(`${etiqueta}: ${e.estado}`);
    if (e.estado === "FAIL") {
      console.error(`  · etapa: ${e.etapa}`);
      if (e.httpStatus != null) console.error(`  · HTTP status: ${e.httpStatus}`);
      if (e.graphCode) console.error(`  · Graph error code: ${e.graphCode}`);
      console.error(`  · diagnóstico: ${e.detalle}`);
      console.error(`  · siguiente acción: ${siguienteAccion(e.httpStatus, e.graphCode)}`);
    }
  }
  console.log(`MICROSOFT 365 GRAPH INTEGRATION: ${r.ok ? "PASS" : "FAIL"}`);
  process.exitCode = r.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(`Smoke test Graph abortado: ${(err as Error).message}`);
  process.exitCode = 1;
});
