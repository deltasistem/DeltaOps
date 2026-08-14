/**
 * DELTAOPS LITE-09 · Runtime de COMPOSICIÓN de la importación histórica.
 *
 * NO es un módulo paralelo ni un ETL: orquesta comandos PÚBLICOS existentes de
 * los runtimes ya montados (Activos, Utilización, Preoperacional, Timeline de
 * plataforma). Cada dato histórico aterriza en su modelo destino real y en la
 * hoja de vida (shared timeline). Idempotente por claves deterministas (UUIDv5),
 * con procedencia por registro y lote determinista por archivo.
 *
 * Autoridad de tenant: SIEMPRE del contexto autenticado (nunca del archivo).
 * Seguridad: el rol se recibe de la sesión; CONSULTA jamás importa (guardado en
 * la capa HTTP y aquí en fail-closed). No toca RLS/RBAC ni contratos congelados.
 */
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ok, fail, KernelErrors, createExecutionContext } from "@workspace/kernel";
import { activosRuntime, contextForActivos } from "./activos-runtime";
import { utilizacionRuntime, contextForUtilizacion } from "./utilizacion-runtime";
import { preoperacionalRuntime, contextForPreoperacional, SERVICIO_PREOP } from "./preoperacional-runtime";
import { formulariosRuntime, contextForFormularios } from "./correctivo-runtime";
import { FLOTA_HISTORICA, resolverActivo, type ActivoHistorico } from "./historicos/catalogo-activos";
import { claveRegistro, uuidv5 } from "./historicos/idempotencia";
import { galonesALitros, normalizarCentroCosto } from "./historicos/normalizacion";
import { PLANTILLAS_HISTORICAS, type PlantillaHistorica } from "./historicos/plantillas-preop";
import {
  detectarTipo, leerHoja, mapChecklist, mapCombustible, mapHorasHombre, mapPmp,
  type FilaChecklist, type FilaCombustible, type FilaHorasHombre, type FilaPmp, type TipoFuente,
} from "./historicos/parsers";

const MODULO_ACTIVOS = "modulo.activos";
const MODULO_UTIL = "modulo.utilizacion";
const MODULO_FORMS = "modulo.formularios";
const TIPO_COMBUSTIBLE = "diesel";

/* --------------------------- utilidades de runtime ------------------------ */

async function drenarActivos() {
  await activosRuntime().platform.kernel.outboxProcessor.processPending();
}
async function drenarUtil() {
  await utilizacionRuntime().platform.kernel.outboxProcessor.processPending();
}
async function drenarForms() {
  await formulariosRuntime().platform.kernel.outboxProcessor.processPending();
}

const execA = (ctx: ExecutionContext, name: string, input: unknown) =>
  activosRuntime().platform.kernel.commands.execute(ctx, name, input);
const execU = (ctx: ExecutionContext, name: string, input: unknown) =>
  utilizacionRuntime().platform.kernel.commands.execute(ctx, name, input);
const execP = (ctx: ExecutionContext, name: string, input: unknown) =>
  preoperacionalRuntime().platform.kernel.commands.execute(ctx, name, input);
const execF = (ctx: ExecutionContext, name: string, input: unknown) =>
  formulariosRuntime().platform.kernel.commands.execute(ctx, name, input);

/**
 * Registra una entrada en el SHARED TIMELINE (hoja de vida) vía el comando
 * público `platform.timeline.record`. `occurredAt` es la FECHA REAL del hecho
 * (la hoja de vida ordena por ella), no la de importación. Idempotente por
 * `entryId`. Se usa para jornadas de horas hombre y eventos de mantenimiento
 * (P-3/P-4) y para dejar procedencia consultable.
 */
async function registrarTimeline(
  ctx: ExecutionContext,
  entry: {
    entryId: string;
    activoId: string;
    eventType: string;
    occurredAt: string;
    resumen: string;
    payload: Record<string, unknown>;
    estado?: string | null;
  },
): Promise<Result<unknown, KernelError>> {
  return activosRuntime().platform.kernel.commands.execute(ctx, "platform.timeline.record", {
    entryId: entry.entryId,
    entityRef: `activo:${entry.activoId}`,
    eventType: entry.eventType,
    actorId: ctx.principal.id,
    occurredAt: entry.occurredAt,
    resumen: entry.resumen,
    estado: entry.estado ?? null,
    payload: entry.payload,
  });
}

/* ---------------------------- contexto de importación --------------------- */

export interface ContextoImportacion {
  readonly tenant: string;
  readonly userId: string;
  readonly rolCanonico: string;
  readonly ctxActivos: ExecutionContext;
  readonly ctxUtil: ExecutionContext;
  readonly ctxPreop: ExecutionContext;
  readonly ctxFormsPlantilla: ExecutionContext;
  readonly ctxFormsRespuesta: ExecutionContext;
}

