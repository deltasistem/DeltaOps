/**
 * DGP-012.2 · Módulo Enterprise Maintenance Plans — Contrato OpenAPI 3
 * (contract-first) VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin
 * imports del workspace) para ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/planes`:
 * planes de mantenimiento (alta/edición/versionado), gobierno por Workflow
 * Engine (publicar/transicionar/archivar/rollback), calendarios operacionales,
 * motor de generación (evaluar-generación DECIDE; generar-órdenes-preventivas
 * MATERIALIZA OT componiendo el comando oficial de module-ordenes), catálogos
 * configurables por tenant, lecturas CQRS (detalle/listado desde read models),
 * reproyección (replay), sincronización offline y consola técnica. Incluye el
 * mapeo de errores kernel→HTTP (AUTH→403, NF→404, CFL→409, VAL→400, INF→500).
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera CADA comando/consulta del módulo.
 */

const BASE = "/api/deltaops/planes";

type Schema = Record<string, unknown>;

const ref = (n: string): Schema => ({ $ref: `#/components/schemas/${n}` });
const str = (extra: Schema = {}): Schema => ({ type: "string", ...extra });
const int = (extra: Schema = {}): Schema => ({ type: "integer", ...extra });
const num = (extra: Schema = {}): Schema => ({ type: "number", ...extra });
const bool = (): Schema => ({ type: "boolean" });
const obj = (props: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object",
  properties: props,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const arr = (items: Schema): Schema => ({ type: "array", items });

function errores(...codigos: Array<"400" | "401" | "403" | "404" | "409" | "500">): Record<string, Schema> {
  const mapa: Record<string, string> = {
    "400": "Validación fallida (KRN-VAL)",
    "401": "No autenticado (sesión ausente)",
    "403": "No autorizado (KRN-AUTH)",
    "404": "No encontrado (KRN-NF)",
    "409": "Conflicto de concurrencia/duplicado (KRN-CFL)",
    "500": "Error de infraestructura (KRN-INF)",
  };
  const out: Record<string, Schema> = {};
  for (const c of codigos) out[c] = { description: mapa[c], content: { "application/json": { schema: ref("Error") } } };
  return out;
}

const jsonBody = (schema: Schema): Schema => ({ required: true, content: { "application/json": { schema } } });
const jsonOk = (schema: Schema, description = "OK"): Schema => ({ description, content: { "application/json": { schema } } });

const pathParam = (name: string, description: string): Schema => ({ name, in: "path", required: true, schema: str(), description });
const queryParam = (name: string, description: string): Schema => ({ name, in: "query", required: false, schema: str(), description });
const idParam: Schema = pathParam("id", "Identificador del recurso");

export function construirOpenApi(): Record<string, unknown> {
  const referenciaExterna = obj({ tipo: str(), id: str(), etiqueta: str() }, ["tipo", "id"]);

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    ResultadoComando: obj({ id: str(), codigo: str(), estado: str(), version: int(), idempotente: bool() }),
    ReglaFrecuencia: obj(
      { tipo: str(), cada: num({ exclusiveMinimum: 0 }), unidad: str({ nullable: true }), evento: str({ nullable: true }) },
      ["tipo"],
    ),
    Frecuencia: obj(
      { reglas: arr(ref("ReglaFrecuencia")), modo: str(), toleranciaAntes: num({ minimum: 0 }), toleranciaDespues: num({ minimum: 0 }) },
      ["reglas"],
    ),
    Alcance: obj({
      activos: arr(str()), categorias: arr(str()), familias: arr(str()), subfamilias: arr(str()),
      empresas: arr(str()), proyectos: arr(str()), ubicaciones: arr(str()), clases: arr(str()),
    }),
    Actividad: obj(
      {
        id: str(), orden: int({ minimum: 0 }), tipo: str(), titulo: str(), descripcion: str(),
        disciplina: str({ nullable: true }), duracion: obj({ minutos: int({ minimum: 0 }) }, ["minutos"]),
        herramientas: arr(referenciaExterna), epp: arr(referenciaExterna), materiales: arr(referenciaExterna),
        repuestos: arr(referenciaExterna), checklists: arr(referenciaExterna), formularios: arr(referenciaExterna),
        documentacion: arr(referenciaExterna),
        riesgos: arr(obj({ categoria: str(), nota: str() }, ["categoria"])), observaciones: str(),
      },
      ["id", "orden", "tipo", "titulo"],
    ),
    Rutina: obj(
      {
        id: str(), nombre: str(),
        recursosSugeridos: arr(obj({ tipo: str(), cantidad: int({ exclusiveMinimum: 0 }) }, ["tipo"])),
        actividades: arr(ref("Actividad")),
        duracionTotal: obj({ minutos: int({ minimum: 0 }) }, ["minutos"]),
      },
      ["id", "nombre", "actividades"],
    ),
    Programa: obj(
      {
        frecuencia: ref("Frecuencia"), calendarioId: str({ nullable: true }),
        vigenteDesde: str(), vigenteHasta: str({ nullable: true }),
      },
      ["frecuencia", "vigenteDesde"],
    ),
    CrearPlan: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        nombre: str(), descripcion: str({ nullable: true }),
        tipoPlan: str(), estrategia: str(), prioridad: str(),
        alcance: ref("Alcance"), rutina: ref("Rutina"), programa: ref("Programa"),
      },
      ["nombre", "tipoPlan", "estrategia", "prioridad", "alcance", "rutina", "programa"],
    ),
    EditarPlan: obj(
      {
        id: str(), expectedVersion: int({ minimum: 1 }), opId: str(),
        nombre: str(), descripcion: str({ nullable: true }),
        alcance: ref("Alcance"), rutina: ref("Rutina"), programa: ref("Programa"),
      },
      ["id", "expectedVersion"],
    ),
    PublicarPlan: obj({ id: str(), expectedVersion: int({ minimum: 1 }), opId: str() }, ["id", "expectedVersion"]),
    TransicionarPlan: obj(
      {
        id: str(),
        accion: str({ enum: ["suspender", "reanudar", "posponer", "extender", "cancelar", "reprogramar"] }),
        expectedVersion: int({ minimum: 1 }), motivo: str(),
        hasta: str({ nullable: true }), nota: str(), opId: str(),
      },
      ["id", "accion", "expectedVersion", "motivo"],
    ),
    ArchivarPlan: obj({ id: str(), expectedVersion: int({ minimum: 1 }), opId: str() }, ["id", "expectedVersion"]),
    RollbackPlan: obj(
      { id: str(), expectedVersion: int({ minimum: 1 }), versionDestino: int({ minimum: 1 }), opId: str() },
      ["id", "expectedVersion", "versionDestino"],
    ),
    CrearCalendario: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        tipo: str(), ambito: str(), nombre: str(),
        turnos: arr(obj({ clave: str(), inicioMin: int(), finMin: int() }, ["clave", "inicioMin", "finMin"])),
        ventanas: arr(obj({ tipo: str(), desde: str(), hasta: str(), etiqueta: str() }, ["tipo", "desde", "hasta"])),
        exclusiones: arr(obj({ tipo: str(), desde: str(), hasta: str(), etiqueta: str() }, ["tipo", "desde", "hasta"])),
      },
      ["tipo", "ambito", "nombre"],
    ),
    EvaluarGeneracion: obj(
      {
        planId: str(), activoId: str(),
        origen: str({ enum: ["manual", "programada", "frecuencia", "horometro", "odometro", "eventos", "multiple"] }),
        ahora: str(),
        medidores: obj({}, []), eventos: obj({}, []),
        anclaje: obj({ desde: str(), medidoresBase: obj({}, []), eventosBase: obj({}, []) }, ["desde"]),
        ocurrenciaManual: str(), opId: str(),
      },
      ["planId", "activoId", "origen", "ahora", "anclaje"],
    ),
    GenerarOrdenesPreventivas: obj(
      { planId: str(), limite: int({ minimum: 1, maximum: 200 }), tipoOrden: str(), opId: str() },
      ["planId"],
    ),
    CatalogoUpsert: obj(
      { catalogo: str(), clave: str(), etiqueta: str(), posicion: int(), padre: str({ nullable: true }) },
      ["catalogo", "clave", "etiqueta"],
    ),
    CatalogoHabilitar: obj({ catalogo: str(), clave: str(), habilitado: bool() }, ["catalogo", "clave", "habilitado"]),
    OperacionSync: obj({ opId: str(), comando: str(), input: obj({}, []) }, ["opId", "comando", "input"]),
    ColaSync: obj({ operaciones: arr(ref("OperacionSync")) }, ["operaciones"]),
    ResumenSync: obj({
      total: int(), aplicadas: int(), idempotentes: int(), conflictos: int(),
      reintentables: int(), rechazadas: int(), resultados: arr(obj({}, [])),
    }),
    Generacion: obj({
      id: str(), planId: str(), version: int(), activoId: str(), ocurrencia: str(),
      claveDedup: str(), origen: str(), ordenTrabajoId: str({ nullable: true }),
      estado: str({ enum: ["pendiente", "materializada"] }), fechaObjetivo: str(),
    }),
    EstadoRutina: obj({
      planId: str(), codigo: str(), nombre: str(), tipoPlan: str(), prioridad: str(), version: int(),
      vencida: bool(),
      semaforo: str({ enum: ["verde", "amarillo", "rojo", "sin-datos"] }),
      etiqueta: str(),
      faltante: num({ nullable: true }), excedente: num({ nullable: true }),
      meta: str({ nullable: true }), unidad: str({ nullable: true }),
      dominio: str({ enum: ["uso", "temporal", "eventos", "desconocido"] }),
      progreso: num(),
    }, ["planId", "nombre", "vencida", "semaforo", "etiqueta"]),
    EstadoRutinasActivo: obj({
      activoId: str(), ahora: str(), rutinas: arr(ref("EstadoRutina")),
    }, ["activoId", "rutinas"]),
    Consola: obj({
      statsPlanes: obj({}, []), eventLog: obj({}, []), proyecciones: obj({}, []),
      outbox: obj({}, []), receipts: arr(obj({}, [])), tablasRLS: arr(str()),
    }),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- Planes (alta + listado + detalle CQRS) ----
  add(BASE, "get", {
    tags: ["Planes"], operationId: "planes.planes", summary: "Listar planes (read model CQRS) con filtros",
    parameters: [
      ...["estado", "tipoPlan"].map((p) => queryParam(p, `Filtro por ${p}`)),
      { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) },
    ],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(BASE, "post", {
    tags: ["Planes"], operationId: "planes.crear-plan", summary: "Crear plan de mantenimiento (idempotente por id de cliente; gobernado por Workflow Engine)",
    requestBody: jsonBody(ref("CrearPlan")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/{id}`, "get", {
    tags: ["Planes"], operationId: "planes.plan", summary: "Detalle de plan (read model CQRS, snapshot completo)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/{id}`, "put", {
    tags: ["Planes"], operationId: "planes.editar-plan", summary: "Editar plan / crear versión borrador (concurrencia optimista)",
    parameters: [idParam], requestBody: jsonBody(ref("EditarPlan")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/versiones`, "get", {
    tags: ["Planes"], operationId: "planes.comparar-versiones", summary: "Comparar dos versiones del plan",
    parameters: [idParam, queryParam("a", "Versión A"), queryParam("b", "Versión B")],
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Gobierno del ciclo de vida (Workflow Engine) ----
  add(`${BASE}/{id}/publicar`, "post", {
    tags: ["Gobierno"], operationId: "planes.publicar-plan", summary: "Publicar versión borrador (aprobación gobernada)",
    parameters: [idParam], requestBody: jsonBody(ref("PublicarPlan")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/transicion`, "post", {
    tags: ["Gobierno"], operationId: "planes.transicionar-plan",
    summary: "Transición gobernada del ciclo de vida (suspender/reanudar/posponer/extender/cancelar/reprogramar)",
    parameters: [idParam], requestBody: jsonBody(ref("TransicionarPlan")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/archivar`, "post", {
    tags: ["Gobierno"], operationId: "planes.archivar-plan", summary: "Archivar plan (aprobación gobernada)",
    parameters: [idParam], requestBody: jsonBody(ref("ArchivarPlan")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/rollback`, "post", {
    tags: ["Gobierno"], operationId: "planes.rollback-plan", summary: "Rollback a una versión previa (aprobación gobernada)",
    parameters: [idParam], requestBody: jsonBody(ref("RollbackPlan")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/historial`, "get", {
    tags: ["Gobierno"], operationId: "planes.historial", summary: "Historial de hitos del plan (suspensiones/reanudaciones/etc.)",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403", "404") },
  });

  // ---- Calendarios operacionales ----
  add(`${BASE}/calendarios`, "post", {
    tags: ["Calendarios"], operationId: "planes.crear-calendario", summary: "Crear calendario operacional (turnos/ventanas/exclusiones)",
    requestBody: jsonBody(ref("CrearCalendario")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/calendarios/{id}`, "get", {
    tags: ["Calendarios"], operationId: "planes.calendario", summary: "Detalle de calendario operacional",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });

  // ---- Motor de generación (decidir + materializar OT) ----
  add(`${BASE}/{id}/evaluar-generacion`, "post", {
    tags: ["Generación"], operationId: "planes.evaluar-generacion",
    summary: "Evaluar y DECIDIR generación de OT (idempotente por clave de dedup; NO crea la OT)",
    parameters: [idParam], requestBody: jsonBody(ref("EvaluarGeneracion")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/generar-ordenes-preventivas`, "post", {
    tags: ["Generación"], operationId: "planes.generar-ordenes-preventivas",
    summary: "Materializar generaciones decididas en Órdenes de Trabajo REALES componiendo el comando oficial de module-ordenes (idempotente por clave de dedup=opId)",
    parameters: [idParam], requestBody: jsonBody(ref("GenerarOrdenesPreventivas")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/generaciones`, "get", {
    tags: ["Generación"], operationId: "planes.generaciones", summary: "Listar generaciones de OT del plan (read model)",
    parameters: [idParam], responses: { "200": jsonOk(arr(ref("Generacion"))), ...errores("401", "403") },
  });
  // DELTAOPS LITE-08 §3-5: estado operacional de rutinas por uso/tiempo de un activo (consulta pura).
  add(`${BASE}/activos/{activoId}/estado-rutinas`, "get", {
    tags: ["Generación"], operationId: "planes.estado-rutinas",
    summary: "Estado operacional (semáforo + faltante) de las rutinas por uso/tiempo de un activo; medidores leídos server-side",
    parameters: [
      pathParam("activoId", "Identificador del activo"),
      queryParam("ahora", "Instante ISO de evaluación (por defecto, ahora)"),
      queryParam("umbral", "Umbral de proximidad 0..1 (por defecto 0.9)"),
    ],
    responses: { "200": jsonOk(ref("EstadoRutinasActivo")), ...errores("401", "403") },
  });

  // ---- Catálogos ----
  add(`${BASE}/catalogos/{catalogo}`, "get", {
    tags: ["Catálogos"], operationId: "planes.catalogo-opciones", summary: "Opciones habilitadas de un catálogo",
    parameters: [pathParam("catalogo", "Nombre del catálogo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/catalogos`, "post", {
    tags: ["Catálogos"], operationId: "planes.catalogo-upsert", summary: "Alta/edición de entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoUpsert")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/catalogos/habilitar`, "post", {
    tags: ["Catálogos"], operationId: "planes.catalogo-habilitar", summary: "Habilitar/deshabilitar entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoHabilitar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Eventos / reproyección / sync / consola ----
  add(`${BASE}/eventos`, "get", {
    tags: ["Administración"], operationId: "planes.eventos", summary: "Bitácora de eventos durable del tenant (replay)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/reproyectar`, "post", {
    tags: ["Administración"], operationId: "planes.reproyectar",
    summary: "Reproyección por replay del event log durable (admin)",
    responses: { "200": jsonOk(obj({ reproyectados: int() }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/sync`, "post", {
    tags: ["Sincronización"], operationId: "planes.sync",
    summary: "Sincronización offline por orquestación (idempotente por opId)",
    requestBody: jsonBody(ref("ColaSync")),
    responses: { "200": jsonOk(ref("ResumenSync")), ...errores("400", "401", "403") },
  });
  add(`${BASE}/consola`, "get", {
    tags: ["Administración"], operationId: "planes.consola", summary: "Consola técnica (admin)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(ref("Consola")), ...errores("401", "403") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Módulo Enterprise Maintenance Plans (DGP-012)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Planes" }, { name: "Gobierno" }, { name: "Calendarios" },
      { name: "Generación" }, { name: "Catálogos" },
      { name: "Sincronización" }, { name: "Administración" },
    ],
    paths,
    components: { schemas },
  };
}

/** Serialización canónica (2 espacios + newline final) para diffs estables. */
export function serializarOpenApi(): string {
  return `${JSON.stringify(construirOpenApi(), null, 2)}\n`;
}
