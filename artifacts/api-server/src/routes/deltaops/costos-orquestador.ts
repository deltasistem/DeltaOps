/**
 * DGP-021.2 · ORQUESTADOR Inventario → Costos de mantenimiento (api-server).
 *
 * §17 ARQUITECTURA: la orquestación cross-módulo vive en el API Server (patrón
 * DGP-020.3). Este módulo NO se suscribe a eventos ajenos ni ejecuta SQL contra
 * tablas internas de inventario/abastecimiento/órdenes: compone SÓLO contratos
 * públicos:
 *   - `modulo.inventario.movimientos` / `modulo.inventario.item` (SOLO LECTURA):
 *      el snapshot AUTORITATIVO del movimiento CONFIRMADO en servidor y la unidad
 *      base del ítem.
 *   - `modulo.ordenes.detalle` (vía el puerto de costos): existencia de la OT y
 *      relación canónica OT→activo (activo DERIVADO, jamás del frontend).
 *   - `modulo.abastecimiento.costos-exactos` (DGP-021.0): costo unitario EXACTO
 *      por (artículo, moneda), string numeric(18,6). PROHIBIDO float legacy.
 *   - `modulo.costos.hecho.materializar-material`: materializa el HECHO con opId
 *      DETERMINISTA `inv:<movimientoId>` (§15) ⇒ 1 solo hecho por movimiento.
 *
 * DISPARO (§18 offline): SÓLO tras la confirmación en servidor de un movimiento
 * (`modulo.inventario.mover`). Nunca desde el cliente ni desde la cola offline:
 * el api-server invoca `orquestarDesdeMover` justo después de que `mover` sella
 * su recibo en el servidor.
 *
 * FAIL-SAFE / RECUPERABLE: si el costo exacto falla / no existe / hay >1 moneda,
 * el movimiento físico NO se rompe. Se registra un PENDIENTE durable (RLS) con el
 * snapshot mínimo del movimiento y su motivo; el reproceso idempotente lo reintenta
 * (el opId determinista garantiza que reprocesar NO duplica el hecho).
 *
 * MONEDAS (§11): el artículo de Abastecimiento tiene UNA moneda al alta; se toma
 * la de `costos-exactos`. Si (contra el invariante) llegaran ≥2 monedas ⇒ NO se
 * elige/convierte/suma: queda PENDIENTE con motivo MULTIMONEDA.
 *
 * PRECISIÓN (§8/§9 · GAP-INV-CANT): inventario lleva la cantidad como float con
 * redondeo 1e-6 (módulo congelado). La conversión float→CADENA canónica escala 6
 * ocurre UNA sola vez AQUÍ (frontera del orquestador), validada con RE_DINERO
 * ANTES de entrar a module-costos; dentro de costos NO hay Number/parseFloat. La
 * exactitud de la CANTIDAD queda limitada por inventario (deuda de fondo de ese
 * módulo, declarada como GAP-INV-CANT); el COSTO unitario sí es exacto (string).
 */
import { pool } from "@workspace/db";
import { RE_DINERO } from "@workspace/module-costos";
import { costosRuntime, contextForCostos } from "./costos-runtime";
import { inventarioRuntime, contextForInventario } from "./inventario-runtime";
import { DELTAOPS_TENANT } from "./reference-runtime";

/** Tipo del pool PG (inferido del pool compartido de @workspace/db; sin dep directa a `pg`). */
type Pool = typeof pool;

/* --------------------------- Principal de servicio ----------------------- */
// §20 RBAC: la orquestación usa un principal de SERVICIO aprobado (NO admin
// fabricado — lección DGP-019.1). La autorización real permanece en cada módulo
// origen (inventario.read, abastecimiento.read, costos.materializar).
const ACTOR_SERVICIO = "svc:costos-inventario";
const ROL_LECTOR = "lector";
// Rol que otorga `modulo.costos.materializar` al principal de costos.
const ROL_MATERIALIZADOR = "SUPERVISOR";

/* ------------------------------- Configuración --------------------------- */
// Tipos de `referencia.tipo` del movimiento que denotan atribución a una OT.
// GAP-INV-REFOT: `referencia.tipo` es texto libre en inventario; se acepta un
// conjunto configurable de alias (sin inventar datos).
const REF_OT_TIPOS = new Set(["ot", "orden", "orden-trabajo", "ordentrabajo"]);
// Familias contables que representan un CONSUMO de material atribuible a costo.
// `consumo` es el candidato semántico primario; `salida` atribuida a OT también
// descarga `disponible`. `devolucion` genera un hecho compensatorio propio.
const FAMILIAS_MATERIAL = new Set(["consumo", "salida", "devolucion"]);

