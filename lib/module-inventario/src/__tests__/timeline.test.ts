/**
 * DGP-011.2 · Módulo Enterprise Inventory — Integración con el SHARED TIMELINE.
 *
 * Verifica que CADA evento de dominio del inventario se proyecta al timeline
 * canónico de plataforma vía el COMANDO `platform.timeline.record` (nunca
 * escritura directa) y que la entrega AT-LEAST-ONCE del outbox es IDEMPOTENTE:
 * reprocesar el outbox varias veces produce UNA sola entrada por evento
 * (entryId = event.id). Además comprueba el AISLAMIENTO por tenant.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ExecutionContext, Principal } from "@workspace/kernel";
import { MODULO, crearInventarioRuntime, type InventarioRuntime } from "..";

const TENANT = "t-inv-tl";
const OTRO_TENANT = "t-inv-tl-otro";

let rt: InventarioRuntime;
beforeEach(() => {
  rt = crearInventarioRuntime();
});

const ctx = (tenant: string, principal?: Principal): ExecutionContext => rt.ctx(tenant, principal);
const exec = (c: ExecutionContext, nombre: string, input: Record<string, unknown>) =>
  rt.platform.kernel.commands.execute(c, nombre, input);
const query = (c: ExecutionContext, nombre: string, input: Record<string, unknown>) =>
  rt.platform.kernel.queries.execute(c, nombre, input);
const drenar = () => rt.platform.kernel.outboxProcessor.processPending();

async function entradasTimeline(tenant: string, entityRef: string): Promise<Record<string, unknown>[]> {
  const r = await query(ctx(tenant), "platform.timeline.byEntity", { entityRef });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as Record<string, unknown>[];
}

describe("Módulo · Shared Timeline (proyección canónica vía comando)", () => {
  it("registra UNA entrada por evento y NO duplica ante reentrega at-least-once", async () => {
    // Crear item ⇒ emite ITEM_CREADO (entityRef=inventario-item:<id>).
    const crear = await exec(ctx(TENANT), `${MODULO}.crear-item`, {
      sku: "SKU-TL", nombre: "Item Timeline", estado: "activo", tipoItem: "insumo",
      unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote",
    });
    expect(crear.ok).toBe(true);
    if (!crear.ok) return;
    const itemId = (crear.value as { id: string }).id;

    // Drenado múltiple del outbox: simula la reentrega AT-LEAST-ONCE del bus.
    await drenar();
    await drenar();
    await drenar();

    const entradas = await entradasTimeline(TENANT, `inventario-item:${itemId}`);
    // Exactamente UNA entrada de timeline para el evento ITEM_CREADO.
    expect(entradas.length).toBe(1);
    const data = entradas[0]!["data"] as Record<string, unknown>;
    expect(data["eventType"]).toBe("modulo.inventario.item-creado");
    expect(data["entityRef"]).toBe(`inventario-item:${itemId}`);
    // Entrada autosuficiente: conserva el payload del evento (con VOs anidados).
    const payload = data["payload"] as Record<string, unknown>;
    expect(payload["entityRef"]).toBe(`inventario-item:${itemId}`);
    expect(payload["tenantId"]).toBe(TENANT);
  });

  it("proyecta al timeline eventos de existencias/movimientos sin duplicar", async () => {
    const b = await exec(ctx(TENANT), `${MODULO}.crear-bodega`, { codigo: "BOD-TL", nombre: "Central", tipo: "principal" });
    const bodegaId = (b.ok ? (b.value as { id: string }).id : "");
    const u = await exec(ctx(TENANT), `${MODULO}.crear-ubicacion`, { bodegaId, nivel: "pasillo", valor: "A" });
    const ubicacionId = (u.ok ? (u.value as { id: string }).id : "");
    const it = await exec(ctx(TENANT), `${MODULO}.crear-item`, {
      sku: "SKU-MV", nombre: "Item", estado: "activo", tipoItem: "insumo",
      unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote",
    });
    const itemId = (it.ok ? (it.value as { id: string }).id : "");
    const mv = await exec(ctx(TENANT), `${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 5 });
    expect(mv.ok).toBe(true);
    if (!mv.ok) return;
    const invId = (mv.value as { inventarioId: string }).inventarioId;

    // Reentrega repetida (idempotencia end-to-end).
    await drenar();
    await drenar();

    // La existencia recibe entradas de timeline (movimiento + stock), sin duplicar.
    const entradas = await entradasTimeline(TENANT, `inventario:${invId}`);
    expect(entradas.length).toBeGreaterThanOrEqual(1);
    // Ninguna entrada repetida: los entryId (id de plataforma) son únicos.
    const ids = entradas.map((e) => String(e["id"]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("aísla por tenant: otro tenant no ve las entradas del primero", async () => {
    const crear = await exec(ctx(TENANT), `${MODULO}.crear-item`, {
      sku: "SKU-ISO", nombre: "Item", estado: "activo", tipoItem: "insumo",
      unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote",
    });
    expect(crear.ok).toBe(true);
    if (!crear.ok) return;
    const itemId = (crear.value as { id: string }).id;
    await drenar();

    const propias = await entradasTimeline(TENANT, `inventario-item:${itemId}`);
    expect(propias.length).toBe(1);
    const ajenas = await entradasTimeline(OTRO_TENANT, `inventario-item:${itemId}`);
    expect(ajenas.length).toBe(0);
  });
});
