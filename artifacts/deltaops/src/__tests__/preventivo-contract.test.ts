/**
 * DGP-014 · Pruebas de CONTRATO frontend ↔ API preventivo (CONGELADO).
 *
 * Verifican que los cuerpos que construyen las mutaciones del frontend cumplen
 * los esquemas del OpenAPI CONGELADO de `@workspace/module-preventivo`, tanto en
 * el envío directo (online) como en la operación ENCOLADA (offline). Fuente de
 * verdad: `lib/module-preventivo/openapi/preventivo.openapi.json`. El validador
 * respeta enum, required, additionalProperties:false, exclusiveMinimum/minimum,
 * nullable, boolean, arrays y $ref, y trata como OPACO cualquier objeto sin
 * propiedades enumeradas ni required (sla/recursos/datos y las respuestas GET).
 * `opId` es propiedad declarada de TODOS los comandos: valida directo.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearPrograma, editarPrograma, transicionarPrograma, versionarPrograma,
  revertirPrograma, definirActividad, generar, reprogramar, suspender, excluir,
  upsertCatalogo, habilitarCatalogo,
} from "../lib/preventivo/mutaciones";
import {
  construirInputPrograma, construirInputActividad, construirInputGenerar,
} from "../lib/preventivo/alta";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaSpec = resolve(aqui, "../../../../lib/module-preventivo/openapi/preventivo.openapi.json");
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
  format?: string;
}

function resolver(s: JsonSchema): JsonSchema {
  if (s.$ref) return schemas[s.$ref.replace("#/components/schemas/", "")]!;
  return s;
}

function validar(nombre: string, valor: unknown, ruta = nombre): string[] {
  const s = resolver(schemas[nombre] ?? ({} as JsonSchema));
  return validarContra(s, valor, ruta);
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
    // Objetos OPACOS del contrato: sin propiedades enumeradas y sin required.
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
    else {
      if (s.minLength != null && valor.length < s.minLength) errores.push(`${ruta}: longitud < ${s.minLength}`);
      if (s.maxLength != null && valor.length > s.maxLength) errores.push(`${ruta}: longitud > ${s.maxLength}`);
    }
  } else if (s.type === "integer" || s.type === "number") {
    if (typeof valor !== "number") errores.push(`${ruta}: se esperaba número`);
    else {
      if (s.minimum != null && valor < s.minimum) errores.push(`${ruta}: < mínimo ${s.minimum}`);
      if (s.maximum != null && valor > s.maximum) errores.push(`${ruta}: > máximo ${s.maximum}`);
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
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "preventivo");

/* ---------------- Valores planos representativos (Dynamic Forms) --------- */

const VALORES_PROGRAMA = {
  nombre: "Preventivo bombas 500h",
  codigo: "PRV-001",
  descripcion: "Rutina cada 500 horas de operación",
  tipo: "preventivo",
  clasificacion: "critico",
  planes: [{ planId: "plan-1", version: 2 }, { planId: "plan-2", version: 1 }],
  activos: [{ activoId: "act-1" }, { activoId: "act-2" }],
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2026-12-31",
};

const VALORES_ACTIVIDAD = {
  nombre: "Cambio de aceite",
  descripcion: "Drenaje y relleno",
  orden: 1,
  checklistPlantillaId: "lubricacion",
  checklistVersion: 3,
  tiempoValor: 2,
  tiempoUnidad: "h",
  moneda: "USD",
  costoEstimado: 45,
  dependencias: [{ actividadId: "act-prev-1" }],
  personal: [{ rol: "mecánico", cantidad: 1, horas: 2 }],
  herramientas: [{ referenciaId: "item-herr-1", cantidad: 1 }],
  repuestos: [{ referenciaId: "item-1", cantidad: 4, unidad: "L", fuente: "inventario" }],
};

/* ------------------------------ Pruebas --------------------------------- */