/** Contexto del motor de formularios con permisos de RESPUESTA (leer/escribir/enviar). */
function contextForRespuestas(actorId: string, tenant: string): ExecutionContext {
  return createExecutionContext({
    principal: {
      id: actorId,
      rol: "admin",
      permisos: [
        `${MODULO_FORMS}.respuesta.read`,
        `${MODULO_FORMS}.respuesta.write`,
        `${MODULO_FORMS}.respuesta.enviar`,
        `${MODULO_FORMS}.plantilla.read`,
      ],
      capacidades: [],
    },
    metadata: { tenantId: tenant },
  });
}

/** Construye los contextos por runtime a partir de la sesión (mismo tenant). */
export function contextoImportacion(userId: string, rolCanonico: string, tenant: string): ContextoImportacion {
  return {
    tenant,
    userId,
    rolCanonico,
    ctxActivos: contextForActivos(userId, aRolLegacyActivos(rolCanonico), tenant),
    ctxUtil: contextForUtilizacion(userId, rolCanonico, tenant),
    ctxPreop: contextForPreoperacional(userId, rolCanonico, tenant),
    ctxFormsPlantilla: contextForFormularios(userId, tenant),
    ctxFormsRespuesta: contextForRespuestas(userId, tenant),
  };
}

/** Activos usa roles legacy (admin/operador/lector); mapeo mínimo desde canónico. */
function aRolLegacyActivos(rolCanonico: string): string {
  if (rolCanonico === "SUPER_ADMIN" || rolCanonico === "TENANT_ADMIN") return "admin";
  if (rolCanonico === "CONSULTA") return "lector";
  return "operador";
}

/* ------------------------------ catálogos base ---------------------------- */

/**
 * Asegura (idempotente) los valores de catálogo mínimos que exigen los comandos
 * oficiales para la flota histórica: tipos/categorías/familias de activos,
 * centros de costo, unidades y tipo de combustible. Es composición sobre los
 * comandos `catalogo.upsert` existentes; no crea estructura nueva.
 */
export async function asegurarCatalogos(ci: ContextoImportacion): Promise<Result<void, KernelError>> {
  const upA = (catalogo: string, clave: string, etiqueta: string) =>
    execA(ci.ctxActivos, `${MODULO_ACTIVOS}.catalogo.upsert`, { catalogo, clave, etiqueta });
  const catsActivos: Array<[string, string, string]> = [
    ["tipos", "maquinaria", "Maquinaria"],
    ["categorias", "maquinaria", "Maquinaria"],
    ["categorias", "energia", "Energía"],
    ["familias", "maquinaria-amarilla", "Maquinaria amarilla"],
    ["familias", "montacargas", "Montacargas"],
    ["familias", "tanques-almacenamiento", "Tanques de almacenamiento"],
    ["centros-costo", "RIVERPORT", "Riverport"],
    ["centros-costo", "DISSAN", "Dissan"],
    ["centros-costo", "SQM", "SQM"],
    ["centros-costo", "ZONA_FRANCA", "Zona Franca"],
    ["centros-costo", "PALO_BLANCO", "Palo Blanco"],
    ["unidades", "horas", "Horas"],
  ];
  for (const [c, k, e] of catsActivos) {
    const r = await upA(c, k, e);
    if (!r.ok) return r as Result<never, KernelError>;
  }
  const rc = await execU(ci.ctxUtil, `${MODULO_UTIL}.catalogo-upsert`, {
    catalogo: "tipos-combustible", clave: TIPO_COMBUSTIBLE, etiqueta: "Diésel",
  });
  if (!rc.ok) return rc as Result<never, KernelError>;
  return ok(undefined);
}

/* ---------------------------- plantillas Dynamic Forms -------------------- */

/**
 * Asegura (idempotente) las plantillas históricas de checklist como VERSIONES
 * INMUTABLES v1 vía `modulo.formularios.plantilla.importar`. Import respeta
 * clave+versión: si la versión ya existe, el motor devuelve CONFLICTO, que aquí
 * se trata como "ya sembrada" (idempotente). Así toda ejecución sellada queda
 * anclada a una plantilla+versión REAL del motor de Dynamic Forms.
 */
export async function asegurarPlantillas(ci: ContextoImportacion): Promise<Result<void, KernelError>> {
  for (const p of Object.values(PLANTILLAS_HISTORICAS)) {
    const r = await execF(ci.ctxFormsPlantilla, `${MODULO_FORMS}.plantilla.importar`, { documento: p.documento });
    if (!r.ok && r.error.code !== "KRN-CFL-001" && !/ya existe/i.test(r.error.message)) {
      return r as Result<never, KernelError>;
    }
  }
  await drenarForms();
  return ok(undefined);
}

