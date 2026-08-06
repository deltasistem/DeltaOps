/**
 * DGP-013.2 · Módulo Enterprise Procurement — Contrato OpenAPI 3 (contract-first)
 * VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin imports del
 * workspace) para ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/abastecimiento`:
 * catálogo de artículos y proveedores (alta/edición/calificación), solicitudes de
 * compra + cotizaciones (registro/selección), órdenes de compra (gobierno por
 * Workflow Engine), recepciones + materialización de inventario (compone el
 * comando oficial `modulo.inventario.mover`), costos (read model), catálogos
 * configurables por tenant, lecturas CQRS (detalle/listado desde read models),
 * reproyección (replay), sincronización offline y consola técnica. Incluye el
 * mapeo de errores kernel→HTTP (AUTH→403, NF→404, CFL→409, VAL→400, INF→500).
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera CADA comando/consulta del módulo.
 */

const BASE = "/api/deltaops/abastecimiento";

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
  const referenciaExterna = obj({ tipo: str(), id: str(), etiqueta: str() }, ["tipo", "id"]);
  const cantidad = obj({ valor: num({ minimum: 0 }), unidad: str() }, ["valor", "unidad"]);
  const precio = obj({ monto: num({ minimum: 0 }), moneda: str() }, ["monto", "moneda"]);

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    ResultadoComando: obj({ id: str(), codigo: str(), estado: str(), version: int(), idempotente: bool() }),
    ReferenciaExterna: referenciaExterna,
    LineaSolicitud: obj(
      {
        numero: int({ minimum: 1 }), descripcion: str(), articuloId: str({ nullable: true }),
        referencia: referenciaExterna, cantidad, unidad: str(), notas: str({ nullable: true }),
      },
      ["descripcion", "cantidad"],
    ),
    LineaCotizacion: obj(
      {
        numeroLineaSolicitud: int({ minimum: 1 }), descripcion: str(), articuloId: str({ nullable: true }),
        cantidad, precioUnitario: precio, plazoEntregaDias: int({ minimum: 0 }),
      },
      ["descripcion", "cantidad", "precioUnitario"],
    ),
    LineaOrdenCompra: obj(
      {
        numero: int({ minimum: 1 }), descripcion: str(), articuloId: str({ nullable: true }),
        referencia: referenciaExterna, bodega: referenciaExterna, cantidad, precioUnitario: precio,
      },
      ["descripcion", "cantidad", "precioUnitario"],
    ),
    LineaRecepcion: obj(
      {
        numeroLineaOC: int({ minimum: 1 }), cantidad, novedad: str(),
        bodega: referenciaExterna, lote: str({ nullable: true }), serie: str({ nullable: true }),
      },
      ["numeroLineaOC", "cantidad"],
    ),
    OrigenSolicitud: obj(
      {
        tipo: str(), referenciaId: str({ nullable: true }),
        referenciaTipo: str({ nullable: true }), etiqueta: str({ nullable: true }),
      },
      ["tipo"],
    ),
    CrearArticulo: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        nombre: str(), descripcion: str({ nullable: true }), tipo: str(), unidad: str(),
        familia: str({ nullable: true }), metodoValoracion: str(), moneda: str(),
        costoEstandar: num({ minimum: 0 }), toleranciaSobreRecepcion: num({ minimum: 0, maximum: 1 }),
        inventarioItemId: str({ nullable: true }),
      },
      ["nombre", "tipo", "unidad", "metodoValoracion", "moneda"],
    ),
    EditarArticulo: obj(
      {
        id: str(), expectedVersion: int({ minimum: 1 }), opId: str(),
        nombre: str(), descripcion: str({ nullable: true }), familia: str({ nullable: true }),
        unidad: str(), metodoValoracion: str(), toleranciaSobreRecepcion: num({ minimum: 0, maximum: 1 }),
        inventarioItemId: str({ nullable: true }), activo: bool(), costoEstandar: num({ minimum: 0 }),
      },
      ["id", "expectedVersion"],
    ),
    CrearProveedor: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        razonSocial: str(), nombreComercial: str({ nullable: true }),
        identificacionTributaria: str({ nullable: true }), tipo: str(),
        monedaPreferida: str({ nullable: true }),
        contactos: arr(obj({}, [])), certificaciones: arr(obj({}, [])), sla: obj({}, []),
      },
      ["razonSocial", "tipo"],
    ),
    EditarProveedor: obj(
      {
        id: str(), expectedVersion: int({ minimum: 1 }), opId: str(),
        razonSocial: str(), nombreComercial: str({ nullable: true }),
        identificacionTributaria: str({ nullable: true }), tipo: str(),
        monedaPreferida: str({ nullable: true }),
        contactos: arr(obj({}, [])), certificaciones: arr(obj({}, [])), sla: obj({}, []), activo: bool(),
      },
      ["id", "expectedVersion"],
    ),
    CalificarProveedor: obj(
      {
        id: str(), expectedVersion: int({ minimum: 1 }), opId: str(),
        calidad: num({ minimum: 0, maximum: 5 }), tiempo: num({ minimum: 0, maximum: 5 }),
        precio: num({ minimum: 0, maximum: 5 }), servicio: num({ minimum: 0, maximum: 5 }),
        nota: str({ nullable: true }),
      },
      ["id", "expectedVersion", "calidad", "tiempo", "precio", "servicio"],
    ),
    CrearSolicitud: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        titulo: str(), descripcion: str({ nullable: true }), prioridad: str(),
        origen: ref("OrigenSolicitud"), lineas: arr(ref("LineaSolicitud")),
      },
      ["titulo", "prioridad", "origen", "lineas"],
    ),
    TransicionarSolicitud: obj(
      {
        id: str(), accion: str({ enum: ["enviar", "aprobar", "rechazar", "cerrar"] }),
        expectedVersion: int({ minimum: 1 }), motivoRechazo: str({ nullable: true }), opId: str(),
      },
      ["id", "accion", "expectedVersion"],
    ),
    RegistrarCotizacion: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        solicitudId: str(), proveedorId: str(), moneda: str(),
        condicionesPago: str({ nullable: true }), vigenteHasta: str({ nullable: true }),
        lineas: arr(ref("LineaCotizacion")),
      },
      ["solicitudId", "proveedorId", "moneda", "lineas"],
    ),
    SeleccionarCotizacion: obj(
      {
        solicitudId: str(), cotizacionId: str(),
        pesos: obj({ precio: num({ minimum: 0 }), plazoEntrega: num({ minimum: 0 }), calificacion: num({ minimum: 0 }) }, []),
        opId: str(),
      },
      ["solicitudId"],
    ),
    CrearOrdenCompra: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        proveedorId: str(), solicitudId: str({ nullable: true }), cotizacionId: str({ nullable: true }),
        moneda: str(), condicionesPago: str({ nullable: true }), condicionesEntrega: str({ nullable: true }),
        lineas: arr(ref("LineaOrdenCompra")),
      },
      ["proveedorId", "moneda", "lineas"],
    ),
    TransicionarOrdenCompra: obj(
      {
        id: str(), accion: str({ enum: ["aprobar", "enviar", "cancelar"] }),
        expectedVersion: int({ minimum: 1 }), opId: str(),
      },
      ["id", "accion", "expectedVersion"],
    ),
    RegistrarRecepcion: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        ordenCompraId: str(), expectedVersion: int({ minimum: 1 }),
        nota: str({ nullable: true }), lineas: arr(ref("LineaRecepcion")),
      },
      ["ordenCompraId", "expectedVersion", "lineas"],
    ),
    MaterializarRecepcion: obj(
      {
        opId: str(), recepcionId: str(),
        bodegaId: str({ nullable: true }), ubicacionId: str({ nullable: true }),
      },
      ["recepcionId"],
    ),
    CatalogoUpsert: obj(
      { catalogo: str(), clave: str(), etiqueta: str(), posicion: int(), padre: str({ nullable: true }) },
      ["catalogo", "clave", "etiqueta"],
    ),
    CatalogoHabilitar: obj({ catalogo: str(), clave: str(), habilitado: bool() }, ["catalogo", "clave", "habilitado"]),
    Costo: obj(
      {
        articuloId: str(), moneda: str(), metodoValoracion: str(),
        costoUnitario: num({ minimum: 0 }), cantidadAcumulada: num({ minimum: 0 }),
      },
      ["articuloId", "moneda"],
    ),
    OperacionSync: obj({ opId: str(), comando: str(), input: obj({}, []) }, ["opId", "comando", "input"]),
    ColaSync: obj({ operaciones: arr(ref("OperacionSync")) }, ["operaciones"]),
    ResumenSync: obj({
      total: int(), aplicadas: int(), idempotentes: int(), conflictos: int(),
      reintentables: int(), rechazadas: int(), resultados: arr(obj({}, [])),
    }),
    Consola: obj({
      pendientes: int(), procesados: int(), ultimos: arr(obj({}, [])), tablasRLS: arr(str()),
    }),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- Artículos (catálogo maestro) ----
  add(`${BASE}/articulos`, "get", {
    tags: ["Artículos"], operationId: "abastecimiento.articulos", summary: "Listar artículos (read model CQRS) con filtros",
    parameters: [...["tipo", "familia", "activo"].map((p) => queryParam(p, `Filtro por ${p}`)), { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/articulos`, "post", {
    tags: ["Artículos"], operationId: "abastecimiento.crear-articulo", summary: "Crear artículo del catálogo (idempotente por id de cliente)",
    requestBody: jsonBody(ref("CrearArticulo")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/articulos/{id}`, "get", {
    tags: ["Artículos"], operationId: "abastecimiento.articulo", summary: "Detalle de artículo (read model CQRS, snapshot completo)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/articulos/{id}`, "put", {
    tags: ["Artículos"], operationId: "abastecimiento.editar-articulo", summary: "Editar artículo (concurrencia optimista)",
    parameters: [idParam], requestBody: jsonBody(ref("EditarArticulo")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/articulos/{id}/costos`, "get", {
    tags: ["Artículos"], operationId: "abastecimiento.costos", summary: "Costos valorizados del artículo (read model; Inventario es la autoridad)",
    parameters: [idParam], responses: { "200": jsonOk(arr(ref("Costo"))), ...errores("401", "403") },
  });

  // ---- Proveedores ----
  add(`${BASE}/proveedores`, "get", {
    tags: ["Proveedores"], operationId: "abastecimiento.proveedores", summary: "Listar proveedores (read model CQRS)",
    parameters: [...["tipo", "activo"].map((p) => queryParam(p, `Filtro por ${p}`)), { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/proveedores`, "post", {
    tags: ["Proveedores"], operationId: "abastecimiento.crear-proveedor", summary: "Crear proveedor (idempotente por id de cliente)",
    requestBody: jsonBody(ref("CrearProveedor")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/proveedores/{id}`, "get", {
    tags: ["Proveedores"], operationId: "abastecimiento.proveedor", summary: "Detalle de proveedor (read model CQRS)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/proveedores/{id}`, "put", {
    tags: ["Proveedores"], operationId: "abastecimiento.editar-proveedor", summary: "Editar proveedor (concurrencia optimista)",
    parameters: [idParam], requestBody: jsonBody(ref("EditarProveedor")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/proveedores/{id}/calificar`, "post", {
    tags: ["Proveedores"], operationId: "abastecimiento.calificar-proveedor", summary: "Calificar proveedor (calidad/tiempo/precio/servicio)",
    parameters: [idParam], requestBody: jsonBody(ref("CalificarProveedor")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Solicitudes de compra ----
  add(`${BASE}/solicitudes`, "get", {
    tags: ["Solicitudes"], operationId: "abastecimiento.solicitudes", summary: "Listar solicitudes de compra (read model CQRS)",
    parameters: [queryParam("estado", "Filtro por estado"), { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/solicitudes`, "post", {
    tags: ["Solicitudes"], operationId: "abastecimiento.crear-solicitud", summary: "Crear solicitud de compra (idempotente por id de cliente)",
    requestBody: jsonBody(ref("CrearSolicitud")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/solicitudes/{id}`, "get", {
    tags: ["Solicitudes"], operationId: "abastecimiento.solicitud", summary: "Detalle de solicitud (read model CQRS, snapshot completo)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/solicitudes/{id}/transicion`, "post", {
    tags: ["Solicitudes"], operationId: "abastecimiento.transicionar-solicitud",
    summary: "Transición gobernada de la solicitud (enviar/aprobar/rechazar/cerrar) vía Workflow Engine",
    parameters: [idParam], requestBody: jsonBody(ref("TransicionarSolicitud")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/solicitudes/{id}/cotizaciones`, "get", {
    tags: ["Cotizaciones"], operationId: "abastecimiento.cotizaciones", summary: "Cotizaciones de una solicitud (read model)",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/solicitudes/{id}/seleccionar-cotizacion`, "post", {
    tags: ["Cotizaciones"], operationId: "abastecimiento.seleccionar-cotizacion",
    summary: "Comparar cotizaciones y seleccionar ganadora (ranking multicriterio)",
    parameters: [idParam], requestBody: jsonBody(ref("SeleccionarCotizacion")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Cotizaciones (registro) ----
  add(`${BASE}/cotizaciones`, "post", {
    tags: ["Cotizaciones"], operationId: "abastecimiento.registrar-cotizacion", summary: "Registrar cotización de un proveedor para una solicitud",
    requestBody: jsonBody(ref("RegistrarCotizacion")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Órdenes de compra ----
  add(`${BASE}/ordenes-compra`, "get", {
    tags: ["Órdenes de compra"], operationId: "abastecimiento.ordenes-compra", summary: "Listar órdenes de compra (read model CQRS)",
    parameters: [...["estado", "proveedorId"].map((p) => queryParam(p, `Filtro por ${p}`)), { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/ordenes-compra`, "post", {
    tags: ["Órdenes de compra"], operationId: "abastecimiento.crear-orden-compra", summary: "Crear orden de compra (idempotente por id de cliente)",
    requestBody: jsonBody(ref("CrearOrdenCompra")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creado"), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/ordenes-compra/{id}`, "get", {
    tags: ["Órdenes de compra"], operationId: "abastecimiento.orden-compra", summary: "Detalle de orden de compra (read model CQRS, snapshot completo)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/ordenes-compra/{id}/transicion`, "post", {
    tags: ["Órdenes de compra"], operationId: "abastecimiento.transicionar-orden-compra",
    summary: "Transición gobernada de la OC (aprobar/enviar/cancelar) vía Workflow Engine",
    parameters: [idParam], requestBody: jsonBody(ref("TransicionarOrdenCompra")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/ordenes-compra/{id}/recepciones`, "get", {
    tags: ["Recepciones"], operationId: "abastecimiento.recepciones", summary: "Recepciones de una OC (read model)",
    parameters: [idParam], responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });

  // ---- Recepciones + materialización de inventario ----
  add(`${BASE}/recepciones`, "post", {
    tags: ["Recepciones"], operationId: "abastecimiento.registrar-recepcion",
    summary: "Registrar recepción de una OC (recibe parcial/total; actualiza costos; gobernado por Workflow Engine)",
    requestBody: jsonBody(ref("RegistrarRecepcion")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Registrada"), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/recepciones/{id}/materializar`, "post", {
    tags: ["Recepciones"], operationId: "abastecimiento.materializar-recepcion",
    summary: "Materializar recepción como movimientos de inventario componiendo el comando oficial modulo.inventario.mover (idempotente por opId=recepcionId:linea)",
    parameters: [idParam], requestBody: jsonBody(ref("MaterializarRecepcion")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Catálogos ----
  add(`${BASE}/catalogos/{catalogo}`, "get", {
    tags: ["Catálogos"], operationId: "abastecimiento.catalogo-opciones", summary: "Opciones habilitadas de un catálogo",
    parameters: [pathParam("catalogo", "Nombre del catálogo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/catalogos`, "post", {
    tags: ["Catálogos"], operationId: "abastecimiento.catalogo-upsert", summary: "Alta/edición de entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoUpsert")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/catalogos/habilitar`, "post", {
    tags: ["Catálogos"], operationId: "abastecimiento.catalogo-habilitar", summary: "Habilitar/deshabilitar entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoHabilitar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Historial / eventos / reproyección / sync / consola ----
  add(`${BASE}/historial`, "get", {
    tags: ["Administración"], operationId: "abastecimiento.historial", summary: "Historial de hitos por entidad (entityRef)",
    parameters: [queryParam("entityRef", "Referencia de entidad (p.ej. orden-compra:<id>)")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403", "404") },
  });
  add(`${BASE}/eventos`, "get", {
    tags: ["Administración"], operationId: "abastecimiento.eventos", summary: "Bitácora de eventos durable del tenant (replay)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/reproyectar`, "post", {
    tags: ["Administración"], operationId: "abastecimiento.reproyectar",
    summary: "Reproyección por replay del event log durable (admin)",
    responses: { "200": jsonOk(obj({ reproyectados: int() }, [])), ...errores("401", "403") },
  });
  add(`${BASE}/sync`, "post", {
    tags: ["Sincronización"], operationId: "abastecimiento.sync",
    summary: "Sincronización offline por orquestación (idempotente por opId)",
    requestBody: jsonBody(ref("ColaSync")),
    responses: { "200": jsonOk(ref("ResumenSync")), ...errores("400", "401", "403") },
  });
  add(`${BASE}/consola`, "get", {
    tags: ["Administración"], operationId: "abastecimiento.consola", summary: "Consola técnica del outbox del módulo (admin)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(ref("Consola")), ...errores("401", "403") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Módulo Enterprise Procurement & Supply Chain (DGP-013)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Artículos" }, { name: "Proveedores" }, { name: "Solicitudes" },
      { name: "Cotizaciones" }, { name: "Órdenes de compra" }, { name: "Recepciones" },
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
