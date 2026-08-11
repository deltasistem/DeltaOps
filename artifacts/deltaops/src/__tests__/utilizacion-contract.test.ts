/**
 * DGP-019.1 · Pruebas de CONTRATO frontend ↔ API Utilización (CONGELADO).
 *
 * Verifican que los cuerpos que construyen las mutaciones del frontend cumplen
 * los esquemas del OpenAPI CONGELADO de `module-utilizacion`, tanto en el envío
 * directo (online) como en la operación ENCOLADA (offline). Fuente de verdad:
 * `lib/module-utilizacion/openapi/utilizacion.openapi.json`. El validador
 * respeta enum, required, additionalProperties:false, minimum/exclusiveMinimum,
 * nullable, boolean, arrays y $ref; trata como OPACO cualquier objeto sin
 * propiedades ni required (input de /sync).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  registrarLectura, anularLectura, reiniciarMedidor, registrarTanqueo, anularTanqueo,
} from "../lib/utilizacion/mutaciones";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaSpec = resolve(aqui, "../../../../lib/module-utilizacion/openapi/utilizacion.openapi.json");
const spec = JSON.parse(readFileSync(rutaSpec, "utf8")) as {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, JsonSchema> };
};
const schemas = spec.components.schemas;

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  nullable?: boolean;
  $ref?: string;
  items?: JsonSchema;
}

function resolver(s: JsonSchema): JsonSchema {
  if (s.$ref) return schemas[s.$ref.replace("#/components/schemas/", "")]!;
  return s;
}

function validar(nombre: string, valor: unknown, ruta = nombre): string[] {
  return validarContra(schemas[nombre] ?? ({} as JsonSchema), valor, ruta);
}

function validarContra(schemaIn: JsonSchema, valor: unknown, ruta: string): string[] {
  const s = resolver(schemaIn);
  const errores: string[] = [];
  if (valor === null) {
    if (!s.nullable) errores.push(`${ruta}: null no permitido`);
    return errores;
  }
  if (s.enum && !s.enum.includes(valor as string)) {
    errores.push(`${ruta}: "${String(valor)}" no está en enum [${s.enum.join(", ")}]`);
  }
  if (s.type === "object") {
    if (typeof valor !== "object" || Array.isArray(valor)) {
      errores.push(`${ruta}: se esperaba objeto`);
      return errores;
    }
    const v = valor as Record<string, unknown>;
    const esOpaco = (!s.properties || Object.keys(s.properties).length === 0) && (s.required?.length ?? 0) === 0;
    if (esOpaco) return errores;
    for (const req of s.required ?? []) {
      if (v[req] === undefined) errores.push(`${ruta}: falta propiedad requerida "${req}"`);
    }
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      const propSchema = s.properties?.[k];
      if (!propSchema) {
        if (s.additionalProperties === false) errores.push(`${ruta}.${k}: propiedad no permitida (additionalProperties:false)`);
        continue;
      }
      errores.push(...validarContra(propSchema, val, `${ruta}.${k}`));
    }
  } else if (s.type === "string") {
    if (typeof valor !== "string") errores.push(`${ruta}: se esperaba string`);
  } else if (s.type === "integer" || s.type === "number") {
    if (typeof valor !== "number") errores.push(`${ruta}: se esperaba número`);
    else {
      if (s.minimum != null && valor < s.minimum) errores.push(`${ruta}: < mínimo ${s.minimum}`);
      if (s.exclusiveMinimum != null && valor <= s.exclusiveMinimum) errores.push(`${ruta}: <= exclusiveMinimum ${s.exclusiveMinimum}`);
    }
  } else if (s.type === "boolean") {
    if (typeof valor !== "boolean") errores.push(`${ruta}: se esperaba boolean`);
  } else if (s.type === "array") {
    if (!Array.isArray(valor)) errores.push(`${ruta}: se esperaba array`);
    else if (s.items) valor.forEach((el, i) => errores.push(...validarContra(s.items!, el, `${ruta}[${i}]`)));
  }
  return errores;
}

let ultimoBody: Record<string, unknown> | null = null;
function espiarFetch(respuesta: unknown = { id: "x" }): void {
  ultimoBody = null;
  vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
    ultimoBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    return new Response(JSON.stringify(respuesta), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "utilizacion");

afterEach(() => vi.restoreAllMocks());

describe("contrato · el OpenAPI congelado expone esquemas y paths usados", () => {
  it("incluye los esquemas de comando consumidos por el frontend", () => {
    for (const n of ["RegistrarLectura", "AnularLectura", "ReinicioMedidor", "RegistrarTanqueo", "AnularTanqueo", "Resumen", "OperacionSync"]) {
      expect(schemas[n], `falta esquema ${n}`).toBeTruthy();
    }
  });

  it("expone los endpoints gobernados (sync incluido)", () => {
    for (const p of [
      "/api/deltaops/utilizacion/sync",
      "/api/deltaops/utilizacion/lecturas",
      "/api/deltaops/utilizacion/lecturas/{id}/anular",
      "/api/deltaops/utilizacion/reinicio-medidor",
      "/api/deltaops/utilizacion/tanqueos",
      "/api/deltaops/utilizacion/tanqueos/{id}/anular",
      "/api/deltaops/utilizacion/activos/{activoId}/resumen",
    ]) {
      expect(spec.paths[p], `falta ${p}`).toBeTruthy();
    }
  });

  it("el Resumen expone los cálculos como ResultadoCalculo (sin-datos ≠ 0)", () => {
    const rc = schemas.ResultadoCalculo!;
    expect(rc.properties?.tipo?.enum).toContain("sin-datos");
    expect(rc.properties?.tipo?.enum).toContain("valor");
  });
});

describe("contrato · lecturas (registro y anulación)", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online de registrar-lectura cumple RegistrarLectura (id+opId acuñados, origen manual)", async () => {
    espiarFetch();
    await registrarLectura(nuevaCola(), {
      activoId: "act-1", tipoMedidor: "horometro", valor: 1234.5, unidad: "h",
      fechaHora: "2024-01-01T10:00:00.000Z", observacion: "OK", origen: "manual",
    });
    expect(ultimoBody).toBeTruthy();
    expect(ultimoBody!.origen).toBe("manual");
    expect(typeof ultimoBody!.opId).toBe("string");
    expect(typeof ultimoBody!.id).toBe("string");
    expect(validar("RegistrarLectura", ultimoBody)).toEqual([]);
  });

  it("cuerpo online de anular-lectura cumple AnularLectura (motivo obligatorio, sin id en el body)", async () => {
    espiarFetch();
    await anularLectura(nuevaCola(), "lec-1", "Corrección de captura");
    expect(validar("AnularLectura", ultimoBody)).toEqual([]);
    expect(ultimoBody!.id).toBeUndefined(); // el id viaja en la ruta
    expect(ultimoBody!.motivo).toBe("Corrección de captura");
  });

  it("operación ENCOLADA (offline) conserva id+opId para replay idempotente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    const r = await registrarLectura(cola, {
      activoId: "act-9", tipoMedidor: "odometro", valor: 500, fechaHora: "2024-02-02T08:00:00.000Z",
    });
    expect(r.encolada).toBe(true);
    const ops = cola.todas();
    expect(ops).toHaveLength(1);
    expect(ops[0]!.comando).toBe("modulo.utilizacion.registrar-lectura");
    const input = ops[0]!.input as Record<string, unknown>;
    expect(typeof input.opId).toBe("string");
    expect(typeof input.id).toBe("string");
    expect(input.origen).toBe("manual");
    // La unidad se deriva del tipo cuando se omite (odometro ⇒ no se envía → backend la deriva).
    expect(validar("RegistrarLectura", input)).toEqual([]);
  });
});

describe("contrato · reinicio de medidor", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online de reinicio cumple ReinicioMedidor (motivo obligatorio)", async () => {
    espiarFetch();
    await reiniciarMedidor(nuevaCola(), {
      activoId: "act-1", tipoMedidor: "horometro", valorNuevo: 0,
      fechaHora: "2024-03-03T00:00:00.000Z", motivo: "Cambio de motor",
    });
    expect(validar("ReinicioMedidor", ultimoBody)).toEqual([]);
    expect(ultimoBody!.motivo).toBe("Cambio de motor");
  });
});

describe("contrato · tanqueos (registro y anulación)", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online de registrar-tanqueo cumple RegistrarTanqueo (litros > 0)", async () => {
    espiarFetch();
    await registrarTanqueo(nuevaCola(), {
      activoId: "act-1", fechaHora: "2024-04-04T12:00:00.000Z", litros: 45.5,
      tipoCombustible: "diesel", precioUnitario: 3.2, costoTotal: 145.6, moneda: "USD",
      lecturaMedidorRef: "lec-77", proveedorId: "prov-2", observacion: "Tanqueo lleno",
    });
    expect(validar("RegistrarTanqueo", ultimoBody)).toEqual([]);
    expect(ultimoBody!.lecturaMedidorRef).toBe("lec-77");
  });

  it("no envía campos opcionales vacíos (additionalProperties/valores nulos)", async () => {
    espiarFetch();
    await registrarTanqueo(nuevaCola(), {
      activoId: "act-1", fechaHora: "2024-04-04T12:00:00.000Z", litros: 10, tipoCombustible: "gasolina",
    });
    expect(ultimoBody!.precioUnitario).toBeUndefined();
    expect(ultimoBody!.proveedorId).toBeUndefined();
    expect(validar("RegistrarTanqueo", ultimoBody)).toEqual([]);
  });

  it("cuerpo online de anular-tanqueo cumple AnularTanqueo", async () => {
    espiarFetch();
    await anularTanqueo(nuevaCola(), "tq-1", "Duplicado");
    expect(validar("AnularTanqueo", ultimoBody)).toEqual([]);
  });
});