/**
 * Crea (idempotente) la RESPUESTA de Dynamic Forms de un checklist histórico,
 * anclada a la plantilla+versión, y la ENVÍA (queda inmutable/enviada). Devuelve
 * el id de la respuesta para anclar el sellado del preoperacional. Los `datos`
 * mapean cada ítem por su clave estable (CUMPLE/NO CUMPLE) más el contexto.
 */
async function crearRespuestaChecklist(
  ci: ContextoImportacion,
  plantilla: PlantillaHistorica,
  respuestaId: string,
  datos: Record<string, unknown>,
): Promise<Result<string, KernelError>> {
  const opBorrador = uuidv5(`resp-borrador|${respuestaId}`);
  const gb = await execF(ci.ctxFormsRespuesta, `${MODULO_FORMS}.respuesta.guardarBorrador`, {
    id: respuestaId,
    opId: opBorrador,
    plantillaClave: plantilla.clave,
    plantillaVersion: plantilla.version,
    datos,
  });
  if (!gb.ok) return gb as Result<never, KernelError>;
  const gv = gb.value as { version?: number; estado?: string; idempotente?: boolean };
  // Si ya está ENVIADA (idempotente en re-import), no reenviar.
  if (gv.estado === "ENVIADA") return ok(respuestaId);
  const version = gv.version ?? 0;
  const env = await execF(ci.ctxFormsRespuesta, `${MODULO_FORMS}.respuesta.enviar`, {
    id: respuestaId,
    opId: uuidv5(`resp-enviar|${respuestaId}`),
    version,
  });
  if (!env.ok) return env as Result<never, KernelError>;
  return ok(respuestaId);
}

/* ------------------------------ activos ----------------------------------- */

/** Crea (idempotente) un activo de la flota y lo lleva a OPERATIVO. */
async function crearActivoHistorico(
  ci: ContextoImportacion,
  a: ActivoHistorico,
  loteId: string,
): Promise<Result<{ id: string; nuevo: boolean }, KernelError>> {
  const id = uuidv5(`activo|${ci.tenant}|${a.codigo}`);
  const crear = await execA(ci.ctxActivos, `${MODULO_ACTIVOS}.crear`, {
    id,
    opId: uuidv5(`activo-op|${ci.tenant}|${a.codigo}`),
    codigoEmpresarial: a.codigo,
    nombre: a.nombre,
    tipo: a.tipo,
    categoria: a.categoria,
    familia: a.familia,
    centroCosto: null,
    // Tenencia/responsabilidad y alias como ATRIBUTOS libres declarados (sin
    // hardcode): la regla dura de mantenimiento TERCERO se lee de este atributo,
    // no de `if (codigo === "C11")`. `atributos` solo admite primitivos ⇒ alias
    // en CSV.
    especificaciones: {
      atributos: {
        tenencia: a.tenencia,
        mantenimiento: a.mantenimiento,
        aliasHistorico: a.alias.join(", "),
        origen: "HISTORICO",
      },
    },
    identificacion: { codigoInterno: (a.alias.join(", ") || a.codigo).slice(0, 120) },
    observaciones: `Importado histórico (lote ${loteId}). Alias: ${a.alias.join(", ") || a.codigo}.`,
  });
  if (!crear.ok) return crear as Result<never, KernelError>;
  const cv = crear.value as { version?: number; estado?: string; idempotente?: boolean };
  // Idempotencia STRONG (write-side): si ya existía, no re-transicionar.
  if (cv.idempotente) return ok({ id, nuevo: false });

  // BORRADOR → REGISTRADO → OPERATIVO (usable y visible). Cada transición usa la
  // versión devuelta por la anterior (optimistic locking).
  const version0 = cv.version ?? 1;
  const reg = await execA(ci.ctxActivos, `${MODULO_ACTIVOS}.registrar`, { id, expectedVersion: version0 });
  if (!reg.ok) return reg as Result<never, KernelError>;
  const version1 = (reg.value as { version?: number }).version ?? version0 + 1;
  const op = await execA(ci.ctxActivos, `${MODULO_ACTIVOS}.operar`, { id, expectedVersion: version1 });
  if (!op.ok) return op as Result<never, KernelError>;
  return ok({ id, nuevo: true });
}

