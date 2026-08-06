/**
 * DGP-013.2 · Contract-first — el JSON OpenAPI comprometido debe estar
 * SINCRONIZADO con el generador determinista (regenerar == comprometido) y
 * DEBE cubrir TODOS los comandos/consultas del módulo (cada comando/consulta
 * con nombre literal aparece como operación del contrato con operationId
 * `abastecimiento.<sufijo>`).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { construirOpenApi, serializarOpenApi } from "../openapi/spec";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaJson = resolve(aqui, "../../openapi/abastecimiento.openapi.json");
const rutaModulo = resolve(aqui, "../module.ts");

/** Nombres literales de comando/consulta declarados en module.ts. */
function nombresDelModulo(): string[] {
  const src = readFileSync(rutaModulo, "utf8");
  const re = /name:\s*`\$\{MODULO\}\.([\w.-]+)`/g;
  const out = new Set<string>();
  for (const m of src.matchAll(re)) out.add(m[1]!);
  return [...out];
}

describe("DGP-013.2 · OpenAPI contract-first", () => {
  it("el JSON comprometido está sincronizado con el generador", () => {
    const comprometido = readFileSync(rutaJson, "utf8");
    expect(serializarOpenApi()).toBe(comprometido);
  });

  it("el documento es OpenAPI 3 con rutas y esquemas", () => {
    const doc = construirOpenApi() as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.openapi.startsWith("3.")).toBe(true);
    expect(Object.keys(doc.paths).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(doc.components.schemas).length).toBeGreaterThan(10);
  });

  it("cubre CADA comando y consulta literal del módulo (operationId por ruta)", () => {
    const nombres = nombresDelModulo();
    expect(nombres.length).toBeGreaterThanOrEqual(20);

    const doc = construirOpenApi() as { paths: Record<string, Record<string, { operationId?: string }>> };
    const operationIds = new Set<string>();
    for (const metodos of Object.values(doc.paths)) {
      for (const op of Object.values(metodos)) if (op.operationId) operationIds.add(op.operationId);
    }
    const faltantes = nombres.filter((suf) => !operationIds.has(`abastecimiento.${suf}`));
    expect(faltantes).toEqual([]);
  });
});
