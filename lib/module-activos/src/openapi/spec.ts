/**
 * DGP-008.2 · Módulo Activos — Contrato OpenAPI 3 (contract-first) VERIFICABLE.
 *
 * Este generador es DETERMINISTA y AUTOSUFICIENTE (sin imports del workspace)
 * para poder ejecutarse con `node --experimental-strip-types`. Emite un
 * documento OpenAPI 3.0 que cubre TODAS las rutas HTTP del módulo:
 * CRUD, transiciones de estado, medidores (horómetro/odómetro), relaciones,
 * históricos, timeline con filtros, colaboración (comentarios/documentación),
 * sincronización offline y consola técnica. Incluye el mapeo de errores
 * kernel→HTTP (AUTH→403, NF→404, CFL→409, VAL→400, INF→500).
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera cada comando/consulta del módulo.
 */

const BASE = "/api/deltaops/activos";

/* --------------------------- Helpers de esquema --------------------------- */

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

/** Respuestas de error kernel→HTTP compartidas por casi todas las rutas. */
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
  for (const c of codigos) {
    out[c] = { description: mapa[c], content: { "application/json": { schema: ref("Error") } } };
  }
  return out;
}

function jsonBody(schema: Schema): Schema {
  return { required: true, content: { "application/json": { schema } } };
}
function jsonOk(schema: Schema, description = "OK"): Schema {
  return { description, content: { "application/json": { schema } } };
}

const idParam: Schema = {
  name: "id",
  in: "path",
  required: true,
  schema: str(),
  description: "Identificador del activo",
};
function pathParam(name: string, description: string): Schema {
  return { name, in: "path", required: true, schema: str(), description };
}
function queryParam(name: string, description: string): Schema {
  return { name, in: "query", required: false, schema: str(), description };
}

/* ------------------------------ Documento -------------------------------- */

