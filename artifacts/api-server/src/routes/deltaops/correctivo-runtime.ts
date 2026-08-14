/**
 * DGP-015.2 · Runtime del Módulo Enterprise Corrective Maintenance en el API
 * Server. Singleton Kernel + Plataforma + Workflow Engine + Módulo Correctivo con
 * adaptadores PostgreSQL reales. Mismo patrón que preventivo-runtime (DGP-014.2).
 *
 * COLABORACIÓN CROSS-MÓDULO (capa de integración, jamás comandos anidados):
 *  - `materializadorOrdenes`: compone el comando OFICIAL `modulo.ordenes.crear`
 *    (tipo canónico "correctiva") del runtime de Órdenes con idempotencia
 *    DETERMINISTA. El puerto recibe `entrada.opId = claveDedup`; este adaptador
 *    DERIVA el id de la OT como `gen:<generacionId>` (UUIDv5 estable) y usa ese
 *    `opId` en la orden para el recibo idempotente. El vínculo generación→OT lo
 *    persiste ATÓMICAMENTE el comando `generar-orden-correctiva`, no este adaptador.
 *  - `activosPort`: valida EXISTENCIA de activos/componentes vía
 *    `modulo.activos.detalle`.
 *  - `inventarioPort`: compone `modulo.inventario.reservar` / `mover`
 *    (tipo=consumo|devolucion) / `existencia` para derivar bodega/ubicación.
 *  - `abastecimientoPort`: compone `modulo.abastecimiento.crear-solicitud`
 *    (origen.tipo="orden") ante stock insuficiente.
 * Todos FAIL-SAFE: ante un fallo del colaborador, la orquestación rechaza (nunca
 * asume el efecto por vías no oficiales).
 */
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import {
  createExecutionContext,
  fail,
  KernelErrors,
  ok,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  correctivoModule,
  crearCorrectivoRuntimeOperacional,
  type CorrectivoRuntimeOperacional,
  type ModuleAdapters,
  type AbastecimientoPort,
  type ActivosPort,
  type DynamicFormsPort,
  type EntradaMaterializacionOrden,
  type InventarioPort,
  type LineaRepuesto,
  type MaterializadorOrdenes,
  type ResultadoConsumo,
  type ResultadoDisponibilidad,
  type ResultadoMaterializacionOrden,
  type ValidacionActivo,
} from "@workspace/module-correctivo";
import {
  crearFormulariosRuntime,
  validarSincrono,
  type DefinicionFormulario,
  type FormulariosRuntime,
  type HallazgoValidacion,
} from "@workspace/dynamic-forms";
import { DELTAOPS_TENANT } from "./reference-runtime";
import { ordenesRuntime, contextForOrdenes } from "./ordenes-runtime";
import { activosRuntime, contextForActivos } from "./activos-runtime";
import { inventarioRuntime, contextForInventario } from "./inventario-runtime";
import { abastecimientoRuntime, contextForAbastecimiento } from "./abastecimiento-runtime";

let runtime: CorrectivoRuntimeOperacional | null = null;

/** Espacio de nombres UUIDv5 para derivar ids de OT deterministas por generación. */
const NS_ORDEN_CORRECTIVA = "2c8d5a1f-4b7e-4c9a-9f3d-1a6b8e0d2c4f";

