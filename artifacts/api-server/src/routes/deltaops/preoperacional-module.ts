/**
 * DGP-LITE-04 · API HTTP del PREOPERACIONAL / Checklist Operacional.
 *
 * Router Express FINO montado bajo `/api/deltaops/activos/preoperacional/*`. Se
 * ancla al segmento `activos` A PROPÓSITO: (1) el preoperacional es SIEMPRE una
 * operación SOBRE un activo; (2) reutiliza el entitlement `activos` ya contratado
 * (NO introduce módulo/entitlement nuevo ni cambia RBAC). El middleware de
 * módulos y el enforcement de entitlements lo gobiernan como parte de `activos`.
 *
 * ORQUESTADOR (análogo a `modulo.ordenes.capturarRespuesta`), fail-closed:
 *   1. Deriva identidad/rol/tenant CANÓNICOS de la sesión (jamás del cliente).
 *   2. Valida el activo ancla vía `modulo.activos.detalle` (autoridad backend;
 *      también resuelve por QR mediante `qr-resolver`).
 *   3. Resuelve la plantilla ACTIVA (o la versión pedida) del preoperacional en
 *      Dynamic Forms y FIJA la versión (trazabilidad histórica).
 *   4. Compone `guardarBorrador → enviar` (validación completa server-side).
 *   5. Calcula el VEREDICTO en el servidor (regla de Dirección) desde el
 *      checklist embebido (criticidad por ítem) y lo SELLA en una ejecución
 *      inmutable anclada a la versión de la plantilla.
 * Idempotente por `opId`; replayable por `/sync` (cola offline ÚNICA existente).
 * NO genera OT (eso es LITE-05); sólo deja lista la procedencia del hallazgo.
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import { createExecutionContext, KernelErrors, type ExecutionContext, type KernelError, type Result } from "@workspace/kernel";
import {
  calcularVeredicto,
  type DefinicionChecklist,
  type RespuestaItem,
} from "@workspace/dynamic-forms";
import { aRolCanonico } from "../../deltaops/identity/rbac";
import { activosRuntime, contextForActivos } from "./activos-runtime";
import { formulariosRuntime } from "./correctivo-runtime";
import {
  preoperacionalRuntime,
  contextForPreoperacional,
  principalPreoperacional,
  SERVICIO_PREOP,
  PERMISOS_PREOP,
} from "./preoperacional-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/activos/preoperacional";

/* ------------------------------ Sesión ------------------------------------ */

interface SesionPreop {
  userId: string;
  rolCanonico: string;
  tenant: string;
  identityId?: string;
}

router.use(BASE, async (req, res, next): Promise<void> => {
  const userId = req.session?.deltaopsUserId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const [user] = await db
    .select({ id: deltaopsUsersTable.id, rol: deltaopsUsersTable.rol, tenant: deltaopsUsersTable.tenant })
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Sesión inválida" });
    return;
  }
  const rolCanonico = req.session?.rolCanonico ?? aRolCanonico(user.rol);
  res.locals.sesion = {
    userId: String(user.id),
    rolCanonico,
    tenant: user.tenant,
    ...(req.session?.identityId ? { identityId: req.session.identityId } : {}),
  } satisfies SesionPreop;
  res.locals.tenant = user.tenant;
  next();
});

/* ---------------------------- Utilidades ---------------------------------- */

function sesionOf(res: Response): SesionPreop {
  return res.locals.sesion as SesionPreop;
}

function statusOf(err: KernelError): number {
  if (err.code.startsWith("KRN-AUTH")) return 403;
  if (err.code.startsWith("KRN-NF")) return 404;
  if (err.code.startsWith("KRN-CFL")) return 409;
  if (err.code.startsWith("KRN-VAL")) return 400;
  return 500;
}

function sendResult(res: Response, r: Result<unknown, KernelError>): void {
  if (r.ok) {
    res.json(r.value);
    return;
  }
  res.status(statusOf(r.error)).json({ error: r.error.message, code: r.error.code });
}

