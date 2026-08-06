/**
 * DGP-014.2 · Módulo Enterprise Preventive Maintenance — Contrato OpenAPI 3
 * (contract-first) VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin
 * imports del workspace) para ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/preventivo`:
 * programas preventivos (alta/edición/gobierno de ciclo por Workflow Engine,
 * versionado/reversión), actividades, generación de OTs (compone el comando
 * oficial `modulo.ordenes.crear` con idempotencia determinista por generación),
 * programaciones (reprogramar/suspender/excluir), lecturas CQRS (detalle/listado/
 * versiones/generaciones/programaciones desde read models), catálogos, eventos,
 * reproyección (replay), sincronización offline y consola técnica. Incluye el
 * mapeo de errores kernel→HTTP (AUTH→403, NF→404, CFL→409, VAL→400, INF→500).
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera CADA comando/consulta del módulo.
 */

const BASE = "/api/deltaops/preventivo";

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
    "409": "Conflicto de concurrencia/duplicado/configuración (KRN-CFL)",
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
  const referenciaPlan = obj({ planId: str(), version: int({ minimum: 1 }) }, ["planId", "version"]);
  const vigencia = obj({ desde: str(), hasta: str({ nullable: true }) }, ["desde"]);
  const sla = obj({}, []);
  const checklist = obj({ plantillaId: str(), version: int({ minimum: 1 }) }, ["plantillaId", "version"]);
  const tiempo = obj({ valor: num({ minimum: 0 }), unidad: str() }, ["valor", "unidad"]);

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    ResultadoComando: obj({ id: str(), codigo: str(), estado: str(), version: int(), idempotente: bool() }),
    ReferenciaPlan: referenciaPlan,
    Vigencia: vigencia,
    Checklist: checklist,
    CrearPrograma: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        codigo: str({ nullable: true }), nombre: str(), descripcion: str({ nullable: true }),
        tipo: str(), clasificacion: str({ nullable: true }), padreId: str({ nullable: true }),
        planes: arr(referenciaPlan), activos: arr(str()), vigencia, sla: { ...sla, nullable: true },
      },
      ["nombre", "tipo"],
    ),
    EditarPrograma: obj(
      {
        id: str(), expectedVersion: int({ minimum: 1 }), opId: str(),
        nombre: str(), descripcion: str({ nullable: true }),
        planes: arr(referenciaPlan), activos: arr(str()), vigencia, sla: { ...sla, nullable: true },
      },
      ["id", "expectedVersion"],
    ),
    TransicionarPrograma: obj(
      {
        id: str(), accion: str({ description: "enviarRevision|publicar|suspender|reanudar|archivar" }),
        expectedVersion: int({ minimum: 1 }), opId: str(),
      },
      ["id", "accion", "expectedVersion"],
    ),
    VersionarPrograma: obj(
      {
        id: str(), expectedVersion: int({ minimum: 1 }), opId: str(),
        nombre: str(), descripcion: str({ nullable: true }),
        planes: arr(referenciaPlan), activos: arr(str()), vigencia, sla: { ...sla, nullable: true },
      },
      ["id", "expectedVersion"],
    ),
    RevertirPrograma: obj(
      { id: str(), expectedVersion: int({ minimum: 1 }), haciaVersion: int({ minimum: 1 }), opId: str() },
      ["id", "expectedVersion", "haciaVersion"],
    ),
    DefinirActividad: obj(
      {
        id: str({ format: "uuid" }), opId: str(), programaId: str(),
        nombre: str(), descripcion: str({ nullable: true }), orden: int({ minimum: 0 }),
        dependencias: arr(str()), checklist, recursos: obj({}, []), tiempoEstimado: tiempo,
        moneda: str(), sla: { ...sla, nullable: true },
      },
      ["programaId", "nombre", "orden", "checklist", "tiempoEstimado", "moneda"],
    ),
    Generar: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        programaId: str(), actividadId: str(), activoId: str(),
        ventana: str(), origen: str(), fechaObjetivo: str(), corresponde: bool(),
      },
      ["programaId", "actividadId", "activoId", "ventana", "origen", "fechaObjetivo"],
    ),
    Reprogramar: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        programaId: str(), actividadId: str({ nullable: true }), activoId: str({ nullable: true }),
        fechaOriginal: str(), fechaNueva: str(), motivo: str(),
      },
      ["programaId", "fechaOriginal", "fechaNueva", "motivo"],
    ),
    Suspender: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        programaId: str(), ambito: str({ description: "programa|actividad|activo" }), sujetoId: str(),
        actividadId: str({ nullable: true }), activoId: str({ nullable: true }),
        motivo: str(), desde: str(), hasta: str({ nullable: true }),
      },
      ["programaId", "ambito", "sujetoId", "motivo", "desde"],
    ),
    Excluir: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        programaId: str(), desde: str(), hasta: str(), activos: arr(str()), motivo: str(),
      },
      ["programaId", "desde", "hasta", "motivo"],
    ),
    CatalogoUpsert: obj(
      { catalogo: str(), clave: str(), etiqueta: str(), habilitado: bool(), datos: obj({}, []) },
      ["catalogo", "clave"],
    ),
    CatalogoHabilitar: obj({ catalogo: str(), clave: str(), habilitado: bool() }, ["catalogo", "clave", "habilitado"]),
    OperacionSync: obj({ opId: str(), comando: str(), input: obj({}, []) }, ["opId", "comando", "input"]),
    ColaSync: arr(ref("OperacionSync")),
    ResumenSync: obj(
      {
        total: int(), aplicadas: int(), idempotentes: int(), conflictos: int(),
        reintentables: int(), rechazadas: int(), resultados: arr(obj({}, [])),
      },
      [],
    ),
    Consola: obj(
      { total: int(), eventos: arr(obj({}, [])), tablasRLS: arr(str()) },
      [],
    ),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- Programas ----
  add(`${BASE}/programas`, "get", {
    tags: ["Programas"], operationId: "preventivo.programas", summary: "Listar programas preventivos (read model CQRS)",
    parameters: [...["estado", "tipo"].map((p) => queryParam(p, `Filtro por ${p}`)), { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/programas`, "post", {
    tags: ["Programas"], operationId: "preventivo.crear-programa", summary: "Crear programa preventivo (idempotente por id de cliente)",
    requestBody: jsonBody(ref("CrearPrograma")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/programas/{id}`, "get", {
    tags: ["Programas"], operationId: "preventivo.programa", summary: "Detalle de programa (read model CQRS, snapshot completo)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/programas/{id}`, "put", {
    tags: ["Programas"], operationId: "preventivo.editar-programa", summary: "Editar programa (concurrencia optimista por expectedVersion)",
    parameters: [idParam], requestBody: jsonBody(ref("EditarPrograma")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/programas/{id}/transicion`, "post", {
    tags: ["Programas"], operationId: "preventivo.transicionar-programa",
    summary: "Transición gobernada del ciclo del programa (enviarRevision/publicar/suspender/reanudar/archivar) vía Workflow Engine",
    parameters: [idParam], requestBody: jsonBody(ref("TransicionarPrograma")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/programas/{id}/versionar`, "post", {
    tags: ["Programas"], operationId: "preventivo.versionar-programa",
    summary: "Crear nueva versión del programa (archiva la anterior en prv_programa_versiones_read)",
    parameters: [idParam], requestBody: jsonBody(ref("VersionarPrograma")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/programas/{id}/revertir`, "post", {
    tags: ["Programas"], operationId: "preventivo.revertir-programa",
    summary: "Revertir el programa a una versión previa (concurrencia optimista)",
    parameters: [idParam], requestBody: jsonBody(ref("RevertirPrograma")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/programas/{id}/actividades`, "get", {
    tags: ["Actividades"], operationId: "preventivo.actividades", summary: "Actividades de un programa (read model CQRS)",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/programas/{id}/versiones`, "get", {
    tags: ["Programas"], operationId: "preventivo.versiones", summary: "Versiones archivadas de un programa (read model CQRS)",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/programas/{id}/generaciones`, "get", {
    tags: ["Generación"], operationId: "preventivo.generaciones", summary: "Generaciones de OT de un programa (read model CQRS)",
    parameters: [idParam, queryParam("estado", "Filtro por estado (pendiente|materializada)"), { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/programas/{id}/programaciones`, "get", {
    tags: ["Programaciones"], operationId: "preventivo.programaciones",
    summary: "Calendario de programaciones (reprogramaciones/suspensiones/exclusiones, append-only)",
    parameters: [idParam, { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403", "409") },
  });

  // ---- Actividades ----
  add(`${BASE}/actividades`, "post", {
    tags: ["Actividades"], operationId: "preventivo.definir-actividad", summary: "Definir actividad de un programa (idempotente por id de cliente)",
    requestBody: jsonBody(ref("DefinirActividad")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creada"), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Generación de OTs (compone modulo.ordenes.crear) ----
  add(`${BASE}/generar`, "post", {
    tags: ["Generación"], operationId: "preventivo.generar",
    summary: "Generar OT preventiva componiendo el comando oficial modulo.ordenes.crear (idempotente por opId=claveDedup; id de OT derivado de la generación)",
    requestBody: jsonBody(ref("Generar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Programaciones ----
  add(`${BASE}/reprogramar`, "post", {
    tags: ["Programaciones"], operationId: "preventivo.reprogramar", summary: "Registrar reprogramación (valida catálogo motivos-reprogramacion)",
    requestBody: jsonBody(ref("Reprogramar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/suspender`, "post", {
    tags: ["Programaciones"], operationId: "preventivo.suspender", summary: "Registrar suspensión por ámbito (valida catálogo motivos-suspension)",
    requestBody: jsonBody(ref("Suspender")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/excluir`, "post", {
    tags: ["Programaciones"], operationId: "preventivo.excluir", summary: "Registrar exclusión de ventana/activos (valida catálogo motivos-exclusion)",
    requestBody: jsonBody(ref("Excluir")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Catálogos ----
  add(`${BASE}/catalogos/{catalogo}`, "get", {
    tags: ["Catálogos"], operationId: "preventivo.catalogo-opciones", summary: "Opciones habilitadas de un catálogo",
    parameters: [pathParam("catalogo", "Nombre del catálogo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/catalogos`, "post", {
    tags: ["Catálogos"], operationId: "preventivo.catalogo-upsert", summary: "Alta/edición de entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoUpsert")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/catalogos/habilitar`, "post", {
    tags: ["Catálogos"], operationId: "preventivo.catalogo-habilitar", summary: "Habilitar/deshabilitar entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoHabilitar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Eventos / reproyección / sync / consola ----
  add(`${BASE}/eventos`, "get", {
    tags: ["Administración"], operationId: "preventivo.eventos", summary: "Bitácora de eventos durable del tenant (replay)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/reproyectar`, "post", {
    tags: ["Administración"], operationId: "preventivo.reproyectar",
    summary: "Reproyección por replay del event log durable (admin)",
    responses: { "200": jsonOk(obj({ reproyectados: int() }, [])), ...errores("401", "403", "409") },
  });
  add(`${BASE}/sync`, "post", {
    tags: ["Sincronización"], operationId: "preventivo.sync",
    summary: "Sincronización offline por orquestación (idempotente por opId)",
    requestBody: jsonBody(ref("ColaSync")),
    responses: { "200": jsonOk(ref("ResumenSync")), ...errores("400", "401", "403") },
  });
  add(`${BASE}/consola`, "get", {
    tags: ["Administración"], operationId: "preventivo.consola", summary: "Consola técnica del outbox del módulo (admin)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(ref("Consola")), ...errores("401", "403", "409") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Módulo Enterprise Preventive Maintenance (DGP-014)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Programas" }, { name: "Actividades" }, { name: "Generación" },
      { name: "Programaciones" }, { name: "Catálogos" }, { name: "Sincronización" },
      { name: "Administración" },
    ],
    paths,
    components: { schemas },
  };
}

/** Serialización canónica (2 espacios + newline final) para diffs estables. */
export function serializarOpenApi(): string {
  return `${JSON.stringify(construirOpenApi(), null, 2)}\n`;
}
