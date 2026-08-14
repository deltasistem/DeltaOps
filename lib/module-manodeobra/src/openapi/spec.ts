/**
 * DGP-020.3 · Fundación de Mano de Obra — Contrato OpenAPI 3 (contract-first)
 * VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin imports del
 * workspace) para poder ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/manodeobra`:
 * catálogo de categorías, recursos humanos, tarifas versionables, valoración de
 * sesiones (orquestada), consultas (mías/resumen/pendientes/costo-estimado).
 * Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera CADA comando/consulta del módulo.
 */

const BASE = "/api/deltaops/manodeobra";

type Schema = Record<string, unknown>;

const ref = (n: string): Schema => ({ $ref: `#/components/schemas/${n}` });
const str = (extra: Schema = {}): Schema => ({ type: "string", ...extra });
const int = (extra: Schema = {}): Schema => ({ type: "integer", ...extra });
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
const queryParam = (name: string, description: string): Schema => ({ name, in: "query", required: false, schema: str(), description });

export function construirOpenApi(): Record<string, unknown> {
  // DGP-020.3 · el DINERO viaja como CADENA decimal exacta (PUNTO FIJO, hasta 6
  // decimales) — nunca como number JS, para no perder precisión en JSON.
  const dinero = str({
    nullable: true,
    pattern: "^\\d+\\.\\d{6}$",
    description: "Monto en PUNTO FIJO como cadena decimal (numeric(18,6)); NULL cuando no hay tarifa/costo",
  });
  const dineroReq = str({ pattern: "^\\d{1,12}(\\.\\d{1,6})?$", description: "Monto en PUNTO FIJO como CADENA decimal (string-only; \\d{1,12}(\\.\\d{1,6})?). Un número JSON es rechazado." });

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    ResultadoComando: obj({ ok: bool(), idempotente: bool() }),

    // ---- Catálogo de categorías (Record Store; canónicas por defecto) ----
    UpsertCategoria: obj(
      { catalogo: str({ enum: ["categorias-mdo"] }), clave: str(), etiqueta: str(), orden: int(), opId: str() },
      ["clave"],
    ),
    HabilitarCategoria: obj(
      { catalogo: str({ enum: ["categorias-mdo"] }), clave: str(), habilitado: bool(), opId: str() },
      ["clave", "habilitado"],
    ),
    OpcionesCatalogo: obj(
      {
        catalogo: str(),
        opciones: arr(obj({ value: str(), label: str(), habilitado: bool(), canonica: bool() }, ["value", "label"])),
        unidades: arr(str({ enum: ["HORA"] })),
      },
      ["catalogo", "opciones", "unidades"],
    ),

    // ---- Recurso humano (agregado ligero) ----
    DefinirRecurso: obj(
      { identityId: str(), categoriaClave: str(), opId: str() },
      ["identityId", "categoriaClave"],
    ),
    EstadoRecurso: obj(
      { identityId: str(), estado: str({ enum: ["ACTIVO", "INACTIVO"] }), opId: str() },
      ["identityId", "estado"],
    ),
    Recurso: obj(
      {
        identityId: str(), nombre: str({ nullable: true }), categoriaClave: str(),
        estado: str({ enum: ["ACTIVO", "INACTIVO"] }),
        creadoAt: str({ format: "date-time" }), actualizadoAt: str({ format: "date-time" }),
      },
      ["identityId", "categoriaClave", "estado"],
    ),

    // ---- Tarifa versionable ----
    CrearTarifa: obj(
      {
        sujetoTipo: str({ enum: ["CATEGORIA", "IDENTIDAD"], description: "Hoy sólo CATEGORIA" }),
        sujetoId: str(), valor: dineroReq, moneda: str({ description: "ISO-4217; explícita o de la config del tenant" }),
        unidad: str({ enum: ["HORA"] }), vigenciaDesde: str({ format: "date-time" }), motivo: str(), opId: str(),
      },
      ["sujetoId", "valor"],
    ),
    ActualizarTarifa: obj(
      {
        sujetoTipo: str({ enum: ["CATEGORIA", "IDENTIDAD"] }), sujetoId: str(),
        valor: dineroReq, moneda: str(), unidad: str({ enum: ["HORA"] }),
        vigenciaDesde: str({ format: "date-time", description: "Instante de corte: cierra la vigente y abre la nueva (una UoW)" }),
        motivo: str(), opId: str(),
      },
      ["sujetoId", "valor", "vigenciaDesde"],
    ),
    CerrarTarifa: obj(
      { sujetoTipo: str({ enum: ["CATEGORIA", "IDENTIDAD"] }), sujetoId: str(), vigenciaHasta: str({ format: "date-time" }), motivo: str(), opId: str() },
      ["sujetoId", "vigenciaHasta"],
    ),
    Tarifa: obj(
      {
        id: str(), sujetoTipo: str(), sujetoId: str(), valor: dineroReq, moneda: str(), unidad: str({ enum: ["HORA"] }),
        vigenciaDesde: str({ format: "date-time" }), vigenciaHasta: str({ format: "date-time", nullable: true }),
        estado: str({ enum: ["VIGENTE", "CERRADA"] }), valorAnterior: dinero, motivo: str({ nullable: true }),
      },
      ["id", "sujetoId", "valor", "moneda", "unidad", "estado"],
    ),

    // ---- Valoración (snapshot inmutable) ----
    ProcesarSesion: obj(
      { sesionId: str(), ordenId: str({ description: "Opcional; se deriva de la sesión si se omite" }), opId: str() },
      ["sesionId"],
    ),
    Revalorar: obj({ sesionId: str(), opId: str() }, ["sesionId"]),
    Valoracion: obj(
      {
        sesionId: str(), ordenId: str(), activoId: str({ nullable: true }), identityId: str(),
        categoriaClave: str({ nullable: true }), tarifaId: str({ nullable: true }),
        tarifaValor: dinero, moneda: str({ nullable: true }), unidad: str({ nullable: true }),
        efectivoMs: int({ minimum: 0 }), costo: dinero,
        // PENDIENTE: sesión CERRADA con horas pero sin snapshot de valoración.
        // EN_CURSO: sesión ABIERTA/PAUSADA con horas acumuladas (trabajo activo).
        // Ambos se componen en la consulta por activo (hoja de vida; DGP-020.3 fix).
        estado: str({ enum: ["VALORADA", "SIN_TARIFA", "SIN_RECURSO", "PENDIENTE", "EN_CURSO"] }),
        cruzaPeriodos: bool(),
        iniciadoAt: str({ format: "date-time" }), cerradoAt: str({ format: "date-time", nullable: true }),
        valoradoAt: str({ format: "date-time" }),
      },
      ["sesionId", "ordenId", "identityId", "efectivoMs", "estado"],
    ),
    ResultadoValoracion: obj(
      {
        sesionId: str(), estado: str({ enum: ["VALORADA", "SIN_TARIFA", "SIN_RECURSO"] }),
        costo: dinero, moneda: str({ nullable: true }), yaExistia: bool(), idempotente: bool(),
      },
      ["sesionId", "estado"],
    ),
    Pendiente: obj(
      { sesionId: str(), ordenId: str(), identityId: str(), efectivoMs: int({ minimum: 0 }), cerradoAt: str({ format: "date-time", nullable: true }) },
      ["sesionId", "ordenId", "identityId"],
    ),
    CostoEstimado: obj(
      { sesionId: str(), estimado: bool(), sinTarifa: bool(), costo: dinero, moneda: str({ nullable: true }), efectivoMs: int({ minimum: 0 }) },
      ["sesionId", "estimado", "sinTarifa"],
    ),
    Resumen: obj(
      {
        ordenId: str(), efectivoMsTotal: int({ minimum: 0 }),
        costoPorMoneda: arr(obj({ moneda: str(), costo: dineroReq }, ["moneda", "costo"])),
        valoraciones: arr(ref("Valoracion")), pendientes: arr(ref("Pendiente")),
      },
      ["ordenId"],
    ),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- Catálogo de categorías ----
  add(`${BASE}/catalogo`, "get", {
    tags: ["Catálogo"], operationId: "manodeobra.catalogo.opciones",
    summary: "Opciones del catálogo de categorías (vacío ⇒ canónicas por defecto) y unidades soportadas",
    parameters: [queryParam("catalogo", "Nombre del catálogo (categorias-mdo)")],
    responses: { "200": jsonOk(ref("OpcionesCatalogo")), ...errores("401", "403") },
  });
  add(`${BASE}/catalogo`, "post", {
    tags: ["Catálogo"], operationId: "manodeobra.catalogo.upsert",
    summary: "Alta/edición de una categoría (idempotente por clave)",
    requestBody: jsonBody(ref("UpsertCategoria")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/catalogo/habilitar`, "post", {
    tags: ["Catálogo"], operationId: "manodeobra.catalogo.habilitar",
    summary: "Habilitar/deshabilitar una categoría",
    requestBody: jsonBody(ref("HabilitarCategoria")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404") },
  });

  // ---- Recursos ----
  add(`${BASE}/recursos`, "get", {
    tags: ["Recursos"], operationId: "manodeobra.recursos",
    summary: "Listar recursos humanos (con nombre resuelto por Identidad)",
    parameters: [queryParam("categoriaClave", "Filtro por categoría"), queryParam("estado", "ACTIVO | INACTIVO")],
    responses: { "200": jsonOk(obj({ recursos: arr(ref("Recurso")) }, ["recursos"])), ...errores("401", "403") },
  });
  add(`${BASE}/recursos`, "post", {
    tags: ["Recursos"], operationId: "manodeobra.recurso.definir",
    summary: "Definir/actualizar un recurso (upsert idempotente por identityId; reactiva INACTIVO)",
    requestBody: jsonBody(ref("DefinirRecurso")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/recursos/estado`, "post", {
    tags: ["Recursos"], operationId: "manodeobra.recurso.estado",
    summary: "Cambiar el estado de un recurso (ACTIVO/INACTIVO)",
    requestBody: jsonBody(ref("EstadoRecurso")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404") },
  });

  // ---- Tarifas ----
  add(`${BASE}/tarifas`, "get", {
    tags: ["Tarifas"], operationId: "manodeobra.tarifas",
    summary: "Listar tarifas de un sujeto (histórico versionado)",
    parameters: [queryParam("sujetoTipo", "CATEGORIA | IDENTIDAD"), queryParam("sujetoId", "Categoría o identidad"), queryParam("estado", "VIGENTE | CERRADA")],
    responses: { "200": jsonOk(obj({ tarifas: arr(ref("Tarifa")) }, ["tarifas"])), ...errores("401", "403") },
  });
  add(`${BASE}/tarifas`, "post", {
    tags: ["Tarifas"], operationId: "manodeobra.tarifa.crear",
    summary: "Crear tarifa (no-solape de vigencias; unidad sólo HORA; moneda explícita o de config)",
    requestBody: jsonBody(ref("CrearTarifa")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/tarifas/actualizar`, "post", {
    tags: ["Tarifas"], operationId: "manodeobra.tarifa.actualizar",
    summary: "Versionar tarifa: cierra la vigente y crea una nueva en UNA sola UoW",
    requestBody: jsonBody(ref("ActualizarTarifa")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/tarifas/cerrar`, "post", {
    tags: ["Tarifas"], operationId: "manodeobra.tarifa.cerrar",
    summary: "Cerrar la vigencia abierta de un sujeto",
    requestBody: jsonBody(ref("CerrarTarifa")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404") },
  });

  // ---- Valoración (orquestada) ----
  add(`${BASE}/valoraciones`, "get", {
    tags: ["Valoración"], operationId: "manodeobra.valoraciones",
    summary: "Listar valoraciones (por OT/activo/identidad/estado)",
    parameters: [
      queryParam("ordenId", "Filtro por OT"), queryParam("activoId", "Filtro por activo"),
      queryParam("identityId", "Filtro por identidad"), queryParam("estado", "VALORADA | SIN_TARIFA | SIN_RECURSO"),
    ],
    responses: { "200": jsonOk(obj({ valoraciones: arr(ref("Valoracion")) }, ["valoraciones"])), ...errores("401", "403") },
  });
  add(`${BASE}/valoraciones/procesar-sesion`, "post", {
    tags: ["Valoración"], operationId: "manodeobra.valoracion.procesar-sesion",
    summary: "Valorar una sesión CERRADA (idempotente por (tenant, sesión); orquestado tras el cierre de la OT)",
    description:
      "Snapshot inmutable: lee `modulo.ordenes.sesion.duraciones` (autoridad del tiempo), resuelve recurso + tarifa vigente en el inicio y persiste el costo. Reprocesar NO duplica (una valoración por sesión). Red de seguridad del cierre fail-safe.",
    requestBody: jsonBody(ref("ProcesarSesion")),
    responses: { "200": jsonOk(ref("ResultadoValoracion")), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/valoraciones/revalorar`, "post", {
    tags: ["Valoración"], operationId: "manodeobra.valoracion.revalorar",
    summary: "Revalorar (sólo SIN_TARIFA/SIN_RECURSO; VALORADA es inmutable)",
    requestBody: jsonBody(ref("Revalorar")),
    responses: { "200": jsonOk(ref("ResultadoValoracion")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/valoraciones/pendientes`, "get", {
    tags: ["Valoración"], operationId: "manodeobra.valoraciones.pendientes",
    summary: "Sesiones CERRADAS sin valoración (red de seguridad de la orquestación)",
    parameters: [queryParam("ordenId", "Filtro por OT")],
    responses: { "200": jsonOk(obj({ pendientes: arr(ref("Pendiente")) }, ["pendientes"])), ...errores("401", "403") },
  });

  // ---- Consultas de trabajador / OT ----
  add(`${BASE}/mias`, "get", {
    tags: ["Consulta"], operationId: "manodeobra.mias",
    summary: "Mis valoraciones (identidad del contexto autenticado; match canónico estricto)",
    responses: { "200": jsonOk(obj({ valoraciones: arr(ref("Valoracion")) }, ["valoraciones"])), ...errores("401", "403") },
  });
  add(`${BASE}/resumen`, "get", {
    tags: ["Consulta"], operationId: "manodeobra.resumen",
    summary: "Resumen de mano de obra por OT (agregado + pendientes)",
    parameters: [queryParam("ordenId", "OT a resumir")],
    responses: { "200": jsonOk(ref("Resumen")), ...errores("400", "401", "403") },
  });
  add(`${BASE}/costo-estimado`, "get", {
    tags: ["Consulta"], operationId: "manodeobra.costo-estimado",
    summary: "Costo estimado de una sesión en curso (tarifa vigente × tiempo actual; sinTarifa nunca 0)",
    parameters: [queryParam("sesionId", "Sesión abierta a estimar")],
    responses: { "200": jsonOk(ref("CostoEstimado")), ...errores("400", "401", "403", "404") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Fundación de Mano de Obra (DGP-020.3)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "El tiempo efectivo proviene de las sesiones de Órdenes (DGP-020.2); el módulo " +
        "no recalcula tramos ni lee tablas de otros módulos. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Catálogo" }, { name: "Recursos" }, { name: "Tarifas" },
      { name: "Valoración" }, { name: "Consulta" },
    ],
    paths,
    components: { schemas },
  };
}

/** Serialización canónica (2 espacios + newline final) para diffs estables. */
export function serializarOpenApi(): string {
  return `${JSON.stringify(construirOpenApi(), null, 2)}\n`;
}