/** Contexto de Activos (lectura) para validar/resolver el activo ancla. */
function ctxActivos(s: SesionPreop): ExecutionContext {
  return contextForActivos(s.userId, "lector", s.tenant);
}
/**
 * Contexto de Formularios para la CAPTURA embebida (lectura de plantilla +
 * `respuesta.guardarBorrador`→`enviar`). Sigue el PATRÓN YA ESTABLECIDO en el
 * repo (p. ej. `principalOrdenes` / `modulo.ordenes.capturarRespuesta`): el
 * orquestador compone la respuesta con un principal de SERVICIO que porta los
 * permisos de respuesta del motor de formularios (`respuesta.read/write/enviar`)
 * más `plantilla.read`. La AUTORIZACIÓN del solicitante NO se delega a este
 * comando embebido: la impone la GUARDA propia de la ruta (`puedeRegistrarPreop`,
 * §3 escritura sólo roles con escritura; CONSULTA sólo lectura) y, en segunda
 * barrera, el sellado con `ctxPreop`. La IDENTIDAD del usuario se conserva:
 * `id: s.userId` (procedencia real) y queda SELLADA en la ejecución.
 * NO crea permisos ni roles nuevos: reutiliza los permisos existentes del motor.
 */
const FORMS_CAPTURA_PERMISOS = [
  "modulo.formularios.plantilla.read",
  "modulo.formularios.respuesta.read",
  "modulo.formularios.respuesta.write",
  "modulo.formularios.respuesta.enviar",
];
function ctxForms(s: SesionPreop): ExecutionContext {
  return createExecutionContext({
    principal: { id: s.userId, rol: s.rolCanonico, permisos: FORMS_CAPTURA_PERMISOS, capacidades: [] },
    metadata: { tenantId: s.tenant, ...(s.identityId ? { identityId: s.identityId } : {}) },
  });
}

/**
 * GUARDA de escritura en la FRONTERA HTTP (patrón `puedeMaterializar` de costos):
 * sólo roles con ESCRITURA en el preoperacional (los mismos que en activos: NO
 * CONSULTA/lector) pueden registrar/sellar. CONSULTA ⇒ 403. Espeja el resolver
 * de permisos del kernel (comodín `*` incluido) sobre el principal CANÓNICO del
 * solicitante, sin introducir permisos nuevos.
 */
function puedeRegistrarPreop(s: SesionPreop): boolean {
  const permisos = principalPreoperacional(s.userId, s.rolCanonico).permisos ?? [];
  return permisos.includes("*") || permisos.includes(PERMISOS_PREOP.write);
}
/** Contexto del servicio de preoperacional (sellado/consulta). */
function ctxPreop(s: SesionPreop): ExecutionContext {
  return contextForPreoperacional(s.userId, s.rolCanonico, s.tenant, s.identityId);
}

/** Resultado de resolver el activo ancla (procedencia backend-autoritativa). */
interface ActivoAncla {
  id: string;
  codigoEmpresarial: string;
  nombre: string;
  tipo: string;
  criticidad: string | null;
  centroCosto: string | null;
  ubicacionId: string | null;
  responsable: string | null;
}

async function resolverActivo(s: SesionPreop, activoId: string): Promise<Result<ActivoAncla, KernelError>> {
  const r = await activosRuntime().platform.kernel.queries.execute(ctxActivos(s), "modulo.activos.detalle", { id: activoId });
  if (!r.ok) return r as Result<never, KernelError>;
  const v = r.value as {
    id: string; codigoEmpresarial?: string; nombre?: string; tipo?: string; criticidad?: string | null;
    datos?: Record<string, unknown>;
  };
  const datos = v.datos ?? {};
  const ubic = datos["ubicacion"] as { ubicacionId?: string } | null | undefined;
  return {
    ok: true,
    value: {
      id: v.id,
      codigoEmpresarial: v.codigoEmpresarial ?? "",
      nombre: v.nombre ?? "",
      tipo: v.tipo ?? "",
      criticidad: v.criticidad ?? null,
      centroCosto: datos["centroCosto"] == null ? null : String(datos["centroCosto"]),
      ubicacionId: ubic?.ubicacionId ?? null,
      responsable: datos["responsable"] == null ? null : String(datos["responsable"]),
    },
  };
}

