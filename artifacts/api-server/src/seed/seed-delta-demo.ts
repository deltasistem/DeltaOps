/**
 * DGP-011.3 · Seed OFICIAL del Tenant DEMO del programa DeltaOps.
 *
 * Crea el tenant DEMO permanente ("DELTA DEMO"), su usuario administrador
 * (Carlos Pacheco · admin@delta.demo) y datos de demostración suficientes para
 * que NINGÚN módulo aparezca vacío al ingresar. Todo se crea por las VÍAS
 * OFICIALES (comandos de módulo / comandos de plataforma) con `opId`/`id`
 * DETERMINISTAS ⇒ es idempotente: reejecutar NO duplica (proyecciones, timeline,
 * event log y outbox quedan coherentes; jamás INSERT directo a agregados o read
 * models). Aislado por RLS del tenant principal `deltaops`.
 *
 * Ejecutar: pnpm --filter @workspace/api-server run seed:demo
 *
 * MANDATO OFICIAL: la contraseña inicial vive ÚNICAMENTE en este seed.
 */
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, pool, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Principal, Result } from "@workspace/kernel";
import { createExecutionContext } from "@workspace/kernel";
import { DELTA_DEMO_TENANT } from "../routes/deltaops/reference-runtime";
import { activosRuntime, principalActivos } from "../routes/deltaops/activos-runtime";
import { ordenesRuntime, principalOrdenes } from "../routes/deltaops/ordenes-runtime";
import { inventarioRuntime, principalInventario } from "../routes/deltaops/inventario-runtime";
import { planesRuntime, principalPlanes } from "../routes/deltaops/planes-runtime";
import { abastecimientoRuntime, principalAbastecimiento } from "../routes/deltaops/abastecimiento-runtime";

/* ------------------------------ Identidad DEMO --------------------------- */

export const DEMO_TENANT = DELTA_DEMO_TENANT;
export const DEMO_EMPRESA = "DELTA DEMO";
export const DEMO_ADMIN = {
  email: "admin@delta.demo",
  nombre: "Carlos Pacheco",
  cargo: "Director TIC",
  rol: "admin",
  password: "DeltaOps2026!",
} as const;

/* ------------------------------ Utilidades ------------------------------- */

/** UUID v5-like DETERMINISTA a partir de una semilla (idempotencia de ids). */
function idDet(seed: string): string {
  let h1 = 0x811c9dc5;
  const bytes: number[] = [];
  for (let i = 0; i < 32; i++) {
    h1 ^= seed.charCodeAt(i % seed.length) + i * 131;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    bytes.push((h1 >>> (i % 4) * 8) & 0xff);
  }
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function ctxCon(principal: Principal): ExecutionContext {
  return createExecutionContext({ principal, metadata: { tenantId: DEMO_TENANT } });
}

const log = (m: string) => console.log(`  · ${m}`);

/**
 * Drena el outbox del runtime dado en BUCLE hasta vaciarlo. Los runtimes de cada
 * módulo comparten la misma tabla de outbox; drenar completamente tras cada
 * módulo garantiza que sus proyecciones/timeline se materialicen ANTES de que
 * otro runtime (sin sus handlers) reclame y marque como procesados sus eventos.
 */
async function drenarCompleto(kernel: {
  outboxProcessor: { processPending: () => Promise<Result<{ processed: number }, KernelError>> };
}): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const r = await kernel.outboxProcessor.processPending();
    if (!r.ok || r.value.processed === 0) return;
  }
}

function unwrap<T>(r: Result<T, KernelError>, ctx: string): T {
  if (!r.ok) throw new Error(`${ctx}: ${r.error.message}`);
  return r.value;
}

/* --------------------------- 1) Usuario admin ---------------------------- */

async function seedAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_ADMIN.password, 10);
  const [existente] = await db
    .select({ id: deltaopsUsersTable.id })
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.email, DEMO_ADMIN.email));
  if (existente) {
    // Reafirma tenant/rol/nombre (idempotente, sin duplicar).
    await db
      .update(deltaopsUsersTable)
      .set({ nombre: DEMO_ADMIN.nombre, rol: DEMO_ADMIN.rol, tenant: DEMO_TENANT, passwordHash })
      .where(eq(deltaopsUsersTable.id, existente.id));
    log(`Admin demo ya existía (id=${existente.id}) — reafirmado`);
    return;
  }
  const [ins] = await db
    .insert(deltaopsUsersTable)
    .values({
      email: DEMO_ADMIN.email,
      nombre: DEMO_ADMIN.nombre,
      rol: DEMO_ADMIN.rol,
      tenant: DEMO_TENANT,
      passwordHash,
    })
    .onConflictDoNothing({ target: deltaopsUsersTable.email })
    .returning({ id: deltaopsUsersTable.id });
  log(`Admin demo creado (id=${ins?.id}): ${DEMO_ADMIN.email} — tenant ${DEMO_TENANT}`);
}

/* -------------------------- 2) Catálogos base ---------------------------- */
/**
 * Habilita en cada módulo los valores de catálogo que usa el dataset demo. Es
 * idempotente (upsert por clave). Los catálogos son configurables por tenant.
 */
async function seedCatalogos(): Promise<void> {
  const p = principalActivos("seed-demo", "admin");
  const ctx = ctxCon(p);
  const rt = activosRuntime();
  const up = (catalogo: string, clave: string, etiqueta: string) =>
    rt.platform.kernel.commands.execute(ctx, "modulo.activos.catalogo.upsert", { catalogo, clave, etiqueta });

  const cats: [string, string, string][] = [
    ["tipos", "movil", "Móvil"], ["tipos", "fijo", "Fijo"],
    ["categorias", "maquinaria", "Maquinaria"], ["categorias", "vehiculo", "Vehículo"],
    ["categorias", "energia", "Energía"], ["categorias", "transporte", "Transporte"],
    ["familias", "maquinaria-amarilla", "Maquinaria amarilla"],
    ["familias", "montacargas", "Montacargas"], ["familias", "bandas", "Bandas"],
    ["familias", "tolvas", "Tolvas"], ["familias", "empacadoras", "Empacadoras"],
    ["familias", "compresores", "Compresores"], ["familias", "generadores", "Generadores"],
    ["familias", "camiones", "Camiones"], ["familias", "tractores", "Tractores"],
    ["familias", "plantas-electricas", "Plantas eléctricas"],
    ["monedas", "USD", "Dólar"], ["criticidades", "alta", "Alta"], ["criticidades", "media", "Media"],
  ];
  for (const [c, k, e] of cats) unwrap(await up(c, k, e), `catalogo.activos ${c}/${k}`);
  await drenarCompleto(rt.platform.kernel);
  log(`Catálogos de activos habilitados (${cats.length})`);

  // Catálogos de inventario: los "tipos de item" del mandato NO son canónicos,
  // se declaran como catálogo configurable del tenant (upsert idempotente).
  const rti = inventarioRuntime();
  const ctxi = ctxCon(principalInventario("seed-demo", "admin"));
  const upi = (catalogo: string, clave: string, etiqueta: string) =>
    rti.platform.kernel.commands.execute(ctxi, "modulo.inventario.catalogo-upsert", { catalogo, clave, etiqueta });
  const tiposItem = [
    "herramienta", "lubricante", "filtro", "rodamiento", "banda", "aceite",
    "grasa", "motor", "sensor", "epp", "consumible", "material-electrico",
  ];
  for (const t of tiposItem) unwrap(await upi("tipos-item", t, t), `catalogo.inv tipos-item/${t}`);
  await drenarCompleto(rti.platform.kernel);
  log(`Catálogos de inventario habilitados (tipos-item: ${tiposItem.length})`);
}

/* ------------------------------ 3) Activos ------------------------------- */

interface DefActivo {
  codigo: string; nombre: string; familia: string; categoria: string;
}
const ACTIVOS: DefActivo[] = [
  { codigo: "MAQ-001", nombre: "Excavadora CAT 320", familia: "maquinaria-amarilla", categoria: "maquinaria" },
  { codigo: "MON-001", nombre: "Montacargas Toyota 8FGCU25", familia: "montacargas", categoria: "maquinaria" },
  { codigo: "BAN-001", nombre: "Banda transportadora L-40", familia: "bandas", categoria: "maquinaria" },
  { codigo: "TOL-001", nombre: "Tolva de descarga T-12", familia: "tolvas", categoria: "maquinaria" },
  { codigo: "EMP-001", nombre: "Empacadora automática E-9", familia: "empacadoras", categoria: "maquinaria" },
  { codigo: "COM-001", nombre: "Compresor Atlas GA-75", familia: "compresores", categoria: "maquinaria" },
  { codigo: "GEN-001", nombre: "Generador Cummins 250kVA", familia: "generadores", categoria: "energia" },
  { codigo: "CAM-001", nombre: "Camión Kenworth T880", familia: "camiones", categoria: "transporte" },
  { codigo: "TRA-001", nombre: "Tractor John Deere 6110", familia: "tractores", categoria: "maquinaria" },
  { codigo: "PLA-001", nombre: "Planta eléctrica CAT 500kW", familia: "plantas-electricas", categoria: "energia" },
];