/** Mapa código canónico → activoId (creando la flota si `crear`). */
export async function asegurarFlota(
  ci: ContextoImportacion,
  loteId: string,
  crear: boolean,
): Promise<Result<{ ids: Map<string, string>; nuevos: string[]; existentes: string[] }, KernelError>> {
  const ids = new Map<string, string>();
  const nuevos: string[] = [];
  const existentes: string[] = [];
  for (const a of FLOTA_HISTORICA) {
    if (crear) {
      const r = await crearActivoHistorico(ci, a, loteId);
      if (!r.ok) return r as Result<never, KernelError>;
      ids.set(a.codigo, r.value.id);
      (r.value.nuevo ? nuevos : existentes).push(a.codigo);
    } else {
      ids.set(a.codigo, uuidv5(`activo|${ci.tenant}|${a.codigo}`));
    }
  }
  if (crear) await drenarActivos();
  return ok({ ids, nuevos, existentes });
}

/* --------------------------- resultado / reporte -------------------------- */

export interface ReporteImportacion {
  tipo: TipoFuente;
  archivo: string;
  loteId: string;
  totalFilas: number;
  validos: number;
  advertencias: number;
  rechazados: number;
  activosNuevos: string[];
  activosExistentes: string[];
  filasExcluidas: Array<{ fila: number; codigo: string; motivo: string }>;
  camposNoMapeados: string[];
  incidencias: Array<{ fila: number; nivel: "warn" | "error"; mensaje: string }>;
  importados: { lecturas: number; tanqueos: number; preoperacionales: number; jornadas: number; mantenimientos: number };
  dryRun: boolean;
}

function loteDeterminista(tenant: string, tipo: TipoFuente, archivo: string): string {
  return uuidv5(`lote|${tenant}|${tipo}|${archivo}`);
}

/** Procedencia común de un registro importado. */
function procedencia(archivo: string, tipo: TipoFuente, filaId: string, filaExcel: number, loteId: string, extra: Record<string, unknown> = {}) {
  return {
    _origen: "HISTORICO",
    archivo,
    tipoFuente: tipo,
    filaId,
    filaExcel,
    loteId,
    ...extra,
  };
}

/* ============================ IMPORTADORES ================================ */

/**
 * Ejecuta la importación de UN archivo (buffer). `dryRun=true` produce SOLO la
 * validación (vista previa), sin escribir nada. `dryRun=false` importa de verdad.
 */
export async function importarArchivo(
  ci: ContextoImportacion,
  archivo: string,
  buffer: Buffer,
  dryRun: boolean,
): Promise<Result<ReporteImportacion, KernelError>> {
  const { headers, filas } = await leerHoja(buffer);
  const tipo = detectarTipo(headers);
  if (!tipo) return fail(KernelErrors.validation(`No se reconoce la estructura del archivo "${archivo}"`));

  const loteId = loteDeterminista(ci.tenant, tipo, archivo);
  const rep: ReporteImportacion = {
    tipo, archivo, loteId, totalFilas: filas.length,
    validos: 0, advertencias: 0, rechazados: 0,
    activosNuevos: [], activosExistentes: [],
    filasExcluidas: [], camposNoMapeados: [], incidencias: [],
    importados: { lecturas: 0, tanqueos: 0, preoperacionales: 0, jornadas: 0, mantenimientos: 0 },
    dryRun,
  };
  const mut = rep;

  // Asegura catálogos ANTES de la flota (crear-activo valida catálogos) y flota
  // (solo en importación real; en dry-run solo se resuelven los ids
  // deterministas para el reporte de nuevos/existentes).
  if (!dryRun) {
    const cat = await asegurarCatalogos(ci);
    if (!cat.ok) return cat as Result<never, KernelError>;
    // Las plantillas Dynamic Forms se aseguran solo cuando la fuente es un
    // checklist (sus ejecuciones se anclan a plantilla+versión reales).
    if (tipo === "checklist-cargador" || tipo === "checklist-montacargas") {
      const pl = await asegurarPlantillas(ci);
      if (!pl.ok) return pl as Result<never, KernelError>;
    }
  }
  const flota = await asegurarFlota(ci, loteId, !dryRun);
  if (!flota.ok) return flota as Result<never, KernelError>;
  mut.activosNuevos = flota.value.nuevos;
  mut.activosExistentes = flota.value.existentes;

  const idDe = (codigo: string) => flota.value.ids.get(codigo);

  switch (tipo) {
    case "checklist-cargador":
    case "checklist-montacargas":
      await importarChecklist(ci, tipo, archivo, loteId, filas.map((f) => mapChecklist(f, tipo)), idDe, mut, dryRun);
      break;
    case "combustible":
      await importarCombustible(ci, archivo, loteId, filas.map(mapCombustible), idDe, mut, dryRun);
      break;
    case "horas-hombre":
      await importarHorasHombre(ci, archivo, loteId, filas.map(mapHorasHombre), idDe, mut, dryRun);
      break;
    case "pmp-cargadores":
    case "pmp-montacargas":
      await importarPmp(ci, tipo, archivo, loteId, filas.map(mapPmp), idDe, mut, dryRun);
      break;
  }

  if (!dryRun) {
    await drenarForms();
    await drenarUtil();
    await drenarActivos();
  }
  return ok(rep);
}