/** Extrae la definición + checklist embebido de la respuesta de `plantilla.obtener`. */
interface PlantillaResuelta {
  clave: string;
  version: number;
  titulo: string;
  checklist: DefinicionChecklist | null;
  aplicabilidad: { tiposEquipo?: string[]; vigenciaDias?: number } | null;
}

function plantillaDeRegistro(rec: unknown): PlantillaResuelta | null {
  const r = rec as {
    data?: {
      clave?: string; version?: number;
      contenido?: { definicion?: { titulo?: string }; checklist?: DefinicionChecklist; aplicabilidad?: { tiposEquipo?: string[]; vigenciaDias?: number } };
    };
  } | null;
  const c = r?.data?.contenido;
  if (!r?.data || !c?.definicion) return null;
  return {
    clave: String(r.data.clave ?? ""),
    version: Number(r.data.version ?? 0),
    titulo: String(c.definicion.titulo ?? ""),
    checklist: c.checklist ?? null,
    aplicabilidad: c.aplicabilidad ?? null,
  };
}

async function resolverPlantilla(
  s: SesionPreop,
  clave: string,
  version?: number,
): Promise<Result<PlantillaResuelta, KernelError>> {
  const query = version
    ? { name: "modulo.formularios.plantilla.obtener", input: { clave, version } }
    : { name: "modulo.formularios.plantilla.obtenerActiva", input: { clave } };
  const r = await formulariosRuntime().platform.kernel.queries.execute(ctxForms(s), query.name, query.input);
  if (!r.ok) return r as Result<never, KernelError>;
  const p = plantillaDeRegistro(r.value);
  if (!p) {
    return { ok: false, error: KernelErrors.notFound("plantilla-preoperacional", clave) };
  }
  return { ok: true, value: p };
}

/**
 * Convierte los `datos` del formulario (mapa clave→{estado,comentario,evidencias})
 * a `RespuestaItem[]` para el cálculo del veredicto. El contrato de estado se
 * mantiene EXACTO (boolean | "na"); el frontend mapea el control segmentado
 * CUMPLE/NO CUMPLE/OBSERVACIÓN/NO APLICA a este contrato sin romperlo.
 */
function respuestasDeItems(datos: Record<string, unknown>, checklist: DefinicionChecklist): RespuestaItem[] {
  const out: RespuestaItem[] = [];
  for (const item of checklist.items) {
    const raw = datos[item.clave] as { estado?: unknown; comentario?: unknown; evidencias?: unknown } | undefined;
    if (raw == null) continue;
    const estado = raw.estado === "na" ? "na" : raw.estado === true ? true : raw.estado === false ? false : undefined;
    if (estado === undefined) continue;
    out.push({
      clave: item.clave,
      estado,
      ...(typeof raw.comentario === "string" ? { comentario: raw.comentario } : {}),
      ...(Array.isArray(raw.evidencias) ? { evidencias: raw.evidencias.map(String) } : {}),
    });
  }
  return out;
}

/** Momento de servidor (nunca del cliente). */
function ahora(): string {
  return new Date().toISOString();
}

/* ------------------------------ Consultas --------------------------------- */

// Plantilla de preoperacional aplicable a un tipo de equipo (o por clave directa).
router.get(`${BASE}/plantilla`, async (req, res) => {
  const s = sesionOf(res);
  const clave = typeof req.query.clave === "string" ? req.query.clave : "";
  const version = typeof req.query.version === "string" && req.query.version.trim() !== "" ? Number(req.query.version) : undefined;
  if (!clave) {
    res.status(400).json({ error: "Falta la clave de la plantilla", code: "KRN-VAL-001" });
    return;
  }
  const p = await resolverPlantilla(s, clave, version);
  if (!p.ok) { sendResult(res, p); return; }
  // Devolvemos también la definición completa (para el renderer) vía obtener.
  const rec = version
    ? await formulariosRuntime().platform.kernel.queries.execute(ctxForms(s), "modulo.formularios.plantilla.obtener", { clave, version })
    : await formulariosRuntime().platform.kernel.queries.execute(ctxForms(s), "modulo.formularios.plantilla.obtenerActiva", { clave });
  sendResult(res, rec);
});

