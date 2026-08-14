/**
 * DGP-009.2 · Módulo Órdenes de Trabajo — Contrato OpenAPI 3 (contract-first)
 * VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin imports del
 * workspace) para poder ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/ordenes`:
 * CRUD + ciclo de vida (transiciones), ejecución, formularios/checklists,
 * evidencias, planificación/agenda/calendario, asignaciones, recursos, SLA,
 * relaciones (dependencias/activos-relacionados), bitácora operacional, lecturas
 * CQRS (listado/detalle/historial/responsables/documentación), catálogos,
 * reproyección (replay), sincronización offline y consola técnica. Incluye el
 * mapeo de errores kernel→HTTP (AUTH→403, NF→404, CFL→409, VAL→400, INF→500).
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera CADA comando/consulta del módulo.
 */

const BASE = "/api/deltaops/ordenes";

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

const idParam: Schema = { name: "id", in: "path", required: true, schema: str(), description: "Identificador de la OT" };
const pathParam = (name: string, description: string): Schema => ({ name, in: "path", required: true, schema: str(), description });
const queryParam = (name: string, description: string): Schema => ({ name, in: "query", required: false, schema: str(), description });

export function construirOpenApi(): Record<string, unknown> {
  const acciones = ["inicio", "pausa", "reanudacion", "espera", "cambio-responsable", "llegada", "salida", "finalizacion"];
  const tiposAsignacion = ["persona", "grupo", "cuadrilla", "contratista"];
  const clasesRecurso = ["herramienta", "material", "epp", "vehiculo", "equipo-auxiliar"];
  const categoriasRelacion = ["activo", "orden", "formulario", "checklist", "evidencia", "recurso"];

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    ResultadoComando: obj({ id: str(), codigo: str(), estado: str(), version: int(), idempotente: bool() }),
    CrearOrden: obj(
      {
        id: str({ format: "uuid" }),
        titulo: str(), tipo: str(), categoria: str(), prioridad: str(), severidad: str(),
        descripcion: str(), responsable: str(), supervisor: str(),
        activoPrincipal: obj({ activoId: str(), entityRef: str(), etiqueta: str(), rol: str() }, ["activoId", "entityRef", "rol"]),
        ubicacion: obj({ ubicacionId: str(), etiqueta: str(), detalle: str() }, ["ubicacionId", "etiqueta"]),
        opId: str(),
      },
      ["titulo", "tipo"],
    ),
    EditarOrden: obj({ id: str(), expectedVersion: int({ minimum: 1 }), titulo: str(), descripcion: str(), prioridad: str(), severidad: str() }, ["id", "expectedVersion"]),
    Transicionar: obj({ id: str(), comando: str(), aprobado: bool(), opId: str() }, ["id", "comando"]),
    AprobarCierre: obj(
      { id: str(), transicion: str(), decision: str({ enum: ["aprobar", "rechazar"] }), motivo: str(), opId: str() },
      ["decision"],
    ),
    Asignar: obj({ id: str(), expectedVersion: int({ minimum: 1 }), responsable: str({ nullable: true }), supervisor: str({ nullable: true }), opId: str() }, ["id", "expectedVersion"]),
    RegistrarEjecucion: obj({ id: str(), expectedVersion: int({ minimum: 1 }), diagnostico: obj({}, []), opId: str() }, ["id", "expectedVersion"]),
    PlantillaRef: obj(
      { servicio: str(), clave: str(), version: int({ minimum: 1 }), etiqueta: str() },
      ["clave", "version"],
    ),
    AsociarPlantilla: obj(
      { id: str(), expectedVersion: int({ minimum: 1 }), plantilla: ref("PlantillaRef"), respuestaId: str({ nullable: true }), opId: str() },
      ["id", "expectedVersion", "plantilla"],
    ),
    Evidencia: obj(
      {
        attachmentId: str(),
        nombreArchivo: str(),
        mimeType: str(),
        tamanoBytes: int({ minimum: 0 }),
        hashSha256: str({ minLength: 64, maxLength: 64 }),
        etapa: str(),
        descripcion: str(),
      },
      ["attachmentId", "nombreArchivo", "mimeType", "tamanoBytes", "hashSha256"],
    ),
    AgregarEvidencia: obj(
      { id: str(), expectedVersion: int({ minimum: 1 }), evidencia: ref("Evidencia"), opId: str() },
      ["id", "expectedVersion", "evidencia"],
    ),
    RegistrarDocumentacion: obj(
      {
        categoria: str(),
        nombreArchivo: str(),
        mimeType: str(),
        tamanoBytes: int({ minimum: 0 }),
        hashSha256: str({ minLength: 64, maxLength: 64 }),
        expectedVersion: int({ minimum: 1 }),
        opId: str(),
      },
      ["categoria", "nombreArchivo", "mimeType", "tamanoBytes", "hashSha256", "expectedVersion"],
    ),
    DocumentacionUrl: obj(
      {
        attachmentId: str(),
        url: str(),
        expiresAt: int(),
        nombreArchivo: str({ nullable: true }),
        mimeType: str({ nullable: true }),
        tamanoBytes: int({ nullable: true }),
        hashSha256: str({ nullable: true }),
      },
      ["attachmentId", "url", "expiresAt"],
    ),
    PlantillaDefinicion: obj(
      {
        clave: str(),
        version: int({ minimum: 1 }),
        titulo: str(),
        definicion: { type: "object", additionalProperties: true, nullable: true } as Schema,
      },
      ["clave", "version", "titulo"],
    ),
    CapturaRespuesta: obj(
      {
        clave: str(),
        version: int({ minimum: 1 }),
        etiqueta: str(),
        datos: { type: "object", additionalProperties: true } as Schema,
        opId: str(),
      },
      ["clave", "version", "datos", "opId"],
    ),
    Planificar: obj(
      {
        ordenId: str(),
        inicioPlanificado: str({ format: "date-time", nullable: true }),
        finPlanificado: str({ format: "date-time", nullable: true }),
        ventanaInicio: str({ format: "date-time", nullable: true }),
        ventanaFin: str({ format: "date-time", nullable: true }),
        bloquear: bool(), bloqueoMotivo: str({ nullable: true }), opId: str(),
      },
      ["ordenId"],
    ),
    AsignarRecursoHumano: obj(
      { ordenId: str(), tipo: str({ enum: tiposAsignacion }), asignadoId: str(), rol: str({ nullable: true }), reemplazaVigentes: bool(), id: str(), opId: str() },
      ["ordenId", "tipo", "asignadoId"],
    ),
    RegistrarRecurso: obj(
      { ordenId: str(), clase: str({ enum: clasesRecurso }), referenciaId: str(), descripcion: str({ nullable: true }), cantidad: num({ nullable: true }), unidad: str({ nullable: true }), id: str(), opId: str() },
      ["ordenId", "clase", "referenciaId"],
    ),
    DefinirSla: obj(
      { ordenId: str(), politica: str({ nullable: true }), minutosObjetivo: int({ minimum: 1, nullable: true }), inicioAt: str({ format: "date-time" }), suspender: bool(), reanudar: bool(), opId: str() },
      ["ordenId"],
    ),
    CrearRelacion: obj(
      { ordenId: str(), categoria: str({ enum: categoriasRelacion }), tipo: str(), destinoId: str(), destinoCodigo: str({ nullable: true }), destinoNombre: str({ nullable: true }), id: str(), opId: str() },
      ["ordenId", "categoria", "tipo", "destinoId"],
    ),
    RegistrarBitacora: obj(
      { ordenId: str(), accion: str({ enum: acciones }), detalle: obj({}, []), ocurridoAt: str({ format: "date-time" }), opId: str() },
      ["ordenId", "accion"],
    ),
    CatalogoUpsert: obj({ catalogo: str(), clave: str(), etiqueta: str(), posicion: int(), padre: str({ nullable: true }) }, ["catalogo", "clave", "etiqueta"]),
    CatalogoHabilitar: obj({ catalogo: str(), clave: str(), habilitado: bool() }, ["catalogo", "clave", "habilitado"]),
    OperacionSync: obj({ opId: str(), comando: str(), input: obj({}, []) }, ["opId", "comando", "input"]),
    ColaSync: obj({ operaciones: arr(ref("OperacionSync")) }, ["operaciones"]),
    ResumenSync: obj({
      total: int(), aplicadas: int(), idempotentes: int(), conflictos: int(),
      reintentables: int(), rechazadas: int(), resultados: arr(obj({}, [])),
    }),
    Consola: obj({
      modulo: str(), version: str(), eventos: arr(str()), catalogos: arr(str()),
      readModels: obj({}, []), eventLog: obj({}, []), outbox: obj({}, []),
      sincronizacion: obj({}, []), rls: obj({}, []),
    }),
    // DGP-020.2 — Sesiones de trabajo. `identityId` y `activoId` NUNCA se envían
    // (se derivan del contexto autenticado y de la OT); `ocurridoAt` es device-time.
    ComandoSesion: obj(
      {
        sesionId: str({ description: "Opcional; sólo en abrir para idempotencia de cliente" }),
        ocurridoAt: str({ format: "date-time", description: "Instante en el dispositivo (device-time); nunca se reemplaza" }),
        origen: str({ enum: ["online", "offline"] }),
        opId: str(),
      },
      [],
    ),
    ResultadoSesion: obj(
      {
        sesionId: str(), ordenId: str(), activoId: str({ nullable: true }), identityId: str(),
        estado: str({ enum: ["ABIERTA", "PAUSADA", "CERRADA"] }),
        ocurridoAt: str({ format: "date-time" }),
        anomaliaReloj: obj({}, []),
        idempotente: bool(),
      },
      ["sesionId", "ordenId", "identityId", "estado"],
    ),
    Duraciones: obj(
      {
        sesionId: str(), ordenId: str(), activoId: str({ nullable: true }), identityId: str(),
        estado: str(), efectivoMs: int({ minimum: 0 }), pausadoMs: int({ minimum: 0 }),
        transcurridoMs: int({ minimum: 0 }), pausas: int({ minimum: 0 }), abierta: bool(),
        iniciadoAt: str({ format: "date-time" }), cerradoAt: str({ format: "date-time", nullable: true }),
      },
      [],
    ),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- CRUD + listado + detalle ----
  add(BASE, "get", {
    tags: ["Órdenes"], operationId: "ordenes.listar",
    summary: "Listar órdenes (read model CQRS) con filtros",
    parameters: [
      ...["estado", "tipo", "responsable", "activoPrincipalId"].map((p) => queryParam(p, `Filtro por ${p}`)),
      { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }), description: "Tamaño de página" },
    ],
    responses: { "200": jsonOk(obj({ ordenes: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(BASE, "post", {
    tags: ["Órdenes"], operationId: "ordenes.crear", summary: "Crear OT (idempotente por id de cliente)",
    requestBody: jsonBody(ref("CrearOrden")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creada"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/{id}`, "get", {
    tags: ["Órdenes"], operationId: "ordenes.detalle", summary: "Detalle de la OT (read model CQRS)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/{id}`, "put", {
    tags: ["Órdenes"], operationId: "ordenes.editar", summary: "Editar OT (concurrencia optimista)",
    parameters: [idParam], requestBody: jsonBody(ref("EditarOrden")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Ciclo de vida / operación ----
  add(`${BASE}/{id}/transicionar`, "post", {
    tags: ["Ciclo de vida"], operationId: "ordenes.transicionar", summary: "Transición de estado (Workflow Engine)",
    parameters: [idParam], requestBody: jsonBody(ref("Transicionar")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/aprobar-cierre`, "post", {
    tags: ["Ciclo de vida"], operationId: "ordenes.aprobarCierre", summary: "Aprobar (o rechazar) el cierre gobernado",
    parameters: [idParam], requestBody: jsonBody(ref("AprobarCierre")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/asignar`, "post", {
    tags: ["Ciclo de vida"], operationId: "ordenes.asignar", summary: "Asignar responsable/supervisor del aggregate",
    parameters: [idParam], requestBody: jsonBody(ref("Asignar")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/ejecucion`, "post", {
    tags: ["Ciclo de vida"], operationId: "ordenes.registrarEjecucion", summary: "Registrar ejecución (diagnóstico/tiempos/costos)",
    parameters: [idParam], requestBody: jsonBody(ref("RegistrarEjecucion")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Formularios / checklists / evidencias ----
  add(`${BASE}/{id}/formulario`, "post", {
    tags: ["Documentación"], operationId: "ordenes.asociarFormulario", summary: "Asociar formulario (Dynamic Forms)",
    parameters: [idParam], requestBody: jsonBody(ref("AsociarPlantilla")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/checklist`, "post", {
    tags: ["Documentación"], operationId: "ordenes.asociarChecklist", summary: "Asociar checklist (Dynamic Forms)",
    parameters: [idParam], requestBody: jsonBody(ref("AsociarPlantilla")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/{clase}/respuesta`, "post", {
    tags: ["Documentación"],
    operationId: "ordenes.capturarRespuesta",
    summary: "Capturar respuesta de un formulario/checklist asociado (comando orquestador, idempotente y offline)",
    description:
      "Comando único `modulo.ordenes.capturarRespuesta`: compone en el servidor respuesta.guardarBorrador (anclada a clave+versión exacta) → respuesta.enviar (validación completa) → asociación a la OT re-leyendo su versión ACTUAL. Idempotente por opId y RECUPERABLE (los reintentos —incl. replay por /sync desde la cola offline— convergen al mismo resultado, sin duplicar ni dejar respuestas huérfanas). La respuesta queda ANCLADA a la asociación/plantilla/versión concreta.",
    parameters: [idParam, pathParam("clase", "Clase de plantilla: formulario | checklist")],
    requestBody: jsonBody(ref("CapturaRespuesta")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/evidencias`, "post", {
    tags: ["Documentación"], operationId: "ordenes.agregarEvidencia", summary: "Agregar evidencia (platform.attachment, referencia-only)",
    parameters: [idParam], requestBody: jsonBody(ref("AgregarEvidencia")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404") },
  });
  add(`${BASE}/{id}/documentacion`, "get", {
    tags: ["Documentación"], operationId: "ordenes.documentacion", summary: "Documentación de la OT (formularios/checklists/evidencias)",
    parameters: [idParam, queryParam("clase", "Filtro por clase de documento")],
    responses: { "200": jsonOk(obj({ documentacion: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/documentacion`, "post", {
    tags: ["Documentación"],
    operationId: "ordenes.registrarDocumentacion",
    summary: "Registrar evidencia por referencia (platform.attachment.register + agregarEvidencia)",
    description:
      "Registra el adjunto en el Attachment Service de plataforma (referencia-only: metadatos + hash, NUNCA el binario) obteniendo un attachmentId, y luego agrega la evidencia a la OT anclada a su versión (control de concurrencia).",
    parameters: [idParam], requestBody: jsonBody(ref("RegistrarDocumentacion")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/documentacion/{attachmentId}/url`, "get", {
    tags: ["Documentación"],
    operationId: "ordenes.documentacionUrl",
    summary: "URL firmada + metadatos de una evidencia (verificación de referencia)",
    description:
      "Devuelve la URL firmada (HMAC + caducidad) y los metadatos verificables del adjunto. El binario NUNCA se expone por esta vía; sirve para verificar la referencia.",
    parameters: [idParam, pathParam("attachmentId", "Identificador del adjunto en plataforma")],
    responses: { "200": jsonOk(ref("DocumentacionUrl")), ...errores("401", "403", "404") },
  });
  add(`${BASE}/plantillas/{clave}/{version}`, "get", {
    tags: ["Documentación"],
    operationId: "ordenes.plantillaDefinicion",
    summary: "Definición de una plantilla de Dynamic Forms (clave + versión exacta)",
    description:
      "Proxy de sólo lectura a modulo.formularios.plantilla.obtener. Devuelve la definición renderizable y metadatos de la plantilla asociada, para capturar su resultado durante la ejecución (respuesta anclada a clave+versión).",
    parameters: [pathParam("clave", "Clave de la plantilla"), pathParam("version", "Versión exacta de la plantilla")],
    responses: { "200": jsonOk(ref("PlantillaDefinicion")), ...errores("400", "401", "403", "404") },
  });
  add(`${BASE}/{id}/formularios`, "get", {
    tags: ["Documentación"], operationId: "ordenes.formularios", summary: "Formularios asociados",
    parameters: [idParam], responses: { "200": jsonOk(obj({ formularios: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/checklists`, "get", {
    tags: ["Documentación"], operationId: "ordenes.checklists", summary: "Checklists asociados",
    parameters: [idParam], responses: { "200": jsonOk(obj({ checklists: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });

  // ---- Planificación / agenda / calendario ----
  add(`${BASE}/{id}/planificar`, "post", {
    tags: ["Planificación"], operationId: "ordenes.planificar", summary: "Programar/reprogramar/bloquear planificación (detecta conflictos)",
    parameters: [idParam], requestBody: jsonBody(ref("Planificar")),
    responses: { "200": jsonOk(obj({ ordenId: str(), estado: str(), enConflicto: bool(), version: int() }, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/agenda`, "get", {
    tags: ["Planificación"], operationId: "ordenes.agenda", summary: "Agenda (read model) por rango",
    parameters: [queryParam("desde", "Rango inicial (ISO-8601)"), queryParam("hasta", "Rango final (ISO-8601)"), { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 1000 }) }],
    responses: { "200": jsonOk(obj({ entradas: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/calendario`, "get", {
    tags: ["Planificación"], operationId: "ordenes.calendario", summary: "Calendario (agrupado por día) por rango",
    parameters: [
      { name: "desde", in: "query", required: true, schema: str({ format: "date-time" }), description: "Rango inicial" },
      { name: "hasta", in: "query", required: true, schema: str({ format: "date-time" }), description: "Rango final" },
    ],
    responses: { "200": jsonOk(obj({ dias: obj({}, []) }, [])), ...errores("400", "401", "403") },
  });

  // ---- Asignaciones / responsables / recursos ----
  add(`${BASE}/{id}/asignar-recurso-humano`, "post", {
    tags: ["Asignaciones"], operationId: "ordenes.asignar-recurso-humano", summary: "Asignar persona/grupo/cuadrilla/contratista",
    parameters: [idParam], requestBody: jsonBody(ref("AsignarRecursoHumano")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });
  add(`${BASE}/{id}/asignaciones`, "get", {
    tags: ["Asignaciones"], operationId: "ordenes.asignaciones", summary: "Asignaciones (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({ asignaciones: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/responsables`, "get", {
    tags: ["Asignaciones"], operationId: "ordenes.responsables", summary: "Histórico de responsables (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({ responsables: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/identidades-elegibles`, "get", {
    tags: ["Asignaciones"], operationId: "ordenes.identidades-elegibles",
    summary: "Identidades canónicas elegibles del tenant (selector de asignación)",
    parameters: [{ name: "q", in: "query", required: false, schema: { type: "string" } }],
    responses: {
      "200": jsonOk(obj({ identidades: arr(obj({
        identityId: { type: "string" }, nombre: { type: "string" }, email: { type: "string" },
        rol: { type: "string" }, estadoMembresia: { type: "string" },
      }, ["identityId", "nombre", "email", "rol", "estadoMembresia"])) }, ["identidades"])),
      ...errores("401", "403"),
    },
  });
  add(`${BASE}/{id}/recursos`, "post", {
    tags: ["Recursos"], operationId: "ordenes.registrar-recurso", summary: "Registrar recurso (referencia-only, sin inventario)",
    parameters: [idParam], requestBody: jsonBody(ref("RegistrarRecurso")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- SLA ----
  add(`${BASE}/{id}/sla`, "post", {
    tags: ["SLA"], operationId: "ordenes.sla.definir", summary: "Configurar/pausar/reanudar SLA (configurable por tenant)",
    parameters: [idParam], requestBody: jsonBody(ref("DefinirSla")),
    responses: { "200": jsonOk(obj({ ordenId: str(), estado: str(), minutosRestantes: int({ nullable: true }), version: int() }, [])), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Relaciones / dependencias / activos relacionados ----
  add(`${BASE}/{id}/relaciones`, "post", {
    tags: ["Relaciones"], operationId: "ordenes.crear-relacion", summary: "Crear relación (OT↔OT/activo/documento)",
    parameters: [idParam], requestBody: jsonBody(ref("CrearRelacion")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/relaciones`, "get", {
    tags: ["Relaciones"], operationId: "ordenes.relaciones", summary: "Relaciones de la OT (read model)",
    parameters: [idParam, queryParam("categoria", "Categoría de relación")],
    responses: { "200": jsonOk(obj({ relaciones: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/activos-relacionados`, "get", {
    tags: ["Relaciones"], operationId: "ordenes.activos-relacionados", summary: "Activos relacionados con la OT",
    parameters: [idParam], responses: { "200": jsonOk(obj({ activos: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/dependencias`, "get", {
    tags: ["Relaciones"], operationId: "ordenes.dependencias", summary: "Dependencias entre órdenes (OT↔OT)",
    parameters: [idParam], responses: { "200": jsonOk(obj({ dependencias: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });

  // ---- Bitácora operacional / historial ----
  add(`${BASE}/{id}/bitacora`, "post", {
    tags: ["Bitácora"], operationId: "ordenes.bitacora.registrar",
    summary: "Registrar acción de bitácora (inicio/pausa/reanudación/espera/cambio-responsable/llegada/salida/finalización)",
    parameters: [idParam], requestBody: jsonBody(ref("RegistrarBitacora")),
    responses: { "200": jsonOk(obj({ ordenId: str(), accion: str(), ocurridoAt: str({ format: "date-time" }), idempotente: bool() }, [])), ...errores("400", "401", "403", "404") },
  });
  add(`${BASE}/{id}/bitacora`, "get", {
    tags: ["Bitácora"], operationId: "ordenes.bitacora", summary: "Bitácora operacional (read model)",
    parameters: [idParam, { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(obj({ bitacora: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/historial`, "get", {
    tags: ["Bitácora"], operationId: "ordenes.historial", summary: "Historial cronológico (read model)",
    parameters: [idParam, { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(obj({ historial: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });

  // ---- Catálogos ----
  add(`${BASE}/catalogos/{catalogo}`, "get", {
    tags: ["Catálogos"], operationId: "ordenes.catalogo.opciones", summary: "Opciones habilitadas de un catálogo",
    parameters: [pathParam("catalogo", "Nombre del catálogo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/catalogos`, "post", {
    tags: ["Catálogos"], operationId: "ordenes.catalogo.upsert", summary: "Alta/edición de entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoUpsert")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/catalogos/habilitar`, "post", {
    tags: ["Catálogos"], operationId: "ordenes.catalogo.habilitar", summary: "Habilitar/deshabilitar entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoHabilitar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Sesiones de trabajo (DGP-020.2) ----
  const sesionOp = (accion: "abrir" | "pausar" | "reanudar" | "cerrar", resumen: string): Record<string, unknown> => ({
    tags: ["Sesiones"], operationId: `ordenes.sesion.${accion}`, summary: resumen,
    description:
      "El identityId proviene SIEMPRE del contexto autenticado (nunca del cuerpo); el activoId se deriva de la OT. " +
      "La duración se calcula EXCLUSIVAMENTE desde los tramos append-only. Idempotente por opId; despachable por /sync offline.",
    parameters: [idParam], requestBody: jsonBody(ref("ComandoSesion")),
    responses: { "200": jsonOk(ref("ResultadoSesion")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/sesion/abrir`, "post", sesionOp("abrir", "Abrir sesión de trabajo (primer tramo de trabajo)"));
  add(`${BASE}/{id}/sesion/pausar`, "post", sesionOp("pausar", "Pausar la sesión de trabajo abierta"));
  add(`${BASE}/{id}/sesion/reanudar`, "post", sesionOp("reanudar", "Reanudar la sesión de trabajo pausada"));
  add(`${BASE}/{id}/sesion/cerrar`, "post", sesionOp("cerrar", "Cerrar la sesión de trabajo (estado final, sin reapertura)"));
  add(`${BASE}/{id}/sesion/activa`, "get", {
    tags: ["Sesiones"], operationId: "ordenes.sesion.activa", summary: "Sesión activa (no cerrada) de la OT (read model)",
    parameters: [idParam, queryParam("identityId", "Filtrar por identidad (opcional)")],
    responses: { "200": jsonOk(obj({ sesion: obj({}, []) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/sesiones`, "get", {
    tags: ["Sesiones"], operationId: "ordenes.sesiones", summary: "Listar sesiones por OT/identidad/activo (read model)",
    parameters: [queryParam("ordenId", "Filtrar por OT"), queryParam("identityId", "Filtrar por identidad"), queryParam("activoId", "Filtrar por activo")],
    responses: { "200": jsonOk(obj({ sesiones: arr(obj({}, [])) }, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/sesiones/{sesionId}/tramos`, "get", {
    tags: ["Sesiones"], operationId: "ordenes.sesion.tramos", summary: "Tramos append-only de una sesión (read model)",
    parameters: [pathParam("sesionId", "Identificador de la sesión")],
    responses: { "200": jsonOk(obj({ tramos: arr(obj({}, [])) }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/sesiones/duraciones`, "get", {
    tags: ["Sesiones"], operationId: "ordenes.sesion.duraciones",
    summary: "Duraciones (efectivo/pausado/transcurrido) por sesión u OT (read model; el cliente NO calcula duración)",
    parameters: [queryParam("sesionId", "Duraciones de una sesión"), queryParam("ordenId", "Duraciones de todas las sesiones de la OT")],
    responses: { "200": jsonOk(obj({ duraciones: obj({}, []) }, [])), ...errores("400", "401", "403") },
  });

  // ---- Reproyección / sync / consola ----
  add(`${BASE}/reproyectar`, "post", {
    tags: ["Administración"], operationId: "ordenes.reproyectar",
    summary: "Reproyección por replay del event log durable (admin)",
    responses: { "200": jsonOk(obj({ eventos: int() }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/sync`, "post", {
    tags: ["Sincronización"], operationId: "ordenes.sync",
    summary: "Sincronización offline por orquestación (idempotente por opId)",
    requestBody: jsonBody(ref("ColaSync")),
    responses: { "200": jsonOk(ref("ResumenSync")), ...errores("400", "401", "403") },
  });
  add(`${BASE}/consola`, "get", {
    tags: ["Administración"], operationId: "ordenes.consola", summary: "Consola técnica (admin)",
    responses: { "200": jsonOk(ref("Consola")), ...errores("401", "403") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Módulo Órdenes de Trabajo Empresariales (DGP-009)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Órdenes" }, { name: "Ciclo de vida" }, { name: "Documentación" },
      { name: "Planificación" }, { name: "Asignaciones" }, { name: "Recursos" },
      { name: "SLA" }, { name: "Relaciones" }, { name: "Bitácora" },
      { name: "Sesiones" },
      { name: "Catálogos" }, { name: "Sincronización" }, { name: "Administración" },
    ],
    paths,
    components: { schemas },
  };
}

/** Serialización canónica (2 espacios + newline final) para diffs estables. */
export function serializarOpenApi(): string {
  return `${JSON.stringify(construirOpenApi(), null, 2)}\n`;
}
