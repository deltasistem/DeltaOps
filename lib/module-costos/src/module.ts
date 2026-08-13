/**
 * DGP-021.1 · Fundación del Módulo de Costos — Capa de aplicación + descriptor
 * del Shared Platform Service (`modulo.costos`).
 *
 * COMPOSICIÓN PURA sobre contratos públicos congelados. El módulo NO modifica
 * Órdenes/Abastecimiento/Identidad/plataforma ni sus RLS. Materializa HECHOS
 * ECONÓMICOS con SNAPSHOT inmutable y estados ACTIVO/ANULADO (SIN workflow: los
 * dos estados no requieren máquina de estados; no se arrastra complejidad).
 *
 * Fuentes de verdad (SOLO LECTURA, por puerto/contrato público):
 *  - Órdenes (`OrdenesPort` → `modulo.ordenes.detalle`): existencia de la OT y
 *    relación canónica OT→activo. El `activoId` NUNCA proviene del frontend.
 *  - Abastecimiento (`CostoExactoPort` → `modulo.abastecimiento.costos-exactos`,
 *    DGP-021.0): costo unitario EXACTO de un material. Prohibido `abs_costos_read`
 *    o el endpoint float legacy.
 *
 * Idempotencia (§25): TODA mutación reclama el `opId` durable ANTES de efectos.
 * Dinero string-safe de extremo a extremo (§9): jamás Number/parseFloat/float.
 *
 * ORQUESTACIÓN cross-módulo (inventario→costos): el GANCHO queda preparado
 * (comando `hecho.materializar-material` idempotente por opId, disparable desde
 * el api-server fail-safe), pero la orquestación real llega en DGP-021.2.
 */