async function seedActivos(): Promise<Map<string, string>> {
  const rt = activosRuntime();
  const ctx = ctxCon(principalActivos("seed-demo", "admin"));
  const ids = new Map<string, string>();
  for (const a of ACTIVOS) {
    const id = idDet(`activo:${a.codigo}`);
    const r = await rt.platform.kernel.commands.execute(ctx, "modulo.activos.crear", {
      id,
      opId: `seed:activo:${a.codigo}`,
      codigoEmpresarial: a.codigo,
      nombre: a.nombre,
      tipo: "movil",
      categoria: a.categoria,
      familia: a.familia,
      criticidad: "alta",
      moneda: "USD",
    });
    unwrap(r, `activo ${a.codigo}`);
    ids.set(a.codigo, id);
  }
  await drenarCompleto(rt.platform.kernel);
  log(`Activos creados (${ACTIVOS.length})`);
  return ids;
}

/* ------------------------------ 4) Órdenes ------------------------------- */
/**
 * Crea 7 órdenes, cada una detenida en un estado del ciclo real de negocio,
 * SIEMPRE a través del Workflow Engine (comando `transicionar`) — sin bypass.
 */
const ORDENES: { estado: string; titulo: string; pasos: string[] }[] = [
  { estado: "BORRADOR", titulo: "OT · Inspección inicial excavadora", pasos: [] },
  { estado: "ABIERTA", titulo: "OT · Cambio de aceite montacargas", pasos: ["abrir"] },
  { estado: "PLANIFICADA", titulo: "OT · Mantenimiento banda transportadora", pasos: ["abrir", "planificar"] },
  { estado: "ASIGNADA", titulo: "OT · Revisión tolva de descarga", pasos: ["abrir", "planificar", "asignar"] },
  { estado: "EN_EJECUCION", titulo: "OT · Reparación empacadora", pasos: ["abrir", "planificar", "asignar", "iniciar"] },
  { estado: "EN_VALIDACION", titulo: "OT · Overhaul compresor", pasos: ["abrir", "planificar", "asignar", "iniciar", "enviarValidacion"] },
  { estado: "CERRADA", titulo: "OT · Servicio generador", pasos: ["abrir", "planificar", "asignar", "iniciar", "enviarValidacion", "cerrar"] },
];

/** Estado de negocio resultante tras aplicar cada paso del ciclo de vida. */
const ESTADO_TRAS_PASO: Record<string, string> = {
  abrir: "ABIERTA",
  planificar: "PLANIFICADA",
  asignar: "ASIGNADA",
  iniciar: "EN_EJECUCION",
  enviarValidacion: "EN_VALIDACION",
  cerrar: "CERRADA",
};
/** Orden lineal de los estados para saber si un paso ya está aplicado. */
const ORDEN_ESTADOS = ["BORRADOR", "ABIERTA", "PLANIFICADA", "ASIGNADA", "EN_EJECUCION", "EN_VALIDACION", "CERRADA"];

async function seedOrdenes(): Promise<string[]> {
  const rt = ordenesRuntime();
  const ctx = ctxCon(principalOrdenes("seed-demo", "admin"));
  // Aprobador con rol validador para el gate de cierre (aprobador declarado).
  const validadorCtx = ctxCon({ id: "seed-validador", rol: "validador", permisos: ["*"], capacidades: ["*"] });
  const cmd = (c: ExecutionContext, n: string, i: unknown) => rt.platform.kernel.commands.execute(c, n, i);
  const ids: string[] = [];

  // Lee el estado ACTUAL del aggregate (fuente de verdad) para saltar pasos ya
  // aplicados. Hace el seed re-ejecutable incluso si sólo sobrevivió el aggregate
  // (p. ej. tras limpiezas parciales de read models por pruebas de otros módulos).
  const estadoActual = async (id: string): Promise<string | null> => {
    const r = await rt.platform.kernel.queries.execute(ctx, "modulo.ordenes.detalle", { id });
    if (!r.ok) return null;
    const orden = (r.value as { orden?: { estado?: string } } | null)?.orden;
    return orden?.estado ?? null;
  };

  for (const o of ORDENES) {
    const id = idDet(`orden:${o.titulo}`);
    unwrap(await cmd(ctx, "modulo.ordenes.crear", {
      id, opId: `seed:orden:${id}`, titulo: o.titulo, tipo: "correctiva", prioridad: "alta",
    }), `orden.crear ${o.estado}`);
    ids.push(id);

    for (const paso of o.pasos) {
      // Idempotencia por estado: si el aggregate ya alcanzó (o superó) el estado
      // que produce este paso, se omite. Evita re-transicionar OTs ya avanzadas.
      const actual = await estadoActual(id);
      const idxActual = actual ? ORDEN_ESTADOS.indexOf(actual) : 0;
      const idxObjetivo = ORDEN_ESTADOS.indexOf(ESTADO_TRAS_PASO[paso] ?? "");
      if (idxObjetivo >= 0 && idxActual >= idxObjetivo) continue;

      if (paso === "cerrar") {
        // Envía a validación → cerrar (gate) → aprobar (validador).
        unwrap(await cmd(ctx, "modulo.ordenes.transicionar", { id, comando: "cerrar", opId: `seed:tr:${id}:cerrar` }), `orden.cerrar ${id}`);
        unwrap(await cmd(validadorCtx, "modulo.ordenes.aprobarCierre", { id, decision: "aprobar", opId: `seed:ap:${id}` }), `orden.aprobar ${id}`);
      } else {
        unwrap(await cmd(ctx, "modulo.ordenes.transicionar", { id, comando: paso, opId: `seed:tr:${id}:${paso}` }), `orden.${paso} ${id}`);
      }
      await drenarCompleto(rt.platform.kernel);
    }
  }
  await drenarCompleto(rt.platform.kernel);
  log(`Órdenes creadas en 7 estados (${ORDENES.length})`);
  return ids;
}

/* ----------------------------- 5) Inventario ----------------------------- */

const ITEMS: { sku: string; nombre: string; tipoItem: string; traz: "sin-lote" | "con-lote" | "con-serie" }[] = [
  { sku: "HER-001", nombre: "Juego de llaves combinadas", tipoItem: "herramienta", traz: "sin-lote" },
  { sku: "LUB-001", nombre: "Lubricante multiuso", tipoItem: "lubricante", traz: "con-lote" },
  { sku: "FIL-001", nombre: "Filtro de aire HD", tipoItem: "filtro", traz: "con-lote" },
  { sku: "ROD-001", nombre: "Rodamiento SKF 6205", tipoItem: "rodamiento", traz: "con-lote" },
  { sku: "BND-001", nombre: "Banda en V B-52", tipoItem: "banda", traz: "sin-lote" },
  { sku: "ACE-001", nombre: "Aceite hidráulico ISO 68", tipoItem: "aceite", traz: "con-lote" },
  { sku: "GRA-001", nombre: "Grasa de litio EP2", tipoItem: "grasa", traz: "con-lote" },
  { sku: "MOT-001", nombre: "Motor eléctrico 5HP", tipoItem: "motor", traz: "con-serie" },
  { sku: "SEN-001", nombre: "Sensor de proximidad inductivo", tipoItem: "sensor", traz: "con-serie" },
  { sku: "EPP-001", nombre: "Casco de seguridad clase E", tipoItem: "epp", traz: "sin-lote" },
  { sku: "CON-001", nombre: "Trapos industriales (paca)", tipoItem: "consumible", traz: "sin-lote" },
  { sku: "ELE-001", nombre: "Cable THHN 12 AWG (rollo)", tipoItem: "material-electrico", traz: "sin-lote" },
];

interface InvContext {
  bodegaA: string; ubicA: string; bodegaB: string; ubicB: string;
  itemIds: Map<string, string>; invIds: Map<string, string>;
}

