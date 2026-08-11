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
 * CREDENCIALES: NO se escriben literales de contraseña en este archivo. Todas
 * provienen de `credencialDemo(envKey)` (única fuente de defaults dev), que lee
 * `process.env` y en producción EXIGE la variable.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { credencialDemo, CLAVES_ENV } from "./seed-credentials";
import { db, pool, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Principal, Result } from "@workspace/kernel";
import { createExecutionContext } from "@workspace/kernel";
import { DELTA_DEMO_TENANT } from "../routes/deltaops/reference-runtime";
import { activosRuntime, principalActivos } from "../routes/deltaops/activos-runtime";
import { ordenesRuntime, principalOrdenes } from "../routes/deltaops/ordenes-runtime";
import { inventarioRuntime, principalInventario } from "../routes/deltaops/inventario-runtime";
import { planesRuntime, principalPlanes } from "../routes/deltaops/planes-runtime";
import { abastecimientoRuntime, principalAbastecimiento } from "../routes/deltaops/abastecimiento-runtime";
import { preventivoRuntime, principalPreventivo } from "../routes/deltaops/preventivo-runtime";
import { correctivoRuntime, principalCorrectivo, formulariosRuntime, contextForFormularios } from "../routes/deltaops/correctivo-runtime";
import { analyticsRuntime, principalAnalytics } from "../routes/deltaops/analytics-runtime";
import { utilizacionRuntime, principalUtilizacion } from "../routes/deltaops/utilizacion-runtime";
import { MODULO as MODULO_UTL } from "@workspace/module-utilizacion";

/* ------------------------------ Identidad DEMO --------------------------- */

