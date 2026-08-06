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

/* ------------------------------- Orquestación ---------------------------- */

export async function seedDeltaDemo(): Promise<void> {
  console.log(`\nSeed DEMO oficial DGP-011.3 — tenant "${DEMO_TENANT}" (${DEMO_EMPRESA})`);
  await seedAdmin();
  await seedCatalogos();
  const activoIds = await seedActivos();
  await seedOrdenes();
  await seedInventario();
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