async function seedInventario(): Promise<void> {
  const rt = inventarioRuntime();
  const ctx = ctxCon(principalInventario("seed-demo", "admin"));
  const cmd = (n: string, i: unknown) => rt.platform.kernel.commands.execute(ctx, n, i);
  const drain = () => drenarCompleto(rt.platform.kernel);

  // Bodegas y ubicaciones (destino para transferencias).
  const bodegaA = idDet("bodega:central");
  const bodegaB = idDet("bodega:taller");
  unwrap(await cmd("modulo.inventario.crear-bodega", { id: bodegaA, opId: "seed:bod:central", codigo: "BOD-CEN", nombre: "Bodega Central", tipo: "principal" }), "bodega A");
  unwrap(await cmd("modulo.inventario.crear-bodega", { id: bodegaB, opId: "seed:bod:taller", codigo: "BOD-TAL", nombre: "Bodega Taller", tipo: "transito" }), "bodega B");
  const ubicA = idDet("ubic:A"); const ubicB = idDet("ubic:B");
  unwrap(await cmd("modulo.inventario.crear-ubicacion", { id: ubicA, opId: "seed:ubic:A", bodegaId: bodegaA, nivel: "pasillo", valor: "A1" }), "ubic A");
  unwrap(await cmd("modulo.inventario.crear-ubicacion", { id: ubicB, opId: "seed:ubic:B", bodegaId: bodegaB, nivel: "pasillo", valor: "B1" }), "ubic B");
  await drain();

  const c: InvContext = { bodegaA, ubicA, bodegaB, ubicB, itemIds: new Map(), invIds: new Map() };

  // Items (12 categorías del mandato).
  for (const it of ITEMS) {
    const id = idDet(`item:${it.sku}`);
    unwrap(await cmd("modulo.inventario.crear-item", {
      id, opId: `seed:item:${it.sku}`, sku: it.sku, nombre: it.nombre, estado: "activo",
      tipoItem: it.tipoItem, unidadBase: { clave: "unidad" }, modoTrazabilidad: it.traz,
      controlaVencimiento: it.traz === "con-lote",
    }), `item ${it.sku}`);
    c.itemIds.set(it.sku, id);
  }
  await drain();

  // Lotes (items con-lote) y series (items con-serie).
  const lotesPorSku: Record<string, string> = {
    "LUB-001": "L-LUB-2601", "FIL-001": "L-FIL-2601", "ROD-001": "L-ROD-2601",
    "ACE-001": "L-ACE-2601", "GRA-001": "L-GRA-2601",
  };
  for (const [sku, codigo] of Object.entries(lotesPorSku)) {
    unwrap(await cmd("modulo.inventario.crear-lote", {
      id: idDet(`lote:${sku}`), opId: `seed:lote:${sku}`, itemId: c.itemIds.get(sku),
      codigo, vencimiento: "2027-12-31",
    }), `lote ${sku}`);
  }
  unwrap(await cmd("modulo.inventario.registrar-serie", { id: idDet("serie:MOT"), opId: "seed:serie:MOT", itemId: c.itemIds.get("MOT-001"), numero: "SN-MOT-0001" }), "serie MOT");
  unwrap(await cmd("modulo.inventario.registrar-serie", { id: idDet("serie:SEN"), opId: "seed:serie:SEN", itemId: c.itemIds.get("SEN-001"), numero: "SN-SEN-0001" }), "serie SEN");
  await drain();

  // Movimientos de entrada (crean existencias). Guarda inventarioId por SKU.
  const entradas: { sku: string; cant: number; lote?: string; serie?: string }[] = [
    { sku: "HER-001", cant: 20 }, { sku: "LUB-001", cant: 50, lote: "L-LUB-2601" },
    { sku: "FIL-001", cant: 40, lote: "L-FIL-2601" }, { sku: "ROD-001", cant: 30, lote: "L-ROD-2601" },
    { sku: "BND-001", cant: 15 },
    { sku: "ACE-001", cant: 60, lote: "L-ACE-2601" }, { sku: "GRA-001", cant: 25, lote: "L-GRA-2601" },
    { sku: "MOT-001", cant: 1, serie: "SN-MOT-0001" }, { sku: "SEN-001", cant: 1, serie: "SN-SEN-0001" },
    { sku: "EPP-001", cant: 100 }, { sku: "CON-001", cant: 200 }, { sku: "ELE-001", cant: 12 },
  ];
  for (const e of entradas) {
    const r = unwrap(await cmd("modulo.inventario.mover", {
      movimientoId: idDet(`mov:${e.sku}`), opId: `seed:mov:${e.sku}`,
      itemId: c.itemIds.get(e.sku), bodegaId: bodegaA, ubicacionId: ubicA,
      tipo: "entrada", cantidad: e.cant, costoUnitario: 10, moneda: "USD",
      ...(e.lote ? { loteCodigo: e.lote } : {}), ...(e.serie ? { serieNumero: e.serie } : {}),
    }), `mov ${e.sku}`) as { inventarioId?: string };
    if (r.inventarioId) c.invIds.set(e.sku, r.inventarioId);
  }
  await drain();

  // Reserva sobre un item con stock.
  const invHer = c.invIds.get("HER-001");
  if (invHer) {
    unwrap(await cmd("modulo.inventario.reservar", {
      id: idDet("reserva:HER"), opId: "seed:reserva:HER", inventarioId: invHer,
      tipo: "orden-trabajo", demanda: { tipo: "orden-trabajo", id: idDet("orden:OT · Servicio generador") }, cantidad: 5,
    }), "reserva HER");
  }
  await drain();

  // Transferencia gobernada por Workflow real (crear → completar).
  const transferId = idDet("transfer:1");
  const tr = unwrap(await cmd("modulo.inventario.transferir", {
    id: transferId, opId: "seed:transfer:1",
    origen: { bodegaId: bodegaA, ubicacionId: ubicA },
    destino: { bodegaId: bodegaB, ubicacionId: ubicB },
    lineas: [{ itemId: c.itemIds.get("FIL-001"), cantidad: 5, loteCodigo: "L-FIL-2601" }],
  }), "transferir") as { id: string; version?: number };
  await drain();
  unwrap(await cmd("modulo.inventario.completar-transferencia", {
    id: transferId, expectedVersion: tr.version ?? 1, opId: "seed:transfer:1:completar",
  }), "completar-transferencia");
  await drain();

  // Conteo gobernado por Workflow real (iniciar → registrar → cerrar).
  const invGra = c.invIds.get("GRA-001");
  if (invGra) {
    const conteoId = idDet("conteo:1");
    const co = unwrap(await cmd("modulo.inventario.iniciar-conteo", {
      id: conteoId, opId: "seed:conteo:1", tipo: "ciclico",
      lineas: [{ inventarioId: invGra }],
    }), "iniciar-conteo") as { id: string; version?: number };
    await drain();
    unwrap(await cmd("modulo.inventario.registrar-conteo", {
      id: conteoId, expectedVersion: co.version ?? 1, opId: "seed:conteo:1:reg",
      contados: [{ inventarioId: invGra, cantidad: 24 }],
    }), "registrar-conteo");
    await drain();
    // El conteo queda REGISTRADO (con lecturas capturadas). El cierre del conteo
    // se gobierna por el Workflow real, cuya instancia se inicia por la operación
    // de campo correspondiente; el seed no fuerza el cierre para no acoplarse a la
    // orquestación del motor. El dato de conteo ya es visible (no hay vacío).
  }

  // Ajuste gobernado por Workflow real.
  unwrap(await cmd("modulo.inventario.ajustar", {
    id: idDet("ajuste:1"), opId: "seed:ajuste:1", tipo: "correccion", motivo: "conciliacion",
    lineas: [{ itemId: c.itemIds.get("EPP-001"), bodegaId: bodegaA, ubicacionId: ubicA, delta: -3 }],
  }), "ajustar");
  await drain();

  log(`Inventario: ${ITEMS.length} items, ${Object.keys(lotesPorSku).length} lotes, 2 series, ${entradas.length} movimientos, 1 reserva, 1 transferencia, 1 conteo, 1 ajuste`);
}

/* --------------- 6) Plataforma: comentarios, adjuntos, QR ---------------- */
/**
 * Comentarios (conversaciones), adjuntos referencia-only (metadatos, sin bytes)
 * y etiquetas QR sobre un activo y un item. Se ejecutan por comandos oficiales
 * de plataforma; idempotencia por contenido determinista (comentario/adjunto se
 * detectan por existencia previa; QR por código único por tenant).
 */
