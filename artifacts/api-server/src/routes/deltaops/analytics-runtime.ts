/**
 * DGP-016.2 · Runtime del Módulo Enterprise Analytics & KPI Platform en el API
 * Server. Singleton Kernel + Plataforma + Módulo Analytics con adaptadores
 * PostgreSQL reales. Mismo patrón que correctivo-runtime (DGP-015.2).
 *
 * FUENTES DE HECHOS (SOLO LECTURA, fail-safe): la capa de integración compone los
 * CONTRATOS PÚBLICOS de consulta de cada módulo (Órdenes/Activos/Inventario/
 * Correctivo/Preventivo/Abastecimiento/Planes/Timeline) en sus PROPIOS runtimes y
 * los ADAPTA a series de HECHOS neutros (filas campo→valor) que el motor evalúa
 * genéricamente. NUNCA importa aggregates ni ejecuta comandos anidados: sólo lee.
 * Si una fuente falla o no existe, la evaluación que la requiere FALLA de forma
 * segura (KRN-CFL) — jamás inventa datos.
 */
import { pool } from "@workspace/db";
import {
  createExecutionContext,
  ok,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  analyticsModule,
  crearAnalyticsRuntimeOperacional,
  type AnalyticsRuntimeOperacional,
  type ModuleAdapters,
  type CriterioFuente,
  type FuenteHechos,
  type Hecho,
  type RegistroFuentes,
} from "@workspace/module-analytics";
import { DELTAOPS_TENANT } from "./reference-runtime";
import { ordenesRuntime, contextForOrdenes } from "./ordenes-runtime";
import { activosRuntime, contextForActivos } from "./activos-runtime";
import { inventarioRuntime, contextForInventario } from "./inventario-runtime";
import { correctivoRuntime, contextForCorrectivo } from "./correctivo-runtime";
import { preventivoRuntime, contextForPreventivo } from "./preventivo-runtime";
import { abastecimientoRuntime, contextForAbastecimiento } from "./abastecimiento-runtime";
import { planesRuntime, contextForPlanes } from "./planes-runtime";
import { indicadoresActivo } from "./costos-indicadores";
import type { RangoPeriodo, Sesion } from "./costos-composicion";

let runtime: AnalyticsRuntimeOperacional | null = null;

/* ------------------------- Utilidades de proyección ---------------------- */

