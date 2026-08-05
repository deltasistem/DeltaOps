/**
 * DGP-009.3 · Pruebas de CONTRATO frontend ↔ API (009.2 congelada).
 *
 * Verifican que las peticiones que construyen las mutaciones del frontend
 * (recurso, evidencia, asociación de formulario/checklist) coinciden con los
 * esquemas del contrato OpenAPI COMPROMETIDO de `@workspace/module-ordenes`,
 * tanto en el envío directo (online) como en la operación ENCOLADA (offline).
 *
 * La fuente de verdad es `lib/module-ordenes/openapi/ordenes.openapi.json`
 * (contract-first, verificado por su propio test de drift). Aquí se lee el JSON
 * congelado y se valida cada cuerpo contra el esquema correspondiente.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  registrarRecurso,
  agregarEvidencia,
  asociarFormulario,
  asociarChecklist,
  capturarRespuestaPlantilla,
} from "../lib/ordenes/mutaciones";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaSpec = resolve(aqui, "../../../../lib/module-ordenes/openapi/ordenes.openapi.json");
const spec = JSON.parse(readFileSync(rutaSpec, "utf8")) as {
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

/** Validador mínimo pero estricto: tipos, requeridos, enum y additionalProperties. */
function validar(nombre: string, valor: unknown, ruta = nombre): string[] {
  const s = resolver(schemas[nombre] ?? ({} as JsonSchema));
  return validarContra(s, valor, ruta);
}

function validarContra(schemaIn: JsonSchema, valor: unknown, ruta: string): string[] {
  const s = resolver(schemaIn);
  const errores: string[] = [];
  if (s.enum && !s.enum.includes(valor as string)) {
    errores.push(`${ruta}: "${String(valor)}" no está en enum [${s.enum.join(", ")}]`);
  }
  if (s.type === "object") {
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
      errores.push(`${ruta}: se esperaba objeto`);
      return errores;
    }
    const v = valor as Record<string, unknown>;
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
    if (valor !== null && typeof valor !== "string") errores.push(`${ruta}: se esperaba string`);
    if (typeof valor === "string") {
      if (s.minLength != null && valor.length < s.minLength) errores.push(`${ruta}: longitud < ${s.minLength}`);
      if (s.maxLength != null && valor.length > s.maxLength) errores.push(`${ruta}: longitud > ${s.maxLength}`);
    }
  } else if (s.type === "integer" || s.type === "number") {
    if (valor !== null && typeof valor !== "number") errores.push(`${ruta}: se esperaba número`);
    if (typeof valor === "number" && s.minimum != null && valor < s.minimum) errores.push(`${ruta}: < mínimo ${s.minimum}`);
  } else if (s.type === "array") {
    if (!Array.isArray(valor)) errores.push(`${ruta}: se esperaba array`);
    else if (s.items) valor.forEach((el, i) => errores.push(...validarContra(s.items!, el, `${ruta}[${i}]`)));
  }
  return errores;
}