async function seedPlataforma(activoIds: Map<string, string>): Promise<void> {
  const rt = activosRuntime();
  const ctx = ctxCon(principalActivos("seed-demo", "admin"));
  const k = rt.platform.kernel;

  const activoRef = `activo:${activoIds.get("MAQ-001")}`;
  const itemRef = `inventario-item:${idDet("item:MOT-001")}`;

  // Comentarios (hilo padre + respuesta) sobre un activo — sólo si no existen.
  const existentes = await k.queries.execute(ctx, "platform.comment.byEntity", { entityRef: activoRef });
  const yaHay = existentes.ok && Array.isArray(existentes.value) && (existentes.value as unknown[]).length > 0;
  if (!yaHay) {
    const padre = unwrap(await k.commands.execute(ctx, "platform.comment.create", {
      entityRef: activoRef, texto: "Excavadora recibida en obra. Revisar horómetro antes de operar.",
    }), "comment padre") as { id: string };
    unwrap(await k.commands.execute(ctx, "platform.comment.create", {
      entityRef: activoRef, texto: "Confirmado, horómetro en 1.240 h. Programo mantenimiento preventivo.", parentId: padre.id,
    }), "comment respuesta");
    log("Comentarios (conversación) creados sobre activo");
  } else {
    log("Comentarios ya existían — sin duplicar");
  }

  // Adjuntos referencia-only (metadatos; sin bytes) sobre activo e item.
  const adjExist = await k.queries.execute(ctx, "platform.attachment.byEntity", { entityRef: activoRef });
  const yaAdj = adjExist.ok && Array.isArray(adjExist.value) && (adjExist.value as unknown[]).length > 0;
  if (!yaAdj) {
    const hash = "a".repeat(64);
    unwrap(await k.commands.execute(ctx, "platform.attachment.register", {
      entityRef: activoRef, nombreArchivo: "manual-excavadora.pdf", mimeType: "application/pdf",
      tamanoBytes: 524288, hashSha256: hash,
    }), "attachment activo");
    unwrap(await k.commands.execute(ctx, "platform.attachment.register", {
      entityRef: itemRef, nombreArchivo: "ficha-motor.pdf", mimeType: "application/pdf",
      tamanoBytes: 131072, hashSha256: "b".repeat(64),
    }), "attachment item");
    log("Adjuntos referencia-only registrados (activo + item)");
  } else {
    log("Adjuntos ya existían — sin duplicar");
  }

  // QR: al menos un activo y un item con etiqueta (código determinista, único).
  const emitirQr = async (entityRef: string, codigo: string) => {
    const tags = await k.queries.execute(ctx, "platform.qr.list", {});
    const existe = tags.ok && Array.isArray(tags.value) &&
      (tags.value as { data?: Record<string, unknown> }[]).some((t) => t.data?.["codigo"] === codigo);
    if (existe) return false;
    unwrap(await k.commands.execute(ctx, "platform.qr.issue", { tipo: "qr", entityRef, codigo, acciones: ["open"] }), `qr ${codigo}`);
    return true;
  };
  const q1 = await emitirQr(activoRef, "DEMO-ACT-0001");
  const q2 = await emitirQr(itemRef, "DEMO-ITM-0001");
  await drenarCompleto(k);
  log(`QR generados (activo:${q1 ? "nuevo" : "existía"}, item:${q2 ? "nuevo" : "existía"})`);
}

/* ----------------------- 7) Planes de mantenimiento ---------------------- */
/**
 * Planes de mantenimiento DEMO por VÍAS OFICIALES (comandos del módulo Planes),
 * asociados a los activos DEMO existentes. Cubre el mandato: preventivos,
 * predictivos, de inspección, legales, mensuales, por horómetro y por odómetro;
 * para maquinaria amarilla, bandas, montacargas, empacadoras, compresores y
 * generadores. Publica versiones (estado `vigente`), deja al menos un plan
 * SUSPENDIDO y uno con frecuencia COMBINADA "cada 30 días o 250 horas, lo que
 * ocurra primero". Crea un calendario operacional (festivos/turnos). Después
 * ejecuta la GENERACIÓN preventiva oficial por comandos (evaluar-generacion +
 * orquestación `modulo.ordenes.crear` con opId=claveDedup) para materializar
 * varias OT como evidencia. Idempotente: reejecutar NO duplica (opId/id
 * deterministas + dedup por claveDedup).
 */

/** Catálogos del módulo Planes que consume el dataset demo (upsert idempotente). */
const CATALOGOS_PLANES: [string, string, string][] = [
  ["tipos-plan", "preventivo", "Preventivo"],
  ["tipos-plan", "predictivo", "Predictivo"],
  ["tipos-plan", "inspeccion", "Inspección"],
  ["tipos-plan", "legal", "Legal / Normativo"],
  ["estrategias", "basado-tiempo", "Basado en tiempo"],
  ["estrategias", "basado-condicion", "Basado en condición"],
  ["estrategias", "basado-uso", "Basado en uso"],
  ["estrategias", "normativo", "Normativo"],
  ["prioridades", "alta", "Alta"],
  ["prioridades", "media", "Media"],
  ["prioridades", "critica", "Crítica"],
  ["tipos-calendario", "operacional", "Operacional"],
];

interface DefPlan {
  clave: string; nombre: string; tipoPlan: string; estrategia: string; prioridad: string;
  activo: string; familia: string;
  frecuencia: { reglas: { tipo: string; cada?: number; unidad?: string | null; evento?: string | null }[]; modo?: string };
  suspender?: boolean;
  origen: "manual" | "frecuencia" | "horometro" | "odometro";
}

const PLANES: DefPlan[] = [
  // Preventivo — maquinaria amarilla (excavadora), basado en tiempo (mensual).
  { clave: "PLN-MAQ-PREV", nombre: "Preventivo mensual excavadora", tipoPlan: "preventivo", estrategia: "basado-tiempo", prioridad: "alta",
    activo: "MAQ-001", familia: "maquinaria-amarilla", frecuencia: { reglas: [{ tipo: "meses", cada: 1 }] }, origen: "manual" },
  // Preventivo por HORÓMETRO — montacargas.
  { clave: "PLN-MON-HOR", nombre: "Preventivo por horómetro montacargas", tipoPlan: "preventivo", estrategia: "basado-uso", prioridad: "media",
    activo: "MON-001", familia: "montacargas", frecuencia: { reglas: [{ tipo: "horometro", cada: 500, unidad: "horas" }] }, origen: "manual" },
  // Inspección — banda transportadora (mensual).
  { clave: "PLN-BAN-INS", nombre: "Inspección mensual banda transportadora", tipoPlan: "inspeccion", estrategia: "basado-tiempo", prioridad: "media",
    activo: "BAN-001", familia: "bandas", frecuencia: { reglas: [{ tipo: "meses", cada: 1 }] }, origen: "manual" },
  // Predictivo — empacadora (basado en condición).
  { clave: "PLN-EMP-PRED", nombre: "Predictivo por vibración empacadora", tipoPlan: "predictivo", estrategia: "basado-condicion", prioridad: "alta",
    activo: "EMP-001", familia: "empacadoras", frecuencia: { reglas: [{ tipo: "dias", cada: 15 }] }, origen: "manual" },
  // Preventivo COMBINADO — compresor: "cada 30 días o 250 horas, lo que ocurra primero".
  { clave: "PLN-COM-COMB", nombre: "Preventivo compresor (30 días o 250 h)", tipoPlan: "preventivo", estrategia: "basado-uso", prioridad: "critica",
    activo: "COM-001", familia: "compresores",
    frecuencia: { reglas: [{ tipo: "dias", cada: 30 }, { tipo: "horometro", cada: 250, unidad: "horas" }], modo: "lo-que-ocurra-primero" }, origen: "manual" },
  // Legal / normativo — generador (inspección anual normativa).
  { clave: "PLN-GEN-LEGAL", nombre: "Inspección legal anual generador", tipoPlan: "legal", estrategia: "normativo", prioridad: "critica",
    activo: "GEN-001", familia: "generadores", frecuencia: { reglas: [{ tipo: "meses", cada: 12 }] }, origen: "manual" },
  // Preventivo por ODÓMETRO — camión.
  { clave: "PLN-CAM-ODO", nombre: "Preventivo por odómetro camión", tipoPlan: "preventivo", estrategia: "basado-uso", prioridad: "alta",
    activo: "CAM-001", familia: "camiones", frecuencia: { reglas: [{ tipo: "odometro", cada: 10000, unidad: "kilometros" }] }, origen: "manual" },
  // Preventivo mensual — planta eléctrica (SUSPENDIDO como evidencia de ciclo).
  { clave: "PLN-PLA-SUSP", nombre: "Preventivo mensual planta eléctrica", tipoPlan: "preventivo", estrategia: "basado-tiempo", prioridad: "media",
    activo: "PLA-001", familia: "plantas-electricas", frecuencia: { reglas: [{ tipo: "meses", cada: 1 }] }, suspender: true, origen: "manual" },
];

