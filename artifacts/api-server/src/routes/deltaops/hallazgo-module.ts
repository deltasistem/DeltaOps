/**
 * DELTAOPS LITE-05 · API HTTP del BUCLE «Hallazgo → OT → Ejecución → Cierre».
 *
 * Router Express FINO montado bajo `/api/deltaops/activos/hallazgo/*` (mismo
 * entitlement `activos` que el preoperacional que ORIGINA los hallazgos; NO
 * introduce módulo ni entitlement nuevo). Es una superficie de COMPOSICIÓN:
 *
 *   - GENERAR MANTENIMIENTO (§2, explícito, nunca automático): orquesta comandos
 *     PÚBLICOS de Correctivo — `crear-solicitud` (origen=preoperacional,
 *     fuenteId=hallazgoId) → cadena de `transicionar-solicitud` → `generar-orden-
 *     correctiva`. Idempotente end-to-end: `solicitudId` DETERMINISTA = uuidv5
 *     del `hallazgoId` (=ejecuciónId+ítemClave). Así la `claveDedup` de Correctivo
 *     queda ANCLADA AL HALLAZGO sin estructura nueva (L5-1): un hallazgo → una OT,
 *     robusto ante doble-click / refresh / mala conexión / sync offline (§13).
 *   - DESCARTAR / REABRIR (§L5-4, decisión de Dirección): sub-estado «descartado»
 *     registrado y reversible en el store genérico (runtime `modulo.hallazgo`).
 *   - ESTADO del hallazgo (pendiente / convertido / descartado) DERIVADO de datos
 *     reales: la generación de Correctivo (convertido + OT) y el store de descarte.
 *
 * PROCEDENCIA §1 resuelta SIEMPRE EN SERVIDOR desde la ejecución preoperacional
 * SELLADA (por `ejecucionId`/`respuestaId`) + `modulo.activos.detalle`; jamás se
 * confía del frontend (§12). Sin centro → «Sin centro de costos configurado».
 *
 * EXCLUSIÓN MUTUA (§L5-4): un hallazgo con OT materializada NO puede descartarse;
 * uno descartado puede reabrirse y luego generar OT.
 */
import crypto from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import { KernelErrors, type ExecutionContext, type KernelError, type Result } from "@workspace/kernel";
import { claveDedupOrden, MODULO as MODULO_CORRECTIVO } from "@workspace/module-correctivo";
import { aRolCanonico } from "../../deltaops/identity/rbac";
import { activosRuntime, contextForActivos } from "./activos-runtime";
import { correctivoRuntime, contextForCorrectivo } from "./correctivo-runtime";
import { preoperacionalRuntime, contextForPreoperacional, SERVICIO_PREOP } from "./preoperacional-runtime";
import {
  hallazgoRuntime,
  contextForHallazgo,
  principalHallazgo,
  SERVICIO_HALLAZGO,
  PERMISOS_HALLAZGO,
} from "./hallazgo-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/activos/hallazgo";

/* ------------------------------ Sesión ------------------------------------ */

interface SesionHallazgo {
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
  // Rol CANÓNICO de la sesión (NO el `user.rol` legacy): imprescindible para el
  // RBAC de estas rutas NUEVAS (CONSULTA no escribe; §5/§12).
  const rolCanonico = req.session?.rolCanonico ?? aRolCanonico(user.rol);
  res.locals.sesion = {
    userId: String(user.id),
    rolCanonico,
    tenant: user.tenant,
    ...(req.session?.identityId ? { identityId: req.session.identityId } : {}),
  } satisfies SesionHallazgo;
  next();
});

/* ---------------------------- Utilidades ---------------------------------- */

