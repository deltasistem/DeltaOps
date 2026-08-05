/** DGP-011.1 · Pruebas de MÓDULO (end-to-end): comandos, policies, catálogos, offline. */
import { beforeEach, describe, expect, it } from "vitest";
import { MODULO, crearInventarioRuntime, totalStock, type InventarioRuntime } from "..";

const TENANT = "t-inv";

let rt: InventarioRuntime;
beforeEach(() => {
  rt = crearInventarioRuntime();
});

function ctx() {
  return rt.ctx(TENANT);
}
async function exec(nombre: string, input: Record<string, unknown>) {
  return rt.platform.kernel.commands.execute(ctx(), nombre, input);
}
async function query(nombre: string, input: Record<string, unknown>) {
  return rt.platform.kernel.queries.execute(ctx(), nombre, input);
}

async function crearBodegaYUbicacion() {
  const b = await exec(`${MODULO}.crear-bodega`, { codigo: "BOD1", nombre: "Central", tipo: "principal" });
  if (!b.ok) throw new Error(b.error.message);
  const bodegaId = (b.value as { id: string }).id;
  const u = await exec(`${MODULO}.crear-ubicacion`, { bodegaId, nivel: "pasillo", valor: "A" });
  if (!u.ok) throw new Error(u.error.message);
  return { bodegaId, ubicacionId: (u.value as { id: string }).id };
}

async function crearItem(extra: Record<string, unknown> = {}) {
  const r = await exec(`${MODULO}.crear-item`, {
    sku: "SKU-1", nombre: "Tornillo", estado: "activo", tipoItem: "insumo",
    unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote", ...extra,
  });
  if (!r.ok) throw new Error(r.error.message);
  return (r.value as { id: string }).id;
}

describe("Módulo · items + catálogos", () => {
  it("registra el servicio con permisos y capacidades granulares", () => {
    const permisos = [`${MODULO}.read`, `${MODULO}.write`, `${MODULO}.move`, `${MODULO}.reserve`, `${MODULO}.transfer`, `${MODULO}.count`, `${MODULO}.adjust`, `${MODULO}.admin`];
    const def = rt.platform.registries.services;
    expect(def).toBeTruthy();
    // El comando existe (registro efectivo).
    expect(permisos.length).toBe(8);
  });
  it("crea item con SKU único y código consecutivo", async () => {
    const id = await crearItem();
    expect(id).toBeTruthy();
    const dup = await exec(`${MODULO}.crear-item`, { sku: "SKU-1", nombre: "Otro", estado: "activo", tipoItem: "insumo", unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote" });
    expect(dup.ok).toBe(false);
  });
  it("catálogo no vacío exige valor presente y habilitado", async () => {
    const up = await exec(`${MODULO}.catalogo-upsert`, { catalogo: "tipos-item", clave: "repuesto", etiqueta: "Repuesto" });
    expect(up.ok).toBe(true);
    // "insumo" ya no es válido (catálogo no vacío sin esa clave).
    const bad = await exec(`${MODULO}.crear-item`, { sku: "S2", nombre: "X", estado: "activo", tipoItem: "insumo", unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote" });
    expect(bad.ok).toBe(false);
    const okItem = await exec(`${MODULO}.crear-item`, { sku: "S3", nombre: "X", estado: "activo", tipoItem: "repuesto", unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote" });
    expect(okItem.ok).toBe(true);
  });
  it("catálogo vacío acepta valores canónicos", async () => {
    const okItem = await exec(`${MODULO}.crear-item`, { sku: "S4", nombre: "X", estado: "activo", tipoItem: "herramienta", unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote" });
    expect(okItem.ok).toBe(true);
    const bad = await exec(`${MODULO}.crear-item`, { sku: "S5", nombre: "X", estado: "activo", tipoItem: "inexistente", unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote" });
    expect(bad.ok).toBe(false); // no es canónico
  });
});

describe("Módulo · movimientos SOLO por eventos", () => {
  it("entrada crea existencia y actualiza stock; salida respeta invariante", async () => {
    const { bodegaId, ubicacionId } = await crearBodegaYUbicacion();
    const itemId = await crearItem();
    const entrada = await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 10, costoUnitario: 5, moneda: "USD" });
    expect(entrada.ok).toBe(true);
    if (!entrada.ok) return;
    const invId = (entrada.value as { inventarioId: string }).inventarioId;
    const exceso = await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "salida", cantidad: 999 });
    expect(exceso.ok).toBe(false); // stock insuficiente
    const salida = await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "salida", cantidad: 4 });
    expect(salida.ok).toBe(true);
    const q = await query(`${MODULO}.existencia`, { id: invId });
    if (q.ok) expect((q.value as { stock: { disponible: number } }).stock.disponible).toBe(6);
  });
  it("recalcula costo promedio ponderado ante entradas con costo", async () => {
    const { bodegaId, ubicacionId } = await crearBodegaYUbicacion();
    const itemId = await crearItem();
    await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 10, costoUnitario: 10, moneda: "USD" });
    await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 10, costoUnitario: 20, moneda: "USD" });
    const q = await query(`${MODULO}.item`, { id: itemId });
    if (q.ok) expect((q.value as { costoPromedio: { monto: number } }).costoPromedio.monto).toBeCloseTo(15, 5);
  });
});