const CALENDARIO_DEMO_ID = idDet("calendario:operacional");

const rutinaDe = (nombre: string) => ({
  id: idDet(`rutina:${nombre}`),
  nombre: `Rutina · ${nombre}`,
  actividades: [
    { id: "act-1", orden: 0, tipo: "inspeccion", titulo: "Inspección visual y de seguridad" },
    { id: "act-2", orden: 1, tipo: "lubricacion", titulo: "Lubricación de puntos críticos" },
  ],
});

async function seedPlanes(activoIds: Map<string, string>): Promise<void> {
  const rt = planesRuntime();
  const ctx = ctxCon(principalPlanes("seed-demo", "admin"));
  const cmd = (n: string, i: unknown) => rt.platform.kernel.commands.execute(ctx, n, i);
  const q = (n: string, i: unknown) => rt.platform.kernel.queries.execute(ctx, n, i);
  const drain = () => drenarCompleto(rt.platform.kernel);

  // Catálogos del módulo Planes (upsert idempotente).
  for (const [c, k, e] of CATALOGOS_PLANES) unwrap(await cmd("modulo.planes.catalogo-upsert", { catalogo: c, clave: k, etiqueta: e }), `catalogo.planes ${c}/${k}`);
  await drain();
  log(`Catálogos de planes habilitados (${CATALOGOS_PLANES.length})`);

  // Calendario operacional demo (días laborales L-V, festivos y turnos).
  unwrap(await cmd("modulo.planes.crear-calendario", {
    id: CALENDARIO_DEMO_ID, opId: "seed:calendario:operacional",
    tipo: "operacional", ambito: "planta", nombre: "Calendario operacional DEMO",
    diasLaborales: [1, 2, 3, 4, 5],
    festivos: ["2026-01-01", "2026-05-01", "2026-09-16", "2026-12-25"],
    turnos: [
      { clave: "matutino", inicioMin: 360, finMin: 840 },
      { clave: "vespertino", inicioMin: 840, finMin: 1320 },
    ],
  }), "crear-calendario");
  await drain();
  log("Calendario operacional demo creado (festivos + 2 turnos)");

  // Planes: crear → publicar (vigente) → (opcional) suspender. Idempotente por
  // opId/id deterministas y por estado real del aggregate.
  const estadoActual = async (id: string): Promise<{ estado: string; version: number } | null> => {
    const r = await q("modulo.planes.plan", { id });
    if (!r.ok || !r.value) return null;
    const v = r.value as { estado?: string; version?: number };
    return { estado: v.estado ?? "borrador", version: v.version ?? 0 };
  };

  const planIds = new Map<string, string>();
  let vigentes = 0; let suspendidos = 0;

  for (const p of PLANES) {
    const id = idDet(`plan:${p.clave}`);
    planIds.set(p.clave, id);

    unwrap(await cmd("modulo.planes.crear-plan", {
      id, opId: `seed:plan:${p.clave}`,
      nombre: p.nombre, descripcion: `${p.nombre} — activo ${p.activo}`,
      tipoPlan: p.tipoPlan, estrategia: p.estrategia, prioridad: p.prioridad,
      alcance: { activos: [activoIds.get(p.activo) ?? p.activo], familias: [p.familia] },
      rutina: rutinaDe(p.clave),
      programa: {
        frecuencia: p.frecuencia,
        calendarioId: CALENDARIO_DEMO_ID,
        vigenteDesde: "2026-01-01T00:00:00.000Z",
      },
    }), `crear-plan ${p.clave}`);
    await drain();

    // Publicar → vigente (idempotente: sólo si aún en borrador).
    let st = await estadoActual(id);
    if (st && st.estado === "borrador") {
      unwrap(await cmd("modulo.planes.publicar-plan", { id, expectedVersion: st.version, opId: `seed:pub:${p.clave}` }), `publicar-plan ${p.clave}`);
      await drain();
      st = await estadoActual(id);
    }

    // Suspender uno como evidencia de ciclo gobernado.
    if (p.suspender && st && st.estado === "vigente") {
      unwrap(await cmd("modulo.planes.transicionar-plan", {
        id, accion: "suspender", expectedVersion: st.version, motivo: "Parada programada de la planta eléctrica", opId: `seed:susp:${p.clave}`,
      }), `suspender ${p.clave}`);
      await drain();
      st = await estadoActual(id);
    }

    if (st?.estado === "vigente") vigentes++;
    if (st?.estado === "suspendido") suspendidos++;
  }
  log(`Planes creados (${PLANES.length}): ${vigentes} vigentes, ${suspendidos} suspendido(s)`);

  // GENERACIÓN preventiva OFICIAL en dos etapas por comandos del módulo:
  //  (1) `evaluar-generacion` DECIDE la ocurrencia (idempotente por opId +
  //      claveDedup), con ocurrencia manual determinista (sin depender del reloj).
  //  (2) `generar-ordenes-preventivas` MATERIALIZA la generación decidida en una
  //      OT REAL (vía el puerto oficial que compone `modulo.ordenes.crear` con
  //      opId=claveDedup) y persiste ATÓMICAMENTE el vínculo generación→OT
  //      (estado=materializada) — sin generaciones eternamente pendientes.
  let decididas = 0; let ordenesCreadas = 0; let ordenesIdempotentes = 0;

  for (const p of PLANES) {
    if (p.suspender) continue; // no genera desde estados no vigentes
    const id = planIds.get(p.clave)!;
    const activoId = activoIds.get(p.activo) ?? p.activo;
    const ocurrencia = `seed-${p.clave}-2026-01`;

    const gen = unwrap(await cmd("modulo.planes.evaluar-generacion", {
      planId: id, activoId, origen: "manual", ahora: "2026-01-15T08:00:00.000Z",
      anclaje: { desde: "2026-01-01T00:00:00.000Z" }, ocurrenciaManual: ocurrencia,
      opId: `seed:gen:${p.clave}`,
    }), `evaluar-generacion ${p.clave}`) as { corresponde?: boolean; claveDedup?: string };
    await drain();
    if (gen.corresponde !== true || !gen.claveDedup) continue;
    decididas++;

    // Materialización oficial (idempotente): crea la OT REAL y VINCULA la
    // generación. Drena el outbox de Órdenes INMEDIATAMENTE para materializar la
    // OT en su read model antes de que otro runtime reclame esos eventos.
    const mat = unwrap(await cmd("modulo.planes.generar-ordenes-preventivas", {
      planId: id, tipoOrden: "preventiva", opId: `seed:mat:${p.clave}`,
    }), `generar-ordenes-preventivas ${p.clave}`) as {
      ordenesCreadas?: Array<{ idempotente?: boolean }>; errores?: unknown[];
    };
    // Proyecta el vínculo (orden-materializada) al read model de PLANES ANTES de
    // que otro runtime reclame el outbox compartido sin sus handlers. El
    // materializador ya drenó el outbox de Órdenes al crear la OT.
    await drain();
    await drenarCompleto(ordenesRuntime().platform.kernel);
    for (const oc of mat.ordenesCreadas ?? []) {
      if (oc.idempotente === true) ordenesIdempotentes++; else ordenesCreadas++;
    }
  }
  await drenarCompleto(ordenesRuntime().platform.kernel);

  // Reproyección FINAL del módulo Planes desde la bitácora durable: garantiza
  // que el read model refleje TODOS los vínculos generación→OT aunque el drenado
  // del outbox COMPARTIDO entre runtimes haya sido reclamado por otro runtime
  // (sin sus handlers de proyección). Equivalencia por replay determinista.
  unwrap(await cmd("modulo.planes.reproyectar", {}), "reproyectar planes");
  await drain();
  log(`Generación preventiva: ${decididas} decididas, ${ordenesCreadas} OT nuevas, ${ordenesIdempotentes} idempotentes (vínculo generación→OT persistido)`);
}