/** Deriva el id de la OT determinísticamente desde la generación (idempotencia). */
function ordenIdDeGeneracion(generacionId: string): string {
  const ns = NS_ORDEN_CORRECTIVA.replace(/-/g, "");
  const nsBytes = Buffer.from(ns, "hex");
  const hash = crypto.createHash("sha1");
  hash.update(nsBytes);
  hash.update(Buffer.from(`gen:${generacionId}`, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC-4122
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Resuelve el centro de costos / ubicación / responsable del activo desde la
 * FUENTE DE VERDAD (`modulo.activos.detalle`, autoridad backend §6). FAIL-SAFE:
 * si el activo no se puede leer, devuelve nulos (la OT se crea igualmente; el
 * frontend mostrará «Sin centro de costos configurado» — jamás se inventa).
 * DELTAOPS LITE-05 (L5-2): enriquece la materialización SIN cambiar el contrato
 * público de `modulo.ordenes.crear` (los campos ya existen en su schema).
 */
async function procedenciaActivo(
  tenantId: string,
  activoId: string,
): Promise<{ centroCosto: string | null; ubicacion: { ubicacionId: string } | null; responsable: string | null }> {
  const ctxA = contextForActivos("system", "lector", tenantId);
  const r = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.detalle", { id: activoId });
  if (!r.ok) return { centroCosto: null, ubicacion: null, responsable: null };
  const v = r.value as { datos?: Record<string, unknown> };
  const datos = v.datos ?? {};
  const ubic = datos["ubicacion"] as { ubicacionId?: string } | null | undefined;
  return {
    centroCosto: datos["centroCosto"] == null ? null : String(datos["centroCosto"]),
    ubicacion: ubic?.ubicacionId ? { ubicacionId: String(ubic.ubicacionId) } : null,
    responsable: datos["responsable"] == null ? null : String(datos["responsable"]),
  };
}

/**
 * MATERIALIZADOR OFICIAL de Órdenes de Trabajo. `entrada.opId` es la `claveDedup`
 * (idempotencia end-to-end); el `id` de la OT se deriva de la generación para que
 * reintentos produzcan la MISMA orden. Tipo CANÓNICO "correctiva". Drena el outbox
 * de Órdenes tras crear.
 *
 * DELTAOPS LITE-05 (L5-2): la OT hereda `centroCosto`/`ubicacion`/`responsable`
 * del activo (fuente de verdad Activos) y la `prioridad` de la solicitud. La
 * PROCEDENCIA extensa del hallazgo (§1) la aporta la solicitud correctiva y viaja
 * en `observaciones` como resumen legible; el detalle completo se consulta por la
 * cadena hallazgo↔solicitud↔OT (nunca se duplica el preoperacional).
 */
const materializadorOrdenes: MaterializadorOrdenes = {
  async crearOrden(tenantId, actorId, entrada: EntradaMaterializacionOrden): Promise<Result<ResultadoMaterializacionOrden, KernelError>> {
    const ctxO = contextForOrdenes(actorId, "admin", tenantId);
    const ordenId = ordenIdDeGeneracion(entrada.generacionId);
    const proc = await procedenciaActivo(tenantId, entrada.activoPrincipal.activoId);
    const creado = await ordenesRuntime().platform.kernel.commands.execute(ctxO, "modulo.ordenes.crear", {
      id: ordenId,
      opId: entrada.opId,
      titulo: entrada.titulo,
      // Tipo CANÓNICO del módulo de Órdenes (DGP-009): "correctiva".
      tipo: "correctiva",
      activoPrincipal: entrada.activoPrincipal,
      // L5-2 · centro/ubicación/responsable desde la fuente de verdad (Activos).
      // `ubicacion`/`responsable` son campos de forma libre en Órdenes; el
      // `centroCosto` se valida contra el catálogo `centros-costo` del tenant y,
      // si está vacío (forma libre), no restringe (§6: respeta el del activo, no
      // inventa). NO se propaga la `prioridad` del catálogo correctivo (distinto
      // dominio de valores): vive en la solicitud/procedencia, no en la OT.
      ...(proc.centroCosto ? { centroCosto: proc.centroCosto } : {}),
      ...(proc.ubicacion ? { ubicacion: proc.ubicacion } : {}),
      ...(proc.responsable ? { responsable: proc.responsable } : {}),
      observaciones: `Solicitud correctiva ${entrada.solicitudId}`,
    });
    if (!creado.ok) return creado;
    await ordenesRuntime().platform.kernel.outboxProcessor.processPending();
    const r = creado.value as { id?: string; idempotente?: boolean };
    if (!r.id) return fail(KernelErrors.infrastructure("modulo.ordenes.crear no devolvió id", {}));
    return ok({ ordenTrabajoId: String(r.id), idempotente: r.idempotente === true });
  },
};

/** Puerto de Activos: valida existencia vía `modulo.activos.detalle` (fail-safe). */
const activosPort: ActivosPort = {
  async existen(tenantId, activoIds): Promise<Result<ValidacionActivo, KernelError>> {
    const ctxA = contextForActivos("system", "lector", tenantId);
    const inexistentes: string[] = [];
    for (const id of activoIds) {
      const r = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.detalle", { id });
      if (!r.ok) {
        if (r.error.code === "KRN-NOT-001") { inexistentes.push(id); continue; }
        return r as Result<never, KernelError>;
      }
    }
    return ok({ inexistentes });
  },
  // Componentes: valida contra el contrato público real de Activos
  // (`modulo.activos.componentes`, relaciones `compuesto-por` salientes). Cada
  // componenteId debe EXISTIR como componente que PERTENECE al activo contenedor;
  // cualquier id ajeno o inexistente se reporta como inexistente (rechazo).
  async componentesExisten(tenantId, activoId, componenteIds): Promise<Result<ValidacionActivo, KernelError>> {
    const ctxA = contextForActivos("system", "lector", tenantId);
    const r = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.componentes", { id: activoId });
    if (!r.ok) {
      // Activo contenedor inexistente ⇒ ninguno de sus componentes existe.
      if (r.error.code === "KRN-NOT-001") return ok({ inexistentes: [...componenteIds] });
      return r as Result<never, KernelError>;
    }
    // `componentes` son relaciones `compuesto-por` salientes: el componente es el
    // destino (`destino.id`). Se acepta el componenteId sólo si figura ahí.
    const rel = (r.value ?? {}) as { componentes?: { destino?: { id?: string } }[] };
    const validos = new Set<string>((rel.componentes ?? []).map((c) => c.destino?.id ?? "").filter((id) => id !== ""));
    const inexistentes = componenteIds.filter((id) => !validos.has(id));
    return ok({ inexistentes });
  },
};

/**
 * Puerto de Inventario (DGP-011). `reservar` compone el comando oficial; `consumir`
 * y `devolver` componen `mover` (tipo=consumo|devolucion) derivando bodega/ubicación
 * desde `existencia`. FAIL-SAFE + idempotente por opId. Drena el outbox tras cada
 * efecto.
 */
const inventarioPort: InventarioPort = {
  async verificarDisponibilidad(tenantId, lineas): Promise<Result<ResultadoDisponibilidad, KernelError>> {
    const ctxI = contextForInventario("system", "lector", tenantId);
    const disponibles: LineaRepuesto[] = [];
    const faltantes: (LineaRepuesto & { disponible: number })[] = [];
    for (const l of lineas) {
      const r = await inventarioRuntime().platform.kernel.queries.execute(ctxI, "modulo.inventario.existencia", { id: l.inventarioId });
      if (!r.ok) {
        if (r.error.code === "KRN-NOT-001") { faltantes.push({ ...l, disponible: 0 }); continue; }
        return r as Result<never, KernelError>;
      }
      const ex = r.value as { disponible?: number } | null;
      const disp = Number(ex?.disponible ?? 0);
      if (disp >= l.cantidad) disponibles.push(l);
      else faltantes.push({ ...l, disponible: disp });
    }
    return ok({ disponibles, faltantes });
  },
  async reservar(tenantId, actorId, entrada): Promise<Result<{ idempotente: boolean }, KernelError>> {
    const ctxI = contextForInventario(actorId, "admin", tenantId);
    let idempotente = true;
    for (const [i, l] of entrada.lineas.entries()) {
      const r = await inventarioRuntime().platform.kernel.commands.execute(ctxI, "modulo.inventario.reservar", {
        opId: `${entrada.opId}:${i}`,
        inventarioId: l.inventarioId,
        tipo: "correctivo",
        demanda: { tipo: "orden", id: entrada.demandaId },
        cantidad: l.cantidad,
      });
      if (!r.ok) return r as Result<never, KernelError>;
      if ((r.value as { idempotente?: boolean }).idempotente !== true) idempotente = false;
    }
    await inventarioRuntime().platform.kernel.outboxProcessor.processPending();
    return ok({ idempotente });
  },
  async consumir(tenantId, actorId, entrada): Promise<Result<ResultadoConsumo, KernelError>> {
    const ctxI = contextForInventario(actorId, "admin", tenantId);
    const ex = await inventarioRuntime().platform.kernel.queries.execute(ctxI, "modulo.inventario.existencia", { id: entrada.linea.inventarioId });
    if (!ex.ok) return ex as Result<never, KernelError>;
    const e = ex.value as { itemId: string; bodegaId: string; ubicacionId: string; disponible?: number };
    const consumida = Math.min(Number(e.disponible ?? 0), entrada.linea.cantidad);
    if (consumida <= 0) return ok({ consumidoTotal: false, cantidadConsumida: 0 });
    const r = await inventarioRuntime().platform.kernel.commands.execute(ctxI, "modulo.inventario.mover", {
      opId: entrada.opId,
      itemId: e.itemId,
      bodegaId: e.bodegaId,
      ubicacionId: e.ubicacionId,
      tipo: "consumo",
      cantidad: consumida,
      referencia: { tipo: "orden", id: entrada.demandaId },
    });
    if (!r.ok) return r as Result<never, KernelError>;
    await inventarioRuntime().platform.kernel.outboxProcessor.processPending();
    return ok({ consumidoTotal: consumida >= entrada.linea.cantidad, cantidadConsumida: consumida });
  },
  async devolver(tenantId, actorId, entrada): Promise<Result<{ idempotente: boolean }, KernelError>> {
    const ctxI = contextForInventario(actorId, "admin", tenantId);
    const ex = await inventarioRuntime().platform.kernel.queries.execute(ctxI, "modulo.inventario.existencia", { id: entrada.linea.inventarioId });
    if (!ex.ok) return ex as Result<never, KernelError>;
    const e = ex.value as { itemId: string; bodegaId: string; ubicacionId: string };
    const r = await inventarioRuntime().platform.kernel.commands.execute(ctxI, "modulo.inventario.mover", {
      opId: entrada.opId,
      itemId: e.itemId,
      bodegaId: e.bodegaId,
      ubicacionId: e.ubicacionId,
      tipo: "devolucion",
      cantidad: entrada.linea.cantidad,
      referencia: { tipo: "orden", id: entrada.demandaId },
    });
    if (!r.ok) return r as Result<never, KernelError>;
    await inventarioRuntime().platform.kernel.outboxProcessor.processPending();
    return ok({ idempotente: (r.value as { idempotente?: boolean }).idempotente === true });
  },
};

/**
 * Puerto de Abastecimiento (DGP-013): compone `crear-solicitud` con
 * `origen.tipo="orden"` ante stock insuficiente. Idempotente por opId; drena el
 * outbox tras crear.
 */
const abastecimientoPort: AbastecimientoPort = {
  async solicitarCompra(tenantId, actorId, entrada): Promise<Result<{ solicitudCompraId: string; idempotente: boolean }, KernelError>> {
    const ctxAb = contextForAbastecimiento(actorId, "admin", tenantId);
    const r = await abastecimientoRuntime().platform.kernel.commands.execute(ctxAb, "modulo.abastecimiento.crear-solicitud", {
      opId: entrada.opId,
      titulo: entrada.titulo,
      prioridad: entrada.prioridad,
      origen: { tipo: "orden", referenciaId: entrada.referenciaId, referenciaTipo: "orden-correctiva" },
      lineas: entrada.lineas.map((l) => ({
        numero: l.numero,
        articuloId: l.articuloId ?? null,
        // Abastecimiento exige descripción NO vacía cuando no hay artículo; damos
        // siempre una etiqueta de reposición para satisfacer el contrato.
        descripcion: l.descripcion ?? `Reposición correctiva (art. ${l.articuloId ?? "s/ref"})`,
        // `crear-solicitud` de Abastecimiento espera cantidad = { valor, unidad };
        // el puerto de correctivo sólo transporta el número, así que la envolvemos
        // con una unidad neutra (no validada contra catálogo en Abastecimiento).
        cantidad: { valor: l.cantidad, unidad: "unidad" },
      })),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    await abastecimientoRuntime().platform.kernel.outboxProcessor.processPending();
    const v = r.value as { id?: string; idempotente?: boolean };
    if (!v.id) return fail(KernelErrors.infrastructure("modulo.abastecimiento.crear-solicitud no devolvió id", {}));
    return ok({ solicitudCompraId: String(v.id), idempotente: v.idempotente === true });
  },
};

/**
 * Runtime del motor de Dynamic Forms (DGP-007): singleton propio sobre el mismo
 * `pool`. El puerto de Correctivo lo envuelve para verificar/validar plantillas
 * de diagnóstico por sus CONTRATOS públicos (jamás comandos anidados).
 */
let formularios: FormulariosRuntime | null = null;
function formulariosRuntime(): FormulariosRuntime {
  if (!formularios) formularios = crearFormulariosRuntime({ pool });
  return formularios;
}

/** Permisos de plantilla del motor de formularios (crear/publicar/leer). */
const FORM_PERMISOS = [
  "modulo.formularios.plantilla.read",
  "modulo.formularios.plantilla.write",
  "modulo.formularios.plantilla.publicar",
  "modulo.formularios.plantilla.admin",
];

/** Contexto del motor de formularios con permisos de plantilla para el tenant. */
function contextForFormularios(actorId: string, tenantId: string): ExecutionContext {
  return createExecutionContext({
    principal: { id: actorId, rol: "admin", permisos: FORM_PERMISOS, capacidades: [] },
    metadata: { tenantId },
  });
}

/**
 * DynamicFormsPort REAL (DGP-007): `verificarPlantilla` resuelve la versión por
 * `clave` (=`plantillaId`) vía `plantilla.obtener` y la considera PUBLICADA si su
 * estado no es BORRADOR; `validarRespuestas` valida sincrónicamente las respuestas
 * contra la DEFINICIÓN de esa versión. Envuelve el contrato público en su PROPIO
 * runtime; jamás comandos anidados.
 */
const dynamicFormsPort: DynamicFormsPort = {
  async verificarPlantilla(tenantId, plantillaId, version): Promise<Result<{ publicada: boolean }, KernelError>> {
    const ctxF = contextForFormularios("system", tenantId);
    const r = await formulariosRuntime().platform.kernel.queries.execute(ctxF, "modulo.formularios.plantilla.obtener", { clave: plantillaId, version });
    if (!r.ok) {
      if (r.error.code === "KRN-NOT-001") return ok({ publicada: false });
      return r as Result<never, KernelError>;
    }
    const rec = r.value as { estado?: string } | null;
    return ok({ publicada: rec != null && rec.estado !== "BORRADOR" });
  },
  async validarRespuestas(tenantId, plantillaId, version, respuestas): Promise<Result<{ validas: boolean; errores: readonly string[] }, KernelError>> {
    const ctxF = contextForFormularios("system", tenantId);
    const r = await formulariosRuntime().platform.kernel.queries.execute(ctxF, "modulo.formularios.plantilla.obtener", { clave: plantillaId, version });
    if (!r.ok) return r as Result<never, KernelError>;
    const rec = r.value as { data?: { contenido?: { definicion?: DefinicionFormulario } } } | null;
    const def = rec?.data?.contenido?.definicion;
    if (!def) return ok({ validas: false, errores: [`Plantilla "${plantillaId}:v${version}" sin definición`] });
    const val = validarSincrono(def, respuestas);
    const errores = val.hallazgos.filter((h: HallazgoValidacion) => h.severidad === "error").map((h: HallazgoValidacion) => h.mensaje);
    return ok({ validas: val.valido, errores });
  },
};

/** Motor de formularios expuesto al seed oficial para sembrar/publicar plantillas. */
export { formulariosRuntime, contextForFormularios };

export function correctivoRuntime(): CorrectivoRuntimeOperacional {
  if (!runtime) {
    runtime = crearCorrectivoRuntimeOperacional({
      pool,
      materializador: materializadorOrdenes,
      activos: activosPort,
      inventario: inventarioPort,
      abastecimiento: abastecimientoPort,
      ...(dynamicFormsPort ? { dynamicForms: dynamicFormsPort } : {}),
    });
  }
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...correctivoModule({
    solicitudes: null as never,
    diagnosticos: null as never,
    intervenciones: null as never,
    generaciones: null as never,
    dedup: null as never,
    historial: null as never,
    eventosActivo: null as never,
    catalogos: null as never,
    consecutivo: null as never,
    recibos: null as never,
    eventLog: null as never,
  } as ModuleAdapters).permissions,
];

/**
 * Mapa rol → permisos. admin/platform_admin: todo (write/govern/execute/admin);
 * operador: write + govern + execute (sin admin); lector: sólo lectura.
 */
export function principalCorrectivo(userId: string, rol: string): Principal {
  if (rol === "admin" || rol === "platform_admin") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: [
        "gestionar-solicitudes", "gobernar-correctivo", "ejecutar-correctivo",
        "administrar-correctivo",
      ],
    };
  }
  if (rol === "operador") {
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.correctivo.admin"),
        "platform.timeline.read", "platform.config.read",
      ],
      capacidades: ["gestionar-solicitudes", "gobernar-correctivo", "ejecutar-correctivo"],
    };
  }
  return {
    id: userId,
    rol,
    permisos: ["modulo.correctivo.read", "platform.timeline.read", "platform.config.read"],
    capacidades: [],
  };
}

export function contextForCorrectivo(userId: string, rol: string, tenant: string = DELTAOPS_TENANT): ExecutionContext {
  return createExecutionContext({
    principal: principalCorrectivo(userId, rol),
    metadata: { tenantId: tenant },
  });
}
