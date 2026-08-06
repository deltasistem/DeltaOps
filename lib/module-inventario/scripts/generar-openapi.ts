/**
 * DGP-011.2 · Genera lib/module-inventario/openapi/inventario.openapi.json desde
 * el generador determinista `src/openapi/spec.ts`. Ejecutar con:
 *   node --experimental-strip-types scripts/generar-openapi.ts
 * El test `openapi.test.ts` verifica que el JSON comprometido está sincronizado.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serializarOpenApi } from "../src/openapi/spec.ts";

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = resolve(aqui, "../openapi/inventario.openapi.json");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, serializarOpenApi(), "utf8");
console.log(`OpenAPI escrito en ${destino}`);
