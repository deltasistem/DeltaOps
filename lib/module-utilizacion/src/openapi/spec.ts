/**
 * DGP-019.1 · Módulo de Utilización, Medidores y Combustible — Contrato OpenAPI 3
 * (contract-first) VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin
 * imports del workspace) para ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/utilizacion`:
 * lecturas de medidor append-only (registrar/anular, detalle y listado CQRS,
 * última válida por medidor), regularización explícita de medidor (reinicio de
 * tramo auditado), tanqueos de combustible (registrar/anular con catálogo),
 * resumen operacional (cálculos puros: L/h, L/100km, costo/h, costo/km;
 * "sin datos" ≠ 0), catálogos, eventos, reproyección (replay), sincronización
 * offline (idempotente por opId) y consola técnica. Incluye el mapeo de errores
 * kernel→HTTP (AUTH→403, NF→404, CFL→409, VAL→400, INF→500).
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera CADA comando/consulta del módulo.
 */

const BASE = "/api/deltaops/utilizacion";

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
  const evidencia = obj({ attachmentId: str(), etiqueta: str({ nullable: true }) }, ["attachmentId"]);
  const tipoMedidor = str({ enum: ["horometro", "odometro"], description: "Tipo de medidor" });
  const origen = str({ enum: ["manual", "qr", "sync-offline"], description: "Origen de la lectura" });

  const schemas: Record<string, Schema> = {
    Error: obj(
      { code: str({ description: "Código kernel (KRN-*)" }), message: str(), details: obj({}, []) },
      ["code", "message"],
    ),
    ResultadoComando: obj({ id: str(), idempotente: bool() }, ["id"]),
    ResultadoCalculo: obj(
      { tipo: str({ enum: ["valor", "sin-datos"] }), valor: num({ nullable: true }), motivo: str({ nullable: true }) },
      ["tipo"],
    ),
    RegistrarLectura: obj(
      {
        id: str({ nullable: true, description: "UUID de cliente (Offline First)" }),
        opId: str({ nullable: true }),
        activoId: str(),
        tipoMedidor,
        valor: num({ minimum: 0 }),
        unidad: str({ nullable: true, description: "Derivada del tipo si se omite (h|km)" }),
        fechaHora: str({ description: "ISO-8601" }),
        origen,
        observacion: str({ nullable: true }),
        evidenciaRef: { ...evidencia, nullable: true },
      },
      ["activoId", "tipoMedidor", "valor", "fechaHora"],
    ),
    AnularLectura: obj({ opId: str({ nullable: true }), motivo: str() }, ["motivo"]),
    ReinicioMedidor: obj(
      {
        id: str({ nullable: true }),
        opId: str({ nullable: true }),
        activoId: str(),
        tipoMedidor,
        valorNuevo: num({ minimum: 0 }),
        fechaHora: str(),
        motivo: str({ description: "Justificación auditable (obligatoria)" }),
        observacion: str({ nullable: true }),
      },
      ["activoId", "tipoMedidor", "valorNuevo", "fechaHora", "motivo"],
    ),
    RegistrarTanqueo: obj(
      {
        id: str({ nullable: true }),
        opId: str({ nullable: true }),
        activoId: str(),
        fechaHora: str(),
        litros: num({ exclusiveMinimum: 0 }),
        tipoCombustible: str({ description: "Clave del catálogo tipos-combustible" }),
        precioUnitario: num({ minimum: 0, nullable: true }),
        costoTotal: num({ minimum: 0, nullable: true }),
        moneda: str({ nullable: true }),
        lecturaMedidorRef: str({ nullable: true }),
        proveedorId: str({ nullable: true, description: "Referencia string sin FK dura" }),
        observacion: str({ nullable: true }),
        evidenciaRef: { ...evidencia, nullable: true },
      },
      ["activoId", "fechaHora", "litros", "tipoCombustible"],
    ),
    AnularTanqueo: obj({ opId: str({ nullable: true }), motivo: str() }, ["motivo"]),
    CatalogoUpsert: obj(
      { catalogo: str({ enum: ["tipos-combustible"] }), clave: str(), etiqueta: str(), posicion: int({ nullable: true }), padre: str({ nullable: true }) },
      ["catalogo", "clave", "etiqueta"],
    ),
    CatalogoHabilitar: obj(
      { catalogo: str({ enum: ["tipos-combustible"] }), clave: str(), habilitado: bool() },
      ["catalogo", "clave", "habilitado"],
    ),
    Resumen: obj(
      {
        activoId: str(),
        lecturas: int(),
        tanqueos: int(),
        deltaHorometro: ref("ResultadoCalculo"),
        deltaOdometro: ref("ResultadoCalculo"),
        litrosTotal: num({ nullable: true }),
        costoTotal: num({ nullable: true }),
        litrosPorHora: ref("ResultadoCalculo"),
        litrosPor100Km: ref("ResultadoCalculo"),
        costoPorHora: ref("ResultadoCalculo"),
        costoPorKm: ref("ResultadoCalculo"),
      },
      ["activoId"],
    ),
    OperacionSync: obj(
      { opId: str(), comando: str({ description: "Comando OFICIAL del runtime" }), input: obj({}, []) },
      ["opId", "comando", "input"],
    ),
    ColaSync: arr(ref("OperacionSync")),
    ResultadoSync: obj(
      {
        opId: str(),
        comando: str(),
        estado: str({ enum: ["aplicada", "idempotente", "conflicto", "rechazada", "reintentable"] }),
        resultado: obj({}, []),
        actual: obj({}, []),
        error: str({ nullable: true }),
      },
      ["opId", "comando", "estado"],
    ),
    ResumenSync: obj(
      {
        total: int(), aplicadas: int(), idempotentes: int(), conflictos: int(), reintentables: int(), rechazadas: int(),
        resultados: arr(ref("ResultadoSync")),
      },
      ["total", "resultados"],
    ),
    Consola: obj(
      { pendientes: int(), procesados: int(), ultimos: arr(obj({}, [])), tablasRLS: arr(str()) },
      ["pendientes", "procesados"],
    ),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- Lecturas (CQRS) ----
  add(`${BASE}/lecturas`, "get", {
    tags: ["Lecturas"], operationId: "utilizacion.lecturas", summary: "Listar lecturas de medidor (read model CQRS; incluye inconsistentes)",
    parameters: [
      ...["activoId", "tipoMedidor", "estado", "desde", "hasta"].map((p) => queryParam(p, `Filtro por ${p}`)),
      { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) },
      { name: "offset", in: "query", required: false, schema: int({ minimum: 0 }) },
    ],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/lecturas`, "post", {
    tags: ["Lecturas"], operationId: "utilizacion.registrar-lectura",
    summary: "Registrar lectura de medidor (append-only; idempotente por opId; decreciente ⇒ inconsistente y NO propaga a Activos)",
    requestBody: jsonBody(ref("RegistrarLectura")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Registrada"), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/lecturas/{id}`, "get", {
    tags: ["Lecturas"], operationId: "utilizacion.lectura-detalle", summary: "Detalle de lectura (read model CQRS, snapshot completo)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/lecturas/{id}/anular`, "post", {
    tags: ["Lecturas"], operationId: "utilizacion.anular-lectura", summary: "Anular lectura (no destructivo; la corrección es una nueva lectura)",
    parameters: [idParam], requestBody: jsonBody(ref("AnularLectura")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/lecturas/{id}/reintentar-sincronizacion`, "post", {
    tags: ["Lecturas"], operationId: "utilizacion.reintentar-sincronizacion",
    summary: "Reintentar (idempotente) la propagación a Activos de una lectura con sincronización fallida",
    parameters: [idParam], requestBody: jsonBody(obj({ opId: str() }, [])),
    responses: { "200": jsonOk(obj({ id: str(), reintentado: bool(), sincronizacionActivo: str() }, ["id"])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/ultima-lectura`, "get", {
    tags: ["Lecturas"], operationId: "utilizacion.ultima-lectura", summary: "Última lectura VÁLIDA por medidor (read model CQRS)",
    parameters: [queryParam("activoId", "Identificador del activo"), queryParam("tipoMedidor", "horometro|odometro")],
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/reinicio-medidor`, "post", {
    tags: ["Medidores"], operationId: "utilizacion.reinicio-medidor",
    summary: "Regularizar medidor (reinicio de tramo auditado; capacidad regularizar; ancla nuevo tramo y propaga a Activos)",
    requestBody: jsonBody(ref("ReinicioMedidor")),
    responses: { "200": jsonOk(obj({ id: str(), valorAnterior: num({ nullable: true }), valorNuevo: num() }, ["id"])), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Tanqueos (CQRS) ----
  add(`${BASE}/tanqueos`, "get", {
    tags: ["Tanqueos"], operationId: "utilizacion.tanqueos", summary: "Listar tanqueos de combustible (read model CQRS)",
    parameters: [
      ...["activoId", "estado", "desde", "hasta"].map((p) => queryParam(p, `Filtro por ${p}`)),
      { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) },
      { name: "offset", in: "query", required: false, schema: int({ minimum: 0 }) },
    ],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/tanqueos`, "post", {
    tags: ["Tanqueos"], operationId: "utilizacion.registrar-tanqueo",
    summary: "Registrar tanqueo (append-only; idempotente por opId; valida tipoCombustible del catálogo del módulo)",
    requestBody: jsonBody(ref("RegistrarTanqueo")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Registrado"), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/tanqueos/{id}`, "get", {
    tags: ["Tanqueos"], operationId: "utilizacion.tanqueo-detalle", summary: "Detalle de tanqueo (read model CQRS, snapshot completo)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/tanqueos/{id}/anular`, "post", {
    tags: ["Tanqueos"], operationId: "utilizacion.anular-tanqueo", summary: "Anular tanqueo (no destructivo)",
    parameters: [idParam], requestBody: jsonBody(ref("AnularTanqueo")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Resumen operacional ----
  add(`${BASE}/activos/{activoId}/resumen`, "get", {
    tags: ["Resumen"], operationId: "utilizacion.resumen",
    summary: "Resumen operacional por activo (cálculos puros de utilización/consumo; 'sin datos' ≠ 0)",
    parameters: [pathParam("activoId", "Identificador del activo"), queryParam("desde", "ISO desde"), queryParam("hasta", "ISO hasta")],
    responses: { "200": jsonOk(ref("Resumen")), ...errores("401", "403", "409") },
  });

  // ---- Catálogos ----
  add(`${BASE}/catalogos/{catalogo}`, "get", {
    tags: ["Catálogos"], operationId: "utilizacion.catalogo-opciones", summary: "Opciones de un catálogo del módulo",
    parameters: [pathParam("catalogo", "Nombre del catálogo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/catalogos`, "post", {
    tags: ["Catálogos"], operationId: "utilizacion.catalogo-upsert", summary: "Alta/edición de entrada de catálogo (capacidad regularizar)",
    requestBody: jsonBody(ref("CatalogoUpsert")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/catalogos/habilitar`, "post", {
    tags: ["Catálogos"], operationId: "utilizacion.catalogo-habilitar", summary: "Habilitar/deshabilitar entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoHabilitar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Eventos / reproyección / sync / consola ----
  add(`${BASE}/eventos`, "get", {
    tags: ["Administración"], operationId: "utilizacion.eventos", summary: "Bitácora de eventos durable del tenant (replay; admin)",
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/reproyectar`, "post", {
    tags: ["Administración"], operationId: "utilizacion.reproyectar",
    summary: "Reproyección por replay del event log durable (admin)",
    responses: { "200": jsonOk(obj({ eventos: int(), aplicados: int() }, [])), ...errores("401", "403", "409") },
  });
  add(`${BASE}/sync`, "post", {
    tags: ["Sincronización"], operationId: "utilizacion.sync",
    summary: "Sincronización offline por orquestación (claim durable; idempotente por opId)",
    requestBody: jsonBody(ref("ColaSync")),
    responses: { "200": jsonOk(ref("ResumenSync")), ...errores("400", "401", "403") },
  });
  add(`${BASE}/consola`, "get", {
    tags: ["Administración"], operationId: "utilizacion.consola", summary: "Consola técnica del outbox del módulo (admin)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(ref("Consola")), ...errores("401", "403", "409") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Módulo de Utilización, Medidores y Combustible (DGP-019.1)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Lecturas" }, { name: "Medidores" }, { name: "Tanqueos" },
      { name: "Resumen" }, { name: "Catálogos" }, { name: "Sincronización" }, { name: "Administración" },
    ],
    paths,
    components: { schemas },
  };
}

/** Serialización canónica (2 espacios + newline final) para diffs estables. */
export function serializarOpenApi(): string {
  return `${JSON.stringify(construirOpenApi(), null, 2)}\n`;
}
