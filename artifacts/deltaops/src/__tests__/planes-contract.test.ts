/**
 * DGP-012 · Pruebas de CONTRATO frontend ↔ API de Planes (contrato congelado).
 *
 * Verifican que los cuerpos que construyen las mutaciones del frontend cumplen
 * los esquemas del OpenAPI CONGELADO de `@workspace/module-planes`, tanto en el
 * envío directo (online) como en la operación ENCOLADA (offline). La fuente de
 * verdad es `lib/module-planes/openapi/planes.openapi.json`. El validador
 * respeta enum, required, additionalProperties:false, exclusiveMinimum, nullable,
 * boolean, arrays y $ref.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { EstadoAsync } from "../lib/ordenes/hooks";
import { ColaSync } from "../lib/offline/cola";
import {
  crearPlan,
  editarPlan,
  publicarPlan,
  transicionarPlan,
  archivarPlan,
  rollbackPlan,
  crearCalendario,
  evaluarGeneracion,
  generarOrdenesPreventivas,
  upsertCatalogo,
  habilitarCatalogo,
  type EntradaCrearPlan,
} from "../lib/planes/mutaciones";
import { construirInputPlan, construirInputCalendario, construirInputEvaluar } from "../lib/planes/alta";
import { ACCIONES_PLAN } from "../lib/planes/constantes";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaSpec = resolve(aqui, "../../../../lib/module-planes/openapi/planes.openapi.json");
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
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "planes");

function opInput(cola: ColaSync): Record<string, unknown> {
  return cola.getSnapshot()[0]!.input as Record<string, unknown>;
}

/** Monta un hook de consulta y espera a que resuelva, devolviendo sus datos. */
async function ejecutarHook<T>(hook: () => EstadoAsync<T[]>): Promise<T[]> {
  const { result } = renderHook(hook);
  await waitFor(() => expect(result.current.cargando).toBe(false));
  return result.current.datos ?? [];
}

/** Valores planos representativos del wizard (Dynamic Forms). */
const VALORES_PLAN = {
  nombre: "Preventivo bomba",
  descripcion: "Rutina mensual",
  tipoPlan: "preventivo",
  estrategia: "basado-en-tiempo",
  prioridad: "alta",
  alcanceActivos: "act-1, act-2",
  alcanceCategorias: "bombas",
  frecuenciaModo: "lo-que-ocurra-primero",
  reglas: [
    { tipo: "dias", cada: 30, unidad: "dias" },
    { tipo: "horas", cada: 250, unidad: "h" },
    { tipo: "eventos", evento: "falla-critica" },
  ],
  toleranciaAntes: 2,
  toleranciaDespues: 3,
  rutinaNombre: "Rutina mensual bomba",
  duracionTotalMin: 120,
  actividades: [
    { titulo: "Inspección visual", tipo: "inspeccion", descripcion: "Revisar sellos", disciplina: "mecanica", duracionMin: 30, herramientas: "h1,h2", epp: "guantes", materiales: "trapo", repuestos: "sello-1", checklists: "ck-1", documentacion: "doc-1", riesgos: "quimico,mecanico", observaciones: "cuidado" },
    { titulo: "Lubricación", tipo: "lubricacion" },
  ],
  vigenteDesde: "2026-01-01",
  vigenteHasta: "2026-12-31",
  calendarioId: "cal-1",
};

describe("contrato · el JSON OpenAPI congelado expone los esquemas y paths usados", () => {
  it("incluye todos los esquemas de comando consumidos por el frontend", () => {
    for (const n of [
      "CrearPlan", "EditarPlan", "PublicarPlan", "TransicionarPlan", "ArchivarPlan", "RollbackPlan",
      "CrearCalendario", "EvaluarGeneracion", "GenerarOrdenesPreventivas", "CatalogoUpsert",
      "CatalogoHabilitar", "OperacionSync", "ColaSync", "Alcance", "Rutina", "Actividad", "Programa",
      "Frecuencia", "ReglaFrecuencia",
    ]) {
      expect(schemas[n], `falta esquema ${n}`).toBeTruthy();
    }
  });

  it("expone el path de sincronización offline por orquestación", () => {
    expect(spec.paths["/api/deltaops/planes/sync"], "falta /sync").toBeTruthy();
  });
});

