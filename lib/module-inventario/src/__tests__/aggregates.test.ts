/** DGP-011.1 · Pruebas de AGGREGATES puros: eventos, invariantes, trazabilidad, replay. */
import { describe, expect, it } from "vitest";
import {
  aplicarMovimientoInventario,
  cerrarConteo,
  crearAjuste,
  crearBodega,
  crearExistencia,
  crearItem,
  crearLoteInventario,
  crearReserva,
  crearTransferencia,
  crearUbicacion,
  diferenciasDeConteo,
  editarItem,
  eliminarItem,
  iniciarConteo,
  ITEM_CREADO,
  liberarReserva,
  MOVIMIENTO_REGISTRADO,
  reconstruirStock,
  registrarConteo,
  registrarSerie,
  STOCK_ACTUALIZADO,
  totalStock,
  type Bodega,
  type Inventario,
  type UbicacionFisica,
} from "..";

const AHORA = new Date("2026-01-01T00:00:00Z");
const codigo = { valor: "ITM-000001", prefijo: "ITM", secuencia: 1 } as const;
const unidad = { clave: "unidad", factorBase: 1 } as const;
const sku = { valor: "SKU-1" } as const;

function itemBase(modo: "sin-lote" | "con-lote" | "con-serie" | "lote-y-serie" = "sin-lote") {
  const r = crearItem({
    id: "i1", tenantId: "t1", codigo, sku, nombre: "Tornillo",
    estado: "activo", unidadBase: unidad, modoTrazabilidad: modo,
    reposicion: { minimo: 1, maximo: 10, puntoReorden: 3 },
    clasificacion: { tipoItem: "insumo", categoria: null, familia: null, subfamilia: null, marca: null, fabricante: null, modelo: null, empresa: null, centroCosto: null, proyecto: null },
    actorId: "u1", maxLongitudNombre: 200, ahora: AHORA,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value.item;
}

const ubic: UbicacionFisica = { ubicacionId: "ub1", segmentos: [{ nivel: "pasillo", valor: "A" }], ruta: "A" };

function existencia(): Inventario {
  return crearExistencia({ id: "inv1", tenantId: "t1", itemId: "i1", bodegaId: "b1", ubicacion: ubic, ahora: AHORA });
}

describe("Aggregate · ItemInventario", () => {
  it("crea con evento autosuficiente", () => {
    const r = crearItem({
      id: "i1", tenantId: "t1", codigo, sku, nombre: "Tornillo",
      estado: "activo", unidadBase: unidad, modoTrazabilidad: "sin-lote",
      reposicion: { minimo: 0, maximo: 0, puntoReorden: 0 },
      clasificacion: { tipoItem: "insumo", categoria: null, familia: null, subfamilia: null, marca: null, fabricante: null, modelo: null, empresa: null, centroCosto: null, proyecto: null },
      actorId: "u1", maxLongitudNombre: 200, ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.evento.tipo).toBe(ITEM_CREADO);
    expect(r.value.evento.payload["sku"]).toEqual(sku);
    expect(r.value.evento.payload["version"]).toBe(1);
  });
  it("rechaza control de vencimiento sin lote", () => {
    const r = crearItem({
      id: "i1", tenantId: "t1", codigo, sku, nombre: "X", estado: "activo", unidadBase: unidad,
      modoTrazabilidad: "sin-lote", controlaVencimiento: true,
      reposicion: { minimo: 0, maximo: 0, puntoReorden: 0 },
      clasificacion: { tipoItem: "insumo", categoria: null, familia: null, subfamilia: null, marca: null, fabricante: null, modelo: null, empresa: null, centroCosto: null, proyecto: null },
      actorId: "u1", maxLongitudNombre: 200, ahora: AHORA,
    });
    expect(r.ok).toBe(false);
  });
  it("edita e incrementa versión; eliminado es inmutable", () => {
    const item = itemBase();
    const e = editarItem(item, { nombre: "Tornillo M6" }, "u1", 200, AHORA);
    expect(e.ok).toBe(true);
    if (e.ok) expect(e.value.item.version).toBe(2);
    const del = eliminarItem(item, "u1", AHORA);
    if (del.ok) {
      const noEdit = editarItem(del.value.item, { nombre: "x" }, "u1", 200, AHORA);
      expect(noEdit.ok).toBe(false);
    }
  });
});

describe("Aggregate · Inventario (movimientos-evento)", () => {
  it("emite MovimientoRegistrado + StockActualizado y respeta invariantes", () => {
    const inv = existencia();
    const r = aplicarMovimientoInventario(inv, { movimientoId: "m1", tipo: "entrada", familia: "entrada", cantidad: 5, actorId: "u1", ahora: AHORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.eventos.map((e) => e.tipo)).toEqual([MOVIMIENTO_REGISTRADO, STOCK_ACTUALIZADO]);
    expect(r.value.inventario.stock.disponible).toBe(5);
    expect(r.value.movimiento.stockAntes.disponible).toBe(0);
    expect(r.value.movimiento.stockDespues.disponible).toBe(5);
  });
  it("reconstruye stock por replay del historial (idempotencia contable)", () => {
    let inv = existencia();
    const movimientos = [];
    for (const q of [5, 3, 2]) {
      const r = aplicarMovimientoInventario(inv, { movimientoId: `m${q}`, tipo: "entrada", familia: "entrada", cantidad: q, actorId: "u1", ahora: AHORA });
      if (!r.ok) throw new Error(r.error.message);
      inv = r.value.inventario;
      movimientos.push(r.value.movimiento);
    }
    const reconstruido = reconstruirStock(movimientos);
    expect(reconstruido.disponible).toBe(inv.stock.disponible);
    expect(totalStock(reconstruido)).toBe(10);
  });
});

describe("Aggregate · Bodega/Ubicación jerárquicas", () => {
  it("crea bodega y ubicación con ruta acumulada", () => {
    const b = crearBodega({ id: "b1", tenantId: "t1", codigo: "BOD1", nombre: "Central", tipo: "principal", actorId: "u1", ahora: AHORA });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const u1 = crearUbicacion({ id: "u1", tenantId: "t1", bodega: b.value.bodega, segmento: { nivel: "pasillo", valor: "A" }, actorId: "u1", ahora: AHORA });
    expect(u1.ok).toBe(true);
    if (!u1.ok) return;
    const u2 = crearUbicacion({ id: "u2", tenantId: "t1", bodega: b.value.bodega, padre: u1.value.ubicacion, segmento: { nivel: "estanteria", valor: "03" }, actorId: "u1", ahora: AHORA });
    if (u2.ok) expect(u2.value.ubicacion.ruta).toBe("A/03");
  });
  it("rechaza ubicación padre de otra bodega", () => {
    const b1 = crearBodega({ id: "b1", tenantId: "t1", codigo: "B1", nombre: "N", tipo: "principal", actorId: "u1", ahora: AHORA });
    const b2 = crearBodega({ id: "b2", tenantId: "t1", codigo: "B2", nombre: "N", tipo: "principal", actorId: "u1", ahora: AHORA });
    if (!b1.ok || !b2.ok) return;
    const u1 = crearUbicacion({ id: "u1", tenantId: "t1", bodega: b1.value.bodega, segmento: { nivel: "pasillo", valor: "A" }, actorId: "u1", ahora: AHORA });
    if (!u1.ok) return;
    const bad = crearUbicacion({ id: "u2", tenantId: "t1", bodega: b2.value.bodega, padre: u1.value.ubicacion, segmento: { nivel: "nivel", valor: "1" }, actorId: "u1", ahora: AHORA });
    expect(bad.ok).toBe(false);
  });
});

describe("Aggregate · Lote / Serie (trazabilidad)", () => {
  it("crea lote y registra su historial", () => {
    const l = crearLoteInventario({ id: "l1", tenantId: "t1", itemId: "i1", codigo: "L-1", actorId: "u1", ahora: AHORA });
    expect(l.ok).toBe(true);
  });
  it("registra serie", () => {
    const s = registrarSerie({ id: "s1", tenantId: "t1", itemId: "i1", numero: "SN-1", actorId: "u1", ahora: AHORA });
    expect(s.ok).toBe(true);
  });
});

describe("Aggregate · Reserva", () => {
  it("crea y libera parcial sin romper consistencia", () => {
    const r = crearReserva({ id: "r1", tenantId: "t1", itemId: "i1", inventarioId: "inv1", bodegaId: "b1", ubicacionId: "ub1", tipo: "orden-trabajo", demanda: { tipo: "ot", id: "ot1" }, cantidad: 5, actorId: "u1", ahora: AHORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lib = liberarReserva(r.value.reserva, 2, "u1", AHORA);
    expect(lib.ok).toBe(true);
    if (lib.ok) {
      expect(lib.value.reserva.estado).toBe("activa");
      expect(lib.value.evento.payload["liberado"]).toBe(2);
    }
  });
  it("rechaza liberar más que lo pendiente", () => {
    const r = crearReserva({ id: "r1", tenantId: "t1", itemId: "i1", inventarioId: "inv1", bodegaId: "b1", ubicacionId: "ub1", tipo: "proyecto", demanda: { tipo: "p", id: "p1" }, cantidad: 3, actorId: "u1", ahora: AHORA });
    if (!r.ok) return;
    expect(liberarReserva(r.value.reserva, 5, "u1", AHORA).ok).toBe(false);
  });
});

describe("Aggregate · Transferencia / Ajuste / Conteo", () => {
  const wf = { proceso: "transferencia" as const, definicion: "d", instanciaId: null, version: 1 };
  it("transferencia exige extremos distintos", () => {
    const bad = crearTransferencia({
      id: "tr1", tenantId: "t1",
      origen: { bodegaId: "b1", ubicacionId: "u1", empresa: null, proyecto: null, centroCosto: null },
      destino: { bodegaId: "b1", ubicacionId: "u1", empresa: null, proyecto: null, centroCosto: null },
      lineas: [{ itemId: "i1", cantidad: 1, loteCodigo: null, serieNumero: null }],
      workflow: wf, estadoInicial: "en-transito", actorId: "u1", ahora: AHORA,
    });
    expect(bad.ok).toBe(false);
  });
  it("ajuste rechaza delta cero", () => {
    const bad = crearAjuste({
      id: "a1", tenantId: "t1", tipo: "merma",
      lineas: [{ itemId: "i1", inventarioId: "inv1", bodegaId: "b1", ubicacionId: "u1", loteCodigo: null, serieNumero: null, delta: 0 }],
      workflow: { proceso: "ajuste", definicion: "d", instanciaId: null, version: 1 }, estadoInicial: "aprobado", actorId: "u1", ahora: AHORA,
    });
    expect(bad.ok).toBe(false);
  });
  it("conteo calcula diferencias y no cierra con pendientes", () => {
    const c = iniciarConteo({
      id: "c1", tenantId: "t1", tipo: "parcial",
      lineas: [
        { itemId: "i1", inventarioId: "inv1", bodegaId: "b1", ubicacionId: "u1", loteCodigo: null, serieNumero: null, esperado: 10 },
        { itemId: "i2", inventarioId: "inv2", bodegaId: "b1", ubicacionId: "u1", loteCodigo: null, serieNumero: null, esperado: 5 },
      ],
      workflow: { proceso: "conteo", definicion: "d", instanciaId: null, version: 1 }, actorId: "u1", ahora: AHORA,
    });
    if (!c.ok) return;
    expect(cerrarConteo(c.value.conteo, "u1", AHORA).ok).toBe(false); // pendientes
    const reg = registrarConteo(c.value.conteo, new Map([["inv1", 8], ["inv2", 5]]), "u1", AHORA);
    if (!reg.ok) return;
    const difs = diferenciasDeConteo(reg.value.conteo);
    expect(difs).toHaveLength(1);
    expect(difs[0]!.diferencia).toBe(-2);
    const cerrado = cerrarConteo(reg.value.conteo, "u1", AHORA);
    expect(cerrado.ok).toBe(true);
    if (cerrado.ok) expect(cerrado.value.conteo.estado).toBe("cerrado");
  });
});