function sesionOf(res: Response): SesionHallazgo {
  return res.locals.sesion as SesionHallazgo;
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

/**
 * GUARDA de escritura en la FRONTERA HTTP (patrón LITE-04 `puedeRegistrarPreop`):
 * sólo roles con ESCRITURA pueden generar/descartar/reabrir. CONSULTA ⇒ 403.
 * Espeja el resolver del kernel sobre el principal CANÓNICO, sin permisos nuevos.
 */
function puedeEscribir(s: SesionHallazgo): boolean {
  const permisos = principalHallazgo(s.userId, s.rolCanonico).permisos ?? [];
  return permisos.includes("*") || permisos.includes(PERMISOS_HALLAZGO.write);
}

/** Momento de servidor (nunca del cliente). */
function ahora(): string {
  return new Date().toISOString();
}

/* -------------------------- Identidad del hallazgo ------------------------ */

/** Espacio de nombres UUIDv5 para derivar ids DETERMINISTAS desde el hallazgo. */
const NS_HALLAZGO = "6f1e2a7c-9b3d-4e58-8a21-0c7d4f6b1e93";

/** uuidv5 determinista (sha1) sobre un token estable. */
function uuidv5(token: string): string {
  const nsBytes = Buffer.from(NS_HALLAZGO.replace(/-/g, ""), "hex");
  const hash = crypto.createHash("sha1");
  hash.update(nsBytes);
  hash.update(Buffer.from(token, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC-4122
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** hallazgoId DETERMINISTA = ejecuciónId + ítemClave (§13). */
function hallazgoIdDe(ejecucionId: string, itemClave: string): string {
  return `${ejecucionId}::${itemClave}`;
}
/** solicitudId DETERMINISTA (ancla la claveDedup de Correctivo al hallazgo). */
function solicitudIdDe(hallazgoId: string): string {
  return uuidv5(`hallazgo-solicitud:${hallazgoId}`);
}
/** id del registro de descarte DETERMINISTA (idempotencia del descarte). */
function descarteIdDe(hallazgoId: string): string {
  return `descarte:${hallazgoId}`;
}

/* --------------------------- Procedencia (§1) ----------------------------- */

interface IncumplimientoSellado {
  clave: string;
  etiqueta: string;
  critico: boolean;
  comentario?: string;
  evidencias?: string[];
}

interface Procedencia {
  hallazgoId: string;
  ejecucionId: string;
  itemClave: string;
  origen: "preoperacional";
  activo: {
    id: string;
    codigoEmpresarial: string;
    nombre: string;
    tipo: string;
    criticidad: string | null;
    centroCosto: string | null;
    ubicacionId: string | null;
    responsable: string | null;
  };
  item: IncumplimientoSellado;
  respuestaId: string;
  plantilla: { clave: string; version: number; titulo: string | null };
  preoperacional: { selladoPor: string; selladoAt: string; veredicto: string };
}

/**
 * Resuelve la procedencia COMPLETA del hallazgo EN SERVIDOR desde la ejecución
 * preoperacional SELLADA (autoridad backend §12). El `centroCosto`/`ubicacion`/
 * `responsable` viajan sellados en la ejecución (LITE-04) — que a su vez los tomó
 * de `activos.detalle` — de modo que NO se recalculan aquí; se refresca sólo el
 * activo si la ejecución no los trae. Devuelve NF si el hallazgo no existe.
 */
async function resolverProcedencia(
  s: SesionHallazgo,
  ejecucionId: string,
  itemClave: string,
): Promise<Result<Procedencia, KernelError>> {
  const ctxP = contextForPreoperacional(s.userId, s.rolCanonico, s.tenant, s.identityId);
  const r = await preoperacionalRuntime().platform.kernel.queries.execute(ctxP, `${SERVICIO_PREOP}.obtener`, { id: ejecucionId });
  if (!r.ok) return r as Result<never, KernelError>;
  const rec = r.value as { data?: Record<string, unknown> } | null;
  const data = rec?.data;
  if (!data) return { ok: false, error: KernelErrors.notFound("preoperacional-ejecucion", ejecucionId) };

  const incumplimientos = (data["incumplimientos"] as IncumplimientoSellado[] | undefined) ?? [];
  const observaciones = (data["observaciones"] as IncumplimientoSellado[] | undefined) ?? [];
  const item = [...incumplimientos, ...observaciones].find((i) => i.clave === itemClave);
  if (!item) return { ok: false, error: KernelErrors.notFound("hallazgo", `${ejecucionId}::${itemClave}`) };

  const contexto = (data["contexto"] as Record<string, unknown> | undefined) ?? {};
  const activoSellado = (contexto["activo"] as Record<string, unknown> | undefined) ?? {};
  const activoId = String(activoSellado["id"] ?? data["activoId"] ?? "");

  // Refresco fail-safe del activo (fuente de verdad §6): si la ejecución no selló
  // centro/ubicación/responsable, se leen de Activos. Nunca se inventa.
  let centroCosto = activoSellado["centroCosto"] == null ? null : String(activoSellado["centroCosto"]);
  let ubicacionId = activoSellado["ubicacionId"] == null ? null : String(activoSellado["ubicacionId"]);
  let responsable = activoSellado["responsable"] == null ? null : String(activoSellado["responsable"]);
  if ((centroCosto === null || ubicacionId === null || responsable === null) && activoId) {
    const ctxA = contextForActivos(s.userId, "lector", s.tenant);
    const ra = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.detalle", { id: activoId });
    if (ra.ok) {
      const v = ra.value as { datos?: Record<string, unknown> };
      const d = v.datos ?? {};
      const ubic = d["ubicacion"] as { ubicacionId?: string } | null | undefined;
      centroCosto = centroCosto ?? (d["centroCosto"] == null ? null : String(d["centroCosto"]));
      ubicacionId = ubicacionId ?? (ubic?.ubicacionId ?? null);
      responsable = responsable ?? (d["responsable"] == null ? null : String(d["responsable"]));
    }
  }

  const hallazgoId = hallazgoIdDe(ejecucionId, itemClave);
  return {
    ok: true,
    value: {
      hallazgoId,
      ejecucionId,
      itemClave,
      origen: "preoperacional",
      activo: {
        id: activoId,
        codigoEmpresarial: String(activoSellado["codigoEmpresarial"] ?? ""),
        nombre: String(activoSellado["nombre"] ?? ""),
        tipo: String(activoSellado["tipo"] ?? ""),
        criticidad: activoSellado["criticidad"] == null ? null : String(activoSellado["criticidad"]),
        centroCosto,
        ubicacionId,
        responsable,
      },
      item,
      respuestaId: String(data["respuestaId"] ?? ""),
      plantilla: {
        clave: String(data["plantillaClave"] ?? ""),
        version: Number(data["plantillaVersion"] ?? 0),
        titulo: contexto["plantillaTitulo"] == null ? null : String(contexto["plantillaTitulo"]),
      },
      preoperacional: {
        selladoPor: String(data["selladoPor"] ?? ""),
        selladoAt: String(data["selladoAt"] ?? ""),
        veredicto: String(data["veredicto"] ?? ""),
      },
    },
  };
}

/* --------------------------- Estado del hallazgo -------------------------- */

type EstadoHallazgo = "pendiente" | "convertido" | "descartado";

interface EstadoResuelto {
  estado: EstadoHallazgo;
  ordenTrabajoId: string | null;
  solicitudId: string;
  descarte: Record<string, unknown> | null;
}

/**
 * DERIVA el estado del hallazgo de DATOS REALES (§8, sin nuevo sistema de
 * estados): «convertido» ⇔ existe generación materializada (OT) para la clave de
 * dedup determinista; «descartado» ⇔ registro de descarte DESCARTADO; si no,
 * «pendiente». La OT tiene precedencia sobre el descarte (exclusión mutua §L5-4).
 */
async function resolverEstado(s: SesionHallazgo, hallazgoId: string): Promise<Result<EstadoResuelto, KernelError>> {
  const solicitudId = solicitudIdDe(hallazgoId);
  // (1) ¿Convertido? — generación de Correctivo por clave determinista.
  const ctxC = contextForCorrectivo(s.userId, s.rolCanonico, s.tenant);
  const gen = await correctivoRuntime().platform.kernel.queries.execute(ctxC, `${MODULO_CORRECTIVO}.generacion-por-solicitud`, { solicitudId });
  if (!gen.ok) return gen as Result<never, KernelError>;
  const g = gen.value as { ordenTrabajoId?: string | null } | null;
  if (g && g.ordenTrabajoId) {
    return { ok: true, value: { estado: "convertido", ordenTrabajoId: g.ordenTrabajoId, solicitudId, descarte: null } };
  }
  // (2) ¿Descartado? — store de descarte (estado DESCARTADO vigente).
  const ctxH = contextForHallazgo(s.userId, s.rolCanonico, s.tenant, s.identityId);
  const desc = await hallazgoRuntime().platform.kernel.queries.execute(ctxH, `${SERVICIO_HALLAZGO}.obtener`, { id: descarteIdDe(hallazgoId) });
  if (desc.ok) {
    const d = desc.value as { status?: string; data?: Record<string, unknown> };
    if (d.status === "DESCARTADO") {
      return { ok: true, value: { estado: "descartado", ordenTrabajoId: null, solicitudId, descarte: d.data ?? null } };
    }
  } else if (!desc.error.code.startsWith("KRN-NF")) {
    return desc as Result<never, KernelError>;
  }
  // (3) Pendiente.
  return { ok: true, value: { estado: "pendiente", ordenTrabajoId: null, solicitudId, descarte: null } };
}

/* ------------------------------ Resumen §15 ------------------------------- */

/**
 * DELTAOPS LITE-05 §15 · RESUMEN accionable por tenant, por COMPOSICIÓN de lectura
 * sobre fuentes REALES (no métrica inventada, no estimación):
 *   - Enumera los HALLAZGOS reales = ítems `incumplimientos ∪ observaciones` de las
 *     ejecuciones preoperacionales SELLADAS (preop `.listar`, acotado).
 *   - Deriva el ESTADO de cada uno con la MISMA lógica server-side (`resolverEstado`):
 *     convertido (generación de Correctivo + OT), descartado (store de descarte)
 *     o pendiente.
 *   - `hallazgosPendientes` = ni OT materializada ni descarte vigente (los que
 *     REQUIEREN gestión). `mantenimientosDerivados` = hallazgos con OT materializada
 *     desde preoperacional. `descartados` se reporta para honestidad del total.
 *
 * Lectura pura: reutiliza contratos ya usados por el bucle. Acota internamente el
 * número de ejecuciones inspeccionadas (`limit`) para no degradar; jamás falla en
 * silencio ni estima. CONSULTA (lector) PUEDE leer (permiso de lectura).
 */
export interface ResumenHallazgos {
  hallazgosPendientes: number;
  mantenimientosDerivados: number;
  descartados: number;
  totalHallazgos: number;
  ejecucionesInspeccionadas: number;
  acotado: boolean;
}

const RESUMEN_MAX_EJECUCIONES = 200;

export async function resumenHallazgos(
  s: SesionHallazgo,
  limit = RESUMEN_MAX_EJECUCIONES,
): Promise<Result<ResumenHallazgos, KernelError>> {
  const capped = Math.max(1, Math.min(limit, RESUMEN_MAX_EJECUCIONES));
  const ctxP = contextForPreoperacional(s.userId, s.rolCanonico, s.tenant, s.identityId);
  const lista = await preoperacionalRuntime().platform.kernel.queries.execute(
    ctxP,
    `${SERVICIO_PREOP}.listar`,
    { limit: capped },
  );
  if (!lista.ok) return lista as Result<never, KernelError>;
  const ejecuciones = (lista.value as Array<{ id?: string; data?: Record<string, unknown> }>) ?? [];

  let pendientes = 0;
  let derivados = 0;
  let descartados = 0;
  let total = 0;

  for (const ejec of ejecuciones) {
    const data = ejec.data;
    const ejecucionId = ejec.id;
    if (!data || !ejecucionId) continue;
    const incumplimientos = (data["incumplimientos"] as IncumplimientoSellado[] | undefined) ?? [];
    const observaciones = (data["observaciones"] as IncumplimientoSellado[] | undefined) ?? [];
    const items = [...incumplimientos, ...observaciones];
    for (const item of items) {
      total += 1;
      const estado = await resolverEstado(s, hallazgoIdDe(ejecucionId, item.clave));
      if (!estado.ok) return estado as Result<never, KernelError>;
      switch (estado.value.estado) {
        case "convertido":
          derivados += 1;
          break;
        case "descartado":
          descartados += 1;
          break;
        default:
          pendientes += 1;
      }
    }
  }

  return {
    ok: true,
    value: {
      hallazgosPendientes: pendientes,
      mantenimientosDerivados: derivados,
      descartados,
      totalHallazgos: total,
      ejecucionesInspeccionadas: ejecuciones.length,
      acotado: ejecuciones.length >= capped,
    },
  };
}

/* ------------------------------ Consultas --------------------------------- */

/**
 * §15 · Resumen accionable por tenant (read-only). CONSULTA puede leer.
 * Deep-link destino: la vista de preoperacionales/activos donde se gestionan.
 */
router.get(`${BASE}/resumen`, async (_req, res) => {
  const s = sesionOf(res);
  const r = await resumenHallazgos(s);
  sendResult(res, r);
});

/** Estado + procedencia del hallazgo (para la vista de resultado/detalle). */
router.get(`${BASE}/estado`, async (req, res) => {
  const s = sesionOf(res);
  const ejecucionId = typeof req.query.ejecucionId === "string" ? req.query.ejecucionId : "";
  const itemClave = typeof req.query.itemClave === "string" ? req.query.itemClave : "";
  if (!ejecucionId || !itemClave) {
    res.status(400).json({ error: "Faltan ejecucionId e itemClave", code: "KRN-VAL-001" });
    return;
  }
  const proc = await resolverProcedencia(s, ejecucionId, itemClave);
  if (!proc.ok) { sendResult(res, proc); return; }
  const estado = await resolverEstado(s, proc.value.hallazgoId);
  if (!estado.ok) { sendResult(res, estado); return; }
  res.json({ ...estado.value, procedencia: proc.value });
});

/* --------------------------- Orquestador (generar) ------------------------ */

interface GenerarBody {
  ejecucionId?: string;
  itemClave?: string;
  opId?: string;
}

/** Mapea la criticidad del ítem del hallazgo a una prioridad del catálogo correctivo. */
function prioridadDe(item: IncumplimientoSellado, activoCriticidad: string | null): string {
  if (item.critico) return "critica";
  const c = (activoCriticidad ?? "").toLowerCase();
  if (c === "critica" || c === "alta") return "alta";
  if (c === "media") return "media";
  return "media";
}

/**
 * Genera el mantenimiento (OT) desde un hallazgo. Idempotente end-to-end por
 * `solicitudId` determinista + recibos por `opId`. Un reintento (doble-click,
 * refresh, sync offline) converge a la MISMA OT. Falla CERRADO ante descarte
 * vigente (exclusión mutua §L5-4).
 */
async function generar(s: SesionHallazgo, b: GenerarBody): Promise<Result<unknown, KernelError>> {
  const val = (msg: string): Result<never, KernelError> => ({ ok: false, error: KernelErrors.validation(msg) });
  if (!b.opId) return val("Falta opId");
  if (!b.ejecucionId) return val("Falta ejecucionId");
  if (!b.itemClave) return val("Falta itemClave");

  // (1) Procedencia server-side (autoridad §12).
  const proc = await resolverProcedencia(s, b.ejecucionId, b.itemClave);
  if (!proc.ok) return proc;
  const p = proc.value;
  const solicitudId = solicitudIdDe(p.hallazgoId);

  // (2) Estado actual. Si ya convertido ⇒ devuelve la MISMA OT (idempotente §2).
  const estado0 = await resolverEstado(s, p.hallazgoId);
  if (!estado0.ok) return estado0;
  if (estado0.value.estado === "convertido") {
    return { ok: true, value: { solicitudId, ordenTrabajoId: estado0.value.ordenTrabajoId, estado: "convertido", idempotente: true } };
  }
  if (estado0.value.estado === "descartado") {
    return { ok: false, error: KernelErrors.conflict("El hallazgo está descartado; reábrelo antes de generar mantenimiento") };
  }

  // CONTEXTO DE SERVICIO para las llamadas internas a Correctivo: la RBAC del
  // SOLICITANTE ya se aplicó en la frontera HTTP (`puedeEscribir`). Los comandos
  // encadenados (write/govern/execute) corren bajo un principal de servicio con
  // EXACTAMENTE los permisos de la cadena (lección LITE-04), preservando la
  // trazabilidad del actor real (`s.userId`). `s.rolCanonico` NO se pasa a
  // Correctivo porque su mapa de roles es legacy (colapsaría a solo-lectura).
  const ctxC = contextForCorrectivo(s.userId, "operador", s.tenant);
  const cor = correctivoRuntime();

  // (2b) ASEGURA (idempotente) el valor `preoperacional` en el catálogo
  //      `origenes-solicitud` del tenant. Reutiliza el comando admin EXISTENTE
  //      `catalogo-upsert` (ON CONFLICT DO UPDATE) con un contexto de servicio
  //      admin acotado a esta única operación (no altera el RBAC del solicitante;
  //      mismo criterio que el materializador usa contextos de servicio). Es
  //      composición: no crea catálogo ni estructura nueva.
  const ctxAdmin = contextForCorrectivo(s.userId, "admin", s.tenant);
  const catOk = await cor.platform.kernel.commands.execute(ctxAdmin, `${MODULO_CORRECTIVO}.catalogo-upsert`, {
    catalogo: "origenes-solicitud",
    clave: "preoperacional",
    etiqueta: "Preoperacional",
  });
  if (!catOk.ok) return catOk;

  // (3) crear-solicitud (id DETERMINISTA = ancla la claveDedup al hallazgo, L5-1).
  //     origen=preoperacional, fuenteId=hallazgoId, evidencia REFERENCIA-ONLY del
  //     hallazgo (§9). Idempotente por opId.
  const prioridad = prioridadDe(p.item, p.activo.criticidad);
  const CRITICIDADES_VALIDAS = ["baja", "media", "alta", "critica"];
  const critLower = (p.activo.criticidad ?? "").toLowerCase();
  const criticidadValida = CRITICIDADES_VALIDAS.includes(critLower) ? critLower : null;
  const evidencias = (p.item.evidencias ?? []).map((attachmentId) => ({ attachmentId, tipo: "foto" as const, etiqueta: "Evidencia del preoperacional" }));
  const sintomaTexto = p.item.comentario && p.item.comentario.trim() !== "" ? `${p.item.etiqueta} — ${p.item.comentario}` : p.item.etiqueta;
  const crear = await cor.platform.kernel.commands.execute(ctxC, `${MODULO_CORRECTIVO}.crear-solicitud`, {
    id: solicitudId,
    opId: `hallazgo-crear:${p.hallazgoId}`,
    titulo: `Hallazgo preoperacional: ${p.item.etiqueta}`,
    descripcion: `Origen: preoperacional ${p.plantilla.titulo ?? p.plantilla.clave} v${p.plantilla.version}. Equipo ${p.activo.codigoEmpresarial || p.activo.id}. Registrado por ${p.preoperacional.selladoPor} el ${p.preoperacional.selladoAt}.`,
    origen: "preoperacional",
    fuenteId: p.hallazgoId,
    objeto: { activoId: p.activo.id },
    prioridad,
    // `criticidad` es OPCIONAL y se valida contra el catálogo `criticidades`
    // (canónicos baja/media/alta/critica). Sólo se propaga si encaja; jamás se
    // inventa un valor que rompa la validación de la solicitud.
    ...(criticidadValida ? { criticidad: criticidadValida } : {}),
    sintomas: [{ clave: p.itemClave, texto: sintomaTexto }],
    ...(evidencias.length > 0 ? { evidencias } : {}),
  });
  if (!crear.ok) return crear;
  await cor.platform.kernel.outboxProcessor.processPending();

  // (4) Cadena de transiciones registro → aprobada (gobierno del Workflow Engine).
  //     Re-lee la versión ACTUAL antes de cada transición (recuperable).
  const acciones = ["enviarTriage", "iniciarDiagnostico", "enviarValidacion", "aprobar"] as const;
  for (const accion of acciones) {
    const det = await cor.platform.kernel.queries.execute(ctxC, `${MODULO_CORRECTIVO}.solicitud-detalle`, { id: solicitudId });
    if (!det.ok) return det;
    const d = det.value as { estado?: string; version?: number };
    // Si ya está en/pasado el destino (reintento), la política lo rechazaría; sólo
    // transicionamos si el estado actual admite la acción.
    const estadoActual = String(d.estado ?? "");
    const yaAvanzado =
      (accion === "enviarTriage" && estadoActual !== "registro") ||
      (accion === "iniciarDiagnostico" && !["triage"].includes(estadoActual)) ||
      (accion === "enviarValidacion" && !["diagnostico"].includes(estadoActual)) ||
      (accion === "aprobar" && !["validacion"].includes(estadoActual));
    if (estadoActual === "aprobada") break;
    if (yaAvanzado) continue;
    const trans = await cor.platform.kernel.commands.execute(ctxC, `${MODULO_CORRECTIVO}.transicionar-solicitud`, {
      id: solicitudId,
      accion,
      expectedVersion: Number(d.version ?? 1),
      opId: `hallazgo-${accion}:${p.hallazgoId}`,
    });
    if (!trans.ok) return trans;
    await cor.platform.kernel.outboxProcessor.processPending();
  }

  // (5) generar-orden-correctiva (idempotente; claveDedup anclada al hallazgo).
  const generado = await cor.platform.kernel.commands.execute(ctxC, `${MODULO_CORRECTIVO}.generar-orden-correctiva`, {
    solicitudId,
    opId: `hallazgo-generar:${p.hallazgoId}`,
  });
  if (!generado.ok) return generado;
  await cor.platform.kernel.outboxProcessor.processPending();
  const gv = generado.value as { ordenTrabajoId?: string; estado?: string; idempotente?: boolean };
  return {
    ok: true,
    value: { solicitudId, ordenTrabajoId: gv.ordenTrabajoId ?? null, estado: "convertido", idempotente: gv.idempotente === true },
  };
}

router.post(`${BASE}/generar`, async (req, res) => {
  const s = sesionOf(res);
  if (!puedeEscribir(s)) {
    res.status(403).json({ error: `Permiso denegado: ${PERMISOS_HALLAZGO.write}`, code: "KRN-AUTH-002" });
    return;
  }
  const r = await generar(s, (req.body ?? {}) as GenerarBody);
  sendResult(res, r);
});

/* --------------------------- Descartar / reabrir -------------------------- */

interface DescarteBody {
  ejecucionId?: string;
  itemClave?: string;
  motivo?: string;
  opId?: string;
}

async function descartar(s: SesionHallazgo, b: DescarteBody): Promise<Result<unknown, KernelError>> {
  const val = (msg: string): Result<never, KernelError> => ({ ok: false, error: KernelErrors.validation(msg) });
  if (!b.opId) return val("Falta opId");
  if (!b.ejecucionId) return val("Falta ejecucionId");
  if (!b.itemClave) return val("Falta itemClave");

  const proc = await resolverProcedencia(s, b.ejecucionId, b.itemClave);
  if (!proc.ok) return proc;
  const p = proc.value;

  // Exclusión mutua (§L5-4): con OT materializada NO se puede descartar.
  // INVARIANTE de precedencia (revisión O-1): generación y descarte viven en stores
  // distintos (check-then-act sin transacción común). Ante una carrera genuina
  // descartar⇄generar, la OT SIEMPRE gana: `resolverEstado` evalúa la materialización
  // ANTES que el descarte, la reserva atómica de Correctivo impide una segunda OT y
  // un registro de descarte concurrente queda inerte (el estado observable es
  // «convertido»). No hay duplicado posible; solo un descarte huérfano sin efecto.
  const estado0 = await resolverEstado(s, p.hallazgoId);
  if (!estado0.ok) return estado0;
  if (estado0.value.estado === "convertido") {
    return { ok: false, error: KernelErrors.conflict("El hallazgo ya tiene una OT; no puede descartarse") };
  }

  const ctxH = contextForHallazgo(s.userId, s.rolCanonico, s.tenant, s.identityId);
  const r = await hallazgoRuntime().platform.kernel.commands.execute(ctxH, `${SERVICIO_HALLAZGO}.descartar`, {
    id: descarteIdDe(p.hallazgoId),
    opId: b.opId,
    hallazgoId: p.hallazgoId,
    ejecucionId: p.ejecucionId,
    itemClave: p.itemClave,
    activoId: p.activo.id,
    ...(b.motivo ? { motivo: b.motivo } : {}),
    descartadoAt: ahora(),
  });
  if (!r.ok) return r;
  await hallazgoRuntime().platform.kernel.outboxProcessor.processPending();
  return r;
}

async function reabrir(s: SesionHallazgo, b: DescarteBody): Promise<Result<unknown, KernelError>> {
  const val = (msg: string): Result<never, KernelError> => ({ ok: false, error: KernelErrors.validation(msg) });
  if (!b.opId) return val("Falta opId");
  if (!b.ejecucionId) return val("Falta ejecucionId");
  if (!b.itemClave) return val("Falta itemClave");

  const proc = await resolverProcedencia(s, b.ejecucionId, b.itemClave);
  if (!proc.ok) return proc;
  const p = proc.value;

  const ctxH = contextForHallazgo(s.userId, s.rolCanonico, s.tenant, s.identityId);
  const r = await hallazgoRuntime().platform.kernel.commands.execute(ctxH, `${SERVICIO_HALLAZGO}.reabrir`, {
    id: descarteIdDe(p.hallazgoId),
    opId: b.opId,
    hallazgoId: p.hallazgoId,
    ...(b.motivo ? { motivo: b.motivo } : {}),
    reabiertoAt: ahora(),
  });
  if (!r.ok) return r;
  await hallazgoRuntime().platform.kernel.outboxProcessor.processPending();
  return r;
}

router.post(`${BASE}/descartar`, async (req, res) => {
  const s = sesionOf(res);
  if (!puedeEscribir(s)) {
    res.status(403).json({ error: `Permiso denegado: ${PERMISOS_HALLAZGO.write}`, code: "KRN-AUTH-002" });
    return;
  }
  sendResult(res, await descartar(s, (req.body ?? {}) as DescarteBody));
});

router.post(`${BASE}/reabrir`, async (req, res) => {
  const s = sesionOf(res);
  if (!puedeEscribir(s)) {
    res.status(403).json({ error: `Permiso denegado: ${PERMISOS_HALLAZGO.write}`, code: "KRN-AUTH-002" });
    return;
  }
  sendResult(res, await reabrir(s, (req.body ?? {}) as DescarteBody));
});

/* --------------------------- Sincronización offline ----------------------- */
// Reutiliza la ÚNICA cola offline existente (ColaSync/mutarConOffline). Cada op
// es un `generar`/`descartar`/`reabrir` idempotente por opId; se despachan una a
// una devolviendo recibos con estado terminal.

interface OperacionSync { opId: string; comando: string; input: Record<string, unknown> }

router.post(`${BASE}/sync`, async (req, res) => {
  const s = sesionOf(res);
  if (!puedeEscribir(s)) {
    res.status(403).json({ error: `Permiso denegado: ${PERMISOS_HALLAZGO.write}`, code: "KRN-AUTH-002" });
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
    const input = { ...op.input, opId: op.opId };
    const r =
      op.comando === "descartar" ? await descartar(s, input as DescarteBody)
      : op.comando === "reabrir" ? await reabrir(s, input as DescarteBody)
      : await generar(s, input as GenerarBody);
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
