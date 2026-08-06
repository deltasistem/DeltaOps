/**
 * DGP-011.1 · GOBIERNO DE WORKFLOW (sin bypass de aprobaciones).
 *
 * Verifica que los comandos gobernados —transferir, completar-transferencia,
 * ajustar, iniciar/cerrar-conteo— NO alteran stock, transferencias, ajustes ni
 * conteos cuando:
 *   (a) el módulo se monta SIN adaptador de workflow aprobado (fallo seguro de
 *       configuración), y
 *   (b) el adaptador de workflow RECHAZA la transición.
 * En ambos casos: comando rechazado, stock intacto y sin eventos de efecto.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MODULO, WorkflowPruebaRechazo, WorkflowPruebaRechazoTransicion, crearInventarioRuntime, type InventarioRuntime } from "..";

const TENANT = "t-gov";

function harness(rt: InventarioRuntime) {
  const ctx = () => rt.ctx(TENANT);
  // CQRS (DGP-011.2): las lecturas sirven desde read models materializados al
  // drenar el outbox. `exec` drena tras cada comando (equivalente al patrón de
  // `module-ordenes`) para que las consultas vean el efecto proyectado.
  const exec = async (n: string, i: Record<string, unknown>) => {
    const r = await rt.platform.kernel.commands.execute(ctx(), n, i);
    await rt.platform.kernel.outboxProcessor.processPending();
    return r;
  };
  const query = (n: string, i: Record<string, unknown>) => rt.platform.kernel.queries.execute(ctx(), n, i);
  return { exec, query };
}

/** Semilla común: bodega + 2 ubicaciones + item + 10 de stock. NO usa workflow. */
async function sembrar(rt: InventarioRuntime) {
  const { exec } = harness(rt);
  const b = await exec(`${MODULO}.crear-bodega`, { codigo: "BOD1", nombre: "Central", tipo: "principal" });
  if (!b.ok) throw new Error(b.error.message);
  const bodegaId = (b.value as { id: string }).id;
  const u1 = await exec(`${MODULO}.crear-ubicacion`, { bodegaId, nivel: "pasillo", valor: "A" });
  const u2 = await exec(`${MODULO}.crear-ubicacion`, { bodegaId, nivel: "pasillo", valor: "B" });
  if (!u1.ok || !u2.ok) throw new Error("ubicacion");
  const it = await exec(`${MODULO}.crear-item`, { sku: "SKU-1", nombre: "Tornillo", estado: "activo", tipoItem: "insumo", unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote" });
  if (!it.ok) throw new Error(it.error.message);
  const itemId = (it.value as { id: string }).id;
  const ent = await exec(`${MODULO}.mover`, { itemId, bodegaId, ubicacionId: (u1.value as { id: string }).id, tipo: "entrada", cantidad: 10 });
  if (!ent.ok) throw new Error(ent.error.message);
  const invId = (ent.value as { inventarioId: string }).inventarioId;
  return { bodegaId, ubic1: (u1.value as { id: string }).id, ubic2: (u2.value as { id: string }).id, itemId, invId };
}

async function stockTotal(rt: InventarioRuntime, itemId: string): Promise<number> {
  const { query } = harness(rt);
  const q = await query(`${MODULO}.existencias-item`, { itemId });
  if (!q.ok) throw new Error(q.error.message);
  return (q.value as { stock: { disponible: number; enTransito: number } }[]).reduce((a, e) => a + e.stock.disponible + e.stock.enTransito, 0);
}
async function disponible(rt: InventarioRuntime, invId: string): Promise<number> {
  const { query } = harness(rt);
  const q = await query(`${MODULO}.existencia`, { id: invId });
  if (!q.ok) throw new Error(q.error.message);
  return (q.value as { stock: { disponible: number } }).stock.disponible;
}
async function movimientos(rt: InventarioRuntime, invId: string): Promise<number> {
  const { query } = harness(rt);
  const q = await query(`${MODULO}.movimientos`, { inventarioId: invId });
  if (!q.ok) throw new Error(q.error.message);
  return (q.value as unknown[]).length;
}

/* --------- (a) Módulo montado SIN adaptador de workflow: fallo seguro -------- */

describe("Gobierno · SIN WorkflowPort aprobado ⇒ comandos gobernados fallan seguro", () => {
  let rt: InventarioRuntime;
  let sem: Awaited<ReturnType<typeof sembrar>>;
  beforeEach(async () => {
    rt = crearInventarioRuntime({ workflow: null }); // ensamblado sin workflow
    sem = await sembrar(rt);
  });

  it("transferir se rechaza por configuración y no mueve stock (sin en-tránsito)", async () => {
    const { exec } = harness(rt);
    const movsAntes = await movimientos(rt, sem.invId);
    const r = await exec(`${MODULO}.transferir`, {
      origen: { bodegaId: sem.bodegaId, ubicacionId: sem.ubic1 },
      destino: { bodegaId: sem.bodegaId, ubicacionId: sem.ubic2 },
      lineas: [{ itemId: sem.itemId, cantidad: 6 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KRN-CFL-001");
    expect(await disponible(rt, sem.invId)).toBe(10); // intacto
    expect(await stockTotal(rt, sem.itemId)).toBe(10);
    expect(await movimientos(rt, sem.invId)).toBe(movsAntes); // sin eventos de efecto
    const tr = await harness(rt).query(`${MODULO}.item`, { id: sem.itemId }); // sanity
    expect(tr.ok).toBe(true);
  });

  it("ajustar se rechaza por configuración y no altera existencias", async () => {
    const { exec } = harness(rt);
    const movsAntes = await movimientos(rt, sem.invId);
    const r = await exec(`${MODULO}.ajustar`, { tipo: "merma", lineas: [{ itemId: sem.itemId, bodegaId: sem.bodegaId, ubicacionId: sem.ubic1, delta: -4 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KRN-CFL-001");
    expect(await disponible(rt, sem.invId)).toBe(10);
    expect(await movimientos(rt, sem.invId)).toBe(movsAntes);
  });

  it("iniciar-conteo se rechaza por configuración (no crea conteo)", async () => {
    const { exec } = harness(rt);
    const r = await exec(`${MODULO}.iniciar-conteo`, { tipo: "ciclico", lineas: [{ inventarioId: sem.invId }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KRN-CFL-001");
    expect(await disponible(rt, sem.invId)).toBe(10);
  });
});

/* ------- (b) Adaptador de workflow que RECHAZA transición: sin efecto -------- */

describe("Gobierno · WorkflowPort que RECHAZA ⇒ sin efecto de negocio", () => {
  it("transferir con motor que deniega no mueve stock ni crea transferencia", async () => {
    const rt = crearInventarioRuntime({ workflow: new WorkflowPruebaRechazo() });
    const sem = await sembrar(rt);
    const { exec, query } = harness(rt);
    const movsAntes = await movimientos(rt, sem.invId);
    const r = await exec(`${MODULO}.transferir`, {
      origen: { bodegaId: sem.bodegaId, ubicacionId: sem.ubic1 },
      destino: { bodegaId: sem.bodegaId, ubicacionId: sem.ubic2 },
      lineas: [{ itemId: sem.itemId, cantidad: 6 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KRN-AUTH-002"); // aprobación denegada
    expect(await disponible(rt, sem.invId)).toBe(10);
    expect(await stockTotal(rt, sem.itemId)).toBe(10);
    expect(await movimientos(rt, sem.invId)).toBe(movsAntes);
    const exs = await query(`${MODULO}.existencias-item`, { itemId: sem.itemId });
    if (exs.ok) expect((exs.value as unknown[]).length).toBe(1); // no existencia en destino
  });

  it("transicionar-transferencia con motor que deniega no aplica recepción (no-bypass)", async () => {
    // Motor que aprueba el despacho pero RECHAZA la transición de recepción: la
    // transferencia queda en tránsito y el destino NO recibe stock.
    const rt = crearInventarioRuntime({ workflow: new WorkflowPruebaRechazoTransicion() });
    const sem = await sembrar(rt);
    const { exec, query } = harness(rt);
    const tr = await exec(`${MODULO}.transferir`, {
      origen: { bodegaId: sem.bodegaId, ubicacionId: sem.ubic1 },
      destino: { bodegaId: sem.bodegaId, ubicacionId: sem.ubic2 },
      lineas: [{ itemId: sem.itemId, cantidad: 6 }],
    });
    if (!tr.ok) throw new Error(tr.error.message);
    const trId = (tr.value as { id: string }).id;
    // Despacho aplicado: 6 en tránsito, 4 disponibles en origen.
    expect(await disponible(rt, sem.invId)).toBe(4);
    const movsAntes = await movimientos(rt, sem.invId);
    const r = await exec(`${MODULO}.transicionar-transferencia`, { id: trId, accion: "recibir", expectedVersion: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KRN-AUTH-002");
    // Sin recepción: destino no recibió stock y no hubo movimientos nuevos.
    expect(await stockTotal(rt, sem.itemId)).toBe(10);
    expect(await movimientos(rt, sem.invId)).toBe(movsAntes);
    const exs = await query(`${MODULO}.existencias-item`, { itemId: sem.itemId });
    if (exs.ok) {
      const destino = (exs.value as { ubicacionId: string; stock: { disponible: number } }[]).find((e) => e.ubicacionId === sem.ubic2);
      expect(destino?.stock.disponible ?? 0).toBe(0);
    }
  });

  it("ajustar con motor que deniega no altera existencias", async () => {
    const rt = crearInventarioRuntime({ workflow: new WorkflowPruebaRechazo() });
    const sem = await sembrar(rt);
    const { exec } = harness(rt);
    const movsAntes = await movimientos(rt, sem.invId);
    const r = await exec(`${MODULO}.ajustar`, { tipo: "merma", lineas: [{ itemId: sem.itemId, bodegaId: sem.bodegaId, ubicacionId: sem.ubic1, delta: -4 }] });
    expect(r.ok).toBe(false);
    expect(await disponible(rt, sem.invId)).toBe(10);
    expect(await movimientos(rt, sem.invId)).toBe(movsAntes);
  });

  it("cerrar-conteo con motor que deniega la transición no aplica conciliación", async () => {
    // Motor que APRUEBA la apertura pero RECHAZA la transición de cierre: el
    // conteo se abre y registra, pero el cierre gobernado se deniega ⇒ el stock
    // NO se concilia (permanece en 10, no baja a 3) y no hay eventos de efecto.
    const rt = crearInventarioRuntime({ workflow: new WorkflowPruebaRechazoTransicion() });
    const sem = await sembrar(rt);
    const h = harness(rt);
    const ini = await h.exec(`${MODULO}.iniciar-conteo`, { tipo: "ciclico", lineas: [{ inventarioId: sem.invId }] });
    if (!ini.ok) throw new Error(ini.error.message);
    const conteoId = (ini.value as { id: string }).id;
    const reg = await h.exec(`${MODULO}.registrar-conteo`, { id: conteoId, expectedVersion: 1, contados: [{ inventarioId: sem.invId, cantidad: 3 }] });
    expect(reg.ok).toBe(true);
    const movsAntes = await movimientos(rt, sem.invId);
    const cerrar = await h.exec(`${MODULO}.cerrar-conteo`, { id: conteoId, expectedVersion: 2, aplicarDiferencias: true });
    expect(cerrar.ok).toBe(false);
    if (!cerrar.ok) expect(cerrar.error.code).toBe("KRN-AUTH-002");
    expect(await disponible(rt, sem.invId)).toBe(10); // sin conciliación
    expect(await movimientos(rt, sem.invId)).toBe(movsAntes); // sin ajuste de conteo
  });
});