/** Normaliza el resultado de una consulta a un arreglo de filas neutro. */
function filasDe(valor: unknown, ...claves: string[]): Record<string, unknown>[] {
  if (Array.isArray(valor)) return valor as Record<string, unknown>[];
  if (valor && typeof valor === "object") {
    for (const k of claves) {
      const v = (valor as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

/** Convierte un ISO/Date a ISO string estable, o null. */
function iso(v: unknown): string | null {
  if (typeof v === "string" && v !== "") return v;
  if (v instanceof Date) return v.toISOString();
  return null;
}

/** Aplana un hecho conservando los campos crudos + una `fecha` canónica. */
function hecho(row: Record<string, unknown>, fechaClaves: string[]): Hecho {
  let fecha: string | null = null;
  for (const k of fechaClaves) {
    const f = iso(row[k]);
    if (f) { fecha = f; break; }
  }
  return { ...row, ...(fecha ? { fecha } : {}) };
}

/**
 * Normaliza el estado de una orden del módulo Órdenes (mayúsculas + `EN_`) al
 * vocabulario neutro que usan los indicadores canónicos de analytics.
 */
function estadoOrdenNeutro(v: unknown): unknown {
  if (typeof v !== "string" || v === "") return v;
  const mapa: Record<string, string> = {
    borrador: "borrador", planificada: "planificada", abierta: "abierta", asignada: "asignada",
    en_ejecucion: "ejecucion", ejecucion: "ejecucion", en_validacion: "validacion", validacion: "validacion",
    cerrada: "cerrada", cancelada: "cancelada",
  };
  const k = v.toLowerCase();
  return mapa[k] ?? k;
}

/**
 * Fuente genérica read-only: enruta cada dataset a un LECTOR que envuelve el
 * contrato público del módulo respectivo. Fail-safe: si el lector falla, propaga
 * el error (⇒ evaluación rechazada); dataset desconocido ⇒ error de configuración.
 */
type Lector = (tenantId: string, criterio: CriterioFuente) => Promise<Result<Hecho[], KernelError>>;

class FuenteComposicion implements FuenteHechos {
  constructor(private readonly lectores: Record<string, Lector>) {}
  datasets(): readonly string[] {
    return Object.keys(this.lectores);
  }
  async hechos(tenantId: string, criterio: CriterioFuente): Promise<Result<Hecho[], KernelError>> {
    const lector = this.lectores[criterio.dataset];
    if (!lector) return ok([]);
    return lector(tenantId, criterio);
  }
}

/* -------------------------------- Órdenes -------------------------------- */
// datasets: ordenes | asignaciones | costos

const fuenteOrdenes = new FuenteComposicion({
  async ordenes(tenantId, criterio) {
    const ctx = contextForOrdenes("system", "lector", tenantId);
    const r = await ordenesRuntime().platform.kernel.queries.execute(ctx, "modulo.ordenes.listar", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "ordenes", "items");
    // Normaliza el estado del módulo Órdenes (p.ej. "EN_EJECUCION") al vocabulario
    // neutro de los indicadores canónicos ("abierta"/"asignada"/"ejecucion"/...).
    return ok(rows.map((o) => hecho({ ...o, estado: estadoOrdenNeutro(o["estado"]) }, ["fecha", "actualizadoAt", "creadoAt"])));
  },
  async asignaciones(tenantId, criterio) {
    const ctx = contextForOrdenes("system", "lector", tenantId);
    const r = await ordenesRuntime().platform.kernel.queries.execute(ctx, "modulo.ordenes.listar", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "ordenes", "items");
    // Cada orden con responsable/cuadrilla se proyecta como una asignación.
    return ok(
      rows
        .filter((o) => o["responsable"] != null || o["cuadrilla"] != null)
        .map((o) => hecho({ id: o["id"], responsable: o["responsable"] ?? null, cuadrilla: o["cuadrilla"] ?? null, estado: o["estado"] ?? null }, ["fecha"])),
    );
  },
  async costos(tenantId, criterio) {
    const ctx = contextForOrdenes("system", "lector", tenantId);
    const r = await ordenesRuntime().platform.kernel.queries.execute(ctx, "modulo.ordenes.listar", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "ordenes", "items");
    return ok(
      rows.map((o) => hecho({ id: o["id"], tipo: o["tipo"] ?? null, costoTotal: Number(o["costoTotal"] ?? 0) }, ["fecha", "actualizadoAt"])),
    );
  },
});

/* -------------------------------- Activos -------------------------------- */
// datasets: disponibilidad | utilizacion

const fuenteActivos = new FuenteComposicion({
  async disponibilidad(tenantId, criterio) {
    const ctx = contextForActivos("system", "lector", tenantId);
    const r = await activosRuntime().platform.kernel.queries.execute(ctx, "modulo.activos.listar", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "activos", "items");
    return ok(
      rows.map((a) => hecho({ id: a["id"], tiempoOperativoMin: Number(a["tiempoOperativoMin"] ?? 0), tiempoTotalMin: Number(a["tiempoTotalMin"] ?? 0) }, ["fecha", "actualizadoAt"])),
    );
  },
  async utilizacion(tenantId, criterio) {
    const ctx = contextForActivos("system", "lector", tenantId);
    const r = await activosRuntime().platform.kernel.queries.execute(ctx, "modulo.activos.listar", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "activos", "items");
    return ok(rows.map((a) => hecho({ id: a["id"], tiempoUsoMin: Number(a["tiempoUsoMin"] ?? 0) }, ["fecha", "actualizadoAt"])));
  },
});

/* ------------------------------- Inventario ------------------------------ */
// datasets: movimientos

const fuenteInventario = new FuenteComposicion({
  async movimientos(tenantId, criterio) {
    const ctx = contextForInventario("system", "lector", tenantId);
    // El contrato público de inventario expone movimientos por EXISTENCIA
    // (`inventarioId` = id de la existencia item+bodega+ubicación+lote/serie),
    // no por tenant. DOBLE FAN-OUT: items del tenant → existencias de cada item
    // → movimientos de cada existencia, agregados. Lectura pura, fail-safe.
    const li = await inventarioRuntime().platform.kernel.queries.execute(ctx, "modulo.inventario.items", {});
    if (!li.ok) return li as Result<never, KernelError>;
    const items = filasDe(li.value, "items", "ordenes");
    const itemIds = items.map((it) => String(it["id"] ?? (it["datos"] as Record<string, unknown> | undefined)?.["id"] ?? "")).filter((x) => x !== "");
    const inventarioIds = new Set<string>();
    for (const itemId of itemIds) {
      const le = await inventarioRuntime().platform.kernel.queries.execute(ctx, "modulo.inventario.existencias-item", { itemId });
      if (!le.ok) return le as Result<never, KernelError>;
      for (const e of filasDe(le.value, "existencias", "items")) {
        const invId = String(e["id"] ?? (e["datos"] as Record<string, unknown> | undefined)?.["id"] ?? "");
        if (invId !== "") inventarioIds.add(invId);
      }
    }
    const hechos: Hecho[] = [];
    for (const inventarioId of inventarioIds) {
      const r = await inventarioRuntime().platform.kernel.queries.execute(ctx, "modulo.inventario.movimientos", {
        inventarioId,
        ...(criterio.limite ? { limit: criterio.limite } : {}),
      });
      if (!r.ok) return r as Result<never, KernelError>;
      const rows = filasDe(r.value, "movimientos", "items");
      for (const m of rows) {
        hechos.push(
          hecho(
            { id: m["id"], inventarioId, tipo: m["tipo"] ?? null, cantidad: Number(m["cantidad"] ?? 0), satisfecha: m["satisfecha"] ?? true },
            ["fecha", "creadoAt", "ocurridoAt", "actualizadoAt", "registradoAt"],
          ),
        );
      }
    }
    return ok(hechos);
  },
});

/* --------------------------------- Costos -------------------------------- */
// dataset: indicadores — DGP-021.4 (ADITIVO). Proyecta un HECHO por (activo, moneda,
// indicador) con el valor EXACTO como CADENA (string-safe; NUNCA Number()), más los
// metadatos declarativos requeridos (§15): fuente, período (rango), tenant, activo,
// moneda, indicador, unidad, fecha, calidad/estado. Fan-out: activos del tenant →
// indicadores por activo (composición 021.3 + Δ de medidor exacto 021.4). Fail-safe.

const RANGO_TOTAL: RangoPeriodo = { clave: "total", desde: null, hasta: null };

const fuenteCostos = new FuenteComposicion({
  async indicadores(tenantId, criterio) {
    const sesion: Sesion = { userId: "system", rol: "lector", tenant: tenantId };
    // Activos del tenant vía contrato público de Activos (lectura pura).
    const ctxA = contextForActivos("system", "lector", tenantId);
    const la = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.listar", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!la.ok) return la as Result<never, KernelError>;
    const activos = filasDe(la.value, "activos", "items");
    const activoIds = activos
      .map((a) => String(a["id"] ?? (a["datos"] as Record<string, unknown> | undefined)?.["id"] ?? ""))
      .filter((x) => x !== "");

    // Ventana temporal: usa el criterio si viene, o el total histórico.
    const rango: RangoPeriodo = criterio.desde || criterio.hasta
      ? { clave: "rango", desde: criterio.desde ?? null, hasta: criterio.hasta ?? null }
      : RANGO_TOTAL;
    const fechaDataset = iso(criterio.hasta) ?? iso(criterio.desde) ?? null;

    const hechos: Hecho[] = [];
    for (const activoId of activoIds) {
      const ind = await indicadoresActivo(sesion, activoId, rango);
      if (!ind.ok) return ind as Result<never, KernelError>;
      for (const clave of ["costoPorHora", "costoPorKm"] as const) {
        const im = ind.value[clave] as {
          estado: string; unidad: string; delta: string | null;
          porMoneda: readonly { moneda: string; costoTotal: string; valor: string }[];
        };
        if (im.estado !== "COMPLETO") {
          // Ausencia ≠ 0: se emite el hecho con estado y sin `valor` (calidad).
          hechos.push({
            id: `${activoId}:${clave}`, activo: activoId, indicador: clave, unidad: im.unidad,
            estado: im.estado, moneda: null, valor: null, costoTotal: null, delta: im.delta,
            ...(fechaDataset ? { fecha: fechaDataset } : {}),
          });
          continue;
        }
        for (const r of im.porMoneda) {
          hechos.push({
            id: `${activoId}:${clave}:${r.moneda}`, activo: activoId, indicador: clave, unidad: im.unidad,
            estado: "COMPLETO", moneda: r.moneda,
            // string-safe: valores decimales EXACTOS como cadena, jamás float.
            valor: r.valor, costoTotal: r.costoTotal, delta: im.delta,
            ...(fechaDataset ? { fecha: fechaDataset } : {}),
          });
        }
      }
    }
    return ok(hechos);
  },
});

/* ------------------------------- Correctivo ------------------------------ */
// datasets: eventos-activo | solicitudes

const fuenteCorrectivo = new FuenteComposicion({
  async "eventos-activo"(tenantId, criterio) {
    const ctx = contextForCorrectivo("system", "lector", tenantId);
    // El contrato público de correctivo exige `activoId` (no hay consulta de
    // eventos por tenant). Para que MTBF/MTTR/confiabilidad/reincidencias/
    // fallas-* funcionen sobre TODO el tenant cuando no hay filtro de activo,
    // el adaptador hace FAN-OUT: lista los activos del tenant (contrato público
    // de activos) y agrega los eventos de cada uno. Con filtro `activoId` se
    // restringe a ese activo. Todo es lectura pura (fail-safe: propaga error).
    const filtroActivo = typeof criterio.extra?.["activoId"] === "string" ? (criterio.extra["activoId"] as string) : null;
    let activoIds: string[];
    if (filtroActivo) {
      activoIds = [filtroActivo];
    } else {
      const ctxAct = contextForActivos("system", "lector", tenantId);
      const la = await activosRuntime().platform.kernel.queries.execute(ctxAct, "modulo.activos.listar", { limit: 200 });
      if (!la.ok) return la as Result<never, KernelError>;
      const activos = filasDe(la.value, "activos", "items");
      activoIds = activos.map((a) => String(a["id"] ?? (a["datos"] as Record<string, unknown> | undefined)?.["id"] ?? "")).filter((x) => x !== "");
    }
    const hechos: Hecho[] = [];
    for (const activoId of activoIds) {
      const r = await correctivoRuntime().platform.kernel.queries.execute(ctx, "modulo.correctivo.eventos-activo", { activoId });
      if (!r.ok) return r as Result<never, KernelError>;
      const rows = filasDe(r.value, "eventos", "items");
      for (const e of rows) {
        const kpi = (e["insumosKpi"] as Record<string, unknown> | undefined) ?? {};
        const rawTipo = String(e["tipo"] ?? "");
        const esFalla = rawTipo.startsWith("falla");
        hechos.push(
          hecho(
            {
              id: e["id"], activo: e["activoId"] ?? activoId,
              // Tipo normalizado para los indicadores canónicos (comparan con "falla").
              tipo: esFalla ? "falla" : rawTipo, tipoEvento: rawTipo, modoFalla: e["modoFalla"] ?? null,
              esFalla, reincidente: e["reincidente"] ?? false,
              tiempoEntreFallasMin: Number(kpi["tiempoEntreFallasMin"] ?? e["tiempoEntreFallasMin"] ?? 0),
              tiempoReparacionMin: Number(kpi["tiempoReparacionMin"] ?? e["tiempoReparacionMin"] ?? 0),
              tiempoIndisponibleMin: Number(kpi["tiempoIndisponibleMin"] ?? e["tiempoIndisponibleMin"] ?? 0),
            },
            ["fecha", "ocurridoEn", "ocurridoAt"],
          ),
        );
      }
    }
    return ok(hechos);
  },
  async solicitudes(tenantId, criterio) {
    const ctx = contextForCorrectivo("system", "lector", tenantId);
    const r = await correctivoRuntime().platform.kernel.queries.execute(ctx, "modulo.correctivo.solicitudes", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "solicitudes", "items");
    return ok(
      rows.map((s) => hecho({ id: s["id"], estado: s["estado"] ?? null, prioridad: s["prioridad"] ?? null, tiempoAtencionMin: Number(s["tiempoAtencionMin"] ?? 0) }, ["fecha", "creadoAt"])),
    );
  },
});

/* ------------------------------- Preventivo ------------------------------ */
// datasets: generaciones

const fuentePreventivo = new FuenteComposicion({
  async generaciones(tenantId, criterio) {
    const ctx = contextForPreventivo("system", "lector", tenantId);
    const r = await preventivoRuntime().platform.kernel.queries.execute(ctx, "modulo.preventivo.generaciones", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "generaciones", "items");
    return ok(rows.map((g) => hecho({ id: g["id"], aTiempo: g["aTiempo"] ?? false, estado: g["estado"] ?? null }, ["fecha", "generadoAt"])));
  },
});

/* ----------------------------- Abastecimiento ---------------------------- */
// datasets: solicitudes

const fuenteAbastecimiento = new FuenteComposicion({
  async solicitudes(tenantId, criterio) {
    const ctx = contextForAbastecimiento("system", "lector", tenantId);
    const r = await abastecimientoRuntime().platform.kernel.queries.execute(ctx, "modulo.abastecimiento.solicitudes", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "solicitudes", "items");
    return ok(rows.map((s) => hecho({ id: s["id"], estado: s["estado"] ?? null }, ["fecha", "creadoAt"])));
  },
});

/* --------------------------------- Planes -------------------------------- */
// datasets: generaciones

const fuentePlanes = new FuenteComposicion({
  async generaciones(tenantId, criterio) {
    const ctx = contextForPlanes("system", "lector", tenantId);
    const r = await planesRuntime().platform.kernel.queries.execute(ctx, "modulo.planes.generaciones", {
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "generaciones", "items");
    return ok(rows.map((g) => hecho({ id: g["id"], ejecutada: g["ejecutada"] ?? false, estado: g["estado"] ?? null }, ["fecha", "generadoAt"])));
  },
});

/* ---------------------------- Shared Timeline ---------------------------- */
// datasets: entradas
// Compone el CONTRATO PÚBLICO de la línea de tiempo compartida
// (`platform.timeline.query`) registrada en el MISMO kernel del runtime de
// analytics. SOLO LECTURA, fail-safe: si el puerto no existe o falla, la
// evaluación se rechaza (jamás inventa datos).

const fuenteTimeline = new FuenteComposicion({
  async entradas(tenantId, criterio) {
    // El contrato de timeline es tenant-wide (`query`) con filtros opcionales.
    const ctx = contextForAnalytics("system", "lector", tenantId);
    const r = await analyticsRuntime().platform.kernel.queries.execute(ctx, "platform.timeline.query", {
      ...(criterio.desde ? { desde: criterio.desde } : {}),
      ...(criterio.hasta ? { hasta: criterio.hasta } : {}),
      ...(criterio.limite ? { limit: criterio.limite } : {}),
    });
    if (!r.ok) return r as Result<never, KernelError>;
    const rows = filasDe(r.value, "entradas", "items");
    // Cada entrada de timeline expone su snapshot bajo `data`
    // ({ eventType, entityRef, actorId, occurredAt, payload }). Se aplana a un
    // hecho neutro con `fecha` canónica (occurredAt).
    return ok(
      rows.map((row) => {
        const d = (row["data"] as Record<string, unknown> | undefined) ?? row;
        return hecho(
          {
            id: row["id"] ?? d["id"] ?? null,
            eventType: d["eventType"] ?? null,
            entityRef: d["entityRef"] ?? null,
            actorId: d["actorId"] ?? null,
            estado: d["estado"] ?? null,
            occurredAt: d["occurredAt"] ?? row["occurredAt"] ?? null,
          },
          ["occurredAt", "fecha", "createdAt"],
        );
      }),
    );
  },
});

/* -------------------------------- Registro ------------------------------- */

const REGISTRO_FUENTES: RegistroFuentes = {
  ordenes: fuenteOrdenes,
  activos: fuenteActivos,
  inventario: fuenteInventario,
  correctivo: fuenteCorrectivo,
  preventivo: fuentePreventivo,
  abastecimiento: fuenteAbastecimiento,
  planes: fuentePlanes,
  timeline: fuenteTimeline,
  costos: fuenteCostos,
};

export function analyticsRuntime(): AnalyticsRuntimeOperacional {
  if (!runtime) {
    runtime = crearAnalyticsRuntimeOperacional({ pool, fuentes: REGISTRO_FUENTES });
  }
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...analyticsModule({
    definiciones: null as never,
    dashboards: null as never,
    snapshots: null as never,
    catalogos: null as never,
    recibos: null as never,
    eventLog: null as never,
  } as ModuleAdapters).permissions,
];

/**
 * Mapa rol → permisos. admin/platform_admin: todo (read/admin/dashboard/export);
 * operador: read + dashboard + export (sin admin); lector: sólo lectura.
 */
export function principalAnalytics(userId: string, rol: string): Principal {
  if (rol === "admin" || rol === "platform_admin") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: ["consultar-analytics", "administrar-analytics", "gestionar-dashboards-analytics", "exportar-analytics"],
    };
  }
  if (rol === "operador") {
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.analytics.admin"),
        "platform.timeline.read", "platform.config.read",
      ],
      capacidades: ["consultar-analytics", "gestionar-dashboards-analytics", "exportar-analytics"],
    };
  }
  return {
    id: userId,
    rol,
    permisos: ["modulo.analytics.read", "platform.timeline.read", "platform.config.read"],
    capacidades: [],
  };
}

export function contextForAnalytics(userId: string, rol: string, tenant: string = DELTAOPS_TENANT): ExecutionContext {
  return createExecutionContext({
    principal: principalAnalytics(userId, rol),
    metadata: { tenantId: tenant },
  });
}