export type EstadoPendiente =
  | "PENDIENTE"
  | "MATERIALIZADO"
  | "SIN_COSTO"
  | "MULTIMONEDA"
  | "ERROR"
  | "DESCARTADO";

/** Snapshot mínimo del movimiento necesario para materializar/reprocesar. */
interface MovimientoSnapshot {
  readonly movimientoId: string;
  readonly inventarioId: string;
  readonly itemId: string;
  readonly otId: string;
  readonly refTipo: string;
  readonly familia: string;
  readonly cantidad: string; // CADENA canónica escala 6 (frontera string-safe)
  readonly unidad: string; // unidad base del ítem
  readonly ocurridoAt: string;
}

export interface ResultadoOrquestacion {
  readonly aplicable: boolean;
  readonly estado?: EstadoPendiente;
  readonly costoId?: string;
  readonly motivo?: string;
  readonly movimientoId?: string;
}

/* ---------------------- Conversión de cantidad (frontera) ---------------- */

/**
 * Convierte la cantidad FLOAT de inventario a CADENA decimal canónica escala 6,
 * string-safe. Se valida contra RE_DINERO ANTES de cruzar a module-costos. Es la
 * ÚNICA conversión Number→string del flujo (GAP-INV-CANT). Devuelve null si el
 * valor no es representable como cantidad canónica no negativa (defensa).
 */
export function cantidadCanonica(valor: unknown): string | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || n < 0) return null;
  // toFixed(6) es determinista para el rango de inventario (redondeo 1e-6).
  const s = n.toFixed(6);
  // Recorta el entero excesivo (RE_DINERO acota a 12 enteros). Sin signo.
  if (!RE_DINERO.test(s)) return null;
  return s;
}

/* ------------------------- Adaptador de pendientes ----------------------- */
// Tabla PROPIA de la orquestación del api-server (deltaops.cos_pendientes_material,
// migración 0045). RLS por tenant vía set_config también en LECTURAS.