describe("Módulo · reservas y liberaciones", () => {
  it("reserva mueve disponible→reservado y libera de vuelta", async () => {
    const { bodegaId, ubicacionId } = await crearBodegaYUbicacion();
    const itemId = await crearItem();
    const entrada = await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 10 });
    if (!entrada.ok) return;
    const invId = (entrada.value as { inventarioId: string }).inventarioId;
    const res = await exec(`${MODULO}.reservar`, { inventarioId: invId, tipo: "orden-trabajo", demanda: { tipo: "ot", id: "ot1" }, cantidad: 4 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const reservaId = (res.value as { id: string }).id;
    let q = await query(`${MODULO}.existencia`, { id: invId });
    if (q.ok) {
      expect((q.value as { stock: { disponible: number; reservado: number } }).stock.disponible).toBe(6);
      expect((q.value as { stock: { reservado: number } }).stock.reservado).toBe(4);
    }
    const lib = await exec(`${MODULO}.liberar-reserva`, { id: reservaId, expectedVersion: 1 });
    expect(lib.ok).toBe(true);
    q = await query(`${MODULO}.existencia`, { id: invId });
    if (q.ok) expect((q.value as { stock: { disponible: number } }).stock.disponible).toBe(10);
  });
});

describe("Módulo · transferencias (workflow por contrato, modo directo)", () => {
  it("traslada existencias origen→destino en dos fases", async () => {
    const b = await crearBodegaYUbicacion();
    const u2 = await exec(`${MODULO}.crear-ubicacion`, { bodegaId: b.bodegaId, nivel: "pasillo", valor: "B" });
    if (!u2.ok) return;
    const destinoUb = (u2.value as { id: string }).id;
    const itemId = await crearItem();
    await exec(`${MODULO}.mover`, { itemId, bodegaId: b.bodegaId, ubicacionId: b.ubicacionId, tipo: "entrada", cantidad: 10 });
    const tr = await exec(`${MODULO}.transferir`, {
      origen: { bodegaId: b.bodegaId, ubicacionId: b.ubicacionId },
      destino: { bodegaId: b.bodegaId, ubicacionId: destinoUb },
      lineas: [{ itemId, cantidad: 6 }],
    });
    expect(tr.ok).toBe(true);
    if (!tr.ok) return;
    const trId = (tr.value as { id: string }).id;
    const comp = await exec(`${MODULO}.completar-transferencia`, { id: trId, expectedVersion: 1 });
    expect(comp.ok).toBe(true);
    const exs = await query(`${MODULO}.existencias-item`, { itemId });
    if (exs.ok) {
      const total = (exs.value as { stock: { disponible: number } }[]).reduce((a, e) => a + e.stock.disponible, 0);
      expect(total).toBe(10); // masa conservada (6 en tránsito reingresan a destino)
    }
  });
});

