/**
 * DGP-017 · Contract-first — el JSON OpenAPI comprometido debe estar
 * SINCRONIZADO con el generador determinista (regenerar == comprometido) y DEBE
 * cubrir CADA ruta declarada en el router de identidad (drift test estricto).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { construirOpenApi, serializarOpenApi, OPERATION_IDS } from "../openapi";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaJson = resolve(aqui, "../../../../openapi/identity.openapi.json");
const rutaRouter = resolve(aqui, "../../../routes/deltaops/identity.ts");

/** Extrae (method, path) de cada `router.<m>(\`${BASE}...\`, ...)` del router. */
function rutasDelRouter(): Array<{ method: string; path: string }> {
  const src = readFileSync(rutaRouter, "utf8");
  const re = /router\.(get|post|patch|put|delete)\(`\$\{BASE\}([^`]*)`/g;
  const out: Array<{ method: string; path: string }> = [];
  for (const m of src.matchAll(re)) {
    // Normaliza `:param` (Express) → `{param}` (OpenAPI).
    const path = m[2]!.replace(/:(\w+)/g, "{$1}");
    out.push({ method: m[1]!, path });
  }
  return out;
}

describe("DGP-017 · OpenAPI contract-first (Identidad)", () => {
  it("el JSON comprometido está sincronizado con el generador", () => {
    const comprometido = readFileSync(rutaJson, "utf8");
    expect(serializarOpenApi()).toBe(comprometido);
  });

  it("el documento es OpenAPI 3 con rutas, esquemas y tags", () => {
    const doc = construirOpenApi() as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
      tags: unknown[];
    };
    expect(doc.openapi.startsWith("3.")).toBe(true);
    expect(Object.keys(doc.paths).length).toBeGreaterThanOrEqual(25);
    expect(Object.keys(doc.components.schemas).length).toBeGreaterThanOrEqual(20);
    expect(doc.tags.length).toBeGreaterThanOrEqual(7);
  });

  it("los operationId son únicos y estables (prefijo identity.)", () => {
    const set = new Set(OPERATION_IDS);
    expect(set.size).toBe(OPERATION_IDS.length);
    expect(OPERATION_IDS.every((id) => id.startsWith("identity."))).toBe(true);
  });

  it("cubre CADA ruta declarada en el router (sin deriva)", () => {
    const doc = construirOpenApi() as { paths: Record<string, Record<string, unknown>> };
    const declaradas = new Set<string>();
    for (const [p, metodos] of Object.entries(doc.paths)) {
      for (const m of Object.keys(metodos)) declaradas.add(`${m} ${p.replace("/api/deltaops", "")}`);
    }
    const faltantes = rutasDelRouter()
      .map((r) => `${r.method} ${r.path}`)
      .filter((clave) => !declaradas.has(clave));
    expect(faltantes).toEqual([]);
  });
});