describe("contrato · crear plan (Dynamic Forms → CrearPlan)", () => {
  beforeEach(() => localStorage.clear());

  it("el builder produce alcance/rutina/frecuencia/programa anidados válidos", () => {
    const input = construirInputPlan(VALORES_PLAN);
    expect(input.alcance.activos).toEqual(["act-1", "act-2"]);
    expect(input.rutina.actividades).toHaveLength(2);
    expect(input.rutina.actividades[0]!.orden).toBe(0);
    expect(input.programa.frecuencia.reglas).toHaveLength(3);
    // Regla de eventos: sin unidad, con evento.
    const reglaEvento = input.programa.frecuencia.reglas.find((r) => r.tipo === "eventos")!;
    expect((reglaEvento as { unidad?: string }).unidad).toBeUndefined();
    expect((reglaEvento as { evento?: string }).evento).toBe("falla-critica");
  });

  it("cuerpo online cumple CrearPlan (id + opId acuñados)", async () => {
    espiarFetch();
    await crearPlan(nuevaCola(), construirInputPlan(VALORES_PLAN));
    expect(ultimoBody).toBeTruthy();
    expect((ultimoBody as Record<string, unknown>).id).toBeTruthy();
    expect((ultimoBody as Record<string, unknown>).opId).toBeTruthy();
    expect(validar("CrearPlan", ultimoBody)).toEqual([]);
  });

  it("cuerpo ENCOLADO (offline) cumple CrearPlan y acuña id de cliente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    await crearPlan(cola, construirInputPlan(VALORES_PLAN));
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.planes.crear-plan");
    expect(op.input).toHaveProperty("id");
    expect(validar("CrearPlan", op.input)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("no envía descripción cuando está vacía (additionalProperties/nullable)", async () => {
    espiarFetch();
    const input = construirInputPlan({ ...VALORES_PLAN, descripcion: "" }) as EntradaCrearPlan;
    await crearPlan(nuevaCola(), input);
    expect(validar("CrearPlan", ultimoBody)).toEqual([]);
  });

  it("rechaza tipoPlan ausente (requerido por el contrato)", async () => {
    espiarFetch();
    await crearPlan(nuevaCola(), construirInputPlan(VALORES_PLAN));
    const sinTipo = { ...(ultimoBody as Record<string, unknown>) };
    delete sinTipo.tipoPlan;
    expect(validar("CrearPlan", sinTipo).length).toBeGreaterThan(0);
  });
});

describe("contrato · editar / publicar / archivar (anclados a expectedVersion)", () => {
  beforeEach(() => localStorage.clear());

  it("editar cumple EditarPlan (solo campos definidos)", async () => {
    espiarFetch();
    await editarPlan(nuevaCola(), "p1", 4, { nombre: "Nuevo nombre" });
    expect(validar("EditarPlan", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).expectedVersion).toBe(4);
  });

  it("publicar cumple PublicarPlan", async () => {
    espiarFetch();
    await publicarPlan(nuevaCola(), "p1", 2);
    expect(validar("PublicarPlan", ultimoBody)).toEqual([]);
  });

  it("archivar cumple ArchivarPlan", async () => {
    espiarFetch();
    await archivarPlan(nuevaCola(), "p1", 5);
    expect(validar("ArchivarPlan", ultimoBody)).toEqual([]);
  });

  it("publicar ENCOLADO cumple PublicarPlan", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await publicarPlan(cola, "p1", 1);
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.planes.publicar-plan");
    expect(validar("PublicarPlan", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("contrato · transiciones de Workflow (cada acción envía SU acción real)", () => {
  beforeEach(() => localStorage.clear());

  it("cada acción del enum cumple TransicionarPlan con motivo y su acción real", async () => {
    for (const a of ACCIONES_PLAN) {
      espiarFetch();
      const hasta = a.pideHasta ? "2026-06-01" : undefined;
      await transicionarPlan(nuevaCola(), "p1", a.clave, 3, "motivo obligatorio", hasta ? { hasta } : {});
      expect(validar("TransicionarPlan", ultimoBody), `acción ${a.clave}`).toEqual([]);
      expect((ultimoBody as Record<string, unknown>).accion, `envía su acción real ${a.clave}`).toBe(a.clave);
      expect((ultimoBody as Record<string, unknown>).motivo).toBe("motivo obligatorio");
      if (a.pideHasta) expect((ultimoBody as Record<string, unknown>).hasta).toBe("2026-06-01");
    }
  });

  it("transición ENCOLADA (offline) cumple TransicionarPlan", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transicionarPlan(cola, "p1", "suspender", 2, "mantenimiento mayor");
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.planes.transicionar-plan");
    expect(validar("TransicionarPlan", opInput(cola))).toEqual([]);
    expect((opInput(cola) as Record<string, unknown>).accion).toBe("suspender");
    vi.restoreAllMocks();
  });

  it("rechaza una acción fuera del enum del contrato", async () => {
    espiarFetch();
    // @ts-expect-error acción inválida a propósito
    await transicionarPlan(nuevaCola(), "p1", "eliminar", 2, "x");
    expect(validar("TransicionarPlan", ultimoBody).length).toBeGreaterThan(0);
  });
});

describe("contrato · rollback (versión destino ≥ 1)", () => {
  beforeEach(() => localStorage.clear());

  it("rollback cumple RollbackPlan", async () => {
    espiarFetch();
    await rollbackPlan(nuevaCola(), "p1", 6, 3);
    expect(validar("RollbackPlan", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).versionDestino).toBe(3);
  });
});

describe("contrato · calendario operacional", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple CrearCalendario (ventanas)", async () => {
    espiarFetch();
    const input = construirInputCalendario({
      nombre: "Planta 1", tipo: "operacional", ambito: "empresa",
      ventanas: [{ tipo: "festivo", desde: "2026-12-25", hasta: "2026-12-25", etiqueta: "Navidad" }],
    });
    await crearCalendario(nuevaCola(), input);
    expect(validar("CrearCalendario", ultimoBody)).toEqual([]);
  });

  it("cuerpo ENCOLADO cumple CrearCalendario", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await crearCalendario(cola, construirInputCalendario({ nombre: "C", tipo: "t", ambito: "proyecto" }));
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.planes.crear-calendario");
    expect(validar("CrearCalendario", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("contrato · evaluación y generación", () => {
  beforeEach(() => localStorage.clear());

  it("evaluar con cada origen del enum cumple EvaluarGeneracion", async () => {
    for (const origen of ["manual", "programada", "frecuencia", "horometro", "odometro", "eventos", "multiple"]) {
      espiarFetch();
      const input = construirInputEvaluar({ activoId: "act-1", origen, desde: "2026-01-01" }, "2026-08-06T00:00:00.000Z");
      await evaluarGeneracion(nuevaCola(), "p1", input);
      expect(validar("EvaluarGeneracion", ultimoBody), `origen ${origen}`).toEqual([]);
      expect((ultimoBody as Record<string, unknown>).origen).toBe(origen);
      expect((ultimoBody as Record<string, unknown>).anclaje).toBeTruthy();
    }
  });

  it("rechaza un origen fuera del enum del contrato", async () => {
    espiarFetch();
    const input = construirInputEvaluar({ activoId: "a", origen: "telepatia", desde: "2026-01-01" }, "2026-08-06T00:00:00.000Z");
    await evaluarGeneracion(nuevaCola(), "p1", input);
    expect(validar("EvaluarGeneracion", ultimoBody).length).toBeGreaterThan(0);
  });

  it("generar (online) cumple GenerarOrdenesPreventivas con opId UUID cliente permitido", async () => {
    espiarFetch();
    await generarOrdenesPreventivas(nuevaCola(), "p1", { limite: 10, tipoOrden: "preventiva" });
    // Contrato actualizado: opId es AHORA una propiedad válida del comando
    // (additionalProperties:false pero declara opId). Valida directo, sin stripping.
    expect(validar("GenerarOrdenesPreventivas", ultimoBody)).toEqual([]);
    const body = ultimoBody as Record<string, unknown>;
    expect(body.planId).toBe("p1");
    expect(body.limite).toBe(10);
    expect(body.tipoOrden).toBe("preventiva");
    expect(body.id).toBeUndefined();
    // La UI acuña un opId (UUID) de cliente como clave de deduplicación estable.
    expect(body.opId).toBeTruthy();
    expect(String(body.opId)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("rechaza límite fuera de rango (>200 según el contrato)", async () => {
    espiarFetch();
    await generarOrdenesPreventivas(nuevaCola(), "p1", { limite: 500 });
    expect(validar("GenerarOrdenesPreventivas", ultimoBody).length).toBeGreaterThan(0);
  });

  it("generar ENCOLADO (offline) es COMANDO OFICIAL de /sync con opId en el input", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await generarOrdenesPreventivas(cola, "p1", { limite: 5 });
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.planes.generar-ordenes-preventivas");
    // opId en el sobre de la operación...
    expect(op.opId).toBeTruthy();
    // ...y también en el input, ahora permitido por el contrato: valida SIN stripping.
    const input = op.input as Record<string, unknown>;
    expect(input.opId).toBeTruthy();
    expect(input.planId).toBe("p1");
    expect(validar("GenerarOrdenesPreventivas", input)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("el opId del sobre coincide con el opId del input (misma clave de deduplicación)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await generarOrdenesPreventivas(cola, "p1", {});
    const op = cola.getSnapshot()[0]!;
    const input = op.input as Record<string, unknown>;
    expect(input.opId).toBe(op.opId);
    vi.restoreAllMocks();
  });
});

describe("contrato · catálogos de tenant", () => {
  beforeEach(() => localStorage.clear());

  it("upsert cumple CatalogoUpsert", async () => {
    espiarFetch();
    await upsertCatalogo(nuevaCola(), { catalogo: "tiposPlan", clave: "predictivo", etiqueta: "Predictivo" });
    expect(validar("CatalogoUpsert", ultimoBody)).toEqual([]);
  });

  it("habilitar cumple CatalogoHabilitar (booleano)", async () => {
    espiarFetch();
    await habilitarCatalogo(nuevaCola(), { catalogo: "tiposPlan", clave: "predictivo", habilitado: false });
    expect(validar("CatalogoHabilitar", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).habilitado).toBe(false);
  });
});

/* ------- Contrato de LECTURA actualizado (ronda 1): Generacion, historial ------ */

describe("contrato · read model Generacion (estado pendiente|materializada + OT)", () => {
  it("el esquema Generacion declara `estado` como enum pendiente|materializada", () => {
    const g = schemas.Generacion!;
    const estado = g.properties?.estado;
    expect(estado, "Generacion.estado debe existir").toBeTruthy();
    expect(estado!.enum).toEqual(["pendiente", "materializada"]);
  });

  it("el esquema Generacion declara `ordenTrabajoId` string nullable", () => {
    const ot = schemas.Generacion!.properties?.ordenTrabajoId;
    expect(ot, "Generacion.ordenTrabajoId debe existir").toBeTruthy();
    expect(ot!.type).toBe("string");
    expect(ot!.nullable).toBe(true);
  });

  it("una generación PENDIENTE (sin OT) cumple el esquema Generacion", () => {
    const pendiente = { id: "gen-1", planId: "p1", claveDedup: "p1:2026-01", estado: "pendiente", ordenTrabajoId: null };
    expect(validar("Generacion", pendiente)).toEqual([]);
  });

  it("una generación MATERIALIZADA (con OT) cumple el esquema Generacion", () => {
    const materializada = { id: "gen-2", planId: "p1", claveDedup: "p1:2026-02", estado: "materializada", ordenTrabajoId: "OT-42" };
    expect(validar("Generacion", materializada)).toEqual([]);
  });

  it("rechaza un estado fuera del enum del contrato", () => {
    const invalida = { id: "gen-3", estado: "borrada" };
    expect(validar("Generacion", invalida).length).toBeGreaterThan(0);
  });
});

describe("contrato · historial del plan (GET /:id/historial ya funciona)", () => {
  beforeEach(() => localStorage.clear());

  it("expone el path GET /:id/historial", () => {
    const path = spec.paths["/api/deltaops/planes/{id}/historial"] as Record<string, unknown> | undefined;
    expect(path, "falta /:id/historial").toBeTruthy();
    expect(path!.get, "historial debe ser GET").toBeTruthy();
  });

  it("useHistorial CONSUME la respuesta {planId, historial:[...]} y devuelve los hitos", async () => {
    const hitos = [
      { id: "h1", tipo: "creado", fecha: "2026-01-01T00:00:00.000Z", actor: "u1" },
      { id: "h2", tipo: "publicado", fecha: "2026-01-02T00:00:00.000Z", actor: "u1" },
      { id: "h3", tipo: "materializo-orden", fecha: "2026-01-10T00:00:00.000Z", motivo: "generación preventiva" },
    ];
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ planId: "p1", historial: hitos }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const { useHistorial } = await import("../lib/planes/hooks");
    const capturado = await ejecutarHook(() => useHistorial("p1"));
    expect(capturado.map((h) => h.tipo)).toEqual(["creado", "publicado", "materializo-orden"]);
    vi.restoreAllMocks();
  });

  it("useHistorial también acepta la respuesta como array plano de hitos", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "h1", tipo: "creado" }]), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const { useHistorial } = await import("../lib/planes/hooks");
    const capturado = await ejecutarHook(() => useHistorial("p1"));
    expect(capturado).toHaveLength(1);
    expect(capturado[0]!.tipo).toBe("creado");
    vi.restoreAllMocks();
  });
});