// Ejecuciones selladas de un activo (fuente honesta de "preoperacionales" del activo).
router.get(`${BASE}/ejecuciones`, async (req, res) => {
  const s = sesionOf(res);
  const activoId = typeof req.query.activoId === "string" ? req.query.activoId : undefined;
  const veredicto = typeof req.query.veredicto === "string" ? req.query.veredicto : undefined;
  const r = await preoperacionalRuntime().platform.kernel.queries.execute(ctxPreop(s), `${SERVICIO_PREOP}.listar`, {
    ...(activoId ? { activoId } : {}),
    ...(veredicto ? { veredicto } : {}),
  });
  sendResult(res, r);
});

router.get(`${BASE}/ejecuciones/:id`, async (req, res) => {
  const s = sesionOf(res);
  const r = await preoperacionalRuntime().platform.kernel.queries.execute(ctxPreop(s), `${SERVICIO_PREOP}.obtener`, { id: req.params.id });
  sendResult(res, r);
});

/* --------------------------- Orquestador (registrar) ---------------------- */

interface RegistrarBody {
  opId?: string;
  activoId?: string;
  plantillaClave?: string;
  plantillaVersion?: number;
  datos?: Record<string, unknown>;
  evidencias?: string[];
}

/**
 * Ejecuta el registro de un preoperacional. NO escribe si el rol es de sólo
 * lectura (CONSULTA): `contextForPreoperacional` no le concede permiso de
 * escritura, y el servicio de preoperacional rechaza el sellado (403 AUTH).
 */
async function registrar(s: SesionPreop, b: RegistrarBody): Promise<Result<unknown, KernelError>> {
  const val = (msg: string): Result<never, KernelError> => ({ ok: false, error: KernelErrors.validation(msg) });
  if (!b.opId) return val("Falta opId");
  if (!b.activoId) return val("Falta activoId");
  if (!b.plantillaClave) return val("Falta plantillaClave");
  if (!b.datos || typeof b.datos !== "object") return val("Faltan datos del checklist");

  // (1) Validar el activo ancla (autoridad backend).
  const activo = await resolverActivo(s, b.activoId);
  if (!activo.ok) return activo;

  // (2) Resolver la plantilla (activa o versión pedida) y fijar la versión.
  const plantilla = await resolverPlantilla(s, b.plantillaClave, b.plantillaVersion);
  if (!plantilla.ok) return plantilla;
  if (!plantilla.value.checklist) {
    return val(`La plantilla "${b.plantillaClave}" no declara checklist embebido (sin criticidad por ítem).`);
  }
  const version = plantilla.value.version;

  // (3) Capturar la respuesta (guardarBorrador → enviar). Id determinista por
  //     opId ⇒ reintentos convergen a la MISMA respuesta.
  const respuestaId = `preop-resp:${b.activoId}:${b.plantillaClave}:v${version}:${b.opId}`;
  const ctxF = ctxForms(s);
  const borrador = await formulariosRuntime().platform.kernel.commands.execute(ctxF, "modulo.formularios.respuesta.guardarBorrador", {
    id: respuestaId,
    opId: `${b.opId}:borrador`,
    plantillaClave: b.plantillaClave,
    plantillaVersion: version,
    datos: b.datos,
    ...(b.evidencias && b.evidencias.length > 0 ? { evidencias: b.evidencias } : {}),
  });
  if (!borrador.ok) return borrador;
  const versionBorrador = (borrador.value as { version: number }).version;
  await formulariosRuntime().platform.kernel.outboxProcessor.processPending();

  const enviado = await formulariosRuntime().platform.kernel.commands.execute(ctxF, "modulo.formularios.respuesta.enviar", {
    id: respuestaId,
    opId: `${b.opId}:enviar`,
    version: versionBorrador,
  });
  if (!enviado.ok) return enviado;
  await formulariosRuntime().platform.kernel.outboxProcessor.processPending();

  // (4) Calcular el VEREDICTO en el servidor (regla de Dirección) desde el
  //     checklist embebido (criticidad por ítem declarada en la plantilla).
  const respuestas = respuestasDeItems(b.datos, plantilla.value.checklist);
  const resultado = calcularVeredicto(plantilla.value.checklist, respuestas);

  // (5) SELLAR la ejecución (inmutable, anclada a la versión). Idempotente por opId.
  const ejecucionId = `preop:${b.activoId}:${b.plantillaClave}:v${version}:${b.opId}`;
  const sellado = await preoperacionalRuntime().platform.kernel.commands.execute(ctxPreop(s), `${SERVICIO_PREOP}.sellar`, {
    id: ejecucionId,
    opId: b.opId,
    activoId: b.activoId,
    plantillaClave: b.plantillaClave,
    plantillaVersion: version,
    respuestaId,
    veredicto: resultado.veredicto,
    incumplimientos: resultado.incumplimientos,
    observaciones: resultado.observaciones,
    puntaje: resultado.puntaje as unknown as Record<string, unknown>,
    contexto: {
      activo: {
        id: activo.value.id,
        codigoEmpresarial: activo.value.codigoEmpresarial,
        nombre: activo.value.nombre,
        tipo: activo.value.tipo,
        criticidad: activo.value.criticidad,
        centroCosto: activo.value.centroCosto,
        ubicacionId: activo.value.ubicacionId,
        responsable: activo.value.responsable,
      },
      plantillaTitulo: plantilla.value.titulo,
    },
    selladoAt: ahora(),
  });
  if (!sellado.ok) return sellado;
  await preoperacionalRuntime().platform.kernel.outboxProcessor.processPending();

  const s2 = sellado.value as { id: string; veredicto: string; idempotente: boolean };
  return {
    ok: true,
    value: {
      id: s2.id,
      respuestaId,
      plantilla: { clave: b.plantillaClave, version },
      veredicto: s2.veredicto,
      incumplimientos: resultado.incumplimientos,
      observaciones: resultado.observaciones,
      hayCriticoIncumplido: resultado.hayCriticoIncumplido,
      idempotente: s2.idempotente,
    },
  };
}