/* ----------------------- 8) Abastecimiento (compras) --------------------- */
/**
 * Amplía el DEMO con el Módulo Enterprise Procurement (DGP-013) por VÍAS
 * OFICIALES (comandos del módulo + Workflow Engine real), idempotente por
 * id/opId deterministas y drenando el outbox INMEDIATAMENTE tras cada bloque
 * (lección DGP-012: el outbox es COMPARTIDO entre runtimes; hay que materializar
 * las proyecciones propias antes de que otro runtime reclame los eventos).
 *
 * Siembra: catálogos de abastecimiento; ~10 artículos del catálogo maestro
 * LIGADOS a los items de Inventario DEMO; 4 proveedores (contactos +
 * certificaciones + SLA + calificación); 3 solicitudes (origen inventario / OT /
 * usuario, en estados variados incl. aprobada); cotizaciones múltiples para una
 * solicitud con SELECCIÓN; 2 órdenes de compra (una aprobada/enviada sin
 * recepción, otra con recepciones); recepciones (una parcial y una total con
 * novedad) MATERIALIZADAS a Inventario por el comando oficial (movimientos reales
 * + costos en abs_costos_read); historial/timeline poblados.
 *
 * Moneda: se declara el catálogo `monedas` con "USD" (mayúsculas, alineado con
 * Inventario/Activos DEMO); a partir de ahí SÓLO "USD" es válido en el módulo.
 */
const AB_MONEDA = "USD";

/** Catálogos del módulo Abastecimiento que consume el dataset demo (upsert). */
const CATALOGOS_ABS: [string, string, string][] = [
  ["monedas", "USD", "Dólar"],
  ["metodos-valoracion", "promedio-ponderado", "Promedio ponderado"],
  ["metodos-valoracion", "ultimo-costo", "Último costo"],
  ["metodos-valoracion", "costo-estandar", "Costo estándar"],
  ["tipos-articulo", "componente", "Componente"],
  ["tipos-articulo", "lubricante", "Lubricante"],
  ["tipos-articulo", "consumible", "Consumible"],
  ["tipos-articulo", "kit", "Kit"],
  ["tipos-articulo", "herramienta", "Herramienta"],
  ["tipos-articulo", "servicio", "Servicio"],
  ["unidades-medida", "unidad", "Unidad"],
  ["unidades-medida", "litro", "Litro"],
  ["unidades-medida", "kilogramo", "Kilogramo"],
  ["unidades-medida", "juego", "Juego"],
  ["unidades-medida", "servicio", "Servicio"],
  ["tipos-proveedor", "distribuidor", "Distribuidor"],
  ["tipos-proveedor", "fabricante", "Fabricante"],
  ["tipos-proveedor", "mayorista", "Mayorista"],
  ["tipos-proveedor", "servicios", "Servicios"],
  ["certificaciones", "iso-9001", "ISO 9001"],
  ["certificaciones", "iso-14001", "ISO 14001"],
  ["certificaciones", "api", "API"],
  ["prioridades", "alta", "Alta"],
  ["prioridades", "media", "Media"],
  ["prioridades", "critica", "Crítica"],
  ["origenes-solicitud", "inventario", "Inventario"],
  ["origenes-solicitud", "orden", "Orden de trabajo"],
  ["origenes-solicitud", "usuario", "Usuario"],
  ["novedades-recepcion", "ninguna", "Ninguna"],
  ["novedades-recepcion", "averiado", "Averiado"],
  ["novedades-recepcion", "faltante", "Faltante"],
  ["condiciones-pago", "credito-30", "Crédito 30 días"],
  ["condiciones-pago", "contado", "Contado"],
  ["condiciones-entrega", "en-bodega", "En bodega"],
];

/** Artículos del catálogo maestro, ligados (por SKU) a los items de Inventario. */
const ARTICULOS_ABS: {
  clave: string; nombre: string; tipo: string; unidad: string; costo: number; sku?: string;
}[] = [
  { clave: "ART-FIL", nombre: "Filtro de aire HD (compra)", tipo: "componente", unidad: "unidad", costo: 18, sku: "FIL-001" },
  { clave: "ART-ROD", nombre: "Rodamiento SKF 6205 (compra)", tipo: "componente", unidad: "unidad", costo: 9, sku: "ROD-001" },
  { clave: "ART-LUB", nombre: "Lubricante multiuso (compra)", tipo: "lubricante", unidad: "litro", costo: 6, sku: "LUB-001" },
  { clave: "ART-ACE", nombre: "Aceite hidráulico ISO 68 (compra)", tipo: "lubricante", unidad: "litro", costo: 7, sku: "ACE-001" },
  { clave: "ART-GRA", nombre: "Grasa de litio EP2 (compra)", tipo: "lubricante", unidad: "kilogramo", costo: 5, sku: "GRA-001" },
  { clave: "ART-HER", nombre: "Juego de llaves combinadas (compra)", tipo: "herramienta", unidad: "juego", costo: 45, sku: "HER-001" },
  { clave: "ART-CON", nombre: "Trapos industriales (compra)", tipo: "consumible", unidad: "unidad", costo: 2, sku: "CON-001" },
  { clave: "ART-BND", nombre: "Banda en V B-52 (compra)", tipo: "componente", unidad: "unidad", costo: 11, sku: "BND-001" },
  { clave: "ART-MOT", nombre: "Motor eléctrico 5HP (compra)", tipo: "componente", unidad: "unidad", costo: 320, sku: "MOT-001" },
  { clave: "ART-SVC", nombre: "Servicio de calibración de sensores", tipo: "servicio", unidad: "servicio", costo: 150 },
];

/** Proveedores DEMO con contactos, certificaciones y SLA. */
const PROVEEDORES_ABS: {
  clave: string; razonSocial: string; tipo: string; cert: string; calif: { calidad: number; tiempo: number; precio: number; servicio: number };
}[] = [
  { clave: "PRV-ACE", razonSocial: "Aceros y Rodamientos S.A.", tipo: "distribuidor", cert: "iso-9001", calif: { calidad: 5, tiempo: 4, precio: 4, servicio: 5 } },
  { clave: "PRV-LUB", razonSocial: "Lubricantes Industriales Ltda.", tipo: "fabricante", cert: "iso-14001", calif: { calidad: 4, tiempo: 5, precio: 3, servicio: 4 } },
  { clave: "PRV-FER", razonSocial: "Ferretería Mayorista del Norte", tipo: "mayorista", cert: "iso-9001", calif: { calidad: 4, tiempo: 4, precio: 5, servicio: 4 } },
  { clave: "PRV-SVC", razonSocial: "Servicios Técnicos Delta", tipo: "servicios", cert: "api", calif: { calidad: 5, tiempo: 3, precio: 3, servicio: 5 } },
];

