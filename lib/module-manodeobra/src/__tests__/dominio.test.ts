/**
 * DGP-020.3 · Mano de Obra — DOMINIO PURO (sin IO).
 * Cubre: precisión monetaria determinista (§42), unidad no soportada rechazada,
 * versionado de tarifa (no-solape, cierre + nueva vigencia, selección vigente,
 * cruce de períodos), y estados de valoración (VALORADA / SIN_TARIFA / SIN_RECURSO,
 * costo NULL ≠ 0, inmutabilidad de VALORADA).
 */
import { describe, expect, it } from "vitest";
import { aMicros, calcularCosto, esUnidadSoportada, microsACadena, normalizarTarifa } from "../domain/dinero";
import { crearTarifa, cerrarTarifa, cruzaPeriodos, tarifaVigenteEn, type Tarifa } from "../domain/tarifa";
import { costoEstimado, esRevalorable, valorarSesion, type Valoracion } from "../domain/valoracion";
import type { RecursoHumano } from "../domain/recurso";

const D = (iso: string) => new Date(iso);

const recurso: RecursoHumano = {
  tenantId: "t", identityId: "u1", categoriaClave: "soldador", estado: "ACTIVO",
  creadoAt: D("2024-01-01T00:00:00Z"), actualizadoAt: D("2024-01-01T00:00:00Z"), creadoPor: "a", actualizadoPor: "a",
};

const tarifaBase = (over: Partial<Tarifa> = {}): Tarifa => ({
  id: "T1", tenantId: "t", sujetoTipo: "CATEGORIA", sujetoId: "soldador", valor: "40000.000000", moneda: "CLP", unidad: "HORA",
  vigenciaDesde: D("2024-01-01T00:00:00Z"), vigenciaHasta: null, estado: "VIGENTE",
  creadoAt: D("2024-01-01T00:00:00Z"), creadoPor: "a", actualizadoAt: D("2024-01-01T00:00:00Z"), actualizadoPor: "a",
  valorAnterior: null, motivo: null, ...over,
});

describe("DGP-020.3 · precisión monetaria (PUNTO FIJO decimal)", () => {
  it("2h30m × 40000 = 100000.0000 (exacto, cadena canónica)", () => {
    const r = calcularCosto(9_000_000, "40000");
    expect(r.ok && r.value).toBe("100000.000000");
  });
  it("1h20m × 35000 = 46666.6667 (half-up a 4 decimales)", () => {
    const r = calcularCosto(4_800_000, "35000");
    // 46666.66666… → half-up 4 dec = 46666.6667; los 2 últimos dígitos en 0.
    expect(r.ok && r.value).toBe("46666.666700");
  });
  it("el tiempo NO se redondea antes de multiplicar", () => {
    const r = calcularCosto(4_800_000, "35000");
    expect(r.ok && r.value).not.toBe("46550.000000");
  });
  it("frontera ESTRICTA (R2): el dinero de origen externo SÓLO es cadena; number ⇒ rechazo", () => {
    // Un number JS ya pudo perder precisión: se rechaza en la frontera del dominio.
    expect(aMicros(40000 as unknown as string).ok).toBe(false);
    expect(normalizarTarifa(35000.1234 as unknown as string).ok).toBe(false);
    expect(calcularCosto(9_000_000, 40000 as unknown as string).ok).toBe(false);
  });
  it("tarifa fraccional 35000.1234 se conserva exacta y se calcula sin float", () => {
    expect(normalizarTarifa("35000.1234")).toEqual({ ok: true, value: "35000.123400" });
    // 1h × 35000.1234 = 35000.1234 → 4 dec = 35000.123400
    const r = calcularCosto(3_600_000, "35000.1234");
    expect(r.ok && r.value).toBe("35000.123400");
  });
  it("rechaza formato inválido: >6 decimales, negativos, notación científica, espacios y >12 enteros", () => {
    expect(normalizarTarifa("1.1234567").ok).toBe(false);
    expect(normalizarTarifa("-1").ok).toBe(false);
    expect(aMicros("abc").ok).toBe(false);
    expect(aMicros("1e5").ok).toBe(false);
    expect(aMicros(" 100").ok).toBe(false);
    expect(aMicros("100 ").ok).toBe(false);
    expect(aMicros("1234567890123").ok).toBe(false); // 13 dígitos enteros
    expect(aMicros("100").ok).toBe(true);
    expect(aMicros("100.5").ok).toBe(true);
  });
  it("microsACadena/aMicros son inversos exactos", () => {
    const m = aMicros("46666.6667");
    expect(m.ok && microsACadena(m.value)).toBe("46666.666700");
  });
  it("0 tiempo = 0 costo (distinto de SIN_TARIFA null)", () => {
    const r = calcularCosto(0, "40000");
    expect(r.ok && r.value).toBe("0.000000");
  });
});