/* ------------------------------- checklists ------------------------------- */

async function importarChecklist(
  ci: ContextoImportacion,
  tipo: TipoFuente,
  archivo: string,
  loteId: string,
  filas: FilaChecklist[],
  idDe: (c: string) => string | undefined,
  rep: ReporteImportacion,
  dryRun: boolean,
) {
  const plantillaTipo = tipo as "checklist-cargador" | "checklist-montacargas";
  const plantilla = PLANTILLAS_HISTORICAS[plantillaTipo];
  // Índice etiqueta verbatim → clave estable de la plantilla (item-N).
  const claveDeEtiqueta = new Map(plantilla.items.map((it) => [it.etiquetaVerbatim, it.clave] as const));
  for (const fila of filas) {
    const res = resolverActivo(fila.codigoCrudo);
    if (res.clase !== "flota") {
      rep.filasExcluidas.push({ fila: fila.filaExcel, codigo: fila.codigoCrudo, motivo: res.clase });
      continue;
    }
    const activoId = idDe(res.activo.codigo);
    if (!activoId) { rep.rechazados++; continue; }
    if (!fila.fechaHecho) {
      rep.rechazados++;
      rep.incidencias.push({ fila: fila.filaExcel, nivel: "error", mensaje: "Sin fecha del hecho" });
      continue;
    }
    let warn = false;
    if (fila.horometro?.normalizado) {
      warn = true;
      rep.incidencias.push({ fila: fila.filaExcel, nivel: "warn", mensaje: `Horómetro normalizado "${fila.horometro.crudo}"` });
    }
    // Incumplimientos anclados a la CLAVE de plantilla (item-N), con la etiqueta
    // verbatim como procedencia legible.
    const incumplimientos = fila.items
      .filter((i) => i.valor === "NO CUMPLE")
      .map((i) => ({ clave: claveDeEtiqueta.get(i.etiqueta) ?? uuidv5(`item|${i.etiqueta}`).slice(0, 8), etiqueta: i.etiqueta, critico: false }));
    // Veredicto DERIVADO transparente: sin NO CUMPLE ⇒ APTO; con NO CUMPLE ⇒
    // APTO_CON_OBSERVACIONES (el Excel no declara bloqueo ⇒ nunca NO_APTO fabricado).
    const veredicto = incumplimientos.length === 0 ? "APTO" : "APTO_CON_OBSERVACIONES";
    if (incumplimientos.length > 0) warn = true;

    if (warn) rep.advertencias++; else rep.validos++;
    if (dryRun) continue;

    const { id, opId } = claveRegistro(ci.tenant, archivo, "preop", fila.filaId);
    const cc = normalizarCentroCosto(fila.centroCostoCrudo);

    // 1) RESPUESTA real de Dynamic Forms, anclada a plantilla+versión, enviada.
    // Los datos mapean cada ítem por su clave estable (valor CUMPLE/NO CUMPLE)
    // más el contexto. La respuesta es inmutable tras enviar.
    const respuestaId = uuidv5(`resp|${id}`);
    const datosRespuesta: Record<string, unknown> = {};
    for (const it of fila.items) {
      const clave = claveDeEtiqueta.get(it.etiqueta);
      if (clave) datosRespuesta[clave] = it.valor;
    }
    if (fila.horometro) datosRespuesta["horometro"] = fila.horometro.valor;
    if (cc.clave) datosRespuesta["centroCosto"] = cc.clave;
    if (fila.operador) datosRespuesta["operador"] = fila.operador;
    if (fila.supervisor) datosRespuesta["supervisor"] = fila.supervisor;
    if (fila.gps) datosRespuesta["gps"] = fila.gps;
    if (fila.observaciones) datosRespuesta["observaciones"] = fila.observaciones;
    const resp = await crearRespuestaChecklist(ci, plantilla, respuestaId, datosRespuesta);
    if (!resp.ok) {
      rep.incidencias.push({ fila: fila.filaExcel, nivel: "error", mensaje: `Respuesta: ${resp.error.message}` });
      continue;
    }

    // 2) SELLO del preoperacional anclado a la plantilla+versión y a la respuesta real.
    const r = await execP(ci.ctxPreop, `${SERVICIO_PREOP}.sellar`, {
      id, opId, activoId,
      plantillaClave: plantilla.clave,
      plantillaVersion: plantilla.version,
      respuestaId: resp.value,
      veredicto,
      incumplimientos,
      observaciones: [],
      // selladoAt = tiempo de servidor (importación); fechaHecho real va en contexto.
      selladoAt: new Date().toISOString(),
      contexto: {
        ...procedencia(archivo, tipo, fila.filaId, fila.filaExcel, loteId, {
          fechaHecho: fila.fechaHecho,
          operador: fila.operador,
          supervisor: fila.supervisor,
          centroCosto: cc.clave,
          centroCostoCrudo: cc.crudo,
          gps: fila.gps,
          observaciones: fila.observaciones,
          horometroCrudo: fila.horometro?.crudo ?? null,
          items: fila.items,
        }),
      },
    });
    if (!r.ok) {
      rep.incidencias.push({ fila: fila.filaExcel, nivel: "error", mensaje: r.error.message });
      continue;
    }
    rep.importados.preoperacionales++;
    // Lectura de horómetro asociada (si numérica).
    if (fila.horometro) {
      const okL = await registrarLectura(ci, archivo, tipo, loteId, fila.filaId, activoId, res.activo, fila.horometro.valor, fila.fechaHecho, "checklist");
      if (okL) rep.importados.lecturas++;
    }
    // Entrada de hoja de vida (preoperacional histórico ordenado por fecha real).
    await registrarTimeline(ci.ctxActivos, {
      entryId: uuidv5(`tl-preop|${id}`),
      activoId,
      eventType: "historico.preoperacional",
      occurredAt: fila.fechaHecho,
      resumen: `Preoperacional ${veredicto} (${res.activo.codigo})`,
      estado: veredicto,
      payload: { origen: "HISTORICO", operador: fila.operador, incumplimientos: incumplimientos.length, archivo, loteId },
    });
  }
}