export function construirOpenApi(): Record<string, unknown> {
  const estados = ["REGISTRADO", "OPERATIVO", "MANTENIMIENTO", "FUERA_SERVICIO", "RETIRADO"];
  const categoriasDoc = ["manual", "certificado", "garantia", "diagrama", "plano", "procedimiento"];

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    Medicion: obj({ valor: num(), unidad: str(), medidoAt: str({ format: "date-time" }) }, ["valor", "unidad"]),
    Ubicacion: obj(
      {
        ubicacionId: str(),
        etiqueta: str(),
        detalle: str(),
        coordenadas: obj({ latitud: num(), longitud: num(), altitud: num() }, ["latitud", "longitud"]),
      },
      ["ubicacionId", "etiqueta"],
    ),
    CrearActivo: obj(
      {
        id: str({ format: "uuid" }),
        codigoEmpresarial: str(),
        nombre: str(),
        descripcion: str(),
        tipo: str(),
        categoria: str(),
        familia: str(),
        criticidad: str(),
        opId: str(),
      },
      ["codigoEmpresarial", "nombre", "tipo", "categoria", "familia", "criticidad"],
    ),
    EditarActivo: obj({
      expectedVersion: int({ minimum: 1 }),
      nombre: str(),
      descripcion: str(),
    }, ["expectedVersion"]),
    TransicionEstado: obj({ expectedVersion: int({ minimum: 1 }), aprobado: bool() }, ["expectedVersion"]),
    CambiarUbicacion: obj({ expectedVersion: int({ minimum: 1 }), ubicacion: ref("Ubicacion") }, ["expectedVersion", "ubicacion"]),
    AsignarResponsable: obj({ expectedVersion: int({ minimum: 1 }), responsable: str(), supervisor: str() }, ["expectedVersion"]),
    ActualizarMedidor: obj({ expectedVersion: int({ minimum: 1 }), medicion: ref("Medicion") }, ["expectedVersion", "medicion"]),
    CrearRelacion: obj(
      { id: str(), opId: str(), tipo: str(), destinoId: str() },
      ["tipo", "destinoId"],
    ),
    Comentario: obj({ texto: str(), parentId: str(), opId: str() }, ["texto"]),
    EditarComentario: obj({ expectedVersion: int({ minimum: 1 }), texto: str(), opId: str() }, ["expectedVersion", "texto"]),
    Adjuntar: obj(
      {
        categoria: str({ enum: categoriasDoc }),
        nombreArchivo: str(),
        mimeType: str(),
        tamanoBytes: int({ minimum: 0 }),
        hashSha256: str({ minLength: 64, maxLength: 64 }),
        attachmentId: str(),
        opId: str(),
      },
      ["categoria", "nombreArchivo", "mimeType", "tamanoBytes", "hashSha256"],
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
    ResultadoComando: obj({ id: str(), version: int(), estado: str({ enum: estados }), idempotente: bool() }),
    EntradaTimeline: obj({
      id: str(), tenantId: str(), service: str(), recordType: str(), status: str(),
      data: obj({
        eventType: str(), entityRef: str(), actorId: str(), resumen: str(),
        estado: str({ nullable: true }), entidadRelacionada: str({ nullable: true }),
        occurredAt: str({ format: "date-time" }),
      }, []),
    }),
    EntradaHistorial: obj({
      eventId: str(), activoId: str(), tipoEvento: str(), estado: str({ nullable: true }),
      version: int(), actorId: str(), resumen: str(), registradoAt: str({ format: "date-time" }),
    }),
    Consola: obj({
      modulo: str(), version: str(), estados: arr(str()), eventos: arr(str()),
      readModels: obj({}, []), outbox: obj({}, []), sincronizacion: obj({}, []),
      colaboracion: obj({}, []), rls: obj({}, []),
    }),
    ResultadoBusqueda: obj({
      id: str(), score: num(), codigoEmpresarial: str(), nombre: str(),
      estado: str({ enum: estados }), tipo: str(), categoria: str({ nullable: true }),
      familia: str({ nullable: true }), criticidad: str({ nullable: true }),
      ubicacionId: str({ nullable: true }), responsable: str({ nullable: true }),
      fabricante: str({ nullable: true }), modelo: str({ nullable: true }), serie: str({ nullable: true }),
    }, ["id", "codigoEmpresarial", "nombre", "estado"]),
    EmitirEtiqueta: obj({ tipo: str({ enum: ["qr", "barcode", "nfc"], default: "qr" }) }),
    EtiquetaEmitida: obj({
      activoId: str(), id: str(), codigo: str(), tipo: str({ enum: ["qr", "barcode", "nfc"] }),
      reutilizada: bool(),
    }, ["activoId", "codigo", "tipo", "reutilizada"]),
    EtiquetaResuelta: obj({
      activoId: str(), codigo: str(), tipo: str({ enum: ["qr", "barcode", "nfc"] }), acciones: arr(str()),
    }, ["activoId", "codigo", "tipo"]),
    UrlFirmada: obj({
      activoId: str(), attachmentId: str(), url: str(), expiresAt: int(),
      nombreArchivo: str({ nullable: true }), mimeType: str({ nullable: true }),
      tamanoBytes: int({ nullable: true }), hashSha256: str({ nullable: true }),
      almacenamiento: str({ enum: ["referencia"] }),
    }, ["activoId", "attachmentId", "url", "expiresAt", "almacenamiento"]),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- CRUD + listado ----
  add(BASE, "get", {
    tags: ["Activos"], operationId: "activos.listar",
    summary: "Listar activos (read model) con filtros avanzados y paginación",
    parameters: [
      ...["estado", "criticidad", "ubicacionId", "tipo", "categoria", "familia", "responsable"].map((p) =>
        queryParam(p, `Filtro por ${p}`),
      ),
      queryParam("q", "Texto libre sobre código empresarial / nombre"),
      { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 200 }), description: "Tamaño de página" },
      { name: "offset", in: "query", required: false, schema: int({ minimum: 0 }), description: "Desplazamiento de página" },
    ],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(BASE, "post", {
    tags: ["Activos"], operationId: "activos.crear", summary: "Crear activo (idempotente por id de cliente)",
    requestBody: jsonBody(ref("CrearActivo")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/{id}`, "get", {
    tags: ["Activos"], operationId: "activos.detalle", summary: "Detalle del activo (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/{id}`, "put", {
    tags: ["Activos"], operationId: "activos.editar", summary: "Editar activo (concurrencia optimista)",
    parameters: [idParam], requestBody: jsonBody(ref("EditarActivo")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Búsqueda (platform.search) ----
  add(`${BASE}/busqueda`, "get", {
    tags: ["Búsqueda"], operationId: "activos.busqueda",
    summary: "Búsqueda rápida/contextual de activos (delega en platform.search)",
    parameters: [
      { name: "q", in: "query", required: true, schema: str(), description: "Texto de búsqueda" },
      ...["estado", "tipo", "categoria", "familia", "criticidad", "ubicacionId", "responsable"].map((p) =>
        queryParam(p, `Filtro por ${p}`),
      ),
      { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 200 }), description: "Máximo de resultados" },
    ],
    responses: { "200": jsonOk(arr(ref("ResultadoBusqueda"))), ...errores("400", "401", "403") },
  });

  // ---- Identificación: QR / Barcode / NFC (platform.qr) ----
  add(`${BASE}/{id}/qr`, "post", {
    tags: ["Identificación"], operationId: "activos.qr-emitir",
    summary: "Emitir/reutilizar etiqueta (idempotente por activo+tipo)",
    parameters: [idParam], requestBody: jsonBody(ref("EmitirEtiqueta")),
    responses: { "200": jsonOk(ref("EtiquetaEmitida")), ...errores("400", "401", "403", "404") },
  });
  add(`${BASE}/qr/resolver`, "get", {
    tags: ["Identificación"], operationId: "activos.qr-resolver",
    summary: "Resolver etiqueta → activo (404 si revocada/inexistente)",
    parameters: [{ name: "codigo", in: "query", required: true, schema: str(), description: "Código de la etiqueta" }],
    responses: { "200": jsonOk(ref("EtiquetaResuelta")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Transiciones de estado ----
  for (const accion of ["registrar", "operar", "mantener", "fuera-servicio", "retirar"]) {
    add(`${BASE}/{id}/${accion}`, "post", {
      tags: ["Transiciones"], operationId: `activos.${accion}`, summary: `Transición: ${accion}`,
      parameters: [idParam], requestBody: jsonBody(ref("TransicionEstado")),
      responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
    });
  }

  // ---- Ubicación / responsable / medidores ----
  add(`${BASE}/{id}/ubicacion`, "post", {
    tags: ["Operación"], operationId: "activos.cambiar-ubicacion", summary: "Cambiar ubicación",
    parameters: [idParam], requestBody: jsonBody(ref("CambiarUbicacion")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}/responsable`, "post", {
    tags: ["Operación"], operationId: "activos.asignar-responsable", summary: "Asignar responsable",
    parameters: [idParam], requestBody: jsonBody(ref("AsignarResponsable")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  for (const medidor of ["horometro", "odometro"]) {
    add(`${BASE}/{id}/${medidor}`, "post", {
      tags: ["Operación"], operationId: `activos.actualizar-${medidor}`, summary: `Actualizar ${medidor}`,
      parameters: [idParam], requestBody: jsonBody(ref("ActualizarMedidor")),
      responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
    });
  }

  // ---- Relaciones ----
  add(`${BASE}/{id}/relaciones`, "post", {
    tags: ["Relaciones"], operationId: "activos.crear-relacion", summary: "Crear relación (origen = {id})",
    parameters: [idParam], requestBody: jsonBody(ref("CrearRelacion")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/relaciones/{relId}`, "delete", {
    tags: ["Relaciones"], operationId: "activos.eliminar-relacion", summary: "Eliminar relación",
    parameters: [pathParam("relId", "Id de la relación")],
    responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/{id}/relacionados`, "get", {
    tags: ["Relaciones"], operationId: "activos.relacionados", summary: "Activos relacionados",
    parameters: [idParam, queryParam("categoria", "Categoría de relación")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/arbol`, "get", {
    tags: ["Relaciones"], operationId: "activos.arbol", summary: "Árbol jerárquico",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/componentes`, "get", {
    tags: ["Relaciones"], operationId: "activos.componentes", summary: "Componentes (compuesto-por)",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });

  // ---- Históricos + timeline ----
  add(`${BASE}/{id}/historial/ubicaciones`, "get", {
    tags: ["Históricos"], operationId: "activos.historial-ubicaciones", summary: "Histórico de ubicaciones",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/historial/responsables`, "get", {
    tags: ["Históricos"], operationId: "activos.historial-responsables", summary: "Histórico de responsables",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/historial`, "get", {
    tags: ["Históricos"], operationId: "activos.historial", summary: "Historial cronológico (read model interno)",
    parameters: [idParam], responses: { "200": jsonOk(arr(ref("EntradaHistorial"))), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/timeline`, "get", {
    tags: ["Timeline"], operationId: "activos.timeline",
    summary: "Shared Timeline (plataforma) con filtros: actor, estado, entidadRelacionada, rango de fechas",
    parameters: [
      idParam,
      queryParam("actor", "Filtro por actor"),
      queryParam("estado", "Filtro por estado"),
      queryParam("entidadRelacionada", "Filtro por entidad relacionada"),
      queryParam("desde", "Rango: fecha/hora inicial (ISO-8601)"),
      queryParam("hasta", "Rango: fecha/hora final (ISO-8601)"),
    ],
    responses: { "200": jsonOk(arr(ref("EntradaTimeline"))), ...errores("401", "403") },
  });

  // ---- Colaboración ----
  add(`${BASE}/{id}/comentarios`, "get", {
    tags: ["Colaboración"], operationId: "activos.comentarios", summary: "Listar comentarios del activo",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/comentarios`, "post", {
    tags: ["Colaboración"], operationId: "activos.comentar", summary: "Comentar / responder (hilos)",
    parameters: [idParam], requestBody: jsonBody(ref("Comentario")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });
  add(`${BASE}/comentarios/{comentarioId}`, "put", {
    tags: ["Colaboración"], operationId: "activos.editar-comentario", summary: "Editar comentario propio",
    parameters: [pathParam("comentarioId", "Id del comentario")], requestBody: jsonBody(ref("EditarComentario")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/comentarios/{comentarioId}`, "delete", {
    tags: ["Colaboración"], operationId: "activos.borrar-comentario", summary: "Borrado lógico de comentario",
    parameters: [pathParam("comentarioId", "Id del comentario")],
    responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/{id}/documentacion`, "get", {
    tags: ["Colaboración"], operationId: "activos.documentacion", summary: "Listar documentación técnica",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/{id}/documentacion/{attachmentId}/url`, "get", {
    tags: ["Colaboración"], operationId: "activos.documentacion-url",
    summary: "URL firmada (HMAC+TTL) del adjunto — referencia-only, sin binarios",
    parameters: [idParam, pathParam("attachmentId", "Id del adjunto")],
    responses: { "200": jsonOk(ref("UrlFirmada")), ...errores("401", "403", "404") },
  });
  add(`${BASE}/{id}/documentacion`, "post", {
    tags: ["Colaboración"], operationId: "activos.adjuntar", summary: "Adjuntar documentación técnica por referencia",
    parameters: [idParam], requestBody: jsonBody(ref("Adjuntar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Catálogos ----
  add(`${BASE}/catalogos/{catalogo}`, "get", {
    tags: ["Catálogos"], operationId: "activos.catalogo.opciones", summary: "Opciones habilitadas de un catálogo",
    parameters: [pathParam("catalogo", "Nombre del catálogo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/catalogos`, "post", {
    tags: ["Catálogos"], operationId: "activos.catalogo.upsert", summary: "Alta/edición de entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoUpsert")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/catalogos/habilitar`, "post", {
    tags: ["Catálogos"], operationId: "activos.catalogo.habilitar", summary: "Habilitar/deshabilitar entrada",
    requestBody: jsonBody(ref("CatalogoHabilitar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Reproyección / sync / consola ----
  add(`${BASE}/reproyectar`, "post", {
    tags: ["Administración"], operationId: "activos.reproyectar",
    summary: "Reproyección por replay del event stream (admin)",
    responses: { "200": jsonOk(obj({ eventos: int(), relaciones: int() }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/sync`, "post", {
    tags: ["Sincronización"], operationId: "activos.sync",
    summary: "Sincronización offline (claim→ejecutar→finalizar, idempotente)",
    requestBody: jsonBody(ref("ColaSync")),
    responses: { "200": jsonOk(ref("ResumenSync")), ...errores("400", "401", "403") },
  });
  add(`${BASE}/consola`, "get", {
    tags: ["Administración"], operationId: "activos.consola", summary: "Consola técnica (admin)",
    responses: { "200": jsonOk(ref("Consola")), ...errores("401", "403") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Módulo Activos Empresariales (DGP-008)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Activos" }, { name: "Búsqueda" }, { name: "Identificación" },
      { name: "Transiciones" }, { name: "Operación" },
      { name: "Relaciones" }, { name: "Históricos" }, { name: "Timeline" },
      { name: "Colaboración" }, { name: "Catálogos" }, { name: "Sincronización" },
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