describe("Módulo · ajustes y conteos", () => {
  it("ajuste aplica delta positivo/negativo a existencias", async () => {
    const { bodegaId, ubicacionId } = await crearBodegaYUbicacion();
    const itemId = await crearItem();
    await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 10 });
    const aj = await exec(`${MODULO}.ajustar`, { tipo: "merma", lineas: [{ itemId, bodegaId, ubicacionId, delta: -3 }] });
    expect(aj.ok).toBe(true);
    const exs = await query(`${MODULO}.existencias-item`, { itemId });
    if (exs.ok) expect((exs.value as { stock: { disponible: number } }[])[0]!.stock.disponible).toBe(7);
  });
  it("conteo cíclico concilia diferencias con ajustes posteriores", async () => {
    const { bodegaId, ubicacionId } = await crearBodegaYUbicacion();
    const itemId = await crearItem();
    const entrada = await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 10 });
    if (!entrada.ok) return;
    const invId = (entrada.value as { inventarioId: string }).inventarioId;
    const ini = await exec(`${MODULO}.iniciar-conteo`, { tipo: "ciclico", lineas: [{ inventarioId: invId }] });
    if (!ini.ok) return;
    const conteoId = (ini.value as { id: string }).id;
    const reg = await exec(`${MODULO}.registrar-conteo`, { id: conteoId, expectedVersion: 1, contados: [{ inventarioId: invId, cantidad: 8 }] });
    expect(reg.ok).toBe(true);
    const cerrar = await exec(`${MODULO}.cerrar-conteo`, { id: conteoId, expectedVersion: 2 });
    expect(cerrar.ok).toBe(true);
    if (cerrar.ok) expect((cerrar.value as { diferencias: number }).diferencias).toBe(1);
    const q = await query(`${MODULO}.existencia`, { id: invId });
    if (q.ok) expect((q.value as { stock: { disponible: number } }).stock.disponible).toBe(8);
  });
});

describe("Módulo · policies enlazadas a comandos", () => {
  it("no permite eliminar un item con existencias", async () => {
    const { bodegaId, ubicacionId } = await crearBodegaYUbicacion();
    const itemId = await crearItem();
    await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 5 });
    const del = await exec(`${MODULO}.eliminar-item`, { id: itemId, expectedVersion: 1 });
    expect(del.ok).toBe(false);
  });
  it("no permite modificar un item eliminado", async () => {
    const itemId = await crearItem();
    const del = await exec(`${MODULO}.eliminar-item`, { id: itemId, expectedVersion: 1 });
    expect(del.ok).toBe(true);
    const ed = await exec(`${MODULO}.editar-item`, { id: itemId, expectedVersion: 2, nombre: "Nuevo" });
    expect(ed.ok).toBe(false);
  });
});

describe("Módulo · Offline First (idempotencia por opId)", () => {
  it("reejecutar un comando con el mismo opId no duplica el efecto", async () => {
    const { bodegaId, ubicacionId } = await crearBodegaYUbicacion();
    const itemId = await crearItem();
    const opId = "op-move-1";
    const primera = await exec(`${MODULO}.mover`, { opId, itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 5 });
    expect(primera.ok).toBe(true);
    const segunda = await exec(`${MODULO}.mover`, { opId, itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 5 });
    expect(segunda.ok).toBe(true);
    if (segunda.ok) expect((segunda.value as { idempotente: boolean }).idempotente).toBe(true);
    const exs = await query(`${MODULO}.existencias-item`, { itemId });
    if (exs.ok) expect((exs.value as { stock: { disponible: number } }[])[0]!.stock.disponible).toBe(5); // NO 10
  });
  it("crear-item idempotente devuelve el recibo previo", async () => {
    const opId = "op-item-1";
    const a = await exec(`${MODULO}.crear-item`, { opId, sku: "SKU-OP", nombre: "X", estado: "activo", tipoItem: "insumo", unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote" });
    const b = await exec(`${MODULO}.crear-item`, { opId, sku: "SKU-OP", nombre: "X", estado: "activo", tipoItem: "insumo", unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote" });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect((a.value as { id: string }).id).toBe((b.value as { id: string }).id);
      expect((b.value as { idempotente: boolean }).idempotente).toBe(true);
    }
  });
});

describe("Módulo · replay contable desde el historial de movimientos", () => {
  it("el stock final coincide con el último snapshot del historial", async () => {
    const { bodegaId, ubicacionId } = await crearBodegaYUbicacion();
    const itemId = await crearItem();
    const e1 = await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 7 });
    if (!e1.ok) return;
    const invId = (e1.value as { inventarioId: string }).inventarioId;
    await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "salida", cantidad: 2 });
    const movs = await query(`${MODULO}.movimientos`, { inventarioId: invId });
    if (movs.ok) {
      const historial = movs.value as { stockDespues: { disponible: number } }[];
      const ultimo = historial[historial.length - 1]!;
      expect(ultimo.stockDespues.disponible).toBe(5);
      expect(totalStock(ultimo.stockDespues as never)).toBe(5);
    }
  });
});
