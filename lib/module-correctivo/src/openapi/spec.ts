/**
 * DGP-015.2 · Módulo Enterprise Corrective Maintenance — Contrato OpenAPI 3
 * (contract-first) VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin
 * imports del workspace) para ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/correctivo`:
 * solicitudes correctivas (alta/edición/evidencia/comentario, diagnóstico anclado
 * a Dynamic Forms, gobierno de ciclo por Workflow Engine), generación idempotente
 * de OTs correctivas (compone el comando oficial `modulo.ordenes.crear`, tipo
 * canónico "correctiva"), intervenciones (creación/asignación de cuadrillas/
 * gobierno), composición con Inventario (reserva/consumo parcial/devolución) y
 * Abastecimiento (solicitud de compra ante stock insuficiente), eventos de activo
 * (historial de fallas / reincidencia), lecturas CQRS (detalle/listado desde read
 * models), catálogos, eventos, reproyección (replay), sincronización offline y
 * consola técnica. Incluye el mapeo de errores kernel→HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500).
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera CADA comando/consulta del módulo.
 */

const BASE = "/api/deltaops/correctivo";

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
  const objeto = obj(
    { activoId: str(), componenteId: str({ nullable: true }), ubicacionId: str({ nullable: true }) },
    ["activoId"],
  );
  const sintoma = obj({ clave: str({ nullable: true }), texto: str({ nullable: true }) }, []);
  const clasificacion = obj(
    {
      tipoFalla: str({ nullable: true }), modoFalla: str({ nullable: true }), causa: str({ nullable: true }),
      efecto: str({ nullable: true }), severidad: str({ nullable: true }), impacto: str({ nullable: true }),
    },
    [],
  );
  const evidencia = obj(
    { attachmentId: str(), tipo: str({ description: "foto|video|documento|audio" }), etiqueta: str({ nullable: true }) },
    ["attachmentId", "tipo"],
  );
  const referenciaExterna = obj({ tipo: str(), id: str(), etiqueta: str() }, ["tipo", "id"]);
  const cuadrilla = obj(
    {
      cuadrillaId: str(), etiqueta: str({ nullable: true }),
      responsables: arr(obj({ responsableId: str(), rol: str() }, ["responsableId", "rol"])),
      recursos: arr(obj({ tipo: str(), referencia: referenciaExterna, cantidad: num({ minimum: 0 }) }, ["tipo", "referencia"])),
    },
    ["cuadrillaId", "responsables"],
  );
  const lineaRepuesto = obj(
    { inventarioId: str(), articuloId: str(), cantidad: num({ exclusiveMinimum: 0 }), unidad: str() },
    ["inventarioId", "articuloId", "cantidad", "unidad"],
  );
  const referenciaPlantilla = obj({ plantillaId: str(), version: int({ minimum: 1 }) }, ["plantillaId", "version"]);

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    ResultadoComando: obj({ id: str(), codigo: str(), estado: str(), version: int(), idempotente: bool() }),
    ObjetoAfectado: objeto,
    Clasificacion: clasificacion,
    Evidencia: evidencia,
    Cuadrilla: cuadrilla,
    LineaRepuesto: lineaRepuesto,
    ReferenciaPlantilla: referenciaPlantilla,
    CrearSolicitud: obj(
      {
        id: str({ format: "uuid" }), opId: str(),
        titulo: str(), descripcion: str({ nullable: true }),
        origen: str({ description: "operador|supervisor|produccion|calidad|sst|iot|api" }),
        objeto: objeto, sintoma, clasificacion, prioridad: str({ nullable: true }),
        evidencias: arr(evidencia),
      },
      ["titulo", "origen", "objeto"],
    ),
    EditarSolicitud: obj(
      {
        id: str(), opId: str(),
        titulo: str(), descripcion: str({ nullable: true }),
        clasificacion, prioridad: str({ nullable: true }),
      },
      ["id"],
    ),
    AdjuntarEvidencia: obj({ id: str(), opId: str(), evidencia }, ["id", "evidencia"]),
    ComentarSolicitud: obj({ id: str(), opId: str(), texto: str(), actorId: str() }, ["id", "texto"]),
    RegistrarDiagnostico: obj(
      {
        solicitudId: str(), opId: str(), id: str({ format: "uuid" }),
        plantilla: referenciaPlantilla, respuestas: obj({}, []),
        causaRaiz: str({ nullable: true }), clasificacion,
      },
      ["solicitudId", "plantilla"],
    ),
    TransicionarSolicitud: obj(
      { id: str(), accion: str({ description: "enviarTriage|iniciarDiagnostico|enviarValidacion|aprobar|rechazar" }), opId: str(), motivo: str({ nullable: true }) },
      ["id", "accion"],
    ),
    GenerarOrdenCorrectiva: obj(
      { solicitudId: str(), opId: str(), id: str({ format: "uuid" }), titulo: str({ nullable: true }), prioridad: str({ nullable: true }) },
      ["solicitudId"],
    ),
    CrearIntervencion: obj(
      { solicitudId: str(), opId: str(), id: str({ format: "uuid" }), mayor: bool(), cuadrillas: arr(cuadrilla) },
      ["solicitudId"],
    ),
    AsignarCuadrillas: obj({ id: str(), opId: str(), cuadrillas: arr(cuadrilla) }, ["id", "cuadrillas"]),
    TransicionarIntervencion: obj(
      { id: str(), accion: str({ description: "asignar|iniciarEjecucion|enviarVerificacion|cerrar" }), opId: str(), motivo: str({ nullable: true }) },
      ["id", "accion"],
    ),
    ReservarRepuestos: obj({ intervencionId: str(), opId: str(), lineas: arr(lineaRepuesto) }, ["intervencionId", "lineas"]),
    ConsumirRepuesto: obj({ intervencionId: str(), opId: str(), linea: lineaRepuesto }, ["intervencionId", "linea"]),
    DevolverRepuesto: obj({ intervencionId: str(), opId: str(), linea: lineaRepuesto }, ["intervencionId", "linea"]),
    RegistrarEventoActivo: obj(
      {
        activoId: str(), tipo: str({ description: "falla-reportada|falla-confirmada|reparacion-iniciada|reparacion-finalizada|puesta-en-servicio" }),
        solicitudId: str({ nullable: true }), ordenTrabajoId: str({ nullable: true }),
        modoFalla: str({ nullable: true }), ocurridoEn: str(),
        insumosKpi: obj(
          {
            tiempoEntreFallasMin: num({ minimum: 0, nullable: true }),
            tiempoReparacionMin: num({ minimum: 0, nullable: true }),
            tiempoIndisponibleMin: num({ minimum: 0, nullable: true }),
          },
          [],
        ),
        id: str({ format: "uuid" }),
      },
      ["activoId", "tipo"],
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
    Consola: obj({ total: int(), eventos: arr(obj({}, [])), tablasRLS: arr(str()) }, []),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- Solicitudes (lecturas CQRS) ----
  add(`${BASE}/solicitudes`, "get", {
    tags: ["Solicitudes"], operationId: "correctivo.solicitudes", summary: "Listar solicitudes correctivas (read model CQRS)",
    parameters: [...["estado", "origen", "activoId"].map((p) => queryParam(p, `Filtro por ${p}`)), { name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/solicitudes`, "post", {
    tags: ["Solicitudes"], operationId: "correctivo.crear-solicitud", summary: "Crear solicitud correctiva (idempotente por id de cliente; gobierno de ciclo por Workflow Engine)",
    requestBody: jsonBody(ref("CrearSolicitud")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creada"), ...errores("400", "401", "403", "409") },
  });
  add(`${BASE}/solicitudes/{id}`, "get", {
    tags: ["Solicitudes"], operationId: "correctivo.solicitud-detalle", summary: "Detalle de solicitud (read model CQRS, snapshot completo)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/solicitudes/{id}`, "put", {
    tags: ["Solicitudes"], operationId: "correctivo.editar-solicitud", summary: "Editar solicitud correctiva",
    parameters: [idParam], requestBody: jsonBody(ref("EditarSolicitud")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/solicitudes/{id}/evidencia`, "post", {
    tags: ["Solicitudes"], operationId: "correctivo.adjuntar-evidencia", summary: "Adjuntar evidencia a una solicitud",
    parameters: [idParam], requestBody: jsonBody(ref("AdjuntarEvidencia")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/solicitudes/{id}/comentario`, "post", {
    tags: ["Solicitudes"], operationId: "correctivo.comentar-solicitud", summary: "Comentar una solicitud (hilo de trabajo)",
    parameters: [idParam], requestBody: jsonBody(ref("ComentarSolicitud")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/solicitudes/{id}/diagnostico`, "post", {
    tags: ["Diagnóstico"], operationId: "correctivo.registrar-diagnostico", summary: "Registrar diagnóstico anclado a Dynamic Forms (plantilla publicada)",
    parameters: [idParam], requestBody: jsonBody(ref("RegistrarDiagnostico")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/solicitudes/{id}/transicion`, "post", {
    tags: ["Solicitudes"], operationId: "correctivo.transicionar-solicitud",
    summary: "Transición gobernada del ciclo de la solicitud (enviarTriage/iniciarDiagnostico/enviarValidacion/aprobar/rechazar) vía Workflow Engine",
    parameters: [idParam], requestBody: jsonBody(ref("TransicionarSolicitud")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Generación de OTs (compone modulo.ordenes.crear) ----
  add(`${BASE}/generar`, "post", {
    tags: ["Generación"], operationId: "correctivo.generar-orden-correctiva",
    summary: "Generar OT correctiva componiendo el comando oficial modulo.ordenes.crear (tipo canónico 'correctiva'; idempotente por claveDedup; id de OT derivado de la generación)",
    requestBody: jsonBody(ref("GenerarOrdenCorrectiva")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/generaciones/{solicitudId}`, "get", {
    tags: ["Generación"], operationId: "correctivo.generacion-por-solicitud",
    summary: "Estado de la generación de OT por solicitud (read-only; enlace a la OT por claveDedup determinista, sin reejecutar la generación)",
    parameters: [{ name: "solicitudId", in: "path", required: true, schema: str() }],
    responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });

  // ---- Intervenciones ----
  add(`${BASE}/intervenciones`, "post", {
    tags: ["Intervenciones"], operationId: "correctivo.crear-intervencion", summary: "Crear intervención (Correctivo Mayor multi-cuadrilla opcional)",
    requestBody: jsonBody(ref("CrearIntervencion")),
    responses: { "200": jsonOk(ref("ResultadoComando"), "Creada"), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/intervenciones/{id}`, "get", {
    tags: ["Intervenciones"], operationId: "correctivo.intervencion-detalle", summary: "Detalle de intervención (read model CQRS)",
    parameters: [idParam], responses: { "200": jsonOk(obj({}, [])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/intervenciones/{id}/cuadrillas`, "post", {
    tags: ["Intervenciones"], operationId: "correctivo.asignar-cuadrillas", summary: "Asignar cuadrillas y recursos a la intervención",
    parameters: [idParam], requestBody: jsonBody(ref("AsignarCuadrillas")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/intervenciones/{id}/transicion`, "post", {
    tags: ["Intervenciones"], operationId: "correctivo.transicionar-intervencion",
    summary: "Transición gobernada del ciclo de la intervención (asignar/iniciarEjecucion/enviarVerificacion/cerrar) vía Workflow Engine",
    parameters: [idParam], requestBody: jsonBody(ref("TransicionarIntervencion")),
    responses: { "200": jsonOk(ref("ResultadoComando")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/intervenciones/{id}/reservar`, "post", {
    tags: ["Inventario"], operationId: "correctivo.reservar-repuestos",
    summary: "Reservar repuestos para la intervención (compone modulo.inventario.reservar; solicita compra ante stock insuficiente)",
    parameters: [idParam], requestBody: jsonBody(ref("ReservarRepuestos")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/intervenciones/{id}/consumir`, "post", {
    tags: ["Inventario"], operationId: "correctivo.consumir-repuesto",
    summary: "Consumir repuesto (compone modulo.inventario.mover tipo=consumo; soporta consumo parcial)",
    parameters: [idParam], requestBody: jsonBody(ref("ConsumirRepuesto")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/intervenciones/{id}/devolver`, "post", {
    tags: ["Inventario"], operationId: "correctivo.devolver-repuesto",
    summary: "Devolver repuesto no usado (compone modulo.inventario.mover tipo=devolucion)",
    parameters: [idParam], requestBody: jsonBody(ref("DevolverRepuesto")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Eventos de activo ----
  add(`${BASE}/eventos-activo`, "post", {
    tags: ["Activos"], operationId: "correctivo.registrar-evento-activo",
    summary: "Registrar evento de activo (historial de fallas / KPIs MTBF-MTTR preparados / detección de reincidencia)",
    requestBody: jsonBody(ref("RegistrarEventoActivo")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/activos/{activoId}/eventos`, "get", {
    tags: ["Activos"], operationId: "correctivo.eventos-activo", summary: "Eventos de un activo (read model CQRS; incluye flag reincidente)",
    parameters: [pathParam("activoId", "Identificador del activo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });

  // ---- Catálogos ----
  add(`${BASE}/catalogos/{catalogo}`, "get", {
    tags: ["Catálogos"], operationId: "correctivo.catalogo-opciones", summary: "Opciones habilitadas de un catálogo",
    parameters: [pathParam("catalogo", "Nombre del catálogo")],
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/catalogos`, "post", {
    tags: ["Catálogos"], operationId: "correctivo.catalogo-upsert", summary: "Alta/edición de entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoUpsert")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403") },
  });
  add(`${BASE}/catalogos/habilitar`, "post", {
    tags: ["Catálogos"], operationId: "correctivo.catalogo-habilitar", summary: "Habilitar/deshabilitar entrada de catálogo",
    requestBody: jsonBody(ref("CatalogoHabilitar")),
    responses: { "200": jsonOk(obj({}, [])), ...errores("400", "401", "403", "404") },
  });

  // ---- Eventos / reproyección / sync / consola ----
  add(`${BASE}/eventos`, "get", {
    tags: ["Administración"], operationId: "correctivo.eventos", summary: "Bitácora de eventos durable del tenant (replay)",
    responses: { "200": jsonOk(arr(obj({}, []))), ...errores("401", "403") },
  });
  add(`${BASE}/reproyectar`, "post", {
    tags: ["Administración"], operationId: "correctivo.reproyectar",
    summary: "Reproyección por replay del event log durable (admin)",
    responses: { "200": jsonOk(obj({ reproyectados: int() }, [])), ...errores("401", "403", "409") },
  });
  add(`${BASE}/sync`, "post", {
    tags: ["Sincronización"], operationId: "correctivo.sync",
    summary: "Sincronización offline por orquestación (idempotente por opId)",
    requestBody: jsonBody(ref("ColaSync")),
    responses: { "200": jsonOk(ref("ResumenSync")), ...errores("400", "401", "403") },
  });
  add(`${BASE}/consola`, "get", {
    tags: ["Administración"], operationId: "correctivo.consola", summary: "Consola técnica del outbox del módulo (admin)",
    parameters: [{ name: "limit", in: "query", required: false, schema: int({ minimum: 1, maximum: 500 }) }],
    responses: { "200": jsonOk(ref("Consola")), ...errores("401", "403", "409") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Módulo Enterprise Corrective Maintenance (DGP-015)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [
      { name: "Solicitudes" }, { name: "Diagnóstico" }, { name: "Generación" },
      { name: "Intervenciones" }, { name: "Inventario" }, { name: "Activos" },
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
