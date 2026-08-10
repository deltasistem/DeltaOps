/**
 * DGP-017 · Exportación determinista del contrato OpenAPI de identidad.
 * Ejecutar: pnpm --filter @workspace/api-server run openapi:identity
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serializarOpenApi } from "../src/deltaops/identity/openapi";

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = resolve(aqui, "../openapi/identity.openapi.json");
writeFileSync(destino, serializarOpenApi());
console.log(`OpenAPI identity export → ${destino}`);
