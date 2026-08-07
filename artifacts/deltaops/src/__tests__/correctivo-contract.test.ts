/**
 * DGP-015 · Pruebas de CONTRATO frontend ↔ API correctivo (CONGELADO).
 *
 * Verifican que los cuerpos que construyen las mutaciones del frontend cumplen
 * los esquemas del OpenAPI CONGELADO de `module-correctivo`, tanto en el envío
 * directo (online) como en la operación ENCOLADA (offline). Fuente de verdad:
 * `lib/module-correctivo/openapi/correctivo.openapi.json`. El validador respeta
 * enum, required, additionalProperties:false, exclusiveMinimum/minimum, nullable,
 * boolean, arrays y $ref/inline; trata como OPACO cualquier objeto sin
 * propiedades enumeradas ni required (respuestas/datos/input y respuestas GET).
 *
 * Matiz del contrato: `opId` NO es propiedad de RegistrarEventoActivo,
 * CatalogoUpsert ni CatalogoHabilitar. Como la cola offline inyecta `opId` en el
 * `input` para el replay idempotente por /sync (cuyo `input` es OPACO), esos
 * comandos se validan ONLINE contra su esquema y ENCOLADO contra `OperacionSync`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearSolicitud, editarSolicitud, adjuntarEvidencia, comentarSolicitud,
  registrarDiagnostico, transicionarSolicitud, generarOrden, crearIntervencion,
  asignarCuadrillas, transicionarIntervencion, reservarRepuestos, consumirRepuesto,
  devolverRepuesto, registrarEventoActivo, upsertCatalogo, habilitarCatalogo,
} from "../lib/correctivo/mutaciones";
import {
  construirInputSolicitud, construirInputDiagnostico, construirInputEventoActivo,
  construirCuadrillas, construirLineasRepuesto, construirLineaRepuesto,
} from "../lib/correctivo/alta";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaSpec = resolve(aqui, "../../../../lib/module-correctivo/openapi/correctivo.openapi.json");
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
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "correctivo");

/* ---------------- Valores planos representativos (Dynamic Forms) --------- */

const VALORES_SOLICITUD = {
  titulo: "Fuga de aceite en bomba 3",
  origen: "operador",
  descripcion: "Se detectó fuga en la carcasa",
  activoId: "act-1",
  componenteId: "comp-9",
  ubicacionId: "ubi-2",
  sintomaClave: "ruido-anormal",
  sintomaTexto: "Vibración y ruido",
  prioridad: "alta",
  tipoFalla: "mecanica",
  modoFalla: "desgaste",
  causa: "lubricacion-insuficiente",
  efecto: "parada",
  severidad: "critica",
  impacto: "produccion",
  evidencias: [{ attachmentId: "att-1", tipo: "foto", etiqueta: "Carcasa" }],
};

const VALORES_DIAGNOSTICO = {
  causaReportada: "Ruido reportado por operador",
  causaEncontrada: "Rodamiento dañado",
  causaRaiz: "Falta de lubricación",
  modoFalla: "desgaste",
  efecto: "parada",
  criticidad: "alta",
  impacto: "produccion",
  recomendaciones: "Reemplazar rodamiento y ajustar plan de lubricación",
};

/* ------------------------------ Pruebas --------------------------------- */

describe("contrato · el OpenAPI congelado expone esquemas y paths usados", () => {
  it("incluye todos los esquemas de comando consumidos por el frontend", () => {
    for (const n of [
      "CrearSolicitud", "EditarSolicitud", "AdjuntarEvidencia", "ComentarSolicitud",
      "RegistrarDiagnostico", "TransicionarSolicitud", "GenerarOrdenCorrectiva",
      "CrearIntervencion", "AsignarCuadrillas", "TransicionarIntervencion",
      "ReservarRepuestos", "ConsumirRepuesto", "DevolverRepuesto",
      "RegistrarEventoActivo", "CatalogoUpsert", "CatalogoHabilitar",
      "OperacionSync", "ColaSync", "ResumenSync",
      "ObjetoAfectado", "Clasificacion", "Evidencia", "Cuadrilla", "LineaRepuesto",
    ]) {
      expect(schemas[n], `falta esquema ${n}`).toBeTruthy();
    }
  });

  it("expone el path de sincronización y los endpoints gobernados", () => {
    for (const p of [
      "/api/deltaops/correctivo/sync",
      "/api/deltaops/correctivo/solicitudes/{id}/transicion",
      "/api/deltaops/correctivo/solicitudes/{id}/diagnostico",
      "/api/deltaops/correctivo/generar",
      "/api/deltaops/correctivo/intervenciones/{id}/transicion",
      "/api/deltaops/correctivo/intervenciones/{id}/reservar",
      "/api/deltaops/correctivo/intervenciones/{id}/consumir",
      "/api/deltaops/correctivo/intervenciones/{id}/devolver",
      "/api/deltaops/correctivo/eventos-activo",
    ]) {
      expect(spec.paths[p], `falta ${p}`).toBeTruthy();
    }
  });
});