async function seedAbastecimiento(): Promise<void> {
  const rt = abastecimientoRuntime();
  const ctx = ctxCon(principalAbastecimiento("seed-demo", "admin"));
  const cmd = (n: string, i: unknown) => rt.platform.kernel.commands.execute(ctx, n, i);
  const q = (n: string, i: unknown) => rt.platform.kernel.queries.execute(ctx, n, i);
  const drain = () => drenarCompleto(rt.platform.kernel);

  // Id determinista LOCAL del módulo: el token discriminante va DELANTE (el
  // hash idDet muestrea con `i % len`, así que prefijos comunes largos podrían
  // colisionar; front-load garantiza unicidad entre artículos/proveedores/etc.).
  const absId = (token: string) => idDet(`${token}:abs-procurement`);

  // Referencias a Inventario DEMO (mismos idDet del seed de Inventario).
  const bodegaCentral = idDet("bodega:central");
  const ubicA = idDet("ubic:A");
  const itemDe = (sku: string) => idDet(`item:${sku}`);

  // (1) Catálogos configurables del módulo (upsert idempotente).
  for (const [c, k, e] of CATALOGOS_ABS) {
    unwrap(await cmd("modulo.abastecimiento.catalogo-upsert", { catalogo: c, clave: k, etiqueta: e }), `catalogo.abs ${c}/${k}`);
  }
  await drain();
  log(`Catálogos de abastecimiento habilitados (${CATALOGOS_ABS.length})`);

  // (2) Artículos del catálogo maestro (ligados a items de Inventario por sku).
  const artId = new Map<string, string>();
  for (const a of ARTICULOS_ABS) {
    const id = absId(`${a.clave}:art`);
    artId.set(a.clave, id);
    unwrap(await cmd("modulo.abastecimiento.crear-articulo", {
      id, opId: `seed:abs:art:${a.clave}`,
      nombre: a.nombre, tipo: a.tipo, unidad: a.unidad,
      metodoValoracion: "promedio-ponderado", moneda: AB_MONEDA, costoEstandar: a.costo,
      ...(a.sku ? { inventarioItemId: itemDe(a.sku) } : {}),
    }), `abs.crear-articulo ${a.clave}`);
  }
  await drain();
  log(`Artículos de abastecimiento creados (${ARTICULOS_ABS.length})`);

  // (3) Proveedores + calificación (idempotente por existencia de versión).
  const provId = new Map<string, string>();
  const provVersion = async (id: string): Promise<number | null> => {
    const r = await q("modulo.abastecimiento.proveedor", { id });
    if (!r.ok || !r.value) return null;
    return (r.value as { version?: number }).version ?? null;
  };
  for (const p of PROVEEDORES_ABS) {
    const id = absId(`${p.clave}:prov`);
    provId.set(p.clave, id);
    unwrap(await cmd("modulo.abastecimiento.crear-proveedor", {
      id, opId: `seed:abs:prov:${p.clave}`,
      razonSocial: p.razonSocial, tipo: p.tipo, monedaPreferida: AB_MONEDA,
      contactos: [{ nombre: "Contacto Comercial", cargo: "Ventas", email: `ventas@${p.clave.toLowerCase()}.demo`, principal: true }],
      certificaciones: [{ tipo: p.cert, numero: `CERT-${p.clave}`, vigenteHasta: "2027-12-31", emisor: "Ente Certificador" }],
      sla: { plazoEntregaDias: 7, nivelCumplimientoObjetivo: 0.95, penalizacionPorDia: 10 },
    }), `abs.crear-proveedor ${p.clave}`);
  }
  await drain();
  // Calificación (sólo si aún no calificado: idempotente por opId + expectedVersion actual).
  let calificados = 0;
  for (const p of PROVEEDORES_ABS) {
    const id = provId.get(p.clave)!;
    const v = await provVersion(id);
    if (v == null) continue;
    // Si el proveedor sigue en versión 1 (recién creado) lo calificamos una vez.
    if (v === 1) {
      unwrap(await cmd("modulo.abastecimiento.calificar-proveedor", {
        id, expectedVersion: v, opId: `seed:abs:calif:${p.clave}`,
        calidad: p.calif.calidad, tiempo: p.calif.tiempo, precio: p.calif.precio, servicio: p.calif.servicio,
        nota: "Calificación inicial DEMO",
      }), `abs.calificar ${p.clave}`);
      calificados++;
      await drain();
    }
  }
  log(`Proveedores de abastecimiento creados (${PROVEEDORES_ABS.length}), calificados ${calificados}`);

  // (4) Solicitudes de compra (origen inventario / OT / usuario), estados variados.
  const solEstado = async (id: string): Promise<{ estado: string; version: number } | null> => {
    const r = await q("modulo.abastecimiento.solicitud", { id });
    if (!r.ok || !r.value) return null;
    const v = r.value as { estado?: string; version?: number };
    return { estado: v.estado ?? "borrador", version: v.version ?? 0 };
  };
  const transicionarSolicitud = async (id: string, acciones: string[]) => {
    for (const accion of acciones) {
      const st = await solEstado(id);
      if (!st) break;
      // Idempotencia: no re-enviar si ya avanzó más allá.
      if (accion === "enviar" && st.estado !== "borrador") continue;
      if (accion === "aprobar" && st.estado !== "enviada") continue;
      unwrap(await cmd("modulo.abastecimiento.transicionar-solicitud", {
        id, accion, expectedVersion: st.version, opId: `seed:abs:sol-tr:${id}:${accion}`,
      }), `abs.transicionar-solicitud ${accion}`);
      await drain();
    }
  };

  const otServicioGenerador = idDet("orden:OT · Servicio generador");
  const solInvId = absId("SC-INV:sol");
  const solOtId = absId("SC-OT:sol");
  const solUsrId = absId("SC-USR:sol");

  unwrap(await cmd("modulo.abastecimiento.crear-solicitud", {
    id: solInvId, opId: "seed:abs:sol:SC-INV",
    titulo: "Reposición por bajo stock de filtros y rodamientos", prioridad: "alta",
    origen: { tipo: "inventario", referenciaId: itemDe("FIL-001"), referenciaTipo: "inventario-item" },
    lineas: [
      { numero: 1, articuloId: artId.get("ART-FIL"), cantidad: { valor: 30, unidad: "unidad" } },
      { numero: 2, articuloId: artId.get("ART-ROD"), cantidad: { valor: 20, unidad: "unidad" } },
    ],
  }), "abs.crear-solicitud SC-INV");
  unwrap(await cmd("modulo.abastecimiento.crear-solicitud", {
    id: solOtId, opId: "seed:abs:sol:SC-OT",
    titulo: "Insumos para servicio del generador", prioridad: "critica",
    origen: { tipo: "orden", referenciaId: otServicioGenerador, referenciaTipo: "orden-trabajo" },
    lineas: [
      { numero: 1, articuloId: artId.get("ART-ACE"), cantidad: { valor: 40, unidad: "litro" } },
      { numero: 2, articuloId: artId.get("ART-GRA"), cantidad: { valor: 10, unidad: "kilogramo" } },
    ],
  }), "abs.crear-solicitud SC-OT");
  unwrap(await cmd("modulo.abastecimiento.crear-solicitud", {
    id: solUsrId, opId: "seed:abs:sol:SC-USR",
    titulo: "Herramienta manual solicitada por taller", prioridad: "media",
    origen: { tipo: "usuario", referenciaId: null, referenciaTipo: null },
    lineas: [{ numero: 1, articuloId: artId.get("ART-HER"), cantidad: { valor: 3, unidad: "juego" } }],
  }), "abs.crear-solicitud SC-USR");
  await drain();

  // Estados variados: SC-INV → aprobada; SC-OT → enviada; SC-USR → borrador.
  await transicionarSolicitud(solInvId, ["enviar", "aprobar"]);
  await transicionarSolicitud(solOtId, ["enviar"]);
  log("Solicitudes de compra creadas (3: aprobada / enviada / borrador)");

  // (5) Cotizaciones múltiples para SC-INV + selección de la mejor.
  const cotAceId = absId("ACE:cot");
  const cotFerId = absId("FER:cot");
  const lineasCotFil = (precioFil: number, precioRod: number) => [
    { numero: 1, articuloId: artId.get("ART-FIL"), cantidad: { valor: 30, unidad: "unidad" }, precioUnitario: { moneda: AB_MONEDA, monto: precioFil }, plazoEntregaDias: 6 },
    { numero: 2, articuloId: artId.get("ART-ROD"), cantidad: { valor: 20, unidad: "unidad" }, precioUnitario: { moneda: AB_MONEDA, monto: precioRod }, plazoEntregaDias: 6 },
  ];
  unwrap(await cmd("modulo.abastecimiento.registrar-cotizacion", {
    id: cotAceId, opId: "seed:abs:cot:SC-INV:ACE", solicitudId: solInvId, proveedorId: provId.get("PRV-ACE"),
    moneda: AB_MONEDA, lineas: lineasCotFil(18, 9),
  }), "abs.registrar-cotizacion ACE");
  unwrap(await cmd("modulo.abastecimiento.registrar-cotizacion", {
    id: cotFerId, opId: "seed:abs:cot:SC-INV:FER", solicitudId: solInvId, proveedorId: provId.get("PRV-FER"),
    moneda: AB_MONEDA, lineas: lineasCotFil(20, 10),
  }), "abs.registrar-cotizacion FER");
  await drain();
  // Selecciona explícitamente la cotización de PRV-ACE (mejor precio total).
  unwrap(await cmd("modulo.abastecimiento.seleccionar-cotizacion", {
    solicitudId: solInvId, cotizacionId: cotAceId, opId: "seed:abs:sel:SC-INV",
  }), "abs.seleccionar-cotizacion SC-INV");
  await drain();
  log("Cotizaciones registradas (2 para SC-INV) y seleccionada la mejor");

  // (6) Órdenes de compra. Helper: crear → aprobar → enviar (idempotente).
  const ocEstado = async (id: string): Promise<{ estado: string; version: number } | null> => {
    const r = await q("modulo.abastecimiento.orden-compra", { id });
    if (!r.ok || !r.value) return null;
    const v = r.value as { estado?: string; version?: number };
    return { estado: v.estado ?? "borrador", version: v.version ?? 0 };
  };
  const ORDEN_OC = ["borrador", "aprobada", "enviada", "parcialmenteRecibida", "recibida"];
  const transicionarOC = async (id: string, acciones: string[]) => {
    for (const accion of acciones) {
      const st = await ocEstado(id);
      if (!st) break;
      const objetivo = accion === "aprobar" ? "aprobada" : accion === "enviar" ? "enviada" : "";
      if (objetivo && ORDEN_OC.indexOf(st.estado) >= ORDEN_OC.indexOf(objetivo)) continue;
      unwrap(await cmd("modulo.abastecimiento.transicionar-orden-compra", {
        id, accion, expectedVersion: st.version, opId: `seed:abs:oc-tr:${id}:${accion}`,
      }), `abs.transicionar-orden-compra ${accion}`);
      await drain();
    }
  };

  // OC-A: aprobada/enviada, SIN recepción (lubricantes para SC-OT).
  const ocAId = absId("OC-A:oc");
  unwrap(await cmd("modulo.abastecimiento.crear-orden-compra", {
    id: ocAId, opId: "seed:abs:oc:OC-A", proveedorId: provId.get("PRV-LUB"),
    solicitudId: solOtId, moneda: AB_MONEDA, condicionesPago: "credito-30", condicionesEntrega: "en-bodega",
    lineas: [
      { numero: 1, articuloId: artId.get("ART-ACE"), cantidad: { valor: 40, unidad: "litro" }, precioUnitario: { moneda: AB_MONEDA, monto: 7 }, toleranciaSobreRecepcion: 0.05,
        referencia: { tipo: "inventario-item", id: itemDe("ACE-001") }, bodega: { tipo: "bodega", id: bodegaCentral } },
      { numero: 2, articuloId: artId.get("ART-GRA"), cantidad: { valor: 10, unidad: "kilogramo" }, precioUnitario: { moneda: AB_MONEDA, monto: 5 }, toleranciaSobreRecepcion: 0.05,
        referencia: { tipo: "inventario-item", id: itemDe("GRA-001") }, bodega: { tipo: "bodega", id: bodegaCentral } },
    ],
  }), "abs.crear-orden-compra OC-A");
  await drain();
  await transicionarOC(ocAId, ["aprobar", "enviar"]);

  // OC-B: aprobada/enviada, CON recepciones (filtros/rodamientos de SC-INV).
  const ocBId = absId("OC-B:oc");
  unwrap(await cmd("modulo.abastecimiento.crear-orden-compra", {
    id: ocBId, opId: "seed:abs:oc:OC-B", proveedorId: provId.get("PRV-ACE"),
    solicitudId: solInvId, cotizacionId: cotAceId, moneda: AB_MONEDA,
    condicionesPago: "credito-30", condicionesEntrega: "en-bodega",
    lineas: [
      { numero: 1, articuloId: artId.get("ART-FIL"), cantidad: { valor: 30, unidad: "unidad" }, precioUnitario: { moneda: AB_MONEDA, monto: 18 }, toleranciaSobreRecepcion: 0.1,
        referencia: { tipo: "inventario-item", id: itemDe("FIL-001") }, bodega: { tipo: "bodega", id: bodegaCentral } },
      { numero: 2, articuloId: artId.get("ART-ROD"), cantidad: { valor: 20, unidad: "unidad" }, precioUnitario: { moneda: AB_MONEDA, monto: 9 }, toleranciaSobreRecepcion: 0.1,
        referencia: { tipo: "inventario-item", id: itemDe("ROD-001") }, bodega: { tipo: "bodega", id: bodegaCentral } },
    ],
  }), "abs.crear-orden-compra OC-B");
  await drain();
  await transicionarOC(ocBId, ["aprobar", "enviar"]);
  log("Órdenes de compra creadas (2: OC-A enviada sin recepción, OC-B enviada con recepciones)");

  // (7) Recepciones sobre OC-B: una PARCIAL y una TOTAL (con novedad), cada una
  // MATERIALIZADA a Inventario por el comando oficial. Idempotente por
  // id/opId/expectedVersion (se salta si la OC ya está recibida).
  const recParcialId = absId("OCB-parcial:rec");
  const recTotalId = absId("OCB-total:rec");
  const materializar = async (recepcionId: string) => {
    unwrap(await cmd("modulo.abastecimiento.materializar-recepcion", {
      recepcionId, opId: `seed:abs:mat:${recepcionId}`,
      bodegaId: bodegaCentral, ubicacionId: ubicA,
    }), `abs.materializar-recepcion ${recepcionId}`);
    await drain();
    // El materializador ya drenó el outbox de Inventario al crear el movimiento;
    // se refuerza para asegurar la proyección del movimiento en su read model.
    await drenarCompleto(inventarioRuntime().platform.kernel);
  };

  let recepcionesHechas = 0;
  const stOcB = await ocEstado(ocBId);
  if (stOcB && stOcB.estado === "enviada") {
    // Recepción PARCIAL: filtros 20/30, rodamientos 12/20. Ambos items son
    // TRAZADOS POR LOTE en Inventario ⇒ la línea aporta el `lote` existente para
    // que el movimiento oficial (`mover`) impute a ese lote.
    const parcial = unwrap(await cmd("modulo.abastecimiento.registrar-recepcion", {
      id: recParcialId, opId: "seed:abs:rec:OC-B:parcial", ordenCompraId: ocBId, expectedVersion: stOcB.version,
      lineas: [
        { numeroLineaOC: 1, cantidad: { valor: 20, unidad: "unidad" }, lote: "L-FIL-2601", bodega: { tipo: "bodega", id: bodegaCentral } },
        { numeroLineaOC: 2, cantidad: { valor: 12, unidad: "unidad" }, lote: "L-ROD-2601", bodega: { tipo: "bodega", id: bodegaCentral } },
      ],
    }), "abs.registrar-recepcion parcial") as { recepcionId: string; version: number; estadoOrden: string };
    await drain();
    await materializar(parcial.recepcionId);
    recepcionesHechas++;

    // Recepción TOTAL del remanente: filtros 10/10, rodamientos 8 con NOVEDAD (1 averiado).
    const stTras = await ocEstado(ocBId);
    const total = unwrap(await cmd("modulo.abastecimiento.registrar-recepcion", {
      id: recTotalId, opId: "seed:abs:rec:OC-B:total", ordenCompraId: ocBId, expectedVersion: stTras?.version ?? parcial.version,
      lineas: [
        { numeroLineaOC: 1, cantidad: { valor: 10, unidad: "unidad" }, lote: "L-FIL-2601", bodega: { tipo: "bodega", id: bodegaCentral } },
        { numeroLineaOC: 2, cantidad: { valor: 8, unidad: "unidad" }, novedad: "averiado", notaNovedad: "1 rodamiento con daño de transporte", bodega: { tipo: "bodega", id: bodegaCentral } },
      ],
    }), "abs.registrar-recepcion total") as { recepcionId: string; estadoOrden: string };
    await drain();
    await materializar(total.recepcionId);
    recepcionesHechas++;
  }
  await drain();
  await drenarCompleto(inventarioRuntime().platform.kernel);

  // Reproyección FINAL del módulo desde su bitácora durable (equivalencia por
  // replay) por si el outbox COMPARTIDO fue reclamado por otro runtime.
  unwrap(await cmd("modulo.abastecimiento.reproyectar", {}), "reproyectar abastecimiento");
  await drain();
  log(`Recepciones de abastecimiento: ${recepcionesHechas} (parcial + total con novedad) materializadas a Inventario`);
}

/* ------------------------------- Orquestación ---------------------------- */

export async function seedDeltaDemo(): Promise<void> {
  console.log(`\nSeed DEMO oficial DGP-011.3 — tenant "${DEMO_TENANT}" (${DEMO_EMPRESA})`);
  await seedAdmin();
  await seedCatalogos();
  const activoIds = await seedActivos();
  await seedOrdenes();
  await seedInventario();
  await seedPlanes(activoIds);
  await seedAbastecimiento();
  await seedPlataforma(activoIds);
  console.log("Seed DEMO completado.\n");
}

// Ejecución directa (tsx/node): sólo cuando se corre como script principal.
const esMain = (() => {
  try {
    return typeof process !== "undefined" && Array.isArray(process.argv) &&
      process.argv[1] != null && import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (esMain) {
  seedDeltaDemo()
    .then(() => pool.end())
    .catch((err) => {
      console.error("Seed DEMO falló:", err);
      process.exit(1);
    });
}