/** Captura el cuerpo JSON del último fetch. */
let ultimoBody: Record<string, unknown> | null = null;
function espiarFetch(respuesta: unknown = { ok: true }): void {
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
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");

describe("contrato · el JSON OpenAPI expone los esquemas usados", () => {
  it("incluye RegistrarRecurso, RegistrarDocumentacion, Evidencia y AsociarPlantilla", () => {
    for (const n of ["RegistrarRecurso", "RegistrarDocumentacion", "Evidencia", "AsociarPlantilla", "PlantillaRef"]) {
      expect(schemas[n], `falta esquema ${n}`).toBeTruthy();
    }
  });
});

describe("contrato · recurso (registrar-recurso)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("el cuerpo online cumple RegistrarRecurso (clase enum + referenciaId)", async () => {
    espiarFetch();
    await registrarRecurso(nuevaCola(), "o1", { clase: "material", referenciaId: "SKU-1", descripcion: "Filtro", cantidad: 2, unidad: "u" });
    expect(ultimoBody).toBeTruthy();
    // ordenId lo inyecta la ruta HTTP; el resto debe cumplir el esquema.
    const cuerpo = { ...(ultimoBody as Record<string, unknown>), ordenId: "o1" };
    expect(validar("RegistrarRecurso", cuerpo)).toEqual([]);
  });

  it("rechaza una clase inválida (fuera del enum del contrato)", async () => {
    espiarFetch();
    await registrarRecurso(nuevaCola(), "o1", { clase: "herramientaXX", referenciaId: "R-9" });
    const cuerpo = { ...(ultimoBody as Record<string, unknown>), ordenId: "o1" };
    expect(validar("RegistrarRecurso", cuerpo).length).toBeGreaterThan(0);
  });

  it("el cuerpo ENCOLADO (offline) también cumple el contrato", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    await registrarRecurso(cola, "o1", { clase: "vehiculo", referenciaId: "PAT-123" });
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.ordenes.registrar-recurso");
    expect(validar("RegistrarRecurso", op.input)).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("contrato · evidencia (referencia-only)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("el cuerpo online cumple RegistrarDocumentacion (metadatos + hash + expectedVersion)", async () => {
    espiarFetch();
    await agregarEvidencia(nuevaCola(), "o1", 3, {
      categoria: "fotografia",
      nombreArchivo: "foto.jpg",
      mimeType: "image/jpeg",
      tamanoBytes: 2048,
      hashSha256: "a".repeat(64),
    });
    expect(validar("RegistrarDocumentacion", ultimoBody)).toEqual([]);
  });

  it("la evidencia compuesta en el servidor cumple el esquema Evidencia (attachmentId)", () => {
    // Reproduce la composición del endpoint POST /:id/documentacion:
    // register → attachmentId → evidencia:{...}. Debe cumplir Evidencia.
    const meta = { nombreArchivo: "[fotografia] foto.jpg", mimeType: "image/jpeg", tamanoBytes: 2048, hashSha256: "b".repeat(64) };
    const evidencia = { attachmentId: "att-generado", ...meta, descripcion: "fotografia" };
    expect(validar("Evidencia", evidencia)).toEqual([]);
    // Y el comando completo cumple AgregarEvidencia.
    expect(validar("AgregarEvidencia", { id: "o1", expectedVersion: 3, evidencia })).toEqual([]);
  });

  it("NO se encola offline (requiere el Attachment Service en línea)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    const r = await agregarEvidencia(cola, "o1", 1, {
      categoria: "pdf", nombreArchivo: "d.pdf", mimeType: "application/pdf", tamanoBytes: 10, hashSha256: "c".repeat(64),
    });
    expect(r.encolada).toBe(false);
    expect(r.error).toBeTruthy();
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("contrato · asociación de formulario/checklist", () => {
  beforeEach(() => { localStorage.clear(); });

  it("el cuerpo online cumple AsociarPlantilla (expectedVersion + plantilla:{clave,version})", async () => {
    espiarFetch();
    await asociarFormulario(nuevaCola(), "o1", 2, { clave: "insp.motor", version: 1, etiqueta: "Inspección" });
    expect(validar("AsociarPlantilla", ultimoBody)).toEqual([]);
  });

  it("checklist: el cuerpo ENCOLADO cumple el contrato", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network error"));
    const cola = nuevaCola();
    await asociarChecklist(cola, "o1", 5, { clave: "chk.seguridad", version: 2 });
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.ordenes.asociarChecklist");
    expect(validar("AsociarPlantilla", op.input)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("rechaza una plantilla sin versión (requerida por el contrato)", async () => {
    espiarFetch();
    await asociarFormulario(nuevaCola(), "o1", 2, { clave: "x", version: undefined as unknown as number });
    expect(validar("AsociarPlantilla", ultimoBody).length).toBeGreaterThan(0);
  });
});

describe("contrato · captura de respuesta de plantilla asociada (defecto #3: anclaje, Offline First)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("expone el esquema CapturaRespuesta en el JSON OpenAPI comprometido", () => {
    expect(schemas["CapturaRespuesta"], "falta esquema CapturaRespuesta").toBeTruthy();
    // La operación (comando orquestador) está declarada como path del contrato.
    const paths = (spec as unknown as { paths: Record<string, unknown> }).paths;
    expect(paths["/api/deltaops/ordenes/{id}/{clase}/respuesta"], "falta path de captura").toBeTruthy();
  });

  it("el cuerpo online cumple CapturaRespuesta y va ANCLADO a la clave+versión asociada", async () => {
    let url = ""; let body: Record<string, unknown> | null = null;
    vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
      url = String(u);
      body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const r = await capturarRespuestaPlantilla(
      nuevaCola(), "o1", "checklist",
      { clave: "chk.seguridad", version: 2 },
      { items: ["epp"], resultado: "conforme" },
    );
    expect(r.encolada).toBe(false);
    expect(r.error).toBeFalsy();
    // Ruta correcta (por clase) y cuerpo válido contra el contrato.
    expect(url).toContain("/o1/checklist/respuesta");
    expect(validar("CapturaRespuesta", body)).toEqual([]);
    // ANCLAJE: la respuesta se envía atada a la clave+versión EXACTA asociada.
    expect(body!["clave"]).toBe("chk.seguridad");
    expect(body!["version"]).toBe(2);
    // NO se envía expectedVersion: el anclaje re-lee la versión actual (recuperable).
    expect(body!["expectedVersion"]).toBeUndefined();
    expect(body!["opId"]).toBeTruthy();
    expect(body!["datos"]).toEqual({ items: ["epp"], resultado: "conforme" });
    vi.restoreAllMocks();
  });

  it("formulario: usa la ruta de su clase y respeta la versión asociada", async () => {
    let url = ""; let body: Record<string, unknown> | null = null;
    vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
      url = String(u);
      body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    await capturarRespuestaPlantilla(nuevaCola(), "o9", "formulario", { clave: "insp.motor", version: 3 }, { a: 1 });
    expect(url).toContain("/o9/formulario/respuesta");
    expect(body!["clave"]).toBe("insp.motor");
    expect(body!["version"]).toBe(3);
    vi.restoreAllMocks();
  });

  it("es OFFLINE-FIRST: ante fallo de red ENCOLA el comando único capturarRespuesta (replay por /sync)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    const r = await capturarRespuestaPlantilla(cola, "o1", "checklist", { clave: "c", version: 1 }, { x: 1 });
    expect(r.encolada).toBe(true);
    expect(r.error).toBeFalsy();
    expect(cola.pendientes()).toBe(1);
    // La operación encolada es el comando ÚNICO del módulo, con la entrada
    // COMPLETA (id/opId/clase/plantilla/datos) que /sync replayará idempotente.
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.ordenes.capturarRespuesta");
    const input = op.input as Record<string, unknown>;
    expect(input["id"]).toBe("o1");
    expect(input["clase"]).toBe("checklist");
    expect(input["opId"]).toBeTruthy();
    expect(input["plantilla"]).toEqual({ clave: "c", version: 1, etiqueta: undefined });
    expect(input["datos"]).toEqual({ x: 1 });
    vi.restoreAllMocks();
  });
});