/* ------------------------------ combustible ------------------------------- */

async function importarCombustible(
  ci: ContextoImportacion,
  archivo: string,
  loteId: string,
  filas: FilaCombustible[],
  idDe: (c: string) => string | undefined,
  rep: ReporteImportacion,
  dryRun: boolean,
) {
  for (const fila of filas) {
    const res = resolverActivo(fila.codigoCrudo);
    if (res.clase !== "flota") {
      rep.filasExcluidas.push({ fila: fila.filaExcel, codigo: fila.codigoCrudo, motivo: res.clase });
      continue;
    }
    const activoId = idDe(res.activo.codigo);
    if (!activoId || !fila.fechaHecho || !fila.galones) {
      rep.rechazados++;
      if (!fila.galones) rep.incidencias.push({ fila: fila.filaExcel, nivel: "error", mensaje: "Galones inválidos" });
      continue;
    }
    let warn = false;
    if (fila.proveedor === "") { warn = true; rep.incidencias.push({ fila: fila.filaExcel, nivel: "warn", mensaje: "Proveedor vacío (se conserva vacío)" }); }
    if (fila.horometro?.normalizado) warn = true;
    if (warn) rep.advertencias++; else rep.validos++;
    if (dryRun) continue;

    // CANÓNICO EN LITROS: la fuente registra GALONES; el campo del módulo es
    // litros y los KPIs asumen litros. Se convierte SIEMPRE (gal→L) y se conserva
    // la cantidad y unidad ORIGINALES (galones) en la procedencia (SEVERO-1).
    const galones = fila.galones.valor;
    const litros = galonesALitros(galones);

    // Corrección de datos previos: los tanqueos v1 (clave "tanqueo") guardaron el
    // valor en galones como si fuera litros. Como el registro es idempotente por
    // opId (no re-emitible con valor nuevo bajo la misma clave), se ANULA el v1 y
    // se emite un v2 con la clave versionada "tanqueo-v2-litros" y litros
    // correctos. Anular es idempotente/seguro: si el v1 no existe (importación
    // limpia) o ya está anulado, se ignora en silencio.
    const v1 = claveRegistro(ci.tenant, archivo, "tanqueo", fila.filaId);
    const anul = await execU(ci.ctxUtil, `${MODULO_UTIL}.anular-tanqueo`, {
      opId: uuidv5(`op:anular|${ci.tenant}|${archivo}|tanqueo|${fila.filaId}`),
      id: v1.id,
      motivo: "Corrección histórica LITE-09: valor recapturado en litros (fuente en galones)",
    });
    if (!anul.ok && anul.error.code !== "KRN-NF-001") {
      rep.incidencias.push({ fila: fila.filaExcel, nivel: "warn", mensaje: `Anulación v1 no aplicada: ${anul.error.message}` });
    }

    const { id, opId } = claveRegistro(ci.tenant, archivo, "tanqueo-v2-litros", fila.filaId);
    const r = await execU(ci.ctxUtil, `${MODULO_UTIL}.registrar-tanqueo`, {
      id, opId, activoId,
      fechaHora: fila.fechaHecho,
      litros, // canónico en LITROS (galones × 3.785411784)
      tipoCombustible: TIPO_COMBUSTIBLE,
      proveedorId: fila.proveedor === "" ? null : fila.proveedor, // snapshot texto (sin catálogo maestro)
      observacion: JSON.stringify(procedencia(archivo, "combustible", fila.filaId, fila.filaExcel, loteId, {
        unidad: "litros", // unidad CANÓNICA del valor registrado
        cantidadOriginal: galones, // cantidad ORIGINAL de la fuente…
        unidadOriginal: "galones", // …y su unidad, conservadas verbatim
        factorConversion: "gal->L 3.785411784",
        litrosCanonicos: litros,
        proveedorSnapshot: fila.proveedor,
        responsable: fila.responsable,
        ticketUrl: fila.ticketUrl,
        horometroCrudo: fila.horometro?.crudo ?? null,
        fechaHecho: fila.fechaHecho,
      })),
    });
    if (!r.ok) { rep.incidencias.push({ fila: fila.filaExcel, nivel: "error", mensaje: r.error.message }); continue; }
    rep.importados.tanqueos++;
    if (fila.horometro) {
      const okL = await registrarLectura(ci, archivo, "combustible", loteId, fila.filaId, activoId, res.activo, fila.horometro.valor, fila.fechaHecho, "combustible");
      if (okL) rep.importados.lecturas++;
    }
  }
}