describe("contrato · solicitud (Dynamic Forms → CrearSolicitud/EditarSolicitud)", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple CrearSolicitud (id + opId acuñados, síntoma SINGULAR)", async () => {
    espiarFetch();
    await crearSolicitud(nuevaCola(), construirInputSolicitud(VALORES_SOLICITUD));
    const b = ultimoBody as Record<string, unknown>;
    expect(b.id).toBeTruthy();
    expect(b.opId).toBeTruthy();
    expect(b.objeto).toEqual({ activoId: "act-1", componenteId: "comp-9", ubicacionId: "ubi-2" });
    expect(b.sintoma).toEqual({ clave: "ruido-anormal", texto: "Vibración y ruido" });
    expect(b.prioridad).toBe("alta");
    expect(Array.isArray(b.evidencias)).toBe(true);
    expect(validar("CrearSolicitud", b)).toEqual([]);
  });

  it("cuerpo ENCOLADO (offline) cumple CrearSolicitud y acuña id/opId de cliente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    await crearSolicitud(cola, construirInputSolicitud(VALORES_SOLICITUD));
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.correctivo.crear-solicitud");
    expect(op.input).toHaveProperty("id");
    expect(op.input).toHaveProperty("opId");
    expect(validar("CrearSolicitud", op.input)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("omite descripción/síntoma/clasificación/evidencias vacíos (additionalProperties)", async () => {
    espiarFetch();
    await crearSolicitud(nuevaCola(), construirInputSolicitud({ titulo: "Mínimo", origen: "api", activoId: "act-9" }));
    const b = ultimoBody as Record<string, unknown>;
    expect(b.descripcion).toBeUndefined();
    expect(b.sintoma).toBeUndefined();
    expect(b.clasificacion).toBeUndefined();
    expect(b.evidencias).toBeUndefined();
    expect(b.prioridad).toBeUndefined();
    expect((b.objeto as Record<string, unknown>).componenteId).toBeUndefined();
    expect(validar("CrearSolicitud", b)).toEqual([]);
  });

  it("rechaza objeto/activo ausente (requerido por el contrato)", async () => {
    espiarFetch();
    await crearSolicitud(nuevaCola(), construirInputSolicitud(VALORES_SOLICITUD));
    const sinObjeto = { ...(ultimoBody as Record<string, unknown>) };
    delete sinObjeto.objeto;
    expect(validar("CrearSolicitud", sinObjeto).length).toBeGreaterThan(0);
  });

  it("editar cumple EditarSolicitud (sólo id requerido; sin expectedVersion)", async () => {
    espiarFetch();
    await editarSolicitud(nuevaCola(), "sol-1", { titulo: "Nuevo", prioridad: "media", clasificacion: { tipoFalla: "electrica" } });
    const b = ultimoBody as Record<string, unknown>;
    expect(b.id).toBe("sol-1");
    expect(b.expectedVersion).toBeUndefined();
    expect(validar("EditarSolicitud", b)).toEqual([]);
  });

  it("adjuntar evidencia y comentar cumplen su esquema", async () => {
    espiarFetch();
    await adjuntarEvidencia(nuevaCola(), "sol-1", { attachmentId: "att-2", tipo: "documento" });
    expect(validar("AdjuntarEvidencia", ultimoBody)).toEqual([]);
    await comentarSolicitud(nuevaCola(), "sol-1", "Revisado en sitio");
    const b = ultimoBody as Record<string, unknown>;
    expect(b.texto).toBe("Revisado en sitio");
    expect(validar("ComentarSolicitud", b)).toEqual([]);
  });
});