router.post(`${BASE}/registrar`, async (req, res) => {
  const s = sesionOf(res);
  if (!puedeRegistrarPreop(s)) {
    res.status(403).json({ error: `Permiso denegado: ${PERMISOS_PREOP.write}`, code: "KRN-AUTH-002" });
    return;
  }
  const r = await registrar(s, (req.body ?? {}) as RegistrarBody);
  sendResult(res, r);
});

/* --------------------------- Sincronización offline ----------------------- */
// Reutiliza la ÚNICA cola offline existente (ColaSync/mutarConOffline). Cada
// operación encolada es un `registrar` idempotente por opId; aquí las
// despachamos una a una y devolvemos recibos con estado terminal.

interface OperacionSync { opId: string; comando: string; input: RegistrarBody }

router.post(`${BASE}/sync`, async (req, res) => {
  const s = sesionOf(res);
  if (!puedeRegistrarPreop(s)) {
    res.status(403).json({ error: `Permiso denegado: ${PERMISOS_PREOP.write}`, code: "KRN-AUTH-002" });
    return;
  }
  const ops = (req.body?.operaciones ?? []) as OperacionSync[];
  if (!Array.isArray(ops)) {
    res.status(400).json({ error: "Cola de sincronización inválida", code: "KRN-VAL-001" });
    return;
  }
  const resultados: Array<Record<string, unknown>> = [];
  let aplicadas = 0, idempotentes = 0, conflictos = 0, reintentables = 0, rechazadas = 0;
  for (const op of ops) {
    const r = await registrar(s, { ...op.input, opId: op.opId });
    if (r.ok) {
      const v = r.value as { idempotente?: boolean };
      const estado = v.idempotente ? "idempotente" : "aplicada";
      if (v.idempotente) idempotentes++; else aplicadas++;
      resultados.push({ opId: op.opId, comando: op.comando, estado, resultado: r.value });
    } else {
      const code = r.error.code;
      let estado: string;
      if (code.startsWith("KRN-CFL")) { estado = "conflicto"; conflictos++; }
      else if (code.startsWith("KRN-VAL") || code.startsWith("KRN-AUTH") || code.startsWith("KRN-NF")) { estado = "rechazada"; rechazadas++; }
      else { estado = "reintentable"; reintentables++; }
      resultados.push({ opId: op.opId, comando: op.comando, estado, error: r.error.message });
    }
  }
  res.json({ total: ops.length, aplicadas, idempotentes, conflictos, reintentables, rechazadas, resultados });
});

export default router;