/* ------------------------------ horas hombre ------------------------------ */

async function importarHorasHombre(
  ci: ContextoImportacion,
  archivo: string,
  loteId: string,
  filas: FilaHorasHombre[],
  idDe: (c: string) => string | undefined,
  rep: ReporteImportacion,
  dryRun: boolean,
) {
  for (const fila of filas) {
    const res = resolverActivo(fila.codigoCrudo);
    if (res.clase !== "flota") {
      rep.filasExcluidas.push({ fila: fila.filaExcel, codigo: fila.codigoCrudo, motivo: res.clase });
      continue;
    }
    const activoId = idDe(res.activo.codigo);
    if (!activoId || !fila.fechaHecho) { rep.rechazados++; continue; }
    let warn = false;
    if (!fila.horometroInicial || !fila.horometroFinal) {
      warn = true;
      rep.incidencias.push({ fila: fila.filaExcel, nivel: "warn", mensaje: "Horómetro no numérico (HOROMETRO FS): se conserva como contexto, sin lectura" });
    }
    if (warn) rep.advertencias++; else rep.validos++;
    if (dryRun) continue;

    // Jornada histórica → hoja de vida (P-3), sin tocar contratos de mano de obra.
    const entryId = uuidv5(`tl-hh|${ci.tenant}|${archivo}|${fila.filaId}`);
    const diffHorometro =
      fila.horometroInicial && fila.horometroFinal
        ? Number((fila.horometroFinal.valor - fila.horometroInicial.valor).toFixed(2))
        : null;
    const rt = await registrarTimeline(ci.ctxActivos, {
      entryId, activoId,
      eventType: "historico.jornada",
      occurredAt: fila.fechaHecho,
      resumen: `Jornada ${fila.turno || ""} ${res.activo.codigo} · ${fila.operacion || ""}`.trim(),
      payload: {
        origen: "HISTORICO",
        ...procedencia(archivo, "horas-hombre", fila.filaId, fila.filaExcel, loteId, {
          fechaHecho: fila.fechaHecho, cliente: fila.cliente, operacion: fila.operacion,
          material: fila.material, area: fila.area, turno: fila.turno,
          propioTercerizado: fila.propioTercerizado, operador: fila.operador, supervisor: fila.supervisor,
          recibo: fila.recibo, observaciones: fila.observaciones,
          // Conserva AMBOS (horómetros y duración declarada), sin asumir cuál es correcto.
          horometroInicial: fila.horometroInicial?.valor ?? null,
          horometroFinal: fila.horometroFinal?.valor ?? null,
          horometroInicialCrudo: fila.horometroInicialCrudo,
          horometroFinalCrudo: fila.horometroFinalCrudo,
          diferenciaHorometro: diffHorometro,
          duracionDeclaradaHoras: fila.duracionDeclarada,
        }),
      },
    });
    if (rt.ok) rep.importados.jornadas++;

    // Lecturas de horómetro (solo filas numéricas).
    if (fila.horometroInicial) {
      const okL = await registrarLectura(ci, archivo, "horas-hombre-ini", loteId, fila.filaId, activoId, res.activo, fila.horometroInicial.valor, fila.fechaHecho, "horas-hombre");
      if (okL) rep.importados.lecturas++;
    }
    if (fila.horometroFinal) {
      const okL = await registrarLectura(ci, archivo, "horas-hombre-fin", loteId, fila.filaId, activoId, res.activo, fila.horometroFinal.valor, fila.fechaHecho, "horas-hombre");
      if (okL) rep.importados.lecturas++;
    }
  }
}