describe("contrato · diagnóstico anclado a plantilla+versión", () => {
  beforeEach(() => localStorage.clear());

  it("cumple RegistrarDiagnostico (plantilla req, respuestas opaco, causaRaiz)", async () => {
    espiarFetch();
    await registrarDiagnostico(
      nuevaCola(),
      construirInputDiagnostico("sol-1", { plantillaId: "correctivo.diagnostico", version: 1 }, VALORES_DIAGNOSTICO),
    );
    const b = ultimoBody as Record<string, unknown>;
    expect(b.solicitudId).toBe("sol-1");
    expect(b.plantilla).toEqual({ plantillaId: "correctivo.diagnostico", version: 1 });
    expect(b.causaRaiz).toBe("Falta de lubricación");
    expect(b.respuestas).toBeTruthy();
    expect(b.clasificacion).toBeTruthy();
    expect(validar("RegistrarDiagnostico", b)).toEqual([]);
  });

  it("la versión de la plantilla debe ser ≥ 1", async () => {
    espiarFetch();
    await registrarDiagnostico(nuevaCola(), construirInputDiagnostico("sol-1", { plantillaId: "p", version: 1 }, {}));
    const b = ultimoBody as Record<string, unknown>;
    const invalido = { ...b, plantilla: { plantillaId: "p", version: 0 } };
    expect(validar("RegistrarDiagnostico", invalido).length).toBeGreaterThan(0);
  });
});

describe("contrato · transiciones REALES por botón (sin bypass)", () => {
  beforeEach(() => localStorage.clear());

  it("cada acción de solicitud envía SU transición explícita al endpoint gobernado", async () => {
    for (const accion of ["enviarTriage", "iniciarDiagnostico", "enviarValidacion", "aprobar", "rechazar"] as const) {
      espiarFetch();
      await transicionarSolicitud(nuevaCola(), "sol-1", accion, accion === "rechazar" ? { motivo: "duplicada" } : {});
      const b = ultimoBody as Record<string, unknown>;
      expect(b.accion).toBe(accion);
      expect(b.id).toBe("sol-1");
      if (accion === "rechazar") expect(b.motivo).toBe("duplicada");
      else expect(b.motivo).toBeUndefined();
      expect(validar("TransicionarSolicitud", b)).toEqual([]);
    }
  });

  it("cada acción de intervención envía SU transición explícita", async () => {
    for (const accion of ["asignar", "iniciarEjecucion", "enviarVerificacion", "cerrar"] as const) {
      espiarFetch();
      await transicionarIntervencion(nuevaCola(), "int-1", accion);
      const b = ultimoBody as Record<string, unknown>;
      expect(b.accion).toBe(accion);
      expect(b.id).toBe("int-1");
      expect(validar("TransicionarIntervencion", b)).toEqual([]);
    }
  });
});

describe("contrato · generar OT correctiva", () => {
  beforeEach(() => localStorage.clear());

  it("cumple GenerarOrdenCorrectiva (solicitudId req) e idempotencia por opId", async () => {
    espiarFetch({ estado: "materializada", ordenTrabajoId: "ot-1", idempotente: false });
    const r = await generarOrden(nuevaCola(), "sol-1", { titulo: "OT correctiva", prioridad: "alta" });
    const b = ultimoBody as Record<string, unknown>;
    expect(b.solicitudId).toBe("sol-1");
    expect(b.opId).toBeTruthy();
    expect(validar("GenerarOrdenCorrectiva", b)).toEqual([]);
    expect((r.resultado as { estado?: string }).estado).toBe("materializada");
  });

  it("reintento con el MISMO opId (idempotencia) sigue cumpliendo el esquema", async () => {
    espiarFetch();
    await generarOrden(nuevaCola(), "sol-1", {}, { opId: "op-fijo", id: "ot-fijo" });
    const b = ultimoBody as Record<string, unknown>;
    expect(b.opId).toBe("op-fijo");
    expect(b.id).toBe("ot-fijo");
    expect(validar("GenerarOrdenCorrectiva", b)).toEqual([]);
  });
});