export const DEMO_TENANT = DELTA_DEMO_TENANT;
export const DEMO_EMPRESA = "DELTA DEMO";
export const DEMO_ADMIN = {
  email: "admin@delta.demo",
  nombre: "Carlos Pacheco",
  cargo: "Director TIC",
  rol: "admin",
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

/* --------------------------- 0) Wipe idempotente ------------------------- */

/**
 * WIPE idempotente del tenant DEMO (patrón DGP-015): antes de re-sembrar,
 * elimina TODO rastro de `delta-demo` para garantizar conteos deterministas
 * aunque la base traiga estado desviado de fases anteriores. Se ejecuta en una
 * transacción con `session_replication_role = replica` para omitir triggers/FK
 * durante el borrado. NO toca otros tenants (borra sólo por `tenant_id`), ni el
 * usuario admin (se reafirma idempotentemente en `seedAdmin`). El `kernel_outbox`
 * global se acota por `payload->>'tenantId'`. Sólo actúa sobre la base real.
 */
async function wipeDeltaDemo(): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    await cliente.query("set local session_replication_role = replica");
    // Todas las tablas del esquema deltaops con columna tenant_id.
    const { rows } = await cliente.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'deltaops' AND column_name = 'tenant_id'
        GROUP BY table_name ORDER BY table_name`,
    );
    for (const { table_name } of rows) {
      await cliente.query(`DELETE FROM deltaops.${table_name} WHERE tenant_id = $1`, [DEMO_TENANT]);
    }
    // Outbox/dead-letter globales: acotar por el tenant en el payload.
    await cliente.query(`DELETE FROM deltaops.kernel_outbox WHERE payload->>'tenantId' = $1`, [DEMO_TENANT]);
    await cliente.query(`DELETE FROM deltaops.kernel_dead_letter WHERE payload->>'tenantId' = $1`, [DEMO_TENANT]);
    await cliente.query("commit");
    log(`Wipe DEMO: ${rows.length} tablas purgadas para tenant ${DEMO_TENANT}`);
  } catch (err) {
    await cliente.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    cliente.release();
  }
}

/* --------------------------- 1) Usuario admin ---------------------------- */

async function seedAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash(credencialDemo(CLAVES_ENV.DEMO_ADMIN), 10);
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

/* ----------------- 1b) Identidad Enterprise DEMO (DGP-017) --------------- */
/**
 * DGP-017 — Siembra idempotente del modelo Enterprise para el tenant DEMO:
 *   - `ten_tenants`: tenant DEMO de primera clase con branding DELTA/DEMO oficial,
 *     configuración y TODOS los módulos habilitados.
 *   - `idn_roles`: roles del sistema por tenant.
 *   - Identidades + membresías de prueba por rol (admin, supervisor, planificador,
 *     técnico, consulta). Las CONTRASEÑAS provienen EXCLUSIVAMENTE de variables de
 *     entorno con defaults de desarrollo (nunca en documentación ni git).
 * El admin DEMO (`admin@delta.demo`) se promueve también a identidad/membresía.
 */
export const DEMO_BRANDING = {
  nombre: "DELTA DEMO",
  nombreApp: "DeltaOps",
  colorPrimario: "#0B5FFF",
  colorSecundario: "#0A2540",
} as const;

/** Usuarios de prueba por rol (credenciales SOLO por env con default dev). */
export const DEMO_USUARIOS = [
  { email: "admin@delta.demo", nombre: "Carlos Pacheco", rol: "TENANT_ADMIN", envPass: CLAVES_ENV.DEMO_ADMIN },
  { email: "supervisor@delta.demo", nombre: "María Fuentes", rol: "SUPERVISOR", envPass: CLAVES_ENV.DEMO_SUPERVISOR },
  { email: "planificador@delta.demo", nombre: "Jorge Rivas", rol: "PLANIFICADOR", envPass: CLAVES_ENV.DEMO_PLANIFICADOR },
  { email: "tecnico@delta.demo", nombre: "Ana Soto", rol: "TECNICO", envPass: CLAVES_ENV.DEMO_TECNICO },
  { email: "consulta@delta.demo", nombre: "Luis Vega", rol: "CONSULTA", envPass: CLAVES_ENV.DEMO_CONSULTA },
] as const;

async function seedEnterpriseIdentity(): Promise<void> {
  const { seedRolesDeTenant } = await import("../deltaops/identity/seed-roles");
  const { crearTenant, crearIdentidad, crearMembresia, actualizarPassword, actualizarModulos } =
    await import("../deltaops/identity/service");
  const { hashPassword } = await import("../deltaops/identity/crypto");

  const modulosDemo = [
    "referencia", "activos", "ordenes", "inventario", "planes",
    "abastecimiento", "preventivo", "correctivo", "analytics", "utilizacion",
  ];
  await crearTenant({
    tenantId: DEMO_TENANT,
    codigo: "DELTA-DEMO",
    nombreComercial: DEMO_EMPRESA,
    razonSocial: "Delta Demo S.A.",
    idTributaria: "76.000.000-0",
    zonaHoraria: "America/Santiago",
    idioma: "es",
    moneda: "CLP",
    modulos: modulosDemo,
    branding: { ...DEMO_BRANDING },
    configuracion: { formatoFecha: "dd-MM-yyyy", formatoNumerico: "es-CL" },
  });
  // `crearTenant` (ON CONFLICT DO UPDATE) NO refresca `modulos` de un tenant
  // preexistente; reafirmamos explícitamente la lista de módulos habilitados
  // para que un tenant creado antes de añadir un módulo (p. ej. `utilizacion`)
  // quede correctamente entitled tras re-sembrar (idempotente).
  await actualizarModulos(DEMO_TENANT, modulosDemo);
  await seedRolesDeTenant(DEMO_TENANT);

  for (const u of DEMO_USUARIOS) {
    const password = credencialDemo(u.envPass);
    const passwordHash = await hashPassword(password);
    const identidad = await crearIdentidad({
      email: u.email,
      nombre: u.nombre,
      passwordHash,
      estado: "ACTIVO",
    });
    // `crearIdentidad` es idempotente por email y NO actualiza el hash de una
    // identidad existente; se reafirma la credencial DEMO para que el seed sea
    // reproducible también en credenciales (única fuente: credencialDemo).
    await actualizarPassword(identidad.identityId, passwordHash);
    await crearMembresia({ identityId: identidad.identityId, tenantId: DEMO_TENANT, rol: u.rol });
  }

  // Administrador de PLATAFORMA (SUPER_ADMIN) del tenant principal `deltaops`.
  // Garantiza que NINGUNA sesión válida carezca de identidad Enterprise: la fila
  // legacy histórica (`admin@deltaops.dev`) se modela como identidad+membresía.
  const platformPass = credencialDemo(CLAVES_ENV.PLATFORM_ADMIN);
  const platformAdmin = await crearIdentidad({
    email: "admin@deltaops.dev",
    nombre: "Administrador de Plataforma",
    passwordHash: await hashPassword(platformPass),
    estado: "ACTIVO",
  });
  const { seedRolesDeTenant: seedRolesPlat } = await import("../deltaops/identity/seed-roles");
  const { crearTenant: crearTenantPlat, actualizarModulos: actualizarModulosPlat } =
    await import("../deltaops/identity/service");
  await crearTenantPlat({
    tenantId: "deltaops",
    codigo: "DELTAOPS",
    nombreComercial: "DeltaOps",
    zonaHoraria: "America/Santiago",
    idioma: "es",
    moneda: "CLP",
    modulos: modulosDemo,
    branding: { nombre: "DeltaOps", nombreApp: "DeltaOps" },
  });
  // Reafirma módulos habilitados del tenant de plataforma (ver nota arriba).
  await actualizarModulosPlat("deltaops", modulosDemo);
  await seedRolesPlat("deltaops");
  await crearMembresia({ identityId: platformAdmin.identityId, tenantId: "deltaops", rol: "SUPER_ADMIN" });

  log(`Enterprise DEMO: tenant + ${DEMO_USUARIOS.length} identidades/membresías + admin plataforma sembrados`);
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
    // Unidades de medición de medidores (usadas por Utilización al propagar el
    // último valor válido a Activos vía actualizar-horometro/odometro).
    ["unidades", "h", "Horas"], ["unidades", "km", "Kilómetros"],
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

async function seedInventario(): Promise<Map<string, string>> {
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
  // Devuelve los inventarioId por SKU (existencias reales) para que Correctivo
  // pueda reservar/consumir/devolver repuestos sobre stock REAL del DEMO.
  return c.invIds;
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

/* ------------------- 8) Mantenimiento preventivo (DGP-014) --------------- */
/**
 * Amplía el tenant DEMO con el módulo PREVENTIVO por VÍAS OFICIALES (comandos del
 * módulo `modulo.preventivo.*` + orquestación real vía MaterializadorOrdenes):
 *   · Catálogos (tipos-programa, motivos reprogramación/suspensión/exclusión,
 *     roles-personal, tipos-recurso, clasificaciones-sla).
 *   · 3 programas PUBLICADOS (crear → enviarRevision → publicar) sobre planes
 *     DEMO vigentes de `modulo.planes` y activos DEMO, con jerarquía padre→hijo,
 *     vigencias variadas y SLA.
 *   · ~8 actividades con dependencias (DAG real), checklists anclados a plantillas
 *     de formularios, recursos (personal/herramientas/repuestos ligados a
 *     artículos/items DEMO reales), tiempos y costos estimados.
 *   · GENERACIÓN oficial (`generar`) para varios vencimientos ⇒ OT preventivas
 *     REALES materializadas por el MaterializadorOrdenes (opId=claveDedup, id de
 *     OT derivado de la generación ⇒ sin duplicados; idempotente al re-sembrar).
 *   · 1 reprogramación + 1 suspensión parcial + 1 exclusión con motivos de
 *     catálogo (para que el calendario DEMO muestre todos los estados).
 *
 * IDEMPOTENTE: id/opId deterministas + guardas por estado real del aggregate.
 * El `absId` (aquí prefijo `prv:`) lleva un token discriminante AL INICIO.
 */

/**
 * Id DETERMINISTA fuerte (UUIDv5 sobre SHA-1) con token discriminante `prv:` AL
 * INICIO de la semilla. A diferencia del `idDet` genérico (suficiente para las
 * claves cortas del resto del seed), aquí las semillas son largas y numerosas;
 * un hash criptográfico evita colisiones entre actividades/programas.
 */
function prvId(seed: string): string {
  const hash = createHash("sha1").update(`prv:${seed}`).digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // versión 5
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC-4122
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface DefActividadPrv {
  clave: string; nombre: string; orden: number; dependencias: string[];
  checklist: { plantillaId: string; version: number };
  tiempo: { valor: number; unidad: string };
  recursos: Record<string, unknown>;
}

/** Programas preventivos DEMO (uno raíz + un hijo ⇒ jerarquía padre→hijo). */
interface DefProgramaPrv {
  clave: string; nombre: string; tipo: string; clasificacion: string;
  padre?: string; plan: string; planActivo: string; activos: string[];
  vigencia: { desde: string; hasta: string | null };
  sla: { clasificacion: string; ventanaRespuestaHoras: number; ventanaCumplimientoHoras: number; toleranciaHoras?: number };
  actividades: DefActividadPrv[];
}

const PROGRAMAS_PRV: DefProgramaPrv[] = [
  // RAÍZ — servicio mayor excavadora (basado en plan preventivo mensual DEMO).
  {
    clave: "PRV-MAQ-MAYOR", nombre: "Servicio mayor excavadora CAT 320",
    tipo: "servicio-mayor", clasificacion: "operativo",
    plan: "PLN-MAQ-PREV", planActivo: "MAQ-001", activos: ["MAQ-001"],
    vigencia: { desde: "2026-01-01T00:00:00.000Z", hasta: "2026-12-31T23:59:59.000Z" },
    sla: { clasificacion: "critico", ventanaRespuestaHoras: 8, ventanaCumplimientoHoras: 72, toleranciaHoras: 12 },
    actividades: [
      { clave: "A1", nombre: "Inspección visual y bloqueo/etiquetado", orden: 1, dependencias: [],
        checklist: { plantillaId: "chk-inspeccion-general", version: 1 }, tiempo: { valor: 1, unidad: "horas" },
        recursos: { personal: [{ rol: "tecnico", cantidad: 1, horasPorPersona: 1, costoHora: { moneda: "usd", monto: 12 } }],
          herramientas: [{ tipo: "manual", descripcion: "Kit de bloqueo LOTO", cantidad: 1 }] } },
      { clave: "A2", nombre: "Cambio de aceite y filtros", orden: 2, dependencias: ["A1"],
        checklist: { plantillaId: "chk-cambio-aceite", version: 1 }, tiempo: { valor: 2, unidad: "horas" },
        recursos: {
          personal: [{ rol: "tecnico-lider", cantidad: 1, horasPorPersona: 2, costoHora: { moneda: "usd", monto: 18 } }],
          herramientas: [{ tipo: "manual", descripcion: "Juego de llaves", cantidad: 1, referencia: { tipo: "inventario-item", id: "HER-001", etiqueta: "Juego de llaves combinadas" } }],
          repuestos: [
            { referencia: { tipo: "inventario-item", id: "ACE-001", etiqueta: "Aceite hidráulico ISO 68" }, cantidad: 20, unidad: "litros", costoUnitario: { moneda: "usd", monto: 6 } },
            { referencia: { tipo: "inventario-item", id: "FIL-001", etiqueta: "Filtro de aire HD" }, cantidad: 2, unidad: "unidad", costoUnitario: { moneda: "usd", monto: 22 } },
          ] } },
      { clave: "A3", nombre: "Engrase de puntos críticos", orden: 3, dependencias: ["A1"],
        checklist: { plantillaId: "chk-engrase", version: 1 }, tiempo: { valor: 1, unidad: "horas" },
        recursos: {
          personal: [{ rol: "auxiliar", cantidad: 1, horasPorPersona: 1, costoHora: { moneda: "usd", monto: 8 } }],
          repuestos: [{ referencia: { tipo: "inventario-item", id: "GRA-001", etiqueta: "Grasa de litio EP2" }, cantidad: 2, unidad: "kilogramos", costoUnitario: { moneda: "usd", monto: 9 } }] } },
      { clave: "A4", nombre: "Prueba funcional y desbloqueo", orden: 4, dependencias: ["A2", "A3"],
        checklist: { plantillaId: "chk-prueba-funcional", version: 1 }, tiempo: { valor: 1, unidad: "horas" },
        recursos: { personal: [{ rol: "supervisor", cantidad: 1, horasPorPersona: 1, costoHora: { moneda: "usd", monto: 25 } }] } },
    ],
  },
  // HIJO — lubricación menor (rutina anidada bajo el servicio mayor: padre→hijo).
  {
    clave: "PRV-MAQ-LUBRIC", nombre: "Lubricación semanal excavadora",
    tipo: "lubricacion", clasificacion: "operativo", padre: "PRV-MAQ-MAYOR",
    plan: "PLN-MAQ-PREV", planActivo: "MAQ-001", activos: ["MAQ-001"],
    vigencia: { desde: "2026-02-01T00:00:00.000Z", hasta: null },
    sla: { clasificacion: "medio", ventanaRespuestaHoras: 24, ventanaCumplimientoHoras: 48 },
    actividades: [
      { clave: "B1", nombre: "Engrase rápido de articulaciones", orden: 1, dependencias: [],
        checklist: { plantillaId: "chk-engrase", version: 1 }, tiempo: { valor: 0.5, unidad: "horas" },
        recursos: {
          personal: [{ rol: "auxiliar", cantidad: 1, horasPorPersona: 0.5, costoHora: { moneda: "usd", monto: 8 } }],
          repuestos: [{ referencia: { tipo: "inventario-item", id: "GRA-001", etiqueta: "Grasa de litio EP2" }, cantidad: 1, unidad: "kilogramos", costoUnitario: { moneda: "usd", monto: 9 } }] } },
      { clave: "B2", nombre: "Verificación de niveles", orden: 2, dependencias: ["B1"],
        checklist: { plantillaId: "chk-inspeccion-general", version: 1 }, tiempo: { valor: 0.5, unidad: "horas" },
        recursos: { personal: [{ rol: "tecnico", cantidad: 1, horasPorPersona: 0.5, costoHora: { moneda: "usd", monto: 12 } }] } },
    ],
  },
  // INDEPENDIENTE — inspección banda transportadora (otro activo/plan DEMO).
  {
    clave: "PRV-BAN-INSP", nombre: "Inspección mensual banda transportadora",
    tipo: "ruta", clasificacion: "seguridad",
    plan: "PLN-BAN-INS", planActivo: "BAN-001", activos: ["BAN-001"],
    vigencia: { desde: "2026-01-15T00:00:00.000Z", hasta: "2026-07-15T23:59:59.000Z" },
    sla: { clasificacion: "alto", ventanaRespuestaHoras: 12, ventanaCumplimientoHoras: 36, toleranciaHoras: 6 },
    actividades: [
      { clave: "C1", nombre: "Inspección de bandas y rodillos", orden: 1, dependencias: [],
        checklist: { plantillaId: "chk-inspeccion-general", version: 1 }, tiempo: { valor: 1, unidad: "horas" },
        recursos: {
          personal: [{ rol: "tecnico", cantidad: 1, horasPorPersona: 1, costoHora: { moneda: "usd", monto: 12 } }],
          repuestos: [{ referencia: { tipo: "inventario-item", id: "BND-001", etiqueta: "Banda en V B-52" }, cantidad: 1, unidad: "unidad", costoUnitario: { moneda: "usd", monto: 15 } }] } },
      { clave: "C2", nombre: "Ajuste de tensión y alineación", orden: 2, dependencias: ["C1"],
        checklist: { plantillaId: "chk-ajuste", version: 1 }, tiempo: { valor: 1.5, unidad: "horas" },
        recursos: { personal: [{ rol: "especialista", cantidad: 1, horasPorPersona: 1.5, costoHora: { moneda: "usd", monto: 20 } }] } },
    ],
  },
];

/** Catálogos del módulo Preventivo que consume el dataset demo (upsert idempotente). */
const CATALOGOS_PRV: [string, string, string][] = [
  ["tipos-programa", "servicio-mayor", "Servicio mayor"],
  ["tipos-programa", "servicio-menor", "Servicio menor"],
  ["tipos-programa", "lubricacion", "Lubricación"],
  ["tipos-programa", "ruta", "Ruta de inspección"],
  ["clasificaciones-programa", "operativo", "Operativo"],
  ["clasificaciones-programa", "seguridad", "Seguridad"],
  ["motivos-reprogramacion", "clima", "Condiciones climáticas"],
  ["motivos-reprogramacion", "disponibilidad-recurso", "Disponibilidad de recurso"],
  ["motivos-suspension", "en-reparacion", "Activo en reparación"],
  ["motivos-suspension", "fuera-de-servicio", "Fuera de servicio"],
  ["motivos-exclusion", "parada-planta", "Parada de planta"],
  ["motivos-exclusion", "inventario-fisico", "Inventario físico"],
  ["roles-personal", "tecnico", "Técnico"],
  ["roles-personal", "tecnico-lider", "Técnico líder"],
  ["roles-personal", "especialista", "Especialista"],
  ["roles-personal", "supervisor", "Supervisor"],
  ["roles-personal", "auxiliar", "Auxiliar"],
  ["tipos-recurso", "personal", "Personal"],
  ["tipos-recurso", "herramienta", "Herramienta"],
  ["tipos-recurso", "repuesto", "Repuesto"],
  ["clasificaciones-sla", "critico", "Crítico"],
  ["clasificaciones-sla", "alto", "Alto"],
  ["clasificaciones-sla", "medio", "Medio"],
  ["origenes-generacion", "programada", "Programada"],
];

async function seedPreventivo(activoIds: Map<string, string>): Promise<void> {
  const rt = preventivoRuntime();
  const ctx = ctxCon(principalPreventivo("seed-demo", "admin"));
  const cmd = (n: string, i: unknown) => rt.platform.kernel.commands.execute(ctx, n, i);
  const q = (n: string, i: unknown) => rt.platform.kernel.queries.execute(ctx, n, i);
  const drain = () => drenarCompleto(rt.platform.kernel);

  // Catálogos (upsert idempotente por clave).
  for (const [c, k, e] of CATALOGOS_PRV) unwrap(await cmd("modulo.preventivo.catalogo-upsert", { catalogo: c, clave: k, etiqueta: e }), `catalogo.prv ${c}/${k}`);
  await drain();
  log(`Catálogos de preventivo habilitados (${CATALOGOS_PRV.length})`);

  // Estado actual del programa (fuente de verdad = aggregate) para idempotencia.
  const estadoPrograma = async (id: string): Promise<{ estado: string; version: number } | null> => {
    const r = await q("modulo.preventivo.programa", { id });
    if (!r.ok || !r.value) return null;
    const v = r.value as { estado?: string; version?: number };
    return { estado: v.estado ?? "preparacion", version: v.version ?? 1 };
  };

  const progIds = new Map<string, string>();
  const actIds = new Map<string, string>(); // `${progClave}:${actClave}` → id
  let publicados = 0;

  // 1) Crear programas (padre ANTES que hijo por la jerarquía), publicarlos y
  //    definir sus actividades (DAG). Todo idempotente por id/opId/estado.
  for (const p of PROGRAMAS_PRV) {
    const id = prvId(`programa:${p.clave}`);
    progIds.set(p.clave, id);
    const planId = idDet(`plan:${p.plan}`);
    const activos = p.activos.map((a) => activoIds.get(a) ?? idDet(`activo:${a}`));

    unwrap(await cmd("modulo.preventivo.crear-programa", {
      id, opId: `seed:prv:programa:${p.clave}`,
      nombre: p.nombre, descripcion: `${p.nombre} — programa preventivo DEMO`,
      tipo: p.tipo, clasificacion: p.clasificacion,
      padreId: p.padre ? progIds.get(p.padre) ?? null : null,
      planes: [{ planId, version: 1, etiqueta: p.plan }],
      activos,
      vigencia: p.vigencia,
      sla: p.sla,
    }), `crear-programa ${p.clave}`);
    await drain();

    // Definir actividades ANTES de publicar (el programa es inmutable al publicar).
    for (const a of p.actividades) {
      const aid = prvId(`actividad:${p.clave}:${a.clave}`);
      actIds.set(`${p.clave}:${a.clave}`, aid);
      const st = await estadoPrograma(id);
      // Sólo define en preparación/revisión (idempotente: si ya publicado, se omite).
      if (st && (st.estado === "preparacion" || st.estado === "revision")) {
        unwrap(await cmd("modulo.preventivo.definir-actividad", {
          id: aid, opId: `seed:prv:actividad:${p.clave}:${a.clave}`,
          programaId: id, nombre: a.nombre, orden: a.orden,
          dependencias: a.dependencias.map((d) => actIds.get(`${p.clave}:${d}`)!),
          checklist: { ...a.checklist, obligatorio: true },
          tiempoEstimado: a.tiempo, moneda: "usd",
          recursos: a.recursos,
        }), `definir-actividad ${p.clave}:${a.clave}`);
        await drain();
      }
    }

    // Publicar: preparacion → enviarRevision → revision → publicar (workflow real).
    let st = await estadoPrograma(id);
    if (st && st.estado === "preparacion") {
      unwrap(await cmd("modulo.preventivo.transicionar-programa", { id, accion: "enviarRevision", expectedVersion: st.version, opId: `seed:prv:rev:${p.clave}` }), `enviarRevision ${p.clave}`);
      await drain();
      st = await estadoPrograma(id);
    }
    if (st && st.estado === "revision") {
      unwrap(await cmd("modulo.preventivo.transicionar-programa", { id, accion: "publicar", expectedVersion: st.version, opId: `seed:prv:pub:${p.clave}` }), `publicar ${p.clave}`);
      await drain();
      st = await estadoPrograma(id);
    }
    if (st?.estado === "publicado") publicados++;
  }
  log(`Programas preventivos publicados (${publicados}/${PROGRAMAS_PRV.length}, incl. jerarquía padre→hijo)`);

  // 2) GENERACIÓN oficial (`generar`) para varios vencimientos ⇒ OT preventivas
  //    REALES materializadas por el MaterializadorOrdenes. Idempotente por opId
  //    (recibo) y por claveDedup (dedup de generación). Cada generación toma la
  //    primera actividad del programa raíz/independiente y un vencimiento distinto.
  const VENCIMIENTOS: { prog: string; act: string; activo: string; ventana: string; fecha: string }[] = [
    { prog: "PRV-MAQ-MAYOR", act: "A1", activo: "MAQ-001", ventana: "2026-01", fecha: "2026-01-20T08:00:00.000Z" },
    { prog: "PRV-MAQ-MAYOR", act: "A1", activo: "MAQ-001", ventana: "2026-02", fecha: "2026-02-20T08:00:00.000Z" },
    { prog: "PRV-BAN-INSP", act: "C1", activo: "BAN-001", ventana: "2026-01", fecha: "2026-01-25T08:00:00.000Z" },
    { prog: "PRV-BAN-INSP", act: "C1", activo: "BAN-001", ventana: "2026-02", fecha: "2026-02-25T08:00:00.000Z" },
  ];
  let materializadas = 0; let idempotentes = 0;
  for (const v of VENCIMIENTOS) {
    const programaId = progIds.get(v.prog)!;
    const actividadId = actIds.get(`${v.prog}:${v.act}`)!;
    const activoId = activoIds.get(v.activo) ?? idDet(`activo:${v.activo}`);
    const genId = prvId(`generacion:${v.prog}:${v.ventana}`);
    const r = unwrap(await cmd("modulo.preventivo.generar", {
      id: genId, opId: `seed:prv:gen:${v.prog}:${v.ventana}`,
      programaId, actividadId, activoId, ventana: v.ventana, origen: "programada",
      fechaObjetivo: v.fecha, corresponde: true,
    }), `generar ${v.prog}/${v.ventana}`) as { estado?: string; ordenTrabajoId?: string | null; idempotente?: boolean };
    // Drena Órdenes INMEDIATAMENTE: el materializador ya creó la OT; proyecta su
    // read model antes de que otro runtime reclame el outbox compartido.
    await drain();
    await drenarCompleto(ordenesRuntime().platform.kernel);
    if (r.estado === "materializada" && r.ordenTrabajoId) {
      if (r.idempotente === true) idempotentes++; else materializadas++;
    }
  }
  await drenarCompleto(ordenesRuntime().platform.kernel);
  log(`Generaciones preventivas materializadas: ${materializadas} nuevas, ${idempotentes} idempotentes (OT reales)`);

  // 3) PROGRAMACIONES del calendario: 1 reprogramación, 1 suspensión parcial y 1
  //    exclusión con motivos de catálogo (append-only; idempotente por opId).
  const progRaiz = progIds.get("PRV-MAQ-MAYOR")!;
  const actRaiz = actIds.get("PRV-MAQ-MAYOR:A2")!;
  unwrap(await cmd("modulo.preventivo.reprogramar", {
    opId: "seed:prv:reprog:MAQ-MAYOR",
    programaId: progRaiz, actividadId: actRaiz, activoId: activoIds.get("MAQ-001") ?? idDet("activo:MAQ-001"),
    fechaOriginal: "2026-01-20T08:00:00.000Z", fechaNueva: "2026-01-27T08:00:00.000Z", motivo: "clima",
  }), "reprogramar MAQ-MAYOR");
  await drain();
  unwrap(await cmd("modulo.preventivo.suspender", {
    opId: "seed:prv:susp:BAN-INSP",
    programaId: progIds.get("PRV-BAN-INSP")!, ambito: "activo",
    sujetoId: activoIds.get("BAN-001") ?? idDet("activo:BAN-001"),
    activoId: activoIds.get("BAN-001") ?? idDet("activo:BAN-001"),
    motivo: "en-reparacion", desde: "2026-03-01T00:00:00.000Z", hasta: "2026-03-15T23:59:59.000Z",
  }), "suspender BAN-INSP");
  await drain();
  unwrap(await cmd("modulo.preventivo.excluir", {
    opId: "seed:prv:excl:MAQ-MAYOR",
    programaId: progRaiz, desde: "2026-04-01T00:00:00.000Z", hasta: "2026-04-07T23:59:59.000Z",
    activos: [activoIds.get("MAQ-001") ?? idDet("activo:MAQ-001")], motivo: "parada-planta",
  }), "excluir MAQ-MAYOR");
  await drain();
  log("Programaciones DEMO: 1 reprogramación + 1 suspensión parcial + 1 exclusión (motivos de catálogo)");

  // 4) Reproyección FINAL desde la bitácora durable (equivalencia por replay) por
  //    si el outbox COMPARTIDO fue reclamado por otro runtime sin sus handlers.
  unwrap(await cmd("modulo.preventivo.reproyectar", {}), "reproyectar preventivo");
  await drain();
}

/* ------------------- 8) Correctivo (DGP-015.3): mantenimiento correctivo ---- */
/**
 * Enterprise Corrective Maintenance para el DEMO: catálogos configurables,
 * solicitudes por origen/prioridad/criticidad con síntomas y evidencias, ciclo
 * de vida gobernado por el Workflow REAL (triage/diagnóstico/validación/aprobada),
 * diagnósticos anclados a Dynamic Forms, generación IDEMPOTENTE de OT correctivas
 * (materializador oficial), intervención Mayor multi-cuadrilla con reserva/consumo
 * parcial/devolución sobre inventario REAL, auto-solicitud de compra ante faltante
 * (visible en Abastecimiento) y eventos de activo con detección de REINCIDENCIA.
 * Todo por comandos oficiales, con `id`/`opId` deterministas (token `cor:`).
 */

/**
 * ID determinista para entidades de correctivo. `idDet` muestrea el seed con
 * `i % len` durante 32 iteraciones, por lo que dos seeds que comparten un prefijo
 * largo y sólo difieren al final COLISIONAN (p. ej. "cor:solicitud:SOL-MAQ" vs
 * "cor:solicitud:SOL-MON"). Para evitarlo invertimos los segmentos del token de
 * modo que el fragmento MÁS discriminante quede al FRENTE, y namespaciamos con
 * "cor" para no chocar con ids de otros módulos del seed.
 */
const corId = (token: string) => idDet(`${token.split(":").reverse().join(":")}:cor`);

/** Catálogos correctivo (subconjunto representativo de los canónicos del módulo). */
const CATALOGOS_COR: [string, string, string][] = [
  ["tipos-falla", "mecanica", "Mecánica"], ["tipos-falla", "electrica", "Eléctrica"],
  ["tipos-falla", "hidraulica", "Hidráulica"], ["tipos-falla", "electronica", "Electrónica"],
  ["modos-falla", "desgaste", "Desgaste"], ["modos-falla", "fuga", "Fuga"],
  ["modos-falla", "sobrecalentamiento", "Sobrecalentamiento"], ["modos-falla", "vibracion", "Vibración"],
  ["modos-falla", "rotura", "Rotura"],
  ["causas", "falta-mantenimiento", "Falta de mantenimiento"], ["causas", "fin-vida-util", "Fin de vida útil"],
  ["causas", "error-operacion", "Error de operación"], ["causas", "material-defectuoso", "Material defectuoso"],
  ["efectos", "parada-total", "Parada total"], ["efectos", "parada-parcial", "Parada parcial"],
  ["efectos", "degradacion", "Degradación"], ["efectos", "riesgo-seguridad", "Riesgo de seguridad"],
  ["prioridades", "baja", "Baja"], ["prioridades", "media", "Media"], ["prioridades", "alta", "Alta"],
  ["prioridades", "critica", "Crítica"], ["prioridades", "emergencia", "Emergencia"],
  ["severidades", "leve", "Leve"], ["severidades", "moderada", "Moderada"],
  ["severidades", "grave", "Grave"], ["severidades", "critica", "Crítica"],
  ["impactos", "produccion", "Producción"], ["impactos", "seguridad", "Seguridad"],
  ["impactos", "calidad", "Calidad"], ["impactos", "economico", "Económico"],
  ["origenes-solicitud", "operador", "Operador"], ["origenes-solicitud", "produccion", "Producción"],
  ["origenes-solicitud", "sst", "SST"], ["origenes-solicitud", "calidad", "Calidad"],
  ["origenes-solicitud", "supervisor", "Supervisor"],
  ["criticidades", "baja", "Baja"], ["criticidades", "media", "Media"],
  ["criticidades", "alta", "Alta"], ["criticidades", "critica", "Crítica"],
  ["sintomas", "ruido-anormal", "Ruido anormal"], ["sintomas", "sobrecalienta", "Se sobrecalienta"],
  ["sintomas", "fuga-fluido", "Fuga de fluido"], ["sintomas", "vibracion-excesiva", "Vibración excesiva"],
  ["sintomas", "no-arranca", "No arranca"],
  ["roles-personal", "tecnico", "Técnico"], ["roles-personal", "tecnico-lider", "Técnico líder"],
  ["roles-personal", "especialista", "Especialista"], ["roles-personal", "supervisor", "Supervisor"],
  ["tipos-recurso", "personal", "Personal"], ["tipos-recurso", "herramienta", "Herramienta"],
  ["tipos-recurso", "repuesto", "Repuesto"], ["tipos-recurso", "equipo-apoyo", "Equipo de apoyo"],
  ["unidades-tiempo", "horas", "Horas"], ["monedas", "usd", "USD"],
];

/** Clave y versión de la plantilla de diagnóstico (Dynamic Forms). */
const DIAG_PLANTILLA_CLAVE = "diag-correctivo";
const DIAG_PLANTILLA_VERSION = 1;

async function seedCorrectivo(activoIds: Map<string, string>, invIds: Map<string, string>): Promise<void> {
  const rt = correctivoRuntime();
  const ctx = ctxCon(principalCorrectivo("seed-demo", "admin"));
  const cmd = (n: string, i: unknown) => rt.platform.kernel.commands.execute(ctx, n, i);
  const q = (n: string, i: unknown) => rt.platform.kernel.queries.execute(ctx, n, i);
  const drain = () => drenarCompleto(rt.platform.kernel);

  const activo = (code: string) => activoIds.get(code) ?? idDet(`activo:${code}`);
  const articulo = (clave: string) => idDet(`${clave}:art:abs-procurement`);

  // (0) Catálogos configurables del módulo (upsert idempotente por clave).
  for (const [c, k, e] of CATALOGOS_COR) unwrap(await cmd("modulo.correctivo.catalogo-upsert", { catalogo: c, clave: k, etiqueta: e }), `catalogo.cor ${c}/${k}`);
  await drain();
  log(`Catálogos de correctivo habilitados (${CATALOGOS_COR.length})`);

  // (1) Plantilla de diagnóstico en Dynamic Forms: crear BORRADOR + PUBLICAR
  //     (idempotente por id de plantilla). Los diagnósticos se anclan a ella.
  const fr = formulariosRuntime();
  const ctxF = contextForFormularios("seed-demo", DEMO_TENANT);
  const fcmd = (n: string, i: unknown) => fr.platform.kernel.commands.execute(ctxF, n, i);
  const fq = (n: string, i: unknown) => fr.platform.kernel.queries.execute(ctxF, n, i);
  const fdrain = () => drenarCompleto(fr.platform.kernel);
  const plantillaId = corId("plantilla:diagnostico");
  // ¿Ya publicada? (idempotencia): si existe la versión 1, se omite crear/publicar.
  const yaPub = await fq("modulo.formularios.plantilla.obtener", { clave: DIAG_PLANTILLA_CLAVE, version: DIAG_PLANTILLA_VERSION });
  if (!yaPub.ok || !yaPub.value) {
    unwrap(await fcmd("modulo.formularios.plantilla.crear", {
      id: plantillaId, opId: "seed:cor:plantilla:crear", clave: DIAG_PLANTILLA_CLAVE,
      contenido: {
        definicion: {
          clave: DIAG_PLANTILLA_CLAVE, titulo: "Diagnóstico correctivo",
          nodos: [
            { clase: "campo", clave: "hallazgo", tipo: "texto", etiqueta: "Hallazgo principal", obligatorio: true },
            { clase: "campo", clave: "causaProbable", tipo: "texto", etiqueta: "Causa probable", obligatorio: true },
            { clase: "campo", clave: "requiereRepuestos", tipo: "booleano", etiqueta: "¿Requiere repuestos?" },
            { clase: "campo", clave: "horasEstimadas", tipo: "numero", etiqueta: "Horas estimadas de reparación" },
          ],
        },
      },
    }), "cor.plantilla.crear");
    await fdrain();
    unwrap(await fcmd("modulo.formularios.plantilla.publicar", { id: plantillaId, opId: "seed:cor:plantilla:publicar" }), "cor.plantilla.publicar");
    await fdrain();
  }
  log(`Plantilla de diagnóstico publicada (${DIAG_PLANTILLA_CLAVE} v${DIAG_PLANTILLA_VERSION})`);

  // (2) Cuatro solicitudes sobre activos REALES con orígenes/prioridades variados.
  //     Estado tras el seed: 1 en triage, 1 en diagnóstico, 2 aprobadas.
  interface DefSolicitud {
    key: string; activo: string; origen: string; prioridad: string; criticidad: string;
    titulo: string; sintomas: { clave?: string; texto?: string }[]; conEvidencias?: boolean;
    // Destino: "triage" | "diagnostico" | "aprobada". Las aprobadas registran diagnóstico.
    destino: "triage" | "diagnostico" | "aprobada";
    diag?: { causaReportada: string; causaEncontrada: string; causaRaiz: string; modoFalla: string; efecto: string; impacto: string; severidad: string; recomendaciones: string };
  }
  const SOLICITUDES: DefSolicitud[] = [
    {
      key: "SOL-MAQ", activo: "MAQ-001", origen: "operador", prioridad: "alta", criticidad: "alta",
      titulo: "Excavadora con ruido anormal en tren de rodaje",
      sintomas: [{ clave: "ruido-anormal" }, { texto: "Se percibe golpeteo al girar" }],
      conEvidencias: true, destino: "triage",
    },
    {
      key: "SOL-MON", activo: "MON-001", origen: "produccion", prioridad: "critica", criticidad: "critica",
      titulo: "Montacargas no levanta carga nominal",
      sintomas: [{ clave: "fuga-fluido" }, { texto: "Fuga en cilindro hidráulico" }],
      destino: "diagnostico",
    },
    {
      key: "SOL-BAN", activo: "BAN-001", origen: "sst", prioridad: "alta", criticidad: "alta",
      titulo: "Banda transportadora con vibración excesiva",
      sintomas: [{ clave: "vibracion-excesiva" }], destino: "aprobada",
      diag: { causaReportada: "error-operacion", causaEncontrada: "material-defectuoso", causaRaiz: "fin-vida-util", modoFalla: "desgaste", efecto: "parada-parcial", impacto: "produccion", severidad: "grave", recomendaciones: "Reemplazar rodamientos y banda; alinear poleas." },
    },
    {
      key: "SOL-EMP", activo: "EMP-001", origen: "calidad", prioridad: "media", criticidad: "media",
      titulo: "Empacadora sobrecalienta el motor",
      sintomas: [{ clave: "sobrecalienta" }], destino: "aprobada",
      diag: { causaReportada: "falta-mantenimiento", causaEncontrada: "falta-mantenimiento", causaRaiz: "falta-mantenimiento", modoFalla: "sobrecalentamiento", efecto: "degradacion", impacto: "calidad", severidad: "moderada", recomendaciones: "Limpiar disipadores y sustituir lubricante." },
    },
  ];

  const solIds = new Map<string, string>();
  const otIds = new Map<string, string>();
  // Estado actual de la solicitud (fuente de verdad para idempotencia).
  const estadoSol = async (id: string): Promise<{ estado: string; version: number } | null> => {
    const r = await q("modulo.correctivo.solicitud-detalle", { id });
    if (!r.ok || !r.value) return null;
    const v = r.value as { estado?: string; version?: number };
    return { estado: v.estado ?? "registro", version: v.version ?? 1 };
  };
  // Transiciona idempotentemente respetando los estados de origen admisibles.
  // Devuelve el estado/versión RESULTANTE leído del comando (no del read model,
  // para no depender del timing de proyección del outbox). Si el estado actual no
  // es transicionable desde `desde`, devuelve el estado leído sin mutar.
  const transicionar = async (key: string, id: string, accion: string, desde: string[]): Promise<{ estado: string; version: number } | null> => {
    const st = await estadoSol(id);
    if (st && desde.includes(st.estado)) {
      const r = unwrap(await cmd("modulo.correctivo.transicionar-solicitud", { id, accion, expectedVersion: st.version, opId: `seed:cor:sol:${key}:${accion}` }), `transicionar ${key}/${accion}`) as { estado?: string; version?: number };
      await drain();
      return { estado: r.estado ?? accion, version: r.version ?? st.version + 1 };
    }
    return st;
  };

  let creadas = 0;
  for (const s of SOLICITUDES) {
    const id = corId(`solicitud:${s.key}`);
    solIds.set(s.key, id);
    const r = unwrap(await cmd("modulo.correctivo.crear-solicitud", {
      id, opId: `seed:cor:sol:${s.key}:crear`,
      titulo: s.titulo, descripcion: `${s.titulo} — solicitud correctiva DEMO`,
      origen: s.origen, objeto: { activoId: activo(s.activo) },
      prioridad: s.prioridad, criticidad: s.criticidad, sintomas: s.sintomas,
      ...(s.conEvidencias
        ? { evidencias: [{ attachmentId: corId(`evid:${s.key}`), tipo: "foto", etiqueta: "Foto de la falla (referencia)" }] }
        : {}),
    }), `crear-solicitud ${s.key}`) as { idempotente?: boolean };
    await drain();
    if (r.idempotente !== true) creadas++;

    // Comentarios (sólo en la solicitud con evidencias de referencia).
    if (s.conEvidencias) {
      unwrap(await cmd("modulo.correctivo.comentar-solicitud", { id, comentarioId: corId(`coment:${s.key}:1`), texto: "Operador reporta golpeteo intermitente al maniobrar." }), `comentar ${s.key}`);
      await drain();
    }

    // Flujo por Workflow REAL hasta el destino.
    if (s.destino === "triage") {
      await transicionar(s.key, id, "enviarTriage", ["registro"]);
    } else {
      await transicionar(s.key, id, "enviarTriage", ["registro"]);
      const trasDiag = await transicionar(s.key, id, "iniciarDiagnostico", ["triage"]);
      // Las que llegan a "aprobada" registran su diagnóstico ANTES de validar.
      if (s.diag) {
        // Versión vigente tras iniciarDiagnostico; el diagnóstico la BUMPEA al
        // anclar el diagnosticoId en la solicitud, así que threadeamos la versión
        // RETORNADA por el comando (no el read model) para evitar conflictos.
        let versionSol = trasDiag?.version ?? (await estadoSol(id))?.version ?? 1;
        const estadoActual = trasDiag?.estado ?? (await estadoSol(id))?.estado;
        // Idempotente: sólo si aún NO tiene diagnóstico anclado (estado diagnostico).
        if (estadoActual === "diagnostico") {
          const rd = unwrap(await cmd("modulo.correctivo.registrar-diagnostico", {
            id: corId(`diagnostico:${s.key}`), opId: `seed:cor:diag:${s.key}`,
            solicitudId: id, expectedVersion: versionSol,
            plantilla: { plantillaId: DIAG_PLANTILLA_CLAVE, version: DIAG_PLANTILLA_VERSION },
            respuestas: { hallazgo: s.titulo, causaProbable: s.diag.causaEncontrada, requiereRepuestos: true, horasEstimadas: 4 },
            causaReportada: s.diag.causaReportada, causaEncontrada: s.diag.causaEncontrada, causaRaiz: s.diag.causaRaiz,
            clasificacion: { modoFalla: s.diag.modoFalla, efecto: s.diag.efecto, impacto: s.diag.impacto, severidad: s.diag.severidad },
            recomendaciones: s.diag.recomendaciones,
          }), `registrar-diagnostico ${s.key}`) as { solicitudVersion?: number; idempotente?: boolean };
          await drain();
          if (typeof rd.solicitudVersion === "number") versionSol = rd.solicitudVersion;
        }
        // Transición version-explícita: usamos la versión THREADED (no el read
        // model, que puede ir por detrás del bump del diagnóstico). Idempotente
        // por opId: si ya se ejecutó, el recibo devuelve el estado sin conflicto.
        const trans = async (accion: string, desdeVersion: number): Promise<number> => {
          const r = await cmd("modulo.correctivo.transicionar-solicitud", { id, accion, expectedVersion: desdeVersion, opId: `seed:cor:sol:${s.key}:${accion}` });
          await drain();
          if (r.ok) return ((r.value as { version?: number }).version ?? desdeVersion + 1);
          // Ya aplicada (re-seed): recuperamos la versión vigente del read model.
          const cur = await estadoSol(id);
          return cur?.version ?? desdeVersion;
        };
        versionSol = await trans("enviarValidacion", versionSol);
        versionSol = await trans("aprobar", versionSol);
      }
    }
  }
  log(`Solicitudes correctivas creadas (${SOLICITUDES.length}; nuevas ${creadas}) — estados: triage/diagnóstico/2×aprobada`);

  // (3) Generación IDEMPOTENTE de OT correctivas desde las 2 aprobadas (materializador
  //     oficial). Drena Órdenes INMEDIATAMENTE para proyectar la OT real.
  let otNuevas = 0; let otIdemp = 0;
  for (const key of ["SOL-BAN", "SOL-EMP"]) {
    const solId = solIds.get(key)!;
    const st = await estadoSol(solId);
    if (!st || st.estado !== "aprobada") continue;
    const r = unwrap(await cmd("modulo.correctivo.generar-orden-correctiva", {
      id: corId(`generacion:${key}`), opId: `seed:cor:gen:${key}`, solicitudId: solId,
    }), `generar-orden ${key}`) as { ordenTrabajoId?: string; idempotente?: boolean };
    await drain();
    await drenarCompleto(ordenesRuntime().platform.kernel);
    if (r.ordenTrabajoId) { otIds.set(key, r.ordenTrabajoId); if (r.idempotente === true) otIdemp++; else otNuevas++; }
  }
  await drenarCompleto(ordenesRuntime().platform.kernel);
  log(`OT correctivas materializadas: ${otNuevas} nuevas, ${otIdemp} idempotentes (tipo canónico "correctiva")`);

  // (4) Intervención MAYOR (2 cuadrillas) sobre la OT de SOL-BAN, avanzada a
  //     ejecución, con reserva de repuestos REALES, 1 consumo parcial y 1 devolución.
  const otBan = otIds.get("SOL-BAN");
  if (otBan) {
    const intId = corId("intervencion:SOL-BAN");
    const ri = unwrap(await cmd("modulo.correctivo.crear-intervencion", {
      id: intId, opId: "seed:cor:int:SOL-BAN", solicitudId: solIds.get("SOL-BAN")!, ordenTrabajoId: otBan,
      cuadrillas: [
        {
          cuadrillaId: corId("cuadrilla:mecanica"), etiqueta: "Cuadrilla mecánica",
          responsables: [{ responsableId: corId("resp:lider-mec"), rol: "tecnico-lider" }, { responsableId: corId("resp:tec-mec"), rol: "tecnico" }],
          recursos: [{ tipo: "herramienta", referencia: { tipo: "item", id: invIds.get("HER-001") ?? corId("rec:her"), etiqueta: "Juego de llaves" } }],
        },
        {
          cuadrillaId: corId("cuadrilla:electrica"), etiqueta: "Cuadrilla eléctrica",
          responsables: [{ responsableId: corId("resp:esp-elec"), rol: "especialista" }],
          recursos: [{ tipo: "equipo-apoyo", referencia: { tipo: "equipo", id: corId("rec:multimetro"), etiqueta: "Multímetro" } }],
        },
      ],
    }), "crear-intervencion SOL-BAN") as { estado?: string; version?: number; mayor?: boolean };
    await drain();

    // Estado de la intervención (idempotencia de transiciones).
    const estadoInt = async (): Promise<{ estado: string; version: number } | null> => {
      const r = await q("modulo.correctivo.intervencion-detalle", { id: intId });
      if (!r.ok || !r.value) return null;
      const v = r.value as { estado?: string; version?: number };
      return { estado: v.estado ?? "preparacion", version: v.version ?? 1 };
    };
    const transInt = async (accion: string, desde: string[]): Promise<void> => {
      const st = await estadoInt();
      if (st && desde.includes(st.estado)) {
        unwrap(await cmd("modulo.correctivo.transicionar-intervencion", { id: intId, accion, expectedVersion: st.version, opId: `seed:cor:int:SOL-BAN:${accion}` }), `transicionar-intervencion ${accion}`);
        await drain();
      }
    };
    // preparacion → asignacion → ejecucion (permite consumo de inventario).
    await transInt("asignar", ["preparacion"]);
    await transInt("iniciarEjecucion", ["asignacion"]);

    // (4a) Reserva de repuestos REALES: 1 con stock (HER-001, SIN lote → apto para
    //      consumo/devolución directos) + 1 con FALTANTE (BND-001, se pide más del
    //      disponible) ⇒ auto-solicitud de compra vía AbastecimientoPort.
    const invHer = invIds.get("HER-001");
    const invBnd = invIds.get("BND-001");
    if (invHer && invBnd) {
      unwrap(await cmd("modulo.correctivo.reservar-repuestos", {
        intervencionId: intId, opId: "seed:cor:resv:SOL-BAN", prioridadCompra: "alta",
        lineas: [
          { inventarioId: invHer, articuloId: articulo("ART-HER"), cantidad: 4, unidad: "juego" },
          { inventarioId: invBnd, articuloId: articulo("ART-BND"), cantidad: 999, unidad: "unidad" },
        ],
      }), "reservar-repuestos SOL-BAN");
      await drain();
      await drenarCompleto(abastecimientoRuntime().platform.kernel);
    }

    // (4b) Consumo PARCIAL de un repuesto con stock (HER-001): consume 2 de 4.
    if (invHer) {
      unwrap(await cmd("modulo.correctivo.consumir-repuesto", {
        intervencionId: intId, opId: "seed:cor:cons:SOL-BAN:HER",
        linea: { inventarioId: invHer, articuloId: articulo("ART-HER"), cantidad: 2, unidad: "juego" },
      }), "consumir-repuesto SOL-BAN");
      await drain();
      await drenarCompleto(inventarioRuntime().platform.kernel);
    }

    // (4c) Devolución de un repuesto (registro de devolución a bodega).
    if (invHer) {
      unwrap(await cmd("modulo.correctivo.devolver-repuesto", {
        intervencionId: intId, opId: "seed:cor:dev:SOL-BAN:HER",
        linea: { inventarioId: invHer, articuloId: articulo("ART-HER"), cantidad: 1, unidad: "juego" },
      }), "devolver-repuesto SOL-BAN");
      await drain();
      await drenarCompleto(inventarioRuntime().platform.kernel);
    }
    log(`Intervención MAYOR (${ri.mayor ? "2 cuadrillas" : "1 cuadrilla"}) en ejecución: reserva + 1 consumo parcial + 1 devolución; faltante ⇒ compra automática`);
  }

  // (5) Eventos de activo (historial de fallas) + REINCIDENCIA (mismo activo +
  //     mismo modo dentro de la ventana). Append-only; idempotente por id.
  const EVENTOS: { key: string; activo: string; tipo: string; modoFalla?: string; solKey?: string; otKey?: string; ocurridoEn: string; kpi?: Record<string, number> }[] = [
    { key: "ev-ban-1", activo: "BAN-001", tipo: "falla-reportada", modoFalla: "desgaste", solKey: "SOL-BAN", ocurridoEn: "2026-01-05T08:00:00.000Z" },
    { key: "ev-ban-2", activo: "BAN-001", tipo: "falla-confirmada", modoFalla: "desgaste", solKey: "SOL-BAN", ocurridoEn: "2026-01-05T10:00:00.000Z" },
    { key: "ev-ban-3", activo: "BAN-001", tipo: "reparacion-iniciada", otKey: "SOL-BAN", ocurridoEn: "2026-01-06T08:00:00.000Z", kpi: { tiempoEntreFallasMin: 43200 } },
    { key: "ev-ban-4", activo: "BAN-001", tipo: "reparacion-finalizada", otKey: "SOL-BAN", ocurridoEn: "2026-01-06T14:00:00.000Z", kpi: { tiempoReparacionMin: 360 } },
    { key: "ev-ban-5", activo: "BAN-001", tipo: "puesta-en-servicio", ocurridoEn: "2026-01-06T15:00:00.000Z", kpi: { tiempoIndisponibleMin: 1620 } },
    // REINCIDENCIA en MON-001: dos fallas con el MISMO modo ("desgaste") dentro de la ventana.
    { key: "ev-mon-1", activo: "MON-001", tipo: "falla-reportada", modoFalla: "desgaste", ocurridoEn: "2026-01-10T08:00:00.000Z" },
    { key: "ev-mon-2", activo: "MON-001", tipo: "falla-reportada", modoFalla: "desgaste", solKey: "SOL-MON", ocurridoEn: "2026-01-20T08:00:00.000Z" },
  ];
  let reincidencias = 0;
  for (const e of EVENTOS) {
    const r = unwrap(await cmd("modulo.correctivo.registrar-evento-activo", {
      id: corId(`evento:${e.key}`), activoId: activo(e.activo), tipo: e.tipo,
      ...(e.modoFalla ? { modoFalla: e.modoFalla } : {}),
      ...(e.solKey ? { solicitudId: solIds.get(e.solKey) } : {}),
      ...(e.otKey && otIds.get(e.otKey) ? { ordenTrabajoId: otIds.get(e.otKey) } : {}),
      ocurridoEn: e.ocurridoEn, ...(e.kpi ? { insumosKpi: e.kpi } : {}),
    }), `evento-activo ${e.key}`) as { reincidente?: boolean };
    await drain();
    if (r.reincidente === true) reincidencias++;
  }
  log(`Eventos de activo registrados (${EVENTOS.length}); reincidencias detectadas: ${reincidencias}`);

  // (6) Reproyección FINAL desde la bitácora durable (equivalencia por replay) por
  //     si el outbox COMPARTIDO fue reclamado por otro runtime sin sus handlers.
  unwrap(await cmd("modulo.correctivo.reproyectar", {}), "reproyectar correctivo");
  await drain();
}

/* ------------------------------- Orquestación ---------------------------- */

/* ----------------------- 10) Analytics & KPI Platform -------------------- */

/**
 * DGP-016 · Siembra la analítica del tenant DEMO SOLO con datos existentes (sin
 * datos falsos): (a) catálogo del sistema (30 indicadores + 8 dashboards
 * canónicos) vía `sembrar-sistema` (idempotente por clave); (b) 1 dashboard
 * PERSONALIZADO del usuario admin demo como ejemplo; (c) ~6 snapshots
 * representativos evaluados contra los datos REALES del tenant (MTBF/MTTR desde
 * los eventos de activo con insumos crudos, OT abiertas, compras generadas,
 * reincidencias, consumo de inventario). Los indicadores sin datos en el DEMO
 * (disponibilidad, costos) NO se fuerzan: evalúan 0 legítimamente.
 *
 * Devuelve los valores materializados (para trazabilidad del seed).
 */
async function seedAnalytics(): Promise<Record<string, number>> {
  const rt = analyticsRuntime();
  const ctx = ctxCon(principalAnalytics(DEMO_ADMIN.email, "admin"));
  const drain = () => drenarCompleto(rt.platform.kernel);

  // (a) Catálogo del sistema (idempotente).
  const sembrado = unwrap(
    await rt.platform.kernel.commands.execute(ctx, "modulo.analytics.sembrar-sistema", {}),
    "analytics.sembrar-sistema",
  ) as { indicadores: number; dashboards: number };
  await drain();
  log(`Analytics: catálogo del sistema (indicadores nuevos=${sembrado.indicadores}, dashboards nuevos=${sembrado.dashboards})`);

  // (b) Dashboard PERSONALIZADO del usuario admin demo (ejemplo). Idempotente
  //     por id determinista + guarda de existencia.
  const dashId = idDet("an:dash:demo-gerencia");
  const existe = await rt.platform.kernel.queries.execute(ctx, "modulo.analytics.dashboard", { id: dashId });
  if (!existe.ok) {
    unwrap(
      await rt.platform.kernel.commands.execute(ctx, "modulo.analytics.crear-dashboard", {
        id: dashId,
        clave: "demo-gerencia",
        nombre: "Panel Gerencial DEMO",
        descripcion: "Vista ejecutiva personalizada del usuario demo (confiabilidad + operación)",
        widgets: [
          { tipo: "card", titulo: "MTBF", indicadorClave: "mtbf", posicion: 0 },
          { tipo: "card", titulo: "MTTR", indicadorClave: "mttr", posicion: 1 },
          { tipo: "card", titulo: "OT abiertas", indicadorClave: "ot-abiertas", posicion: 2 },
          { tipo: "bar", titulo: "Compras generadas", indicadorClave: "compras-generadas", posicion: 3 },
          { tipo: "ranking", titulo: "Top activos con fallas", indicadorClave: "fallas-por-activo", ranking: { modo: "topN", n: 5 }, posicion: 4 },
        ],
      }),
      "analytics.crear-dashboard demo-gerencia",
    );
    await drain();
    log("Analytics: dashboard personalizado del usuario demo creado (Panel Gerencial DEMO)");
  }

  // (c) Snapshots representativos evaluados contra datos REALES (idempotentes por
  //     opId + clave determinista). evaluadoEn fijo ⇒ reproducibilidad.
  const evaluadoEn = "2026-02-01T00:00:00.000Z";
  const objetivo = ["disponibilidad", "mtbf", "mttr", "ot-abiertas", "costo-mantenimiento", "compras-generadas", "reincidencias", "consumo-inventario", "actividad-timeline"];
  const valores: Record<string, number> = {};
  for (const clave of objetivo) {
    const r = unwrap(
      await rt.platform.kernel.commands.execute(ctx, "modulo.analytics.materializar-snapshot", {
        opId: `seed:an:snap:${clave}`, clave, evaluadoEn,
      }),
      `analytics.materializar-snapshot ${clave}`,
    ) as { valor: number };
    valores[clave] = r.valor;
    await drain();
  }
  log(`Analytics: snapshots materializados → ${objetivo.map((k) => `${k}=${valores[k]}`).join(", ")}`);
  return valores;
}

/* --------------------- 11) Utilización / Combustible --------------------- */

async function seedUtilizacion(activoIds: Map<string, string>): Promise<void> {
  const rt = utilizacionRuntime();
  const ctx = ctxCon(principalUtilizacion("seed-demo", "TENANT_ADMIN"));
  const drain = () => drenarCompleto(rt.platform.kernel);
  const cmd = (name: string, input: Record<string, unknown>) =>
    rt.platform.kernel.commands.execute(ctx, name, input);

  // Activos con medidor: excavadora (horómetro) y camión (odómetro). Ids DEMO.
  const maq = activoIds.get("MAQ-001") ?? idDet("activo:MAQ-001");
  const cam = activoIds.get("CAM-001") ?? idDet("activo:CAM-001");

  // Lecturas crecientes de horómetro (excavadora) — se propagan a Activos.
  const lecturasHoro = [
    { valor: 1200, fecha: "2026-01-05T08:00:00.000Z" },
    { valor: 1260, fecha: "2026-01-20T08:00:00.000Z" },
    { valor: 1335, fecha: "2026-02-01T08:00:00.000Z" },
  ];
  for (const [i, l] of lecturasHoro.entries()) {
    unwrap(
      await cmd(`${MODULO_UTL}.registrar-lectura`, {
        opId: `seed:utl:lec:MAQ-001:${i}`,
        activoId: maq, tipoMedidor: "horometro", valor: l.valor, unidad: "h",
        fechaHora: l.fecha, origen: "manual",
      }),
      `utl.lectura MAQ-001 #${i}`,
    );
    await drain();
  }

  // Lecturas de odómetro (camión).
  const lecturasOdo = [
    { valor: 85000, fecha: "2026-01-05T08:00:00.000Z" },
    { valor: 86200, fecha: "2026-01-20T08:00:00.000Z" },
    { valor: 87550, fecha: "2026-02-01T08:00:00.000Z" },
  ];
  for (const [i, l] of lecturasOdo.entries()) {
    unwrap(
      await cmd(`${MODULO_UTL}.registrar-lectura`, {
        opId: `seed:utl:lec:CAM-001:${i}`,
        activoId: cam, tipoMedidor: "odometro", valor: l.valor, unidad: "km",
        fechaHora: l.fecha, origen: "manual",
      }),
      `utl.lectura CAM-001 #${i}`,
    );
    await drain();
  }

  // Tanqueos de combustible (diesel) para ambos activos.
  const tanqueos = [
    { activo: maq, seed: "MAQ-001", fecha: "2026-01-06T09:00:00.000Z", litros: 180, precio: 1.2 },
    { activo: maq, seed: "MAQ-001", fecha: "2026-01-22T09:00:00.000Z", litros: 200, precio: 1.25 },
    { activo: cam, seed: "CAM-001", fecha: "2026-01-06T10:00:00.000Z", litros: 300, precio: 1.2 },
    { activo: cam, seed: "CAM-001", fecha: "2026-01-22T10:00:00.000Z", litros: 320, precio: 1.25 },
  ];
  for (const [i, t] of tanqueos.entries()) {
    unwrap(
      await cmd(`${MODULO_UTL}.registrar-tanqueo`, {
        opId: `seed:utl:tnq:${t.seed}:${i}`,
        activoId: t.activo, fechaHora: t.fecha, litros: t.litros,
        tipoCombustible: "diesel", precioUnitario: t.precio, moneda: "USD",
      }),
      `utl.tanqueo ${t.seed} #${i}`,
    );
    await drain();
  }

  log(`Utilización: ${lecturasHoro.length + lecturasOdo.length} lecturas + ${tanqueos.length} tanqueos (MAQ-001, CAM-001)`);
}

export async function seedDeltaDemo(): Promise<void> {
  console.log(`\nSeed DEMO oficial DGP-011.3 — tenant "${DEMO_TENANT}" (${DEMO_EMPRESA})`);
  await wipeDeltaDemo();
  await seedAdmin();
  await seedEnterpriseIdentity();
  await seedCatalogos();
  const activoIds = await seedActivos();
  await seedOrdenes();
  const invIds = await seedInventario();
  await seedPlanes(activoIds);
  await seedAbastecimiento();
  await seedPreventivo(activoIds);
  await seedCorrectivo(activoIds, invIds);
  await seedUtilizacion(activoIds);
  await seedPlataforma(activoIds);
  await seedAnalytics();
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
