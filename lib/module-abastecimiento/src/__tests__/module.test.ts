/** DGP-013 · Pruebas de MÓDULO (end-to-end): comandos, gobierno, catálogos, idempotencia, concurrencia. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  MODULO,
  crearAbastecimientoRuntime,
  WorkflowPruebaRechazo,
  WorkflowPruebaRechazoTransicion,
  type AbastecimientoRuntime,
} from "..";

const TENANT = "t-abastecimiento";
let rt: AbastecimientoRuntime;

function nuevoRt(opts: Parameters<typeof crearAbastecimientoRuntime>[0] = {}) {
  return crearAbastecimientoRuntime(opts);
}

async function exec(nombre: string, input: Record<string, unknown>) {
  const r = await rt.platform.kernel.commands.execute(rt.ctx(TENANT), nombre, input);
  await rt.platform.kernel.outboxProcessor.processPending();
  return r;
}
async function query(nombre: string, input: Record<string, unknown>) {
  return rt.platform.kernel.queries.execute(rt.ctx(TENANT), nombre, input);
}

/* ------------------------------ Constructores ----------------------------- */
async function crearArticulo(extra: Record<string, unknown> = {}) {
  const r = await exec(`${MODULO}.crear-articulo`, {
    nombre: "Rodamiento 6205", tipo: "componente", unidad: "unidad", metodoValoracion: "promedio-ponderado",
    moneda: "usd", costoEstandar: 10, ...extra,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string; version: number };
}
async function crearProveedor(extra: Record<string, unknown> = {}) {
  const r = await exec(`${MODULO}.crear-proveedor`, { razonSocial: "Aceros S.A.", tipo: "distribuidor", monedaPreferida: "usd", ...extra });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string; version: number };
}
async function crearSolicitud(extra: Record<string, unknown> = {}) {
  const r = await exec(`${MODULO}.crear-solicitud`, {
    titulo: "Repuestos bomba", prioridad: "alta",
    origen: { tipo: "usuario", referenciaId: null, referenciaTipo: null },
    lineas: [{ numero: 1, articuloId: "art-1", cantidad: { valor: 10, unidad: "unidad" } }], ...extra,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string; estado: string; version: number };
}
async function crearOC(proveedorId: string, extra: Record<string, unknown> = {}) {
  const r = await exec(`${MODULO}.crear-orden-compra`, {
    proveedorId, moneda: "usd",
    lineas: [{ numero: 1, articuloId: "art-1", cantidad: { valor: 10, unidad: "unidad" }, precioUnitario: { moneda: "usd", monto: 5 }, toleranciaSobreRecepcion: 0.1 }],
    ...extra,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string; estado: string; total: number; version: number };
}
async function ocEnviada(proveedorId: string, extra: Record<string, unknown> = {}) {
  const oc = await crearOC(proveedorId, extra);
  const ap = await exec(`${MODULO}.transicionar-orden-compra`, { id: oc.id, accion: "aprobar", expectedVersion: oc.version });
  if (!ap.ok) throw new Error("aprobar");
  const v1 = (ap.value as { version: number }).version;
  const en = await exec(`${MODULO}.transicionar-orden-compra`, { id: oc.id, accion: "enviar", expectedVersion: v1 });
  if (!en.ok) throw new Error("enviar");
  return { id: oc.id, version: (en.value as { version: number }).version };
}

/* -------------------------------- Registro -------------------------------- */
describe("Registro del servicio", () => {
  beforeEach(() => { rt = nuevoRt(); });
  it("expone el servicio y ejecuta comandos con código consecutivo", async () => {
    const a = await crearArticulo();
    expect(a.codigo.startsWith("ART-")).toBe(true);
    const p = await crearProveedor();
    expect(p.codigo.startsWith("PRV-")).toBe(true);
  });
});

/* ------------------------ Ciclo de vida gobernado ------------------------- */
describe("Solicitud → cotización → OC → recepción", () => {
  beforeEach(() => { rt = nuevoRt(); });

  it("solicitud se crea en borrador y transiciona vía workflow", async () => {
    const s = await crearSolicitud();
    expect(s.estado).toBe("borrador");
    const env = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "enviar", expectedVersion: s.version });
    expect(env.ok && (env.value as { estado: string }).estado === "enviada").toBe(true);
  });

  it("registra cotizaciones y selecciona la mejor por ranking determinista", async () => {
    const s = await crearSolicitud();
    const env = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "enviar", expectedVersion: s.version });
    if (!env.ok) throw new Error("enviar");
    const p1 = await crearProveedor({ razonSocial: "Caro" });
    const p2 = await crearProveedor({ razonSocial: "Barato" });
    await exec(`${MODULO}.registrar-cotizacion`, { solicitudId: s.id, proveedorId: p1.id, moneda: "usd", lineas: [{ numero: 1, articuloId: "art-1", cantidad: { valor: 10, unidad: "unidad" }, precioUnitario: { moneda: "usd", monto: 12 }, plazoEntregaDias: 5 }] });
    const c2 = await exec(`${MODULO}.registrar-cotizacion`, { solicitudId: s.id, proveedorId: p2.id, moneda: "usd", lineas: [{ numero: 1, articuloId: "art-1", cantidad: { valor: 10, unidad: "unidad" }, precioUnitario: { moneda: "usd", monto: 8 }, plazoEntregaDias: 5 }] });
    if (!c2.ok) throw new Error("c2");
    const sel = await exec(`${MODULO}.seleccionar-cotizacion`, { solicitudId: s.id });
    expect(sel.ok).toBe(true);
    if (!sel.ok) return;
    expect((sel.value as { seleccionada: string }).seleccionada).toBe((c2.value as { id: string }).id);
  });

  it("recepción parcial y total actualizan el estado y el costo promedio del artículo", async () => {
    const art = await crearArticulo({ id: "11111111-1111-1111-1111-111111111111" });
    const p = await crearProveedor();
    // Alinea el articuloId de la línea de OC con el artículo catalogado.
    const oc = await ocEnviada(p.id, { lineas: [{ numero: 1, articuloId: art.id, cantidad: { valor: 10, unidad: "unidad" }, precioUnitario: { moneda: "usd", monto: 5 }, toleranciaSobreRecepcion: 0 }] });

    const parcial = await exec(`${MODULO}.registrar-recepcion`, { ordenCompraId: oc.id, expectedVersion: oc.version, lineas: [{ numeroLineaOC: 1, cantidad: { valor: 4, unidad: "unidad" } }] });
    expect(parcial.ok).toBe(true);
    if (!parcial.ok) return;
    expect((parcial.value as { estadoOrden: string }).estadoOrden).toBe("parcialmenteRecibida");
    const v1 = (parcial.value as { version: number }).version;

    const total = await exec(`${MODULO}.registrar-recepcion`, { ordenCompraId: oc.id, expectedVersion: v1, lineas: [{ numeroLineaOC: 1, cantidad: { valor: 6, unidad: "unidad" } }] });
    expect(total.ok).toBe(true);
    if (!total.ok) return;
    expect((total.value as { estadoOrden: string }).estadoOrden).toBe("recibida");

    // Artículo con costoEstandar 10 inicial (sin stock) recibe 10 @ 5 ⇒ promedio 5.
    const q = await query(`${MODULO}.articulo`, { id: art.id });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect((q.value as { costos: { costoPromedio: number } }).costos.costoPromedio).toBe(5);
  });

  it("recepción con novedad no ingresable no alimenta el costo", async () => {
    const art = await crearArticulo({ id: "22222222-2222-2222-2222-222222222222" });
    const p = await crearProveedor();
    const oc = await ocEnviada(p.id, { lineas: [{ numero: 1, articuloId: art.id, cantidad: { valor: 5, unidad: "unidad" }, precioUnitario: { moneda: "usd", monto: 7 }, toleranciaSobreRecepcion: 0 }] });
    const r = await exec(`${MODULO}.registrar-recepcion`, { ordenCompraId: oc.id, expectedVersion: oc.version, lineas: [{ numeroLineaOC: 1, cantidad: { valor: 5, unidad: "unidad" }, novedad: "averiado" }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { conNovedades: boolean }).conNovedades).toBe(true);
    expect((r.value as { costosActualizados: unknown[] }).costosActualizados).toHaveLength(0);
  });

  it("rechaza recibir por encima del tope (ordenado + tolerancia)", async () => {
    const p = await crearProveedor();
    const oc = await ocEnviada(p.id, { lineas: [{ numero: 1, articuloId: "art-x", cantidad: { valor: 10, unidad: "unidad" }, precioUnitario: { moneda: "usd", monto: 5 }, toleranciaSobreRecepcion: 0.1 }] });
    const r = await exec(`${MODULO}.registrar-recepcion`, { ordenCompraId: oc.id, expectedVersion: oc.version, lineas: [{ numeroLineaOC: 1, cantidad: { valor: 12, unidad: "unidad" } }] });
    expect(r.ok).toBe(false);
  });
});