import { z } from "zod";
import {
  createDomainEvent,
  fail,
  KernelErrors,
  ok,
  type ExecutionContext,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { audit, tenantOf, type PlatformServiceDefinition, type ServiceDeps } from "@workspace/platform";
import { MODULO } from "./module-name";
import { EVENTOS_MODULO, HECHO_ANULADO, HECHO_MATERIALIZADO } from "./domain/events";
import {
  anular as anularHecho,
  ESTADOS_HECHO,
  materializar as materializarHecho,
  NATURALEZAS_HECHO,
  TIPOS_HECHO,
  type EstadoHecho,
  type HechoEconomico,
  type NaturalezaHecho,
  type TipoHecho,
} from "./domain/hecho";
import { RE_DINERO } from "./domain/dinero";
import type {
  CostoExactoPort,
  HechoRepository,
  IdentidadPort,
  OrdenesPort,
  ReciboPort,
} from "./domain/ports";

/* ------------------------------- Permisos -------------------------------- */
// Capacidades SEPARADAS por operación (§directiva RBAC): consulta ≠ materializar
// ≠ anular ≠ administrar. Se reutiliza el patrón de permisos por comando.

const P_READ = `${MODULO}.read`; // consulta tenant-scoped de hechos
const P_MATERIALIZAR = `${MODULO}.materializar`; // crear hechos económicos
const P_ANULAR = `${MODULO}.anular`; // anular hechos (append-only)
const P_ADMIN = `${MODULO}.admin`; // administración del módulo (reservado)

/** Tablas del módulo protegidas por RLS (documentación/auditoría). */
export const TABLAS_RLS_MODULO: readonly string[] = [
  "cos_hechos",
  "cos_recibos",
  "cos_eventos",
];

/* ------------------------------- Adaptadores ----------------------------- */

/** Puerto mínimo de bitácora durable de eventos (append idempotente). */
export interface EventLogPort {
  append(
    uow: UnitOfWork,
    e: { tenantId: string; eventId: string; tipo: string; payload: Record<string, unknown>; occurredAt: Date },
  ): Promise<Result<void, KernelError>>;
}

export interface ModuleAdapters {
  readonly hechos: HechoRepository;
  readonly recibos: ReciboPort;
  readonly identidad: IdentidadPort;
  readonly ordenes: OrdenesPort;
  readonly costoExacto: CostoExactoPort;
  readonly eventLog: EventLogPort;
}

/* ------------------------------- Utilidades ------------------------------ */

async function emitir(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenantId: string,
  tipo: string,
  payload: Record<string, unknown>,
): Promise<Result<void, KernelError>> {
  const ev = createDomainEvent(tipo, payload, ctx.correlationId);
  const logged = await adapters.eventLog.append(uow, {
    tenantId,
    eventId: ev.id,
    tipo: ev.type,
    payload: ev.payload,
    occurredAt: ev.occurredAt,
  });
  if (!logged.ok) return logged;
  uow.registerEvent(ev);
  return ok(undefined);
}

/**
 * Claim durable del opId ANTES de efectos (§16 · §25 idempotencia como
 * INVARIANTE). El claim ocurre ANTES de cualquier lookup de OT/fuente o efecto
 * en BD. Falla CERRADO si el opId está ausente (defensa en profundidad: el
 * schema zod ya lo exige, pero el claim nunca procede sin clave de idempotencia).
 */
async function reclamar(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenant: string,
  comando: string,
  opId: string | undefined,
): Promise<{ proceder: true } | { proceder: false; corto: Result<Record<string, unknown>, KernelError> }> {
  if (!opId) {
    return { proceder: false, corto: fail(KernelErrors.validation("opId es obligatorio: la idempotencia es invariante en toda mutación de costos")) };
  }
  const claim = await adapters.recibos.reclamar(uow, tenant, comando, opId, ctx.principal.id);
  if (!claim.ok) return { proceder: false, corto: claim };
  if (claim.value.duenio) return { proceder: true };
  if (claim.value.resultado !== undefined) {
    return { proceder: false, corto: ok({ ...claim.value.resultado, idempotente: true }) };
  }
  return { proceder: false, corto: fail(KernelErrors.conflict(`Operación ${opId} en curso`)) };
}

async function sellarSi(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenant: string,
  comando: string,
  opId: string | undefined,
  resultado: Record<string, unknown>,
): Promise<Result<Record<string, unknown>, KernelError>> {
  if (opId) {
    const rec = await adapters.recibos.sellar(uow, tenant, { opId, comando, resultado }, ctx.principal.id);
    if (!rec.ok) return rec;
  }
  return ok({ ...resultado, idempotente: false });
}

/** Identidad canónica autenticada del contexto (nunca del frontend). */
function identidadDeSesion(ctx: ExecutionContext): string | null {
  const id = ctx.metadata["identityId"];
  return typeof id === "string" && id.length > 0 ? id : null;
}

/* -------------------------- Serialización de VOs ------------------------- */

function hechoAResultado(h: HechoEconomico): Record<string, unknown> {
  return {
    costoId: h.costoId,
    tipo: h.tipo,
    // DGP-021.2 (R1) · naturaleza económica del ledger (CARGO/ABONO): expuesta en
    // TODO read model para que la composición distinga costo de crédito.
    naturaleza: h.naturaleza,
    originType: h.origen.originType,
    originId: h.origen.originId,
    otId: h.otId,
    activoId: h.activoId,
    identityId: h.identityId,
    movimientoId: h.movimientoId ?? null,
    articuloId: h.articuloId ?? null,
    opId: h.opId,
    estado: h.estado,
    cantidad: h.snapshot.cantidad,
    unidad: h.snapshot.unidad,
    costoUnitario: h.snapshot.costoUnitario,
    costoTotal: h.snapshot.costoTotal,
    moneda: h.snapshot.moneda,
    fuente: h.snapshot.fuente,
    ocurridoAt: h.snapshot.ocurridoAt,
    registradoAt: h.registradoAt,
    registradoPor: h.registradoPor,
    anuladoAt: h.anuladoAt,
    anuladoPor: h.anuladoPor,
    motivoAnulacion: h.motivoAnulacion,
  };
}

/**
 * Verifica la OT vía el contrato público y DERIVA el activoId de la relación
 * canónica OT→activo (fail-closed). El `activoId` del frontend NUNCA se usa: si
 * la OT tiene activo principal, ése es el que manda; si no lo tiene, el hecho
 * queda con `activoId=null` (caso documentado: OT sin activo principal, p.ej.
 * OTs administrativas/generales).
 */
async function verificarOtYDerivarActivo(
  adapters: ModuleAdapters,
  tenant: string,
  otId: string,
): Promise<Result<{ activoId: string | null }, KernelError>> {
  const r = await adapters.ordenes.obtener(tenant, otId);
  if (!r.ok) return r;
  if (!r.value) return fail(KernelErrors.notFound("orden-trabajo", otId));
  return ok({ activoId: r.value.activoPrincipalId });
}

/* ------------------------------ El servicio ------------------------------ */

/**
 * DGP-021.1 · Schema de DINERO/cantidad de entrada (PUNTO FIJO, frontera
 * ESTRICTA). SÓLO se acepta una CADENA decimal canónica `\d{1,12}(\.\d{1,6})?`.
 * Un número JSON se RECHAZA con validación clara: ya pudo perder precisión antes
 * de llegar. Coincide con `RE_DINERO` del dominio y el `pattern` de OpenAPI.
 */
const dineroSchema = z
  .string({
    invalid_type_error: "el importe/cantidad debe ser una CADENA decimal, no un número",
    required_error: "el importe/cantidad es obligatorio",
  })
  .regex(RE_DINERO, "valor decimal inválido: use \\d{1,12}(\\.\\d{1,6})? (sin signo ni notación científica, ≤6 decimales)");

/**
 * IDEMPOTENCIA COMO INVARIANTE (§16 · criterio de cierre 15). El `opId` es
 * OBLIGATORIO y ACOTADO en TODA mutación: el cliente debe aportar una clave de
 * operación estable para que un reintento sea idempotente. NUNCA se genera un
 * opId de fallback en el servidor (un UUID fresco por intento haría cada
 * reintento un hecho NUEVO → duplicados). Formato: cadena no vacía de 8..200
 * caracteres imprimibles ASCII (cubre UUIDv4 y claves deterministas del corpus
 * tipo `recepcionId:numeroLinea`), sin espacios en blanco delimitando.
 */
const opIdSchema = z
  .string({
    invalid_type_error: "opId debe ser una CADENA",
    required_error: "opId es obligatorio: la idempotencia es invariante, no opcional",
  })
  .trim()
  .min(8, "opId demasiado corto (mínimo 8 caracteres)")
  .max(200, "opId demasiado largo (máximo 200 caracteres)")
  .regex(/^[\x21-\x7e]+$/, "opId inválido: use caracteres imprimibles ASCII sin espacios");

export function costosModule(adapters: ModuleAdapters): PlatformServiceDefinition {
  return {
    name: MODULO,
    version: "1.0.0",
    description:
      "Fundación auditable de Costos de mantenimiento: hechos económicos exactos con snapshot inmutable (ACTIVO/ANULADO).",
    capabilities: [
      { name: "consultar-costos", permissions: [P_READ], description: "Consulta de hechos económicos tenant-scoped." },
      { name: "materializar-costos", permissions: [P_MATERIALIZAR, P_READ], description: "Materializar hechos económicos exactos." },
      { name: "anular-costos", permissions: [P_ANULAR, P_READ], description: "Anular hechos económicos (append-only auditable)." },
      { name: "administrar-costos", permissions: [P_ADMIN, P_READ], description: "Administración del módulo de costos." },
    ],
    permissions: [P_READ, P_MATERIALIZAR, P_ANULAR, P_ADMIN],
    dependsOn: ["platform.config", "platform.timeline"],
    events: [...EVENTOS_MODULO],
    recordTypes: [],
    configDefaults: {},

    commands: [
      /* -------------------- hecho.materializar-material -------------------- */
      // Snapshot del costo EXACTO de un material (DGP-021.0). Verifica OT, deriva
      // activo, consume el contrato público de costo exacto y CONGELA el snapshot.
      (deps) => ({
        name: `${MODULO}.hecho.materializar-material`,
        // DGP-021.2 · ANTI-BYPASS (§20): la vía CANÓNICA de MATERIAL es el
        // movimiento físico de inventario. El comando EXIGE `movimientoId` (origen
        // determinista) y sólo lo invoca la ORQUESTACIÓN de servicio del api-server
        // tras confirmar un movimiento; NO se puede fabricar un consumo de MATERIAL
        // sin un movimiento real. La única vía manual queda en `materializar-otros`
        // (tipo OTROS). Justificación documentada: DGP-021.2 §D5 (extensión de la
        // MISMA serie 021.x, no de un contrato congelado ajeno).
        //
        // R2 · DEFENSA EN PROFUNDIDAD: NO hay ruta HTTP para este comando (se
        // eliminó `POST /hechos/material`). Además, el handler EXIGE el marcador
        // interno `metadata.origenOrquestacion=true`, que SÓLO fija el contexto de
        // servicio de la orquestación (`contextForCostosOrquestacion`). Un contexto
        // derivado de una sesión HTTP jamás lo trae ⇒ aunque un principal tuviera el
        // permiso `materializar`, no puede invocar MATERIAL fuera de la orquestación.
        inputSchema: z.object({
          opId: opIdSchema,
          costoId: z.string().uuid().optional(),
          otId: z.string().min(1),
          articuloId: z.string().min(1),
          movimientoId: z.string().min(1, "movimientoId es obligatorio: MATERIAL sólo se materializa desde un movimiento de inventario"),
          // DGP-021.2 (R1) · FAMILIA contable del movimiento de origen (auditoría).
          // Deriva la NATURALEZA económica del hecho: `devolucion` ⇒ ABONO (crédito
          // compensatorio); cualquier otra (consumo/salida) ⇒ CARGO. Se registra
          // cruda en `fuente.familia`. Omitida ⇒ CARGO (compatibilidad).
          familia: z.string().min(1).optional(),
          cantidad: dineroSchema,
          unidad: z.string().min(1),
          moneda: z.string().min(1),
          ocurridoAt: z.string().min(1).optional(),
        }),
        authorization: { permissions: [P_MATERIALIZAR] },
        async handle(ctx, input, uow) {
          const comando = `${MODULO}.hecho.materializar-material`;
          // R2 · ANTI-BYPASS: MATERIAL sólo desde la ORQUESTACIÓN de servicio. El
          // marcador interno lo fija exclusivamente `contextForCostosOrquestacion`
          // (nunca un contexto de sesión HTTP). Fail-closed ⇒ 403.
          if (ctx.metadata["origenOrquestacion"] !== true) {
            return fail(
              KernelErrors.forbidden(
                "MATERIAL sólo se materializa vía la orquestación inventario→costos (movimiento físico confirmado); no hay vía HTTP directa (§20 anti-bypass)",
              ),
            );
          }
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, comando, input.opId);
          if (!r0.proceder) return r0.corto;

          const ot = await verificarOtYDerivarActivo(adapters, tenant.value, input.otId);
          if (!ot.ok) return ot;

          // Costo exacto del artículo por moneda (SOLO LECTURA, DGP-021.0).
          const costos = await adapters.costoExacto.costosDeArticulo(tenant.value, input.articuloId);
          if (!costos.ok) return costos;
          const exacto = costos.value.find((c) => c.moneda === input.moneda);
          if (!exacto) {
            // SIN COSTO ≠ "0": no se materializa un hecho sin fuente exacta.
            return fail(
              KernelErrors.validation(
                `No hay costo exacto para el artículo ${input.articuloId} en moneda ${input.moneda} (SIN COSTO ≠ 0)`,
              ),
            );
          }

          const ahora = new Date();
          // DGP-021.2 (R1) · La FAMILIA del movimiento decide la NATURALEZA: una
          // `devolucion` es un ABONO (crédito) que compensa; consumo/salida es CARGO.
          // NUNCA se enruta una devolución por la semántica positiva de consumo.
          const familia = (input.familia ?? "").toLowerCase();
          const naturaleza: NaturalezaHecho = familia === "devolucion" ? "ABONO" : "CARGO";
          const hecho = materializarHecho({
            costoId: input.costoId ?? crypto.randomUUID(),
            tenantId: tenant.value,
            tipo: "MATERIAL",
            naturaleza,
            // ORIGEN físico determinista: el movimiento de inventario. El costo
            // EXACTO sigue viniendo de Abastecimiento (se guarda crudo en `fuente`).
            origen: { originType: "inventario.movimiento", originId: input.movimientoId },
            otId: input.otId,
            activoId: ot.value.activoId,
            identityId: null,
            movimientoId: input.movimientoId,
            articuloId: input.articuloId,
            opId: input.opId,
            cantidad: input.cantidad,
            unidad: input.unidad,
            costoUnitario: exacto.costoUnitario,
            moneda: input.moneda,
            fuente: {
              // Trazabilidad de ORIGEN (movimiento) + FAMILIA contable (auditoría de
              // la naturaleza) + copia CRUDA del costo exacto.
              movimientoId: input.movimientoId,
              familia: input.familia ?? null,
              naturaleza,
              articuloId: exacto.articuloId,
              moneda: exacto.moneda,
              metodoValoracion: exacto.metodoValoracion,
              costoUnitario: exacto.costoUnitario,
              cantidadAcumulada: exacto.cantidadAcumulada,
              actualizadoAt: exacto.actualizadoAt,
            },
            ocurridoAt: input.ocurridoAt ?? ahora.toISOString(),
            registradoAt: ahora.toISOString(),
            registradoPor: ctx.principal.id,
          });
          if (!hecho.ok) return hecho;

          const guardado = await adapters.hechos.materializar(uow, hecho.value);
          if (!guardado.ok) return guardado;
          if (!guardado.value.insertado) {
            const actual = await adapters.hechos.buscar(tenant.value, hecho.value.costoId);
            if (actual.ok && actual.value) return ok({ ...hechoAResultado(actual.value), idempotente: true });
            return ok({ ...hechoAResultado(hecho.value), idempotente: true });
          }

          const em = await emitir(adapters, ctx, uow, tenant.value, HECHO_MATERIALIZADO, {
            tenantId: tenant.value,
            entityRef: `costos:hecho:${hecho.value.costoId}`,
            ...hechoAResultado(hecho.value),
          });
          if (!em.ok) return em;
          const aud = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "hecho:materializar-material", hecho.value.costoId, {
            otId: hecho.value.otId,
            activoId: hecho.value.activoId,
            tipo: hecho.value.tipo,
            costoTotal: hecho.value.snapshot.costoTotal,
            moneda: hecho.value.snapshot.moneda,
            origen: `${hecho.value.origen.originType}:${hecho.value.origen.originId}`,
          });
          if (!aud.ok) return aud;
          return sellarSi(adapters, ctx, uow, tenant.value, comando, input.opId, hechoAResultado(hecho.value));
        },
      }),
      /* -------------------- hecho.materializar-otros -------------------- */
      // Costo manual AUTORIZADO (tipo OTROS): única fuente manual de la fundación.
      // El importe unitario lo aporta el autorizante (string-safe); la identidad
      // canónica del autorizante se toma de la SESIÓN (nunca del frontend).
      (deps) => ({
        name: `${MODULO}.hecho.materializar-otros`,
        inputSchema: z.object({
          opId: opIdSchema,
          costoId: z.string().uuid().optional(),
          otId: z.string().min(1),
          concepto: z.string().min(1),
          cantidad: dineroSchema,
          unidad: z.string().min(1),
          costoUnitario: dineroSchema,
          moneda: z.string().min(1),
          ocurridoAt: z.string().min(1).optional(),
        }),
        authorization: { permissions: [P_MATERIALIZAR] },
        async handle(ctx, input, uow) {
          const comando = `${MODULO}.hecho.materializar-otros`;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, comando, input.opId);
          if (!r0.proceder) return r0.corto;

          const ot = await verificarOtYDerivarActivo(adapters, tenant.value, input.otId);
          if (!ot.ok) return ot;

          // Identidad canónica autorizante SÓLO de la sesión (fail-closed).
          const yo = identidadDeSesion(ctx);
          if (!yo) {
            return fail(KernelErrors.forbidden("costos: falta la identidad canónica autenticada (identityId) para autorizar el costo manual"));
          }
          const idn = await adapters.identidad.resolver(tenant.value, yo);
          if (!idn.ok) return idn;
          if (!idn.value) return fail(KernelErrors.forbidden("costos: la identidad autenticada no pertenece al tenant"));

          const ahora = new Date();
          const hecho = materializarHecho({
            costoId: input.costoId ?? crypto.randomUUID(),
            tenantId: tenant.value,
            tipo: "OTROS",
            origen: { originType: "manual", originId: input.concepto },
            otId: input.otId,
            activoId: ot.value.activoId,
            identityId: yo,
            opId: input.opId,
            cantidad: input.cantidad,
            unidad: input.unidad,
            costoUnitario: input.costoUnitario,
            moneda: input.moneda,
            fuente: { concepto: input.concepto, autorizante: yo },
            ocurridoAt: input.ocurridoAt ?? ahora.toISOString(),
            registradoAt: ahora.toISOString(),
            registradoPor: ctx.principal.id,
          });
          if (!hecho.ok) return hecho;

          const guardado = await adapters.hechos.materializar(uow, hecho.value);
          if (!guardado.ok) return guardado;
          if (!guardado.value.insertado) {
            const actual = await adapters.hechos.buscar(tenant.value, hecho.value.costoId);
            if (actual.ok && actual.value) return ok({ ...hechoAResultado(actual.value), idempotente: true });
            return ok({ ...hechoAResultado(hecho.value), idempotente: true });
          }

          const em = await emitir(adapters, ctx, uow, tenant.value, HECHO_MATERIALIZADO, {
            tenantId: tenant.value,
            entityRef: `costos:hecho:${hecho.value.costoId}`,
            ...hechoAResultado(hecho.value),
          });
          if (!em.ok) return em;
          const aud = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "hecho:materializar-otros", hecho.value.costoId, {
            otId: hecho.value.otId,
            activoId: hecho.value.activoId,
            tipo: hecho.value.tipo,
            costoTotal: hecho.value.snapshot.costoTotal,
            moneda: hecho.value.snapshot.moneda,
            identityId: yo,
          });
          if (!aud.ok) return aud;
          return sellarSi(adapters, ctx, uow, tenant.value, comando, input.opId, hechoAResultado(hecho.value));
        },
      }),
      /* -------------------- hecho.anular -------------------- */
      // Anulación append-only, auditable. NUNCA borra ni edita el snapshot.
      (deps) => ({
        name: `${MODULO}.hecho.anular`,
        inputSchema: z.object({
          opId: opIdSchema,
          costoId: z.string().min(1),
          motivo: z.string().min(1),
        }),
        authorization: { permissions: [P_ANULAR] },
        async handle(ctx, input, uow) {
          const comando = `${MODULO}.hecho.anular`;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, comando, input.opId);
          if (!r0.proceder) return r0.corto;

          const actual = await adapters.hechos.buscar(tenant.value, input.costoId);
          if (!actual.ok) return actual;
          if (!actual.value) return fail(KernelErrors.notFound("hecho-economico", input.costoId));

          const ahora = new Date();
          const anulado = anularHecho(actual.value, ctx.principal.id, ahora.toISOString(), input.motivo);
          if (!anulado.ok) return anulado;

          const guardado = await adapters.hechos.anular(uow, anulado.value);
          if (!guardado.ok) return guardado;

          const em = await emitir(adapters, ctx, uow, tenant.value, HECHO_ANULADO, {
            tenantId: tenant.value,
            entityRef: `costos:hecho:${anulado.value.costoId}`,
            ...hechoAResultado(anulado.value),
          });
          if (!em.ok) return em;
          const aud = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "hecho:anular", anulado.value.costoId, {
            otId: anulado.value.otId,
            motivo: input.motivo,
          });
          if (!aud.ok) return aud;
          return sellarSi(adapters, ctx, uow, tenant.value, comando, input.opId, hechoAResultado(anulado.value));
        },
      }),
    ],

    queries: [
      /* -------------------- detalle (CQRS: por read model) -------------------- */
      (deps) => ({
        name: `${MODULO}.hecho.detalle`,
        inputSchema: z.object({ costoId: z.string().min(1) }),
        authorization: { permissions: [P_READ] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.hechos.buscar(tenant.value, input.costoId);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("hecho-economico", input.costoId));
          return ok({ hecho: hechoAResultado(r.value) });
        },
      }),
      /* -------------------- hechos (por OT/activo/tipo/moneda/período/estado) --- */
      (deps) => ({
        name: `${MODULO}.hechos`,
        inputSchema: z.object({
          otId: z.string().optional(),
          activoId: z.string().optional(),
          // DGP-021.2 · read models de trazabilidad: por movimiento y por artículo.
          movimientoId: z.string().optional(),
          articuloId: z.string().optional(),
          tipo: z.enum([...TIPOS_HECHO] as [string, ...string[]]).optional(),
          // DGP-021.2 (R1) · filtra CARGO vs ABONO (distingue costo de crédito).
          naturaleza: z.enum([...NATURALEZAS_HECHO] as [string, ...string[]]).optional(),
          moneda: z.string().optional(),
          estado: z.enum([...ESTADOS_HECHO] as [string, ...string[]]).optional(),
          desde: z.string().optional(),
          hasta: z.string().optional(),
          limit: z.number().int().positive().max(500).optional(),
        }),
        authorization: { permissions: [P_READ] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.hechos.listar(tenant.value, {
            otId: input.otId,
            activoId: input.activoId,
            movimientoId: input.movimientoId,
            articuloId: input.articuloId,
            tipo: input.tipo as TipoHecho | undefined,
            naturaleza: input.naturaleza as NaturalezaHecho | undefined,
            moneda: input.moneda,
            estado: input.estado as EstadoHecho | undefined,
            desde: input.desde,
            hasta: input.hasta,
            limit: input.limit,
          });
          if (!r.ok) return r;
          return ok({ hechos: r.value.map(hechoAResultado) });
        },
      }),
      /* -------------------- por-moneda (series separadas; NUNCA suma monedas) --- */
      // Devuelve los hechos AGRUPADOS por moneda como SERIES SEPARADAS. NO suma
      // COP+USD ni convierte: cada moneda es una serie independiente (§moneda).
      (deps) => ({
        name: `${MODULO}.hechos.por-moneda`,
        inputSchema: z.object({
          otId: z.string().optional(),
          activoId: z.string().optional(),
          estado: z.enum([...ESTADOS_HECHO] as [string, ...string[]]).optional(),
        }),
        authorization: { permissions: [P_READ] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.hechos.listar(tenant.value, {
            otId: input.otId,
            activoId: input.activoId,
            estado: input.estado as EstadoHecho | undefined,
          });
          if (!r.ok) return r;
          const series = new Map<string, Record<string, unknown>[]>();
          for (const h of r.value) {
            const arr = series.get(h.snapshot.moneda) ?? [];
            arr.push(hechoAResultado(h));
            series.set(h.snapshot.moneda, arr);
          }
          return ok({
            monedas: [...series.entries()].map(([moneda, hechos]) => ({ moneda, hechos })),
          });
        },
      }),
    ],

    eventHandlers: [],
    healthCheck: () => async () => ({ healthy: true, detail: `${MODULO} operativo` }),
  };
}
