/**
 * DGP-011.2 · Módulo Enterprise Inventory — Contrato OpenAPI 3 (contract-first)
 * VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin imports del
 * workspace) para ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/inventario`:
 * items (CRUD + clasificación), bodegas/ubicaciones jerárquicas, lotes/series,
 * movimientos SOLO por eventos, reservas, transferencias/ajustes/conteos
 * gobernados por el Workflow Engine, catálogos configurables por tenant,
 * lecturas CQRS (detalle/listado/existencias/movimientos + proyectados),
 * reproyección (replay), sincronización offline y consola técnica. Incluye el
 * mapeo de errores kernel→HTTP (AUTH→403, NF→404, CFL→409, VAL→400, INF→500).
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera CADA comando/consulta del módulo.
 */

const BASE = "/api/deltaops/inventario";

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
  const stockBuckets = ["disponible", "reservado", "comprometido", "enTransito", "enInspeccion", "bloqueado", "vencido"];

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    ResultadoComando: obj({ id: str(), codigo: str(), sku: str(), version: int(), idempotente: bool() }),
    Stock: obj(Object.fromEntries(stockBuckets.map((b) => [b, num({ minimum: 0 })])), stockBuckets),
    CrearItem: obj(
      {
        id: str({ format: "uuid" }),
        sku: str(), nombre: str(), descripcion: str(), estado: str(),
        tipoItem: str(), categoria: str({ nullable: true }), familia: str({ nullable: true }),
        subcategoria: str({ nullable: true }), marca: str({ nullable: true }), proyecto: str({ nullable: true }),
        unidadBase: obj({ clave: str(), etiqueta: str(), factorBase: num() }, ["clave"]),
        modoTrazabilidad: str(), controlaVencimiento: bool(),
        reposicion: obj({ minimo: num(), maximo: num(), puntoReorden: num() }, []),
        leadTimeDias: int({ minimum: 0 }),
        opId: str(),
      },
      ["sku", "nombre", "tipoItem", "unidadBase", "modoTrazabilidad"],
    ),
    EditarItem: obj(
      { id: str(), expectedVersion: int({ minimum: 1 }), nombre: str(), descripcion: str({ nullable: true }), estado: str(), opId: str() },
      ["id"],
    ),
    EliminarItem: obj({ id: str(), expectedVersion: int({ minimum: 1 }), motivo: str(), opId: str() }, ["id"]),
    CrearBodega: obj(
      { id: str({ format: "uuid" }), codigo: str(), nombre: str(), tipo: str(), empresaId: str({ nullable: true }), opId: str() },
      ["codigo", "nombre", "tipo"],
    ),
    CrearUbicacion: obj(
      { id: str({ format: "uuid" }), bodegaId: str(), nivel: str(), valor: str(), padreId: str({ nullable: true }), opId: str() },
      ["bodegaId", "nivel", "valor"],
    ),
    CrearLote: obj(
      { id: str({ format: "uuid" }), itemId: str(), codigo: str(), vencimiento: str({ format: "date", nullable: true }), opId: str() },
      ["itemId", "codigo"],
    ),
    RegistrarSerie: obj(
      { id: str({ format: "uuid" }), itemId: str(), numero: str(), loteId: str({ nullable: true }), opId: str() },
      ["itemId", "numero"],
    ),
    Mover: obj(
      {
        id: str({ format: "uuid" }), itemId: str(), bodegaId: str(), ubicacionId: str(),
        tipo: str(), cantidad: num(), loteId: str({ nullable: true }), serieId: str({ nullable: true }),
        costoUnitario: num({ nullable: true }), moneda: str({ nullable: true }), referencia: str({ nullable: true }), opId: str(),
      },
      ["itemId", "bodegaId", "ubicacionId", "tipo", "cantidad"],
    ),
    Reservar: obj(
      {
        id: str({ format: "uuid" }), itemId: str(), bodegaId: str(), ubicacionId: str(), cantidad: num(),
        demanda: obj({ tipo: str(), id: str() }, ["tipo", "id"]), opId: str(),
      },
      ["itemId", "bodegaId", "ubicacionId", "cantidad", "demanda"],
    ),
    LiberarReserva: obj({ id: str(), expectedVersion: int({ minimum: 1 }), motivo: str(), opId: str() }, ["id"]),
    Extremo: obj(
      {
        bodegaId: str(), ubicacionId: str(),
        empresa: str({ nullable: true }), proyecto: str({ nullable: true }), centroCosto: str({ nullable: true }),
      },
      ["bodegaId", "ubicacionId"],
    ),
    LineaTransferencia: obj(
      { itemId: str(), cantidad: num({ exclusiveMinimum: 0 }), loteCodigo: str({ nullable: true }), serieNumero: str({ nullable: true }) },
      ["itemId", "cantidad"],
    ),
    Transferir: obj(
      { id: str({ format: "uuid" }), opId: str(), origen: ref("Extremo"), destino: ref("Extremo"), lineas: arr(ref("LineaTransferencia")) },
      ["origen", "destino", "lineas"],
    ),
    CompletarTransferencia: obj({ id: str(), expectedVersion: int({ minimum: 1 }), opId: str() }, ["id", "expectedVersion"]),
    TransicionarTransferencia: obj(
      {
        id: str(),
        accion: str({ enum: ["recibir", "completar", "cancelar", "rechazar"] }),
        expectedVersion: int({ minimum: 1 }),
        opId: str(),
        motivo: str(),
      },
      ["id", "accion", "expectedVersion"],
    ),
    Ajustar: obj(
      {
        id: str({ format: "uuid" }), itemId: str(), bodegaId: str(), ubicacionId: str(),
        tipo: str(), cantidad: num(), motivo: str(), aprobado: bool(), loteId: str({ nullable: true }), opId: str(),
      },
      ["itemId", "bodegaId", "ubicacionId", "tipo", "cantidad", "motivo"],
    ),
    IniciarConteo: obj(
      {
        id: str({ format: "uuid" }), opId: str(), tipo: str(),
        alcance: obj({ tipo: str(), id: str() }, ["tipo", "id"]),
        lineas: arr(obj({ inventarioId: str() }, ["inventarioId"])),
      },
      ["tipo", "lineas"],
    ),
    RegistrarConteo: obj(
      {
        id: str(), expectedVersion: int({ minimum: 1 }), opId: str(),
        contados: arr(obj({ inventarioId: str(), cantidad: num({ minimum: 0 }) }, ["inventarioId", "cantidad"])),
      },
      ["id", "expectedVersion", "contados"],
    ),
    CerrarConteo: obj(
      { id: str(), expectedVersion: int({ minimum: 1 }), opId: str(), aplicarDiferencias: bool() },
      ["id", "expectedVersion", "aplicarDiferencias"],
    ),
    CatalogoUpsert: obj({ catalogo: str(), clave: str(), etiqueta: str(), posicion: int(), padre: str({ nullable: true }) }, ["catalogo", "clave", "etiqueta"]),
    CatalogoHabilitar: obj({ catalogo: str(), clave: str(), habilitado: bool() }, ["catalogo", "clave", "habilitado"]),
    OperacionSync: obj({ opId: str(), comando: str(), input: obj({}, []) }, ["opId", "comando", "input"]),
    ColaSync: obj({ operaciones: arr(ref("OperacionSync")) }, ["operaciones"]),
    ResumenSync: obj({
      total: int(), aplicadas: int(), idempotentes: int(), conflictos: int(),
      reintentables: int(), rechazadas: int(), resultados: arr(obj({}, [])),
    }),
    Existencia: obj({
      id: str(), itemId: str(), bodegaId: str(), ubicacionId: str(),
      stock: ref("Stock"), total: num(), version: int(),
    }),
    Consola: obj({
      statsItems: obj({}, []), eventLog: obj({}, []), proyecciones: obj({}, []),
      outbox: obj({}, []), receipts: arr(obj({}, [])), tablasRLS: arr(str()),
    }),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- Items (CRUD + listado + detalle CQRS) ----
  add(BASE, "get", {
    tags: ["Items"], operationId: "inventario.items", summary: "Listar items (read model CQRS) con filtros",
    parameters: [
      ...["estado", "tipoItem"].map((p) => queryParam(p, `Filtro por ${p}`)),
      { name: "incluirEliminados", in: "query", required: false, schema: bool() },
      { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) },
    ],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(BASE, "post", {
    tags: ["Items"], operationId: "inventario.crear-item", summary: "Crear item (idempotente por id de cliente)",
    requestBody: jsonBody(ref("CrearItem")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/{id}`, "get", {
    tags: ["Items"], operationId: "inventario.item", summary: "Detalle de item (read model CQRS)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/{id}`, "put", {
    tags: ["Items"], operationId: "inventario.editar-item", summary: "Editar item (concurrencia optimista)",
    parameters: [idParam], requestBody: jsonBody(ref("EditarItem")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/{id}`, "delete", {
    tags: ["Items"], operationId: "inventario.eliminar-item", summary: "Eliminar (soft-delete) item",
    parameters: [idParam], requestBody: jsonBody(ref("EliminarItem")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Bodegas / ubicaciones ----
  add(`${BASE}/bodegas`, "post", {
    tags: ["Bodegas"], operationId: "inventario.crear-bodega", summary: "Crear bodega",
    requestBody: jsonBody(ref("CrearBodega")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/ubicaciones`, "post", {
    tags: ["Bodegas"], operationId: "inventario.crear-ubicacion", summary: "Crear ubicación jerárquica",
    requestBody: jsonBody(ref("CrearUbicacion")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/bodegas`, "get", {
    tags: ["Bodegas"], operationId: "inventario.bodegas", summary: "Listar bodegas (read model)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/bodegas/{id}`, "get", {
    tags: ["Bodegas"], operationId: "inventario.bodega", summary: "Detalle de bodega (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/ubicaciones`, "get", {
    tags: ["Bodegas"], operationId: "inventario.ubicaciones", summary: "Listar ubicaciones (read model)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/ubicaciones/{id}`, "get", {
    tags: ["Bodegas"], operationId: "inventario.ubicacion", summary: "Detalle de ubicación (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });

  // ---- Lotes / series ----
  add(`${BASE}/lotes`, "post", {
    tags: ["Trazabilidad"], operationId: "inventario.crear-lote", summary: "Crear lote (con vencimiento opcional)",
    requestBody: jsonBody(ref("CrearLote")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/series`, "post", {
    tags: ["Trazabilidad"], operationId: "inventario.registrar-serie", summary: "Registrar serie",
    requestBody: jsonBody(ref("RegistrarSerie")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/lotes`, "get", {
    tags: ["Trazabilidad"], operationId: "inventario.lotes", summary: "Listar lotes (read model)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/lotes/{id}`, "get", {
    tags: ["Trazabilidad"], operationId: "inventario.lote", summary: "Detalle de lote (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/series`, "get", {
    tags: ["Trazabilidad"], operationId: "inventario.series", summary: "Listar series (read model)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/series/{id}`, "get", {
    tags: ["Trazabilidad"], operationId: "inventario.serie", summary: "Detalle de serie (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });

  // ---- Existencias / movimientos ----
  add(`${BASE}/existencias/{id}`, "get", {
    tags: ["Existencias"], operationId: "inventario.existencia", summary: "Detalle de existencia por id (read model)",
    parameters: [idParam], responses: { "200": jsonOk(ref("Existencia")), ...errores("401", "403", "404") },
  });
  add(`${BASE}/items/{itemId}/existencias`, "get", {
    tags: ["Existencias"], operationId: "inventario.existencias-item", summary: "Existencias/disponibilidad por item (read model)",
    parameters: [pathParam("itemId", "Identificador del item")],
    responses: { "200": jsonOk(arr(ref("Existencia"))), ...errores("401", "403") },
  });
  add(`${BASE}/mover`, "post", {
    tags: ["Existencias"], operationId: "inventario.mover", summary: "Registrar movimiento (el stock SOLO cambia por evento)",
    requestBody: jsonBody(ref("Mover")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/existencias/{id}/movimientos`, "get", {
    tags: ["Existencias"], operationId: "inventario.movimientos", summary: "Historial de movimientos (read model)",
    parameters: [pathParam("id", "Identificador de la existencia"), { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });

  // ---- Reservas ----
  add(`${BASE}/reservas`, "post", {
    tags: ["Reservas"], operationId: "inventario.reservar", summary: "Reservar existencias para OT/proyecto/solicitud",
    requestBody: jsonBody(ref("Reservar")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/reservas/{id}/liberar`, "post", {
    tags: ["Reservas"], operationId: "inventario.liberar-reserva", summary: "Liberar reserva",
    parameters: [idParam], requestBody: jsonBody(ref("LiberarReserva")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/reservas`, "get", {
    tags: ["Reservas"], operationId: "inventario.reservas", summary: "Listar reservas (read model)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/reservas/{id}`, "get", {
    tags: ["Reservas"], operationId: "inventario.reserva", summary: "Detalle de reserva (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });

  // ---- Transferencias (gobernadas) ----
  add(`${BASE}/transferencias`, "post", {
    tags: ["Transferencias"], operationId: "inventario.transferir", summary: "Iniciar transferencia (gobernada por Workflow Engine)",
    requestBody: jsonBody(ref("Transferir")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/transferencias/{id}/completar`, "post", {
    tags: ["Transferencias"], operationId: "inventario.completar-transferencia", summary: "Completar transferencia (aprobación gobernada)",
    parameters: [idParam], requestBody: jsonBody(ref("CompletarTransferencia")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/transferencias/{id}/transicion`, "post", {
    tags: ["Transferencias"], operationId: "inventario.transicionar-transferencia",
    summary: "Transición gobernada del ciclo de vida (recibir/completar/cancelar/rechazar). Sólo recibir/completar aplican la entrada en destino; cancelar/rechazar liberan el en-tránsito al origen.",
    parameters: [idParam], requestBody: jsonBody(ref("TransicionarTransferencia")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/transferencias`, "get", {
    tags: ["Transferencias"], operationId: "inventario.transferencias", summary: "Listar transferencias (read model)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/transferencias/{id}`, "get", {
    tags: ["Transferencias"], operationId: "inventario.transferencia", summary: "Detalle de transferencia (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });

  // ---- Ajustes (gobernados) ----
  add(`${BASE}/ajustes`, "post", {
    tags: ["Ajustes"], operationId: "inventario.ajustar", summary: "Ajustar existencias (gobernado por Workflow Engine)",
    requestBody: jsonBody(ref("Ajustar")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/ajustes`, "get", {
    tags: ["Ajustes"], operationId: "inventario.ajustes", summary: "Listar ajustes (read model)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/ajustes/{id}`, "get", {
    tags: ["Ajustes"], operationId: "inventario.ajuste", summary: "Detalle de ajuste (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });

  // ---- Conteos (gobernados) ----
  add(`${BASE}/conteos`, "post", {
    tags: ["Conteos"], operationId: "inventario.iniciar-conteo", summary: "Iniciar conteo físico (gobernado por Workflow Engine)",
    requestBody: jsonBody(ref("IniciarConteo")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/conteos/{id}/registrar`, "post", {
    tags: ["Conteos"], operationId: "inventario.registrar-conteo", summary: "Registrar lecturas del conteo",
    parameters: [idParam], requestBody: jsonBody(ref("RegistrarConteo")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/conteos/{id}/cerrar`, "post", {
    tags: ["Conteos"], operationId: "inventario.cerrar-conteo", summary: "Cerrar conteo y conciliar (aprobación gobernada)",
    parameters: [idParam], requestBody: jsonBody(ref("CerrarConteo")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/conteos`, "get", {
    tags: ["Conteos"], operationId: "inventario.conteos", summary: "Listar conteos (read model)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/conteos/{id}`, "get", {
    tags: ["Conteos"], operationId: "inventario.conteo", summary: "Detalle de conteo (read model)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });

  // ---- Catálogos ----
  add(`${BASE}/catalogos/{catalogo}`, "get", {
    tags: ["Catálogos"], operationId: "inventario.catalogo-opciones", summary: "Opciones habilitadas de un catálogo",
    parameters: [pathParam("catalogo", "Nombre del catálogo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/catalogos`, "post", {
    tags: ["Catálogos"], operationId: "inventario.catalogo-upsert", summary: "Alta/edición de entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoUpsert")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/catalogos/habilitar`, "post", {
    tags: ["Catálogos"], operationId: "inventario.catalogo-habilitar", summary: "Habilitar/deshabilitar entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoHabilitar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Reproyección / sync / consola ----
  add(`${BASE}/reproyectar`, "post", {
    tags: ["Administración"], operationId: "inventario.reproyectar",
    summary: "Reproyección por replay del event log durable (admin)",
    responses: { "200": jsonOk(obj({ reproyectados: int() }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/sync`, "post", {
    tags: ["Sincronización"], operationId: "inventario.sync",
    summary: "Sincronización offline por orquestación (idempotente por opId)",
    requestBody: jsonBody(ref("ColaSync")),
    responses: { "200": jsonOk(ref("ResumenSync")), ...errores("400", "401", "403") },
  });
  add(`${BASE}/consola`, "get", {
    tags: ["Administración"], operationId: "inventario.consola", summary: "Consola técnica (admin)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(ref("Consola")), ...errores("401", "403") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Módulo Enterprise Inventory (DGP-011)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Items" }, { name: "Bodegas" }, { name: "Trazabilidad" },
      { name: "Existencias" }, { name: "Reservas" }, { name: "Transferencias" },
      { name: "Ajustes" }, { name: "Conteos" }, { name: "Catálogos" },
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
