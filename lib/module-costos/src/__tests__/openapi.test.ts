/**
 * DGP-021.1 · Contract-first — el JSON OpenAPI comprometido debe estar
 * SINCRONIZADO con el generador determinista (regenerar == comprometido) y DEBE
 * cubrir TODAS las rutas del módulo (cada comando/consulta HTTP-expuesto aparece
 * como operación del contrato con operationId `costos.<sufijo>`).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { construirOpenApi, serializarOpenApi } from "../openapi/spec";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaJson = resolve(aqui, "../../openapi/costos.openapi.json");
const rutaModulo = resolve(aqui, "../module.ts");

/**
 * Comandos INTERNOS que NO se exponen como ruta HTTP y por tanto NO tienen
 * operationId en el contrato. DGP-021.2 (R2): `hecho.materializar-material` es la
 * vía canónica SÓLO por orquestación interna (movimiento físico confirmado); no
 * hay `POST /hechos/material`. Su esquema `MaterializarMaterial` queda documentado
 * como contrato interno, sin operación HTTP. §20 anti-bypass.
 */
const COMANDOS_INTERNOS = new Set<string>(["hecho.materializar-material"]);

/** Nombres de comando/consulta HTTP-expuestos declarados en module.ts. */
function nombresDelModulo(): string[] {
  const src = readFileSync(rutaModulo, "utf8");
  const re = /name:\s*`\$\{MODULO\}\.([\w.-]+)`/g;
  const out = new Set<string>();
  for (const m of src.matchAll(re)) if (!COMANDOS_INTERNOS.has(m[1]!)) out.add(m[1]!);
  return [...out];
}

describe("DGP-021.1 · OpenAPI contract-first", () => {
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
    expect(Object.keys(doc.paths).length).toBeGreaterThan(3);
    expect(Object.keys(doc.components.schemas).length).toBeGreaterThan(5);
  });

  it("el dinero SIEMPRE es cadena decimal (nunca number) en el contrato", () => {
    const json = readFileSync(rutaJson, "utf8");
    // No debe haber ningún `"type": "number"` (dinero string-safe extremo a extremo).
    expect(json.includes('"type": "number"')).toBe(false);
  });

  it("opId es REQUERIDO en TODOS los cuerpos de mutación (idempotencia invariante)", () => {
    const doc = construirOpenApi() as { components: { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }> } };
    for (const nombre of ["MaterializarMaterial", "MaterializarOtros", "AnularHecho"]) {
      const schema = doc.components.schemas[nombre]!;
      expect(schema.properties && "opId" in schema.properties).toBe(true);
      expect(schema.required ?? []).toContain("opId");
    }
  });

  it("cubre CADA comando y consulta HTTP-expuesto (operationId por ruta)", () => {
    const nombres = nombresDelModulo();
    // 5 superficies HTTP tras R2 (materializar-otros, anular, detalle, hechos,
    // por-moneda). El comando interno `materializar-material` NO cuenta (anti-bypass).
    expect(nombres.length).toBeGreaterThanOrEqual(5);

    const doc = construirOpenApi() as { paths: Record<string, Record<string, { operationId?: string }>> };
    const operationIds = new Set<string>();
    for (const metodos of Object.values(doc.paths)) {
      for (const op of Object.values(metodos)) if (op.operationId) operationIds.add(op.operationId);
    }
    const faltantes = nombres.filter((suf) => !operationIds.has(`costos.${suf}`));
    expect(faltantes).toEqual([]);
  });

  it("DGP-021.2 (R2) · el comando INTERNO materializar-material NO se expone como ruta HTTP", () => {
    const doc = construirOpenApi() as { paths: Record<string, Record<string, { operationId?: string }>> };
    const operationIds = new Set<string>();
    for (const metodos of Object.values(doc.paths)) {
      for (const op of Object.values(metodos)) if (op.operationId) operationIds.add(op.operationId);
    }
    // Anti-bypass §20: no hay operación HTTP para MATERIAL.
    expect(operationIds.has("costos.hecho.materializar-material")).toBe(false);
    // Pero el esquema del contrato interno se conserva documentado.
    const schemas = (construirOpenApi() as { components: { schemas: Record<string, unknown> } }).components.schemas;
    expect("MaterializarMaterial" in schemas).toBe(true);
  });
});