describe("contrato · el OpenAPI congelado expone esquemas y paths usados", () => {
  it("incluye todos los esquemas de comando consumidos por el frontend", () => {
    for (const n of [
      "CrearPrograma", "EditarPrograma", "TransicionarPrograma", "VersionarPrograma",
      "RevertirPrograma", "DefinirActividad", "Generar", "Reprogramar", "Suspender",
      "Excluir", "CatalogoUpsert", "CatalogoHabilitar", "OperacionSync", "ColaSync",
      "ResumenSync", "ReferenciaPlan", "Vigencia", "Checklist",
    ]) {
      expect(schemas[n], `falta esquema ${n}`).toBeTruthy();
    }
  });

  it("expone el path de sincronización y los endpoints gobernados", () => {
    for (const p of [
      "/api/deltaops/preventivo/sync",
      "/api/deltaops/preventivo/programas/{id}/transicion",
      "/api/deltaops/preventivo/programas/{id}/versionar",
      "/api/deltaops/preventivo/programas/{id}/revertir",
      "/api/deltaops/preventivo/generar",
      "/api/deltaops/preventivo/reprogramar",
      "/api/deltaops/preventivo/suspender",
      "/api/deltaops/preventivo/excluir",
    ]) {
      expect(spec.paths[p], `falta ${p}`).toBeTruthy();
    }
  });
});

describe("contrato · programa (Dynamic Forms → CrearPrograma/EditarPrograma)", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple CrearPrograma (id + opId acuñados)", async () => {
    espiarFetch();
    await crearPrograma(nuevaCola(), construirInputPrograma(VALORES_PROGRAMA));
    const b = ultimoBody as Record<string, unknown>;
    expect(b.id).toBeTruthy();
    expect(b.opId).toBeTruthy();
    expect(Array.isArray(b.planes)).toBe(true);
    expect((b.planes as unknown[]).length).toBe(2);
    expect(b.vigencia).toEqual({ desde: "2026-01-01", hasta: "2026-12-31" });
    expect(validar("CrearPrograma", b)).toEqual([]);
  });

  it("cuerpo ENCOLADO (offline) cumple CrearPrograma y acuña id de cliente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    await crearPrograma(cola, construirInputPrograma(VALORES_PROGRAMA));
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.preventivo.crear-programa");
    expect(op.input).toHaveProperty("id");
    expect(op.input).toHaveProperty("opId");
    expect(validar("CrearPrograma", op.input)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("omite descripción/código/clasificación/vigencia vacíos (additionalProperties)", async () => {
    espiarFetch();
    await crearPrograma(nuevaCola(), construirInputPrograma({
      nombre: "Mínimo", tipo: "preventivo",
    }));
    const b = ultimoBody as Record<string, unknown>;
    expect(b.descripcion).toBeUndefined();
    expect(b.codigo).toBeUndefined();
    expect(b.clasificacion).toBeUndefined();
    expect(b.vigencia).toBeUndefined();
    expect(b.planes).toBeUndefined();
    expect(validar("CrearPrograma", b)).toEqual([]);
  });

  it("rechaza tipo ausente (requerido por el contrato)", async () => {
    espiarFetch();
    await crearPrograma(nuevaCola(), construirInputPrograma(VALORES_PROGRAMA));
    const sinTipo = { ...(ultimoBody as Record<string, unknown>) };
    delete sinTipo.tipo;
    expect(validar("CrearPrograma", sinTipo).length).toBeGreaterThan(0);
  });

  it("editar cumple EditarPrograma anclado a expectedVersion", async () => {
    espiarFetch();
    await editarPrograma(nuevaCola(), "prog-1", 4, { nombre: "Nuevo", activos: ["a-1"] });
    const b = ultimoBody as Record<string, unknown>;
    expect(b.expectedVersion).toBe(4);
    expect(validar("EditarPrograma", b)).toEqual([]);
  });

  it("versionar/revertir cumplen su esquema", async () => {
    espiarFetch();
    await versionarPrograma(nuevaCola(), "prog-1", 4, { nombre: "v-trabajo" });
    expect(validar("VersionarPrograma", ultimoBody)).toEqual([]);
    await revertirPrograma(nuevaCola(), "prog-1", 5, 2);
    const b = ultimoBody as Record<string, unknown>;
    expect(b.haciaVersion).toBe(2);
    expect(validar("RevertirPrograma", b)).toEqual([]);
  });
});

describe("contrato · transiciones REALES por botón (sin bypass, sin motivo)", () => {
  beforeEach(() => localStorage.clear());

  it("cada acción envía SU transición explícita al endpoint gobernado", async () => {
    for (const accion of ["enviarRevision", "publicar", "suspender", "reanudar", "archivar"] as const) {
      espiarFetch();
      await transicionarPrograma(nuevaCola(), "prog-1", accion, 3);
      const b = ultimoBody as Record<string, unknown>;
      expect(b.accion).toBe(accion);
      expect(b.expectedVersion).toBe(3);
      // TransicionarPrograma NO declara motivo: no debe enviarse.
      expect(b.motivo).toBeUndefined();
      expect(validar("TransicionarPrograma", b)).toEqual([]);
    }
  });
});