describe("DGP-020.3 · tarifa versionable", () => {
  it("rechaza unidad no soportada", () => {
    expect(esUnidadSoportada("DIA")).toBe(false);
    const r = crearTarifa({
      id: "T", tenantId: "t", sujetoTipo: "CATEGORIA", sujetoId: "soldador", valor: "1", moneda: "CLP",
      unidad: "DIA", vigenciaDesde: D("2024-01-01T00:00:00Z"), actorId: "a", ahora: D("2024-01-01T00:00:00Z"), existentes: [],
    });
    expect(r.ok).toBe(false);
  });
  it("rechaza solape de vigencias del mismo sujeto", () => {
    const abierta = tarifaBase();
    const r = crearTarifa({
      id: "T2", tenantId: "t", sujetoTipo: "CATEGORIA", sujetoId: "soldador", valor: "50000", moneda: "CLP",
      unidad: "HORA", vigenciaDesde: D("2024-06-01T00:00:00Z"), actorId: "a", ahora: D("2024-06-01T00:00:00Z"), existentes: [abierta],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("conflict");
  });
  it("cierra vigencia + crea nueva sin solape", () => {
    const abierta = tarifaBase();
    const cerrada = cerrarTarifa(abierta, D("2024-06-01T00:00:00Z"), "a", D("2024-06-01T00:00:00Z"));
    expect(cerrada.ok).toBe(true);
    if (!cerrada.ok) return;
    const nueva = crearTarifa({
      id: "T2", tenantId: "t", sujetoTipo: "CATEGORIA", sujetoId: "soldador", valor: "50000", moneda: "CLP",
      unidad: "HORA", vigenciaDesde: D("2024-06-01T00:00:00Z"), actorId: "a", ahora: D("2024-06-01T00:00:00Z"), existentes: [cerrada.value],
    });
    expect(nueva.ok).toBe(true);
  });
  it("tarifaVigenteEn selecciona por intervalo [desde, hasta)", () => {
    const t1 = tarifaBase({ id: "T1", valor: "40000.000000", vigenciaDesde: D("2024-01-01T00:00:00Z"), vigenciaHasta: D("2024-06-01T00:00:00Z"), estado: "CERRADA" });
    const t2 = tarifaBase({ id: "T2", valor: "50000.000000", vigenciaDesde: D("2024-06-01T00:00:00Z"), vigenciaHasta: null });
    expect(tarifaVigenteEn([t1, t2], D("2024-03-01T00:00:00Z"))?.id).toBe("T1");
    expect(tarifaVigenteEn([t1, t2], D("2024-07-01T00:00:00Z"))?.id).toBe("T2");
    expect(tarifaVigenteEn([t1, t2], D("2023-12-01T00:00:00Z"))).toBeNull();
  });
  it("cruzaPeriodos detecta bordes de vigencia dentro de la sesión", () => {
    const t1 = tarifaBase({ id: "T1", vigenciaDesde: D("2024-01-01T00:00:00Z"), vigenciaHasta: D("2024-06-01T00:00:00Z"), estado: "CERRADA" });
    const t2 = tarifaBase({ id: "T2", vigenciaDesde: D("2024-06-01T00:00:00Z"), vigenciaHasta: null });
    expect(cruzaPeriodos([t1, t2], D("2024-05-31T00:00:00Z"), D("2024-06-02T00:00:00Z"))).toBe(true);
    expect(cruzaPeriodos([t1, t2], D("2024-07-01T00:00:00Z"), D("2024-07-02T00:00:00Z"))).toBe(false);
  });
});

describe("DGP-020.3 · valoración (snapshot)", () => {
  const sesion = { tenantId: "t", sesionId: "s1", ordenId: "o1", activoId: "act1", identityId: "u1", efectivoMs: 9_000_000, iniciadoAt: D("2024-03-01T00:00:00Z"), cerradoAt: D("2024-03-01T02:30:00Z") };
  const ahora = D("2024-03-02T00:00:00Z");

  it("VALORADA con tarifa vigente ⇒ costo calculado e inmutable", () => {
    const v = valorarSesion({ sesion, recurso, tarifas: [tarifaBase()], actorId: "a", ahora });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.estado).toBe("VALORADA");
    expect(v.value.costo).toBe("100000.000000");
    expect(v.value.tarifaValor).toBe("40000.000000");
    expect(v.value.efectivoMs).toBe(9_000_000);
    const rev = esRevalorable(v.value);
    expect(rev.ok).toBe(false); // inmutable
  });
  it("SIN_TARIFA ⇒ costo NULL (nunca 0)", () => {
    const v = valorarSesion({ sesion, recurso, tarifas: [], actorId: "a", ahora });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.estado).toBe("SIN_TARIFA");
    expect(v.value.costo).toBeNull();
    expect(v.value.costo).not.toBe(0);
    expect(esRevalorable(v.value).ok).toBe(true);
  });
  it("SIN_RECURSO ⇒ costo NULL, categoría NULL, revalorable", () => {
    const v = valorarSesion({ sesion, recurso: null, tarifas: [], actorId: "a", ahora });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.estado).toBe("SIN_RECURSO");
    expect(v.value.costo).toBeNull();
    expect(v.value.categoriaClave).toBeNull();
    expect(esRevalorable(v.value).ok).toBe(true);
  });
  it("costoEstimado de sesión abierta: sin tarifa ⇒ sinTarifa=true, jamás 0", () => {
    const est = costoEstimado({ sesionId: "s1", efectivoMs: 4_800_000, iniciadoAt: D("2024-03-01T00:00:00Z") }, []);
    expect(est.ok && est.value.sinTarifa).toBe(true);
    expect(est.ok && est.value.costo).toBeNull();
    const est2 = costoEstimado({ sesionId: "s1", efectivoMs: 4_800_000, iniciadoAt: D("2024-03-01T00:00:00Z") }, [tarifaBase({ valor: "35000.000000" })]);
    expect(est2.ok && est2.value.estimado).toBe(true);
    expect(est2.ok && est2.value.costo).toBe("46666.666700");
  });
});
