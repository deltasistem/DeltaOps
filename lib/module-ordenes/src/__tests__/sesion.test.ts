/**
 * DGP-020.2 · Sesiones de trabajo — DOMINIO PURO (sin IO).
 * Cubre: máquina de estados (transiciones válidas/inválidas y bordes huérfanos),
 * cálculo de duraciones desde tramos append-only (efectivo/pausado/transcurrido,
 * múltiples pausas SUMAN, sesión abierta = acumulados "hasta ahora"),
 * monotonicidad/robustez ante retroceso de reloj, y política de reloj sospechoso.
 */
import { describe, expect, it } from "vitest";
import {
  calcularDuraciones,
  evaluarReloj,
  transicion,
  TOLERANCIA_FUTURO_MS,
  type Tramo,
} from "../domain/sesion";

const t = (secuencia: number, tipo: Tramo["tipo"], origen: Tramo["origen"], iso: string): Tramo => ({
  sesionId: "s1", secuencia, tipo, origen,
  ocurridoAt: new Date(iso), registradoAt: new Date(iso), anomaliaReloj: null,
});

describe("DGP-020.2 · máquina de estados de sesión", () => {
  it("iniciar sólo desde inexistente (null); repetir ⇒ negocio 'sesion-ya-abierta'", () => {
    const ok = transicion(null, "iniciar");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.estado).toBe("ABIERTA");
    const dup = transicion("ABIERTA", "iniciar");
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.codigo).toBe("sesion-ya-abierta");
  });

  it("ABIERTA→PAUSADA→ABIERTA (pausar/reanudar) con tipos de tramo correctos", () => {
    const p = transicion("ABIERTA", "pausar");
    expect(p.ok && p.estado === "PAUSADA" && p.tipo === "pausa").toBe(true);
    const r = transicion("PAUSADA", "reanudar");
    expect(r.ok && r.estado === "ABIERTA" && r.tipo === "trabajo").toBe(true);
  });

  it("cerrar desde ABIERTA y desde PAUSADA ⇒ CERRADA (final)", () => {
    expect(transicion("ABIERTA", "cerrar")).toMatchObject({ ok: true, estado: "CERRADA" });
    expect(transicion("PAUSADA", "cerrar")).toMatchObject({ ok: true, estado: "CERRADA" });
  });

  it("transiciones inválidas y bordes huérfanos ⇒ error de NEGOCIO (nunca throw)", () => {
    expect(transicion("PAUSADA", "pausar")).toMatchObject({ ok: false });
    expect(transicion("ABIERTA", "reanudar")).toMatchObject({ ok: false });
    expect(transicion(null, "pausar")).toMatchObject({ ok: false, error: { codigo: "sin-sesion" } });
    expect(transicion(null, "reanudar")).toMatchObject({ ok: false, error: { codigo: "sin-sesion" } });
    expect(transicion(null, "cerrar")).toMatchObject({ ok: false, error: { codigo: "sin-sesion" } });
  });

  it("una sesión CERRADA no admite operaciones (sin reapertura)", () => {
    for (const cmd of ["pausar", "reanudar", "cerrar"] as const) {
      expect(transicion("CERRADA", cmd)).toMatchObject({ ok: false, error: { codigo: "sesion-cerrada" } });
    }
  });
});