describe("contrato · intervención, cuadrillas y repuestos", () => {
  beforeEach(() => localStorage.clear());

  it("crear intervención requiere SOLO solicitudId (no ordenTrabajoId)", async () => {
    espiarFetch();
    await crearIntervencion(nuevaCola(), "sol-1", { mayor: true });
    const b = ultimoBody as Record<string, unknown>;
    expect(b.solicitudId).toBe("sol-1");
    expect(b.mayor).toBe(true);
    expect(b.ordenTrabajoId).toBeUndefined();
    expect(validar("CrearIntervencion", b)).toEqual([]);
  });

  it("asignar cuadrillas cumple AsignarCuadrillas (responsables id:rol, recursos tipo:id)", async () => {
    espiarFetch();
    const cuadrillas = construirCuadrillas({
      cuadrillas: [{ cuadrillaId: "cu-1", etiqueta: "Turno A", responsables: "r1:lider, r2:tecnico", recursos: "equipo:e1, vehiculo:v3" }],
    });
    await asignarCuadrillas(nuevaCola(), "int-1", cuadrillas);
    const b = ultimoBody as Record<string, unknown>;
    const c0 = (b.cuadrillas as Record<string, unknown>[])[0]!;
    expect(c0.cuadrillaId).toBe("cu-1");
    expect((c0.responsables as unknown[]).length).toBe(2);
    expect((c0.recursos as unknown[]).length).toBe(2);
    expect(validar("AsignarCuadrillas", b)).toEqual([]);
  });

  it("reservar repuestos cumple ReservarRepuestos (cantidad exclusiveMinimum 0)", async () => {
    espiarFetch();
    const lineas = construirLineasRepuesto({
      lineas: [{ inventarioId: "inv-1", articuloId: "art-1", cantidad: 4, unidad: "L" }],
    });
    await reservarRepuestos(nuevaCola(), "int-1", lineas);
    const b = ultimoBody as Record<string, unknown>;
    expect(b.intervencionId).toBe("int-1");
    expect((b.lineas as unknown[]).length).toBe(1);
    expect(validar("ReservarRepuestos", b)).toEqual([]);
  });

  it("cantidad 0 es rechazada por el constructor (exclusiveMinimum 0)", () => {
    const lineas = construirLineasRepuesto({ lineas: [{ inventarioId: "inv-1", articuloId: "art-1", cantidad: 0, unidad: "L" }] });
    expect(lineas.length).toBe(0);
  });

  it("consumir/devolver usan LINEA singular y cumplen su esquema", async () => {
    const linea = construirLineaRepuesto({ inventarioId: "inv-1", articuloId: "art-1", cantidad: 2, unidad: "u" })!;
    espiarFetch();
    await consumirRepuesto(nuevaCola(), "int-1", linea);
    let b = ultimoBody as Record<string, unknown>;
    expect(b.linea).toEqual(linea);
    expect(validar("ConsumirRepuesto", b)).toEqual([]);

    await devolverRepuesto(nuevaCola(), "int-1", linea);
    b = ultimoBody as Record<string, unknown>;
    expect(b.linea).toEqual(linea);
    expect(validar("DevolverRepuesto", b)).toEqual([]);
  });
});

describe("contrato · eventos de activo (sin opId declarado)", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo ONLINE cumple RegistrarEventoActivo (id, sin opId)", async () => {
    espiarFetch();
    await registrarEventoActivo(nuevaCola(), construirInputEventoActivo({ tipo: "falla-reportada", modoFalla: "desgaste" }, "act-1"));
    const b = ultimoBody as Record<string, unknown>;
    expect(b.activoId).toBe("act-1");
    expect(b.tipo).toBe("falla-reportada");
    expect(b.id).toBeTruthy();
    expect(b.opId).toBeUndefined();
    expect(validar("RegistrarEventoActivo", b)).toEqual([]);
  });

  it("cuerpo ENCOLADO viaja como OperacionSync opaca (input con opId inyectado)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    await registrarEventoActivo(cola, construirInputEventoActivo({ tipo: "reparacion-finalizada" }, "act-1"));
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.correctivo.registrar-evento-activo");
    // La operación se transporta como OperacionSync (input OPACO): válido.
    const sobre = { opId: op.opId, comando: op.comando, input: op.input };
    expect(validar("OperacionSync", sobre)).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("contrato · catálogos (sin opId declarado)", () => {
  beforeEach(() => localStorage.clear());

  it("upsert/habilitar ONLINE cumplen su esquema (sin opId)", async () => {
    espiarFetch();
    await upsertCatalogo(nuevaCola(), { catalogo: "tiposFalla", clave: "mecanica", etiqueta: "Mecánica", habilitado: true });
    let b = ultimoBody as Record<string, unknown>;
    expect(b.opId).toBeUndefined();
    expect(validar("CatalogoUpsert", b)).toEqual([]);

    await habilitarCatalogo(nuevaCola(), { catalogo: "tiposFalla", clave: "mecanica", habilitado: false });
    b = ultimoBody as Record<string, unknown>;
    expect(b.opId).toBeUndefined();
    expect(validar("CatalogoHabilitar", b)).toEqual([]);
  });
});