describe("contrato · actividad (checklist/dependencias/recursos/tiempos/costos)", () => {
  beforeEach(() => localStorage.clear());

  it("cumple DefinirActividad con recursos opacos y checklist requerido", async () => {
    espiarFetch();
    await definirActividad(nuevaCola(), construirInputActividad("prog-1", VALORES_ACTIVIDAD));
    const b = ultimoBody as Record<string, unknown>;
    expect(b.programaId).toBe("prog-1");
    expect(b.checklist).toEqual({ plantillaId: "lubricacion", version: 3 });
    expect(b.tiempoEstimado).toEqual({ valor: 2, unidad: "h" });
    expect(Array.isArray(b.dependencias)).toBe(true);
    expect(b.recursos).toBeTruthy();
    expect(validar("DefinirActividad", b)).toEqual([]);
  });

  it("orden 0 es válido (minimum:0) y checklist.version ≥ 1", async () => {
    espiarFetch();
    await definirActividad(nuevaCola(), construirInputActividad("prog-1", { ...VALORES_ACTIVIDAD, orden: 0 }));
    const b = ultimoBody as Record<string, unknown>;
    expect(b.orden).toBe(0);
    expect(validar("DefinirActividad", b)).toEqual([]);
  });
});

describe("contrato · generar / acciones de programación", () => {
  beforeEach(() => localStorage.clear());

  it("generar cumple Generar (6 requeridos) e idempotencia por opId", async () => {
    espiarFetch({ estado: "materializada", ordenTrabajoId: "ot-1", idempotente: false });
    const r = await generar(nuevaCola(), construirInputGenerar({
      programaId: "prog-1", actividadId: "act-1", activoId: "a-1",
      ventana: "programada", origen: "manual", fechaObjetivo: "2026-02-01",
    }));
    const b = ultimoBody as Record<string, unknown>;
    expect(b.opId).toBeTruthy();
    expect(validar("Generar", b)).toEqual([]);
    expect((r.resultado as { estado?: string }).estado).toBe("materializada");
  });

  it("reprogramar/suspender/excluir cumplen su esquema (motivo obligatorio)", async () => {
    espiarFetch();
    await reprogramar(nuevaCola(), { programaId: "p1", fechaOriginal: "2026-02-01", fechaNueva: "2026-02-05", motivo: "clima" });
    expect(validar("Reprogramar", ultimoBody)).toEqual([]);

    await suspender(nuevaCola(), { programaId: "p1", ambito: "programa", sujetoId: "p1", motivo: "parada", desde: "2026-03-01" });
    const bs = ultimoBody as Record<string, unknown>;
    expect(bs.ambito).toBe("programa");
    expect(validar("Suspender", bs)).toEqual([]);

    await excluir(nuevaCola(), { programaId: "p1", desde: "2026-04-01", hasta: "2026-04-10", motivo: "feriados", activos: ["a-1"] });
    expect(validar("Excluir", ultimoBody)).toEqual([]);
  });

  it("suspender acepta los tres ámbitos gobernados (programa/actividad/activo)", async () => {
    for (const ambito of ["programa", "actividad", "activo"] as const) {
      espiarFetch();
      await suspender(nuevaCola(), { programaId: "p1", ambito, sujetoId: "s1", motivo: "x", desde: "2026-03-01" });
      const b = ultimoBody as Record<string, unknown>;
      expect(b.ambito).toBe(ambito);
      expect(validar("Suspender", b)).toEqual([]);
    }
  });
});

describe("contrato · catálogos", () => {
  beforeEach(() => localStorage.clear());

  it("upsert/habilitar cumplen su esquema", async () => {
    espiarFetch();
    await upsertCatalogo(nuevaCola(), { catalogo: "tiposPrograma", clave: "preventivo", etiqueta: "Preventivo", habilitado: true });
    expect(validar("CatalogoUpsert", ultimoBody)).toEqual([]);
    await habilitarCatalogo(nuevaCola(), { catalogo: "tiposPrograma", clave: "preventivo", habilitado: false });
    expect(validar("CatalogoHabilitar", ultimoBody)).toEqual([]);
  });
});
