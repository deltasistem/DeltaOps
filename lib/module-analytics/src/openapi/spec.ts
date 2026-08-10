/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — Contrato OpenAPI 3
 * (contract-first) VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin
 * imports del workspace) para ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/analytics`:
 * indicadores (definición/edición/habilitación/detalle/listado), evaluación
 * PURA de indicadores contra fuentes read-only (`evaluar`), materialización
 * idempotente de snapshots, dashboards (CRUD + clonado), catálogos configurables
 * (categorías/unidades/formatos/períodos), siembra del catálogo del sistema
 * (`sembrar-sistema`), reproyección por replay, bitácora de eventos, consola
 * técnica del outbox y sincronización offline por orquestación. El módulo es de
 * SOLO LECTURA sobre los módulos de dominio + Shared Timeline: JAMÁS los muta.
 *
 * Autorización por permiso del kernel (documentada por operación):
 *   - `modulo.analytics.read`      → consultas + evaluación.
 *   - `modulo.analytics.dashboard` → CRUD/clonado de dashboards.
 *   - `modulo.analytics.admin`     → catálogos, indicadores, siembra, reproyección.
 * Roles: admin/platform_admin (todo), operador (read+dashboard+export),
 * lector (sólo lectura). Errores kernel→HTTP: AUTH→403, NF/NOT→404, CFL→409,
 * VAL→400, INF→500.
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera CADA comando/consulta del módulo.
 */

const BASE = "/api/deltaops/analytics";

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
const queryParam = (name: string, description: string, schema: Schema = str()): Schema => ({ name, in: "query", required: false, schema, description });
const claveParam: Schema = pathParam("clave", "Clave del indicador");
const idParam: Schema = pathParam("id", "Identificador del dashboard");

const TIPOS_EXPRESION = ["conteo", "suma", "promedio", "ratio", "duracion-promedio", "tasa", "mtbf", "mttr"];
const TIPOS_WIDGET = [
  "card", "line", "bar", "area", "pie", "donut", "gauge", "table",
  "heatmap", "timeline", "calendar", "ranking", "comparativo",
];
const CATALOGOS = ["categorias-indicador", "unidades", "formatos", "periodos-meta"];

export function construirOpenApi(): Record<string, unknown> {
  const fuente = obj(
    { modulo: str({ description: "ordenes|activos|inventario|correctivo|preventivo|abastecimiento|planes|timeline" }), dataset: str() },
    ["modulo", "dataset"],
  );
  const filtro = obj(
    { dimension: str(), campo: str({ nullable: true }), operador: str({ description: "eq|neq|in|gt|gte|lt|lte|exists" }), valor: {} },
    ["dimension", "operador"],
  );
  const ventana = obj(
    { campoFecha: str(), ultimosDias: int({ minimum: 1, nullable: true }), desde: str({ nullable: true }), hasta: str({ nullable: true }) },
    ["campoFecha"],
  );
  const expresion = obj(
    {
      tipo: str({ enum: TIPOS_EXPRESION }),
      campo: str({ nullable: true }),
      filtros: arr(filtro),
      filtrosDenominador: arr(filtro),
      factor: num({ nullable: true }),
      ventana: { ...ventana, nullable: true },
      agrupadores: arr(str()),
      campoTiempoOperativo: str({ nullable: true }),
      campoTiempoReparacion: str({ nullable: true }),
      campoEsFalla: str({ nullable: true }),
    },
    ["tipo"],
  );
  const umbrales = obj(
    { mayorEsMejor: bool(), bueno: num(), alerta: num(), critico: num() },
    ["mayorEsMejor", "bueno", "alerta", "critico"],
  );
  const meta = obj({ periodo: str(), valor: num() }, ["periodo", "valor"]);
  const ranking = obj({ modo: str({ enum: ["topN", "bottomN"] }), n: int({ minimum: 1 }) }, ["modo", "n"]);
  const widget = obj(
    {
      id: str(), tipo: str({ enum: TIPOS_WIDGET }), titulo: str(), indicadorClave: str(),
      filtros: arr(filtro), presentacion: obj({}, []), ranking: { ...ranking, nullable: true },
      posicion: int({ minimum: 0 }),
    },
    ["tipo", "titulo", "indicadorClave"],
  );

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    ResultadoComando: obj({ id: str(), clave: str(), version: int(), idempotente: bool() }),
    Fuente: fuente,
    Filtro: filtro,
    Ventana: ventana,
    Expresion: expresion,
    Umbrales: umbrales,
    Meta: meta,
    Widget: widget,
    DefinirIndicador: obj(
      {
        id: str({ format: "uuid" }), clave: str(), nombre: str(),
        descripcion: str({ nullable: true }), categoria: str(),
        fuente, expresion, unidad: str(), formato: str(),
        umbrales: { ...umbrales, nullable: true }, metas: arr(meta),
      },
      ["clave", "nombre", "categoria", "fuente", "expresion", "unidad", "formato"],
    ),
    ActualizarIndicador: obj(
      {
        expectedVersion: int({ minimum: 1 }), nombre: str(), descripcion: str({ nullable: true }),
        categoria: str(), fuente, expresion, unidad: str(), formato: str(),
        umbrales: { ...umbrales, nullable: true }, metas: arr(meta),
      },
      ["expectedVersion"],
    ),
    HabilitarIndicador: obj({ expectedVersion: int({ minimum: 1 }), habilitado: bool() }, ["expectedVersion", "habilitado"]),
    EvaluarIndicador: obj(
      { filtros: arr(filtro), periodo: str({ nullable: true }), evaluadoEn: str({ description: "ISO-8601", nullable: true }) },
      [],
    ),
    ResultadoEvaluacion: obj(
      {
        clave: str(), unidad: str(), formato: str(), valor: num(), muestras: int(),
        grupos: arr(obj({}, [])), semaforo: str({ nullable: true }),
        cumplimiento: obj({}, []), evaluadoEn: str(),
      },
      [],
    ),
    MaterializarSnapshot: obj(
      { opId: str(), filtros: arr(filtro), evaluadoEn: str({ description: "ISO-8601", nullable: true }) },
      [],
    ),
    ResultadoSnapshot: obj(
      { id: str(), claveSnapshot: str(), clave: str(), valor: num(), muestras: int(), idempotente: bool() },
      [],
    ),
    CrearDashboard: obj(
      { id: str({ format: "uuid" }), clave: str(), nombre: str(), descripcion: str({ nullable: true }), widgets: arr(widget) },
      ["clave", "nombre"],
    ),
    ActualizarDashboard: obj(
      { expectedVersion: int({ minimum: 1 }), nombre: str(), descripcion: str({ nullable: true }), widgets: arr(widget) },
      ["expectedVersion"],
    ),
    ClonarDashboard: obj(
      { origenId: str(), clave: str(), nombre: str() },
      ["clave", "nombre"],
    ),
    EliminarDashboard: obj({ expectedVersion: int({ minimum: 1 }) }, ["expectedVersion"]),
    ResultadoSembrar: obj({ indicadores: int(), dashboards: int() }, ["indicadores", "dashboards"]),
    CatalogoUpsert: obj(
      { catalogo: str({ enum: CATALOGOS }), clave: str(), etiqueta: str(), posicion: int({ minimum: 0 }), padre: str({ nullable: true }) },
      ["catalogo", "clave", "etiqueta"],
    ),
    CatalogoHabilitar: obj({ catalogo: str({ enum: CATALOGOS }), clave: str(), habilitado: bool() }, ["catalogo", "clave", "habilitado"]),
    OperacionSync: obj({ opId: str(), comando: str(), input: obj({}, []) }, ["opId", "comando", "input"]),
    ColaSync: obj({ operaciones: arr(ref("OperacionSync")) }, []),
    ResumenSync: obj(
      {
        total: int(), aplicadas: int(), idempotentes: int(), conflictos: int(),
        reintentables: int(), rechazadas: int(), resultados: arr(obj({}, [])),
      },
      [],
    ),
    Consola: obj({ total: int(), eventos: arr(obj({}, [])), tablasRLS: arr(str()) }, []),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- Indicadores ----
  add(`${BASE}/indicadores`, "get", {
    tags: ["Indicadores"], operationId: "analytics.indicadores",
    summary: "Listar indicadores (read model CQRS). Permiso: modulo.analytics.read",
    parameters: [
      queryParam("categoria", "Filtro por categoría"),
      queryParam("habilitado", "Filtro por habilitado (true|false)", bool()),
      queryParam("delSistema", "Filtro por indicadores del sistema (true|false)", bool()),
      queryParam("limit", "Máximo de filas", int({ minimum: 1, maximum: 500 })),
    ],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/indicadores`, "post", {
    tags: ["Indicadores"], operationId: "analytics.definir-indicador",
    summary: "Definir indicador personalizado del tenant (COMO DATOS). Permiso: modulo.analytics.admin",
    requestBody: jsonBody(ref("DefinirIndicador")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/indicadores/{clave}/evaluar`, "post", {
    tags: ["Evaluación"], operationId: "analytics.evaluar",
    summary: "Evaluar indicador (lectura PURA sobre fuentes read-only fail-safe; incluye Shared Timeline). Permiso: modulo.analytics.read",
    parameters: [claveParam], requestBody: jsonBody(ref("EvaluarIndicador")),
    responses: { "200": jsonOk(ref("ResultadoEvaluacion")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/indicadores/{clave}`, "get", {
    tags: ["Indicadores"], operationId: "analytics.indicador",
    summary: "Detalle de indicador (read model CQRS, snapshot completo incl. descripción). Permiso: modulo.analytics.read",
    parameters: [claveParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/indicadores/{clave}`, "put", {
    tags: ["Indicadores"], operationId: "analytics.actualizar-indicador",
    summary: "Actualizar indicador (control de versión optimista). Permiso: modulo.analytics.admin",
    parameters: [claveParam], requestBody: jsonBody(ref("ActualizarIndicador")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/indicadores/{clave}/habilitar`, "post", {
    tags: ["Indicadores"], operationId: "analytics.habilitar-indicador",
    summary: "Habilitar/deshabilitar indicador (control de versión optimista). Permiso: modulo.analytics.admin",
    parameters: [claveParam], requestBody: jsonBody(ref("HabilitarIndicador")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/indicadores/{clave}/snapshot`, "post", {
    tags: ["Snapshots"], operationId: "analytics.materializar-snapshot",
    summary: "Materializar snapshot del indicador contra datos REALES (idempotente por opId + clave determinista). Permiso: modulo.analytics.read",
    parameters: [claveParam], requestBody: jsonBody(ref("MaterializarSnapshot")),
    responses: { "200": jsonOk(ref("ResultadoSnapshot")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Snapshots ----
  add(`${BASE}/snapshots`, "get", {
    tags: ["Snapshots"], operationId: "analytics.snapshots",
    summary: "Listar snapshots materializados por indicador (read model CQRS). Permiso: modulo.analytics.read",
    parameters: [queryParam("targetClave", "Clave del indicador objetivo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });

  // ---- Dashboards ----
  add(`${BASE}/dashboards`, "get", {
    tags: ["Dashboards"], operationId: "analytics.dashboards",
    summary: "Listar dashboards (del sistema + personalizados del propietario). Permiso: modulo.analytics.read",
    parameters: [
      queryParam("delSistema", "Filtro por dashboards del sistema (true|false)", bool()),
      queryParam("propietarioId", "Filtro por propietario"),
      queryParam("limit", "Máximo de filas", int({ minimum: 1, maximum: 500 })),
    ],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/dashboards`, "post", {
    tags: ["Dashboards"], operationId: "analytics.crear-dashboard",
    summary: "Crear dashboard personalizado. Permiso: modulo.analytics.dashboard",
    requestBody: jsonBody(ref("CrearDashboard")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/dashboards/{id}`, "get", {
    tags: ["Dashboards"], operationId: "analytics.dashboard",
    summary: "Detalle de dashboard (read model CQRS). Permiso: modulo.analytics.read",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/dashboards/{id}`, "put", {
    tags: ["Dashboards"], operationId: "analytics.actualizar-dashboard",
    summary: "Actualizar dashboard (control de versión optimista; sólo propietario/no-sistema). Permiso: modulo.analytics.dashboard",
    parameters: [idParam], requestBody: jsonBody(ref("ActualizarDashboard")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/dashboards/{id}/clonar`, "post", {
    tags: ["Dashboards"], operationId: "analytics.clonar-dashboard",
    summary: "Clonar dashboard (el {id} de ruta es el dashboard ORIGEN). Permiso: modulo.analytics.dashboard",
    parameters: [pathParam("id", "Identificador del dashboard ORIGEN a clonar")],
    requestBody: jsonBody(ref("ClonarDashboard")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Clonado"), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/dashboards/{id}`, "delete", {
    tags: ["Dashboards"], operationId: "analytics.eliminar-dashboard",
    summary: "Eliminar dashboard (control de versión optimista; sólo propietario/no-sistema). Permiso: modulo.analytics.dashboard",
    parameters: [idParam], requestBody: jsonBody(ref("EliminarDashboard")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Catálogos ----
  add(`${BASE}/catalogos/{catalogo}`, "get", {
    tags: ["Catálogos"], operationId: "analytics.catalogo-opciones",
    summary: "Opciones habilitadas de un catálogo (con fallback a valores canónicos). Permiso: modulo.analytics.read",
    parameters: [pathParam("catalogo", "categorias-indicador|unidades|formatos|periodos-meta")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/catalogos`, "post", {
    tags: ["Catálogos"], operationId: "analytics.catalogo-upsert",
    summary: "Alta/edición de entrada de catálogo (jerárquica y ordenable). Permiso: modulo.analytics.admin",
    requestBody: jsonBody(ref("CatalogoUpsert")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/catalogos/habilitar`, "post", {
    tags: ["Catálogos"], operationId: "analytics.catalogo-habilitar",
    summary: "Habilitar/deshabilitar entrada de catálogo. Permiso: modulo.analytics.admin",
    requestBody: jsonBody(ref("CatalogoHabilitar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Siembra / eventos / reproyección / consola / sync ----
  add(`${BASE}/sembrar`, "post", {
    tags: ["Administración"], operationId: "analytics.sembrar-sistema",
    summary: "Sembrar el catálogo del sistema (indicadores + dashboards canónicos; idempotente por clave). Permiso: modulo.analytics.admin",
    responses: { "200": jsonOk(ref("ResultadoSembrar")), ...errores("401", "403", "409") },
  });
  add(`${BASE}/eventos`, "get", {
    tags: ["Administración"], operationId: "analytics.eventos",
    summary: "Bitácora de eventos durable del tenant (replay). Permiso: modulo.analytics.read",
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/reproyectar`, "post", {
    tags: ["Administración"], operationId: "analytics.reproyectar",
    summary: "Reproyección por replay del event log durable. Permiso: modulo.analytics.admin",
    responses: { "200": jsonOk(obj({ reproyectados: int() }, [])), ...errores("401", "403", "409") },
  });
  add(`${BASE}/consola`, "get", {
    tags: ["Administración"], operationId: "analytics.consola",
    summary: "Consola técnica del outbox del módulo. Permiso: modulo.analytics.read",
    responses: { "200": jsonOk(ref("Consola")), ...errores("401", "403", "409") },
  });
  add(`${BASE}/sync`, "post", {
    tags: ["Sincronización"], operationId: "analytics.sync",
    summary: "Sincronización offline por ORQUESTACIÓN (una UoW por operación real; idempotente por opId).",
    requestBody: jsonBody(ref("ColaSync")),
    responses: { "200": jsonOk(ref("ResumenSync")), ...errores("400", "401", "403") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Módulo Enterprise Analytics & KPI Platform (DGP-016)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Módulo de SOLO LECTURA: compone contratos públicos de Órdenes/Activos/" +
        "Inventario/Correctivo/Preventivo/Abastecimiento/Planes y del Shared " +
        "Timeline. Permisos: modulo.analytics.read (consultas/evaluación), " +
        "modulo.analytics.dashboard (dashboards), modulo.analytics.admin " +
        "(catálogos/indicadores/siembra/reproyección). Errores kernel→HTTP: " +
        "AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Indicadores" }, { name: "Evaluación" }, { name: "Snapshots" },
      { name: "Dashboards" }, { name: "Catálogos" }, { name: "Administración" },
      { name: "Sincronización" },
    ],
    paths,
    components: { schemas },
  };
}

/** Serialización canónica (2 espacios + newline final) para diffs estables. */
export function serializarOpenApi(): string {
  return `${JSON.stringify(construirOpenApi(), null, 2)}\n`;
}