async function withTenant<T>(pool: Pool, tenantId: string, fn: (c: { query: Pool["query"] }) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const out = await fn(client as unknown as { query: Pool["query"] });
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface FilaPendiente {
  readonly movimientoId: string;
  readonly opId: string;
  readonly estado: EstadoPendiente;
  readonly otId: string;
  readonly articuloId: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly moneda: string | null;
  readonly refTipo: string | null;
  readonly ocurridoAt: string;
  readonly familia: string;
  readonly costoId: string | null;
  readonly motivo: string | null;
  readonly intentos: number;
}

/** Registra/actualiza el intento (upsert idempotente por (tenant, movimiento)). */
async function registrarIntento(
  pool: Pool,
  tenantId: string,
  mov: MovimientoSnapshot,
  opId: string,
): Promise<void> {
  await withTenant(pool, tenantId, async (c) => {
    await c.query(
      `INSERT INTO deltaops.cos_pendientes_material
         (tenant_id, movimiento_id, op_id, estado, ot_id, articulo_id, cantidad, unidad, ref_tipo, ocurrido_at, familia, actor_id, intentos)
       VALUES ($1,$2,$3,'PENDIENTE',$4,$5,$6,$7,$8,$9,$10,$11,1)
       ON CONFLICT (tenant_id, movimiento_id) DO UPDATE SET
         intentos = deltaops.cos_pendientes_material.intentos + 1,
         actualizado_at = now()
       WHERE deltaops.cos_pendientes_material.estado <> 'MATERIALIZADO'`,
      [tenantId, mov.movimientoId, opId, mov.otId, mov.itemId, mov.cantidad, mov.unidad, mov.refTipo, mov.ocurridoAt, mov.familia, ACTOR_SERVICIO],
    );
  });
}

/** Marca el resultado del intento (auditable; nunca borra el registro). */
async function marcar(
  pool: Pool,
  tenantId: string,
  movimientoId: string,
  estado: EstadoPendiente,
  extra: { costoId?: string | null; motivo?: string | null; moneda?: string | null },
): Promise<void> {
  await withTenant(pool, tenantId, async (c) => {
    await c.query(
      `UPDATE deltaops.cos_pendientes_material
         SET estado=$3, costo_id=COALESCE($4, costo_id), motivo=$5, moneda=COALESCE($6, moneda), actualizado_at=now()
       WHERE tenant_id=$1 AND movimiento_id=$2`,
      [tenantId, movimientoId, estado, extra.costoId ?? null, extra.motivo ?? null, extra.moneda ?? null],
    );
  });
}

/** Lista pendientes NO resueltos (reproceso) o filtra por estado. */
export async function listarPendientes(
  tenantId: string = DELTAOPS_TENANT,
  estado?: EstadoPendiente,
  pool: Pool = poolRef(),
): Promise<FilaPendiente[]> {
  return withTenant(pool, tenantId, async (c) => {
    const cond = estado ? `AND estado = $2` : `AND estado <> 'MATERIALIZADO'`;
    const args = estado ? [tenantId, estado] : [tenantId];
    const r = await c.query(
      `SELECT movimiento_id, op_id, estado, ot_id, articulo_id, cantidad, unidad, moneda, ref_tipo, ocurrido_at, familia, costo_id, motivo, intentos
         FROM deltaops.cos_pendientes_material
        WHERE tenant_id=$1 ${cond}
        ORDER BY creado_at ASC`,
      args,
    );
    return r.rows.map((row: Record<string, unknown>) => ({
      movimientoId: String(row["movimiento_id"]),
      opId: String(row["op_id"]),
      estado: String(row["estado"]) as EstadoPendiente,
      otId: String(row["ot_id"]),
      articuloId: String(row["articulo_id"]),
      cantidad: String(row["cantidad"]),
      unidad: String(row["unidad"]),
      moneda: row["moneda"] == null ? null : String(row["moneda"]),
      refTipo: row["ref_tipo"] == null ? null : String(row["ref_tipo"]),
      ocurridoAt: row["ocurrido_at"] instanceof Date ? (row["ocurrido_at"] as Date).toISOString() : String(row["ocurrido_at"]),
      familia: String(row["familia"]),
      costoId: row["costo_id"] == null ? null : String(row["costo_id"]),
      motivo: row["motivo"] == null ? null : String(row["motivo"]),
      intentos: Number(row["intentos"] ?? 0),
    }));
  });
}

/* ------------------------------ Pool ------------------------------------- */
// Pool PostgreSQL compartido (mismo `pool` que los runtimes de deltaops). La
// tabla de pendientes es PROPIA de la orquestación del api-server.
function poolRef(): Pool {
  return pool;
}

/* ---------------------- Lectura del movimiento (contrato) ---------------- */

/**
 * Lee el snapshot AUTORITATIVO del movimiento CONFIRMADO vía contrato público de
 * inventario (`modulo.inventario.movimientos` por inventarioId) + la unidad base
 * del ítem (`modulo.inventario.item`). Devuelve null si no es materializable
 * (familia no material, sin referencia a OT, o no encontrado).
 */
async function leerMovimiento(
  tenantId: string,
  inventarioId: string,
  movimientoId: string,
): Promise<MovimientoSnapshot | null> {
  const ctx = contextForInventario(ACTOR_SERVICIO, ROL_LECTOR, tenantId);
  const rt = inventarioRuntime().platform.kernel.queries;
  const movs = await rt.execute(ctx, "modulo.inventario.movimientos", { inventarioId });
  if (!movs.ok) return null;
  const lista = (movs.value as Array<Record<string, unknown>>) ?? [];
  const m = lista.find((x) => String(x["id"] ?? x["movimientoId"] ?? "") === movimientoId);
  if (!m) return null;

  const familia = String(m["familia"] ?? "");
  if (!FAMILIAS_MATERIAL.has(familia)) return null;

  const ref = m["referencia"] as { tipo?: unknown; id?: unknown } | null | undefined;
  const refTipo = ref && typeof ref.tipo === "string" ? ref.tipo.toLowerCase() : "";
  const otId = ref && typeof ref.id === "string" ? ref.id : "";
  if (!REF_OT_TIPOS.has(refTipo) || otId === "") return null; // no atribuido a OT ⇒ no materializable

  const cantidad = cantidadCanonica(m["cantidad"]);
  if (cantidad === null) return null;

  const itemId = String(m["itemId"] ?? "");
  // Unidad base del ítem (la cantidad de stock/movimiento vive en unidad base).
  let unidad = "UN";
  const item = await rt.execute(ctx, "modulo.inventario.item", { id: itemId });
  if (item.ok && item.value) {
    const datos = (item.value as { datos?: Record<string, unknown> }).datos ?? (item.value as Record<string, unknown>);
    const ub = datos["unidadBase"] as { clave?: unknown } | undefined;
    if (ub && typeof ub.clave === "string" && ub.clave !== "") unidad = ub.clave;
  }

  const ocurridoAt = m["registradoAt"] ? String(m["registradoAt"]) : new Date().toISOString();
  return { movimientoId, inventarioId, itemId, otId, refTipo, familia, cantidad, unidad, ocurridoAt };
}

/* ---------------------- Materialización de un movimiento ----------------- */

function opIdDe(movimientoId: string): string {
  // §15 identidad DETERMINISTA movimiento→hecho. Mismo movimiento ⇒ mismo opId
  // ⇒ 1 solo hecho (uq_cos_hechos_opid), aunque el `mover` haya usado otro opId.
  return `inv:${movimientoId}`;
}

/**
 * Intenta materializar el HECHO de MATERIAL para un movimiento ya leído. Resuelve
 * la moneda desde `costos-exactos` y delega en `modulo.costos.hecho.materializar-material`
 * (opId determinista). Registra el resultado en el registro de pendientes.
 */
async function materializarMovimiento(
  tenantId: string,
  mov: MovimientoSnapshot,
  pool: Pool,
): Promise<ResultadoOrquestacion> {
  const opId = opIdDe(mov.movimientoId);
  await registrarIntento(pool, tenantId, mov, opId);

  // Resolución de moneda por el contrato de costo exacto (§11). El artículo de
  // Abastecimiento tiene una sola moneda al alta; si llegaran ≥2 ⇒ MULTIMONEDA.
  const monedaRes = await resolverMoneda(tenantId, mov.itemId);
  if (monedaRes.estado === "SIN_COSTO") {
    await marcar(pool, tenantId, mov.movimientoId, "SIN_COSTO", { motivo: `SIN COSTO exacto para el artículo ${mov.itemId} (≠ "0")` });
    return { aplicable: true, estado: "SIN_COSTO", motivo: "sin costo exacto", movimientoId: mov.movimientoId };
  }
  if (monedaRes.estado === "MULTIMONEDA") {
    await marcar(pool, tenantId, mov.movimientoId, "MULTIMONEDA", { motivo: `El artículo ${mov.itemId} tiene >1 moneda: NO se elige/convierte/suma` });
    return { aplicable: true, estado: "MULTIMONEDA", motivo: "multimoneda", movimientoId: mov.movimientoId };
  }
  const moneda = monedaRes.moneda;

  const ctx = contextForCostos(ACTOR_SERVICIO, ROL_MATERIALIZADOR, tenantId);
  const r = await costosRuntime().platform.kernel.commands.execute(ctx, "modulo.costos.hecho.materializar-material", {
    opId,
    otId: mov.otId,
    articuloId: mov.itemId,
    movimientoId: mov.movimientoId,
    cantidad: mov.cantidad,
    unidad: mov.unidad,
    moneda,
    ocurridoAt: mov.ocurridoAt,
  });
  await costosRuntime().platform.kernel.outboxProcessor.processPending();

  if (!r.ok) {
    await marcar(pool, tenantId, mov.movimientoId, "ERROR", { moneda, motivo: `${r.error.code}: ${r.error.message}` });
    return { aplicable: true, estado: "ERROR", motivo: r.error.message, movimientoId: mov.movimientoId };
  }
  const costoId = String((r.value as Record<string, unknown>)["costoId"] ?? "");
  await marcar(pool, tenantId, mov.movimientoId, "MATERIALIZADO", { costoId, moneda });
  return { aplicable: true, estado: "MATERIALIZADO", costoId, movimientoId: mov.movimientoId };
}

/** Resuelve la moneda única del artículo vía costo exacto (SOLO LECTURA). */
async function resolverMoneda(
  tenantId: string,
  articuloId: string,
): Promise<{ estado: "OK"; moneda: string } | { estado: "SIN_COSTO" } | { estado: "MULTIMONEDA" }> {
  // Se reutiliza el puerto de costo exacto expuesto por el runtime de costos, que
  // compone `modulo.abastecimiento.costos-exactos` (string numeric(18,6)). El
  // módulo de costos no expone la lista cruda de monedas; se consulta el puerto.
  const costos = await costosRuntime().adapters.costoExacto.costosDeArticulo(tenantId, articuloId);
  if (!costos.ok) return { estado: "SIN_COSTO" };
  const monedas = new Set(costos.value.map((c) => c.moneda));
  if (monedas.size === 0) return { estado: "SIN_COSTO" };
  if (monedas.size > 1) return { estado: "MULTIMONEDA" };
  return { estado: "OK", moneda: [...monedas][0]! };
}

/* --------------------------------- API pública --------------------------- */

/**
 * DISPARO tras confirmar `modulo.inventario.mover`. Recibe el RESULTADO del
 * comando `mover` (contiene movimientoId + inventarioId). Lee el snapshot
 * autoritativo del movimiento y, si es un consumo/salida/devolución atribuido a
 * una OT, materializa el hecho. FAIL-SAFE: cualquier fallo se captura y queda
 * como PENDIENTE recuperable — NUNCA propaga excepción al movimiento físico.
 */
export async function orquestarDesdeMover(
  resultadoMover: unknown,
  tenantId: string | undefined = DELTAOPS_TENANT,
): Promise<ResultadoOrquestacion> {
  tenantId = tenantId ?? DELTAOPS_TENANT;
  const pool = poolRef();
  try {
    const res = (resultadoMover ?? {}) as Record<string, unknown>;
    const movimientoId = typeof res["movimientoId"] === "string" ? res["movimientoId"] : "";
    const inventarioId = typeof res["inventarioId"] === "string" ? res["inventarioId"] : "";
    if (movimientoId === "" || inventarioId === "") return { aplicable: false };

    const mov = await leerMovimiento(tenantId, inventarioId, movimientoId);
    if (!mov) return { aplicable: false };
    return await materializarMovimiento(tenantId, mov, pool);
  } catch (err) {
    // FAIL-SAFE extremo: el movimiento físico ya está confirmado; jamás romper.
    const movimientoId = typeof (resultadoMover as Record<string, unknown>)?.["movimientoId"] === "string"
      ? String((resultadoMover as Record<string, unknown>)["movimientoId"])
      : "";
    if (movimientoId) {
      await marcar(pool, tenantId, movimientoId, "ERROR", { motivo: `orquestación falló: ${(err as Error).message}` }).catch(() => undefined);
    }
    return { aplicable: true, estado: "ERROR", motivo: (err as Error).message, movimientoId };
  }
}

/**
 * REPROCESO idempotente de pendientes NO resueltos de un tenant. Reintenta la
 * materialización; el opId determinista garantiza que un pendiente ya
 * materializado (o reprocesado) NO duplica el hecho. Devuelve el resumen.
 */
export async function reprocesarPendientes(
  tenantId: string | undefined = DELTAOPS_TENANT,
): Promise<{ total: number; materializados: number; pendientes: number; resultados: ResultadoOrquestacion[] }> {
  tenantId = tenantId ?? DELTAOPS_TENANT;
  const pool = poolRef();
  const pend = await listarPendientes(tenantId, undefined, pool);
  const resultados: ResultadoOrquestacion[] = [];
  let materializados = 0;
  for (const p of pend) {
    // Reconstruye el snapshot desde el registro durable (sin releer inventario:
    // la fuente física ya no cambia — el movimiento es inmutable).
    const mov: MovimientoSnapshot = {
      movimientoId: p.movimientoId,
      inventarioId: "",
      itemId: p.articuloId,
      otId: p.otId,
      refTipo: p.refTipo ?? "ot",
      familia: p.familia,
      cantidad: p.cantidad,
      unidad: p.unidad,
      ocurridoAt: p.ocurridoAt,
    };
    const r = await materializarMovimiento(tenantId, mov, pool);
    if (r.estado === "MATERIALIZADO") materializados += 1;
    resultados.push(r);
  }
  const restantes = await listarPendientes(tenantId, undefined, pool);
  return { total: pend.length, materializados, pendientes: restantes.length, resultados };
}