/* -------------------------- Gobierno SIN bypass --------------------------- */
describe("Gobierno SIN bypass", () => {
  it("SIN adaptador de workflow: crear-solicitud falla de forma segura", async () => {
    rt = nuevoRt({ workflow: null });
    const r = await exec(`${MODULO}.crear-solicitud`, {
      titulo: "X", prioridad: "alta", origen: { tipo: "usuario" },
      lineas: [{ numero: 1, articuloId: "a", cantidad: { valor: 1, unidad: "unidad" } }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-CFL-001");
    const lista = await query(`${MODULO}.solicitudes`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(0);
  });

  it("workflow que RECHAZA la apertura impide crear la solicitud (sin efecto)", async () => {
    rt = nuevoRt({ workflow: new WorkflowPruebaRechazo() });
    const r = await exec(`${MODULO}.crear-solicitud`, {
      titulo: "X", prioridad: "alta", origen: { tipo: "usuario" },
      lineas: [{ numero: 1, articuloId: "a", cantidad: { valor: 1, unidad: "unidad" } }],
    });
    expect(r.ok).toBe(false);
    const lista = await query(`${MODULO}.solicitudes`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(0);
  });

  it("workflow que RECHAZA la transición impide enviar la solicitud (sigue en borrador)", async () => {
    rt = nuevoRt({ workflow: new WorkflowPruebaRechazoTransicion() });
    const s = await crearSolicitud();
    const env = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "enviar", expectedVersion: s.version });
    expect(env.ok).toBe(false);
    const q = await query(`${MODULO}.solicitud`, { id: s.id });
    expect(q.ok && (q.value as { estado: string }).estado).toBe("borrador");
  });

  it("workflow que RECHAZA la transición impide recibir (OC sin cambios)", async () => {
    rt = nuevoRt({ workflow: new WorkflowPruebaRechazoTransicion() });
    const p = await crearProveedor();
    // Sin poder transicionar, la OC no puede llegar a 'enviada': recibir falla.
    const oc = await crearOC(p.id);
    const r = await exec(`${MODULO}.transicionar-orden-compra`, { id: oc.id, accion: "aprobar", expectedVersion: oc.version });
    expect(r.ok).toBe(false);
  });
});

/* --------------------------------- Catálogos ------------------------------ */
describe("Catálogos (semántica canónica)", () => {
  beforeEach(() => { rt = nuevoRt(); });

  it("catálogo vacío acepta valores canónicos y rechaza no canónicos", async () => {
    const okC = await exec(`${MODULO}.crear-articulo`, { nombre: "A", tipo: "lubricante", unidad: "litro", metodoValoracion: "promedio-ponderado", moneda: "usd" });
    expect(okC.ok).toBe(true);
    const bad = await exec(`${MODULO}.crear-articulo`, { nombre: "B", tipo: "inexistente", unidad: "unidad", metodoValoracion: "promedio-ponderado", moneda: "usd" });
    expect(bad.ok).toBe(false);
  });

  it("catálogo administrado: sólo acepta el valor si existe y está habilitado", async () => {
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "tipos-articulo", clave: "especial", etiqueta: "Especial" });
    const okC = await exec(`${MODULO}.crear-articulo`, { nombre: "A", tipo: "especial", unidad: "unidad", metodoValoracion: "promedio-ponderado", moneda: "usd" });
    expect(okC.ok).toBe(true);
    // Un canónico ya NO aplica: el catálogo dejó de estar vacío.
    const bad = await exec(`${MODULO}.crear-articulo`, { nombre: "B", tipo: "componente", unidad: "unidad", metodoValoracion: "promedio-ponderado", moneda: "usd" });
    expect(bad.ok).toBe(false);
    // Deshabilitar impide su uso.
    await exec(`${MODULO}.catalogo-habilitar`, { catalogo: "tipos-articulo", clave: "especial", habilitado: false });
    const bad2 = await exec(`${MODULO}.crear-articulo`, { nombre: "C", tipo: "especial", unidad: "unidad", metodoValoracion: "promedio-ponderado", moneda: "usd" });
    expect(bad2.ok).toBe(false);
  });

  it("expone opciones de catálogo por consulta", async () => {
    const q = await query(`${MODULO}.catalogo-opciones`, { catalogo: "prioridades" });
    expect(q.ok).toBe(true);
  });
});

/* ------------------------------- Idempotencia ----------------------------- */
describe("Idempotencia (opId)", () => {
  beforeEach(() => { rt = nuevoRt(); });
  it("re-ejecutar el mismo opId no crea un segundo artículo", async () => {
    const opId = "op-articulo-1";
    const r1 = await exec(`${MODULO}.crear-articulo`, { opId, nombre: "A", tipo: "componente", unidad: "unidad", metodoValoracion: "promedio-ponderado", moneda: "usd" });
    const r2 = await exec(`${MODULO}.crear-articulo`, { opId, nombre: "A", tipo: "componente", unidad: "unidad", metodoValoracion: "promedio-ponderado", moneda: "usd" });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect((r1.value as { id: string }).id).toBe((r2.value as { id: string }).id);
    expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
    const lista = await query(`${MODULO}.articulos`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(1);
  });
});

/* ------------------- Concurrencia optimista (versionado) ------------------ */
describe("Concurrencia optimista", () => {
  beforeEach(() => { rt = nuevoRt(); });
  it("editar con expectedVersion desactualizada es rechazado", async () => {
    const a = await crearArticulo();
    const ed = await exec(`${MODULO}.editar-articulo`, { id: a.id, expectedVersion: a.version, nombre: "Nuevo nombre" });
    expect(ed.ok).toBe(true);
    // Reintentar con la versión vieja falla (ya avanzó).
    const stale = await exec(`${MODULO}.editar-articulo`, { id: a.id, expectedVersion: a.version, nombre: "Otro" });
    expect(stale.ok).toBe(false);
  });

  it("calificar proveedor recomputa el promedio y avanza versión", async () => {
    const p = await crearProveedor();
    const cal = await exec(`${MODULO}.calificar-proveedor`, { id: p.id, expectedVersion: p.version, calidad: 4, tiempo: 5, precio: 3, servicio: 4 });
    expect(cal.ok).toBe(true);
    if (!cal.ok) return;
    expect((cal.value as { version: number }).version).toBe(p.version + 1);
    expect((cal.value as { calificacionPromedio: number }).calificacionPromedio).toBeGreaterThan(0);
  });
});

/* ------- DGP-021.0 · Contrato de costos exactos (puerto string-safe) ------- */
// Prueba del PUERTO de lectura string-safe (`costosExactosPorArticulo`) contra
// el Fake, verificando el TIPO (string) y la semántica SIN COSTO ≠ "0". El
// camino de PRECISIÓN EXACTA (numeric leído del driver) se prueba con PG real
// en `module.pg.test.ts`.
describe("DGP-021.0 · costos exactos (string-safe)", () => {
  it("el puerto devuelve montos como STRING y distingue ausencia de cero", async () => {
    const { FakeReadModelsStore } = await import("../infrastructure/operacional");
    const store = new FakeReadModelsStore();

    // AUSENCIA: sin fila ⇒ [] (jamás "0").
    const vacio = await store.costosExactosPorArticulo(TENANT, "art-sin-costo");
    expect(vacio.ok).toBe(true);
    if (vacio.ok) expect(vacio.value).toEqual([]);

    // Sembrar CERO real vía el respaldo STRING-ONLY (no vía el read model float).
    const now = new Date("2024-01-01T00:00:00.000Z");
    store.sembrarCostoExacto({
      tenantId: TENANT, articuloId: "art-cero", moneda: "usd", metodoValoracion: "promedio-ponderado",
      costoUnitario: "0.000000", cantidadAcumulada: "0.000000", actualizadoAt: now,
    });

    const r = await store.costosExactosPorArticulo(TENANT, "art-cero");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(1);
    expect(typeof r.value[0]!.costoUnitario).toBe("string");
    expect(r.value[0]!.costoUnitario).toBe("0.000000"); // CERO real, no ausencia
  });

  it("el respaldo fake es STRING-ONLY: preserva un valor float-inseguro intacto y NO acepta number", async () => {
    const { FakeReadModelsStore } = await import("../infrastructure/operacional");
    const store = new FakeReadModelsStore();
    const now = new Date("2024-01-01T00:00:00.000Z");

    // Valor NO representable exactamente en float64: 11 enteros + 6 decimales.
    // Si pasara por Number()/toFixed(6) se corrompería.
    const CRUDO = "12345678901.123456";
    // Evidencia de que float LO PIERDE: la ida-y-vuelta por number cambia el valor.
    expect(Number(CRUDO).toFixed(6)).not.toBe(CRUDO);

    store.sembrarCostoExacto({
      tenantId: TENANT, articuloId: "art-preciso", moneda: "clp", metodoValoracion: "promedio-ponderado",
      costoUnitario: CRUDO, cantidadAcumulada: "0.000001", actualizadoAt: now,
    });
    const r = await store.costosExactosPorArticulo(TENANT, "art-preciso");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // La cadena sobrevive BIT A BIT (nunca tocó float en el fake).
    expect(r.value[0]!.costoUnitario).toBe(CRUDO);
    expect(r.value[0]!.cantidadAcumulada).toBe("0.000001");

    // El fake NO puede fabricar silenciosamente un string exacto desde un number:
    // el seeder string-only rechaza montos numéricos (barrera dura anti-float).
    expect(() => store.sembrarCostoExacto({
      tenantId: TENANT, articuloId: "art-preciso", moneda: "usd", metodoValoracion: "promedio-ponderado",
      costoUnitario: 12345678901.123456 as unknown as string, cantidadAcumulada: "0.000000", actualizadoAt: now,
    })).toThrow(TypeError);
  });
});