/* ---------------------------------- PMP ----------------------------------- */

async function importarPmp(
  ci: ContextoImportacion,
  tipo: TipoFuente,
  archivo: string,
  loteId: string,
  filas: FilaPmp[],
  idDe: (c: string) => string | undefined,
  rep: ReporteImportacion,
  dryRun: boolean,
) {
  for (const fila of filas) {
    const res = resolverActivo(fila.codigoCrudo);
    if (res.clase !== "flota") {
      rep.filasExcluidas.push({ fila: fila.filaExcel, codigo: fila.codigoCrudo, motivo: res.clase });
      continue;
    }
    const activoId = idDe(res.activo.codigo);
    if (!activoId || !fila.fechaHecho) { rep.rechazados++; continue; }

    // Regla dura de tenencia (sin hardcode por código): mantenimiento TERCERO
    // ⇒ jamás se genera evento de mantenimiento interno Delta desde importación.
    if (res.activo.mantenimiento === "TERCERO") {
      rep.filasExcluidas.push({ fila: fila.filaExcel, codigo: res.activo.codigo, motivo: "mantenimiento-tercero" });
      continue;
    }

    const esRutina = fila.tipoMantenimiento === "RUTINA";
    let warn = false;
    if (esRutina && fila.items.length === 0) {
      warn = true;
      rep.incidencias.push({ fila: fila.filaExcel, nivel: "warn", mensaje: "RUTINA sin ítems diligenciados: evento con detalle vacío ⚠" });
    }
    if (warn) rep.advertencias++; else rep.validos++;
    if (dryRun) continue;

    const entryId = uuidv5(`tl-pmp|${ci.tenant}|${archivo}|${fila.filaId}`);
    const rt = await registrarTimeline(ci.ctxActivos, {
      entryId, activoId,
      eventType: esRutina ? "historico.mantenimiento.rutina" : "historico.mantenimiento.correctivo",
      occurredAt: fila.fechaHecho,
      resumen: esRutina
        ? `Mantenimiento RUTINA ${fila.rutina} (${res.activo.codigo})`
        : `Mantenimiento CORRECTIVO ${fila.sistemaSubsistema} (${res.activo.codigo})`,
      estado: fila.estadoEquipo || null,
      payload: {
        origen: "HISTORICO",
        naturaleza: "EJECUTADO", // el Excel demuestra ejecución (no OT fabricada)
        ...procedencia(archivo, tipo, fila.filaId, fila.filaExcel, loteId, {
          fechaHecho: fila.fechaHecho, tipoMantenimiento: fila.tipoMantenimiento,
          rutina: fila.rutina, estadoEquipo: fila.estadoEquipo, tecnicos: fila.tecnicos,
          items: fila.items, detalleVacio: esRutina && fila.items.length === 0,
          sistemaSubsistema: fila.sistemaSubsistema, modoFalla: fila.modoFalla, efectoFalla: fila.efectoFalla,
          descripcionFalla: fila.descripcionFalla, descripcionActividades: fila.descripcionActividades,
          tiempoReparacionHoras: fila.tiempoReparacion, downtimeHoras: fila.downtime,
          supervisor: fila.supervisor, observaciones: fila.observaciones,
          horometroCrudo: fila.horometro?.crudo ?? null,
        }),
      },
    });
    if (rt.ok) rep.importados.mantenimientos++;

    if (fila.horometro) {
      const okL = await registrarLectura(ci, archivo, "pmp", loteId, fila.filaId, activoId, res.activo, fila.horometro.valor, fila.fechaHecho, "mantenimiento");
      if (okL) rep.importados.lecturas++;
    }
  }
}

/* ---------------------------- lectura de horómetro ------------------------ */

async function registrarLectura(
  ci: ContextoImportacion,
  archivo: string,
  sub: string,
  loteId: string,
  filaId: string,
  activoId: string,
  activo: ActivoHistorico,
  valor: number,
  fechaHora: string,
  origenFuente: string,
): Promise<boolean> {
  const { id, opId } = claveRegistro(ci.tenant, archivo, `lectura-${sub}`, filaId);
  const r = await execU(ci.ctxUtil, `${MODULO_UTIL}.registrar-lectura`, {
    id, opId, activoId,
    tipoMedidor: "horometro",
    valor,
    // La unidad canónica del horómetro la fija el módulo ("h"); omitirla evita
    // choque con la etiqueta humana ("horas") usada en catálogos de activos.
    fechaHora,
    // El origen canónico admitido es manual/qr/sync-offline; la procedencia
    // histórica real se conserva en `observacion` y en la hoja de vida.
    origen: "manual",
    observacion: `Histórico ${origenFuente} (lote ${loteId}, archivo ${archivo})`,
  });
  return r.ok;
}