describe("DGP-020.2 · cálculo de duraciones desde tramos", () => {
  it("trabajo simple cerrado: efectivo = transcurrido, sin pausas", () => {
    const tramos = [t(0, "trabajo", "iniciar", "2024-01-01T10:00:00Z")];
    const d = calcularDuraciones(tramos, new Date("2024-01-01T11:00:00Z"), new Date());
    expect(d.efectivoMs).toBe(3_600_000);
    expect(d.pausadoMs).toBe(0);
    expect(d.transcurridoMs).toBe(3_600_000);
    expect(d.pausas).toBe(0);
    expect(d.abierta).toBe(false);
  });

  it("varias pausas SUMAN y transcurrido = efectivo + pausado", () => {
    const tramos = [
      t(0, "trabajo", "iniciar", "2024-01-01T10:00:00Z"),   // 30m trabajo
      t(1, "pausa", "pausar", "2024-01-01T10:30:00Z"),      // 10m pausa
      t(2, "trabajo", "reanudar", "2024-01-01T10:40:00Z"),  // 20m trabajo
      t(3, "pausa", "pausar", "2024-01-01T11:00:00Z"),      // 5m pausa
      t(4, "trabajo", "reanudar", "2024-01-01T11:05:00Z"),  // 15m trabajo
    ];
    const d = calcularDuraciones(tramos, new Date("2024-01-01T11:20:00Z"), new Date());
    expect(d.efectivoMs).toBe((30 + 20 + 15) * 60_000);
    expect(d.pausadoMs).toBe((10 + 5) * 60_000);
    expect(d.transcurridoMs).toBe(d.efectivoMs + d.pausadoMs);
    expect(d.pausas).toBe(2);
    expect(d.abierta).toBe(false);
  });

  it("sesión abierta ⇒ acumulados 'hasta ahora' con frontera = ahora", () => {
    const tramos = [t(0, "trabajo", "iniciar", "2024-01-01T10:00:00Z")];
    const d = calcularDuraciones(tramos, null, new Date("2024-01-01T10:15:00Z"));
    expect(d.abierta).toBe(true);
    expect(d.efectivoMs).toBe(15 * 60_000);
  });

  it("robustez ante retroceso de ocurridoAt: intervalos negativos se acotan a 0", () => {
    const tramos = [
      t(0, "trabajo", "iniciar", "2024-01-01T10:00:00Z"),
      t(1, "pausa", "pausar", "2024-01-01T09:59:00Z"), // retroceso ⇒ intervalo negativo
    ];
    const d = calcularDuraciones(tramos, new Date("2024-01-01T10:30:00Z"), new Date());
    expect(d.efectivoMs).toBe(0); // 09:59 - 10:00 < 0 ⇒ 0
    expect(d.pausadoMs).toBe(31 * 60_000); // 10:30 - 09:59
    expect(d.pausadoMs).toBeGreaterThanOrEqual(0);
  });

  it("sin tramos ⇒ ceros; abierta según cerradoAt", () => {
    expect(calcularDuraciones([], null, new Date())).toMatchObject({ efectivoMs: 0, abierta: true });
    expect(calcularDuraciones([], new Date(), new Date())).toMatchObject({ transcurridoMs: 0, abierta: false });
  });
});

describe("DGP-020.2 · reloj sospechoso / monotonicidad", () => {
  it("ocurridoAt muy en el futuro ⇒ anomalía 'futuro' (sin destruir el hecho)", () => {
    const reg = new Date("2024-01-01T10:00:00Z");
    const oc = new Date(reg.getTime() + TOLERANCIA_FUTURO_MS + 60_000);
    const a = evaluarReloj({ ocurridoAt: oc, registradoAt: reg, previoOcurridoAt: null });
    expect(a?.tipo).toBe("futuro");
    expect(a?.ocurridoAt).toBe(oc.toISOString());
  });

  it("dentro de la tolerancia ⇒ sin anomalía", () => {
    const reg = new Date("2024-01-01T10:00:00Z");
    const oc = new Date(reg.getTime() + TOLERANCIA_FUTURO_MS - 1000);
    expect(evaluarReloj({ ocurridoAt: oc, registradoAt: reg, previoOcurridoAt: null })).toBeNull();
  });

  it("ocurridoAt anterior al tramo previo ⇒ anomalía 'no-monotono'", () => {
    const prev = new Date("2024-01-01T10:10:00Z");
    const oc = new Date("2024-01-01T10:05:00Z");
    const reg = new Date("2024-01-01T10:11:00Z");
    const a = evaluarReloj({ ocurridoAt: oc, registradoAt: reg, previoOcurridoAt: prev });
    expect(a?.tipo).toBe("no-monotono");
  });

  it("monótono y presente ⇒ null", () => {
    const prev = new Date("2024-01-01T10:00:00Z");
    const oc = new Date("2024-01-01T10:05:00Z");
    const reg = new Date("2024-01-01T10:05:01Z");
    expect(evaluarReloj({ ocurridoAt: oc, registradoAt: reg, previoOcurridoAt: prev })).toBeNull();
  });
});
