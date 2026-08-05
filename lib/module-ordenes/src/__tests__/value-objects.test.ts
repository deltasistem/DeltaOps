/**
 * DGP-009.1 · Pruebas de Objetos de Valor del dominio de Órdenes de Trabajo.
 * Cubre validaciones e invariantes de cada VO (Zod strict + reglas de dominio).
 */
import { describe, expect, it } from "vitest";
import {
  crearCodigoOrden,
  crearCosto,
  crearDiagnostico,
  crearDuracion,
  crearEvidencia,
  crearFechas,
  crearReferenciaActivo,
  crearReferenciaPlantilla,
  crearReferenciaWorkflow,
  crearRiesgoImpacto,
  crearSla,
  crearUbicacion,
} from "..";

describe("value-objects", () => {
  it("código de OT válido/inválido", () => {
    expect(crearCodigoOrden({ valor: "OT-000001", prefijo: "OT", secuencia: 1 }).ok).toBe(true);
    expect(crearCodigoOrden({ valor: "", prefijo: "OT", secuencia: 1 }).ok).toBe(false);
    expect(crearCodigoOrden({ valor: "OT-1", prefijo: "OT", secuencia: 0 }).ok).toBe(false);
  });

  it("SLA respeta respuesta <= resolución", () => {
    expect(crearSla({ clave: "oro", respuestaMinutos: 30, resolucionMinutos: 240 }).ok).toBe(true);
    const malo = crearSla({ clave: "oro", respuestaMinutos: 300, resolucionMinutos: 240 });
    expect(malo.ok).toBe(false);
  });

  it("duración no negativa", () => {
    expect(crearDuracion({ minutos: 90 }).ok).toBe(true);
    expect(crearDuracion({ minutos: -5 }).ok).toBe(false);
  });

  it("costo con moneda y monto no negativo", () => {
    expect(crearCosto({ monto: 100, moneda: "USD" }).ok).toBe(true);
    expect(crearCosto({ monto: -1, moneda: "USD" }).ok).toBe(false);
    expect(crearCosto({ monto: 1, moneda: "" }).ok).toBe(false);
  });

  it("riesgo/impacto con puntaje acotado", () => {
    expect(crearRiesgoImpacto({ riesgo: "alto", impacto: "medio", puntaje: 80 }).ok).toBe(true);
    expect(crearRiesgoImpacto({ riesgo: "alto", impacto: "medio", puntaje: 200 }).ok).toBe(false);
  });

  it("referencia a activo con rol", () => {
    const r = crearReferenciaActivo({ activoId: "a1", entityRef: "activo:a1", rol: "principal" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.rol).toBe("principal");
  });

  it("ubicación válida", () => {
    expect(crearUbicacion({ ubicacionId: "u1", etiqueta: "Planta 1" }).ok).toBe(true);
    expect(crearUbicacion({ ubicacionId: "", etiqueta: "x" }).ok).toBe(false);
  });

  it("referencia a plantilla anclada a versión", () => {
    const r = crearReferenciaPlantilla({ clave: "chk-1", version: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.version).toBe(3);
      expect(r.value.servicio).toBe("modulo.formularios");
    }
    expect(crearReferenciaPlantilla({ clave: "x", version: 0 }).ok).toBe(false);
  });

  it("referencia a workflow", () => {
    const r = crearReferenciaWorkflow({ definicion: "ciclo-item" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.instanciaId).toBeNull();
  });

  it("evidencia exige hash SHA-256 de 64 hex", () => {
    const base = { attachmentId: "att1", nombreArchivo: "f.jpg", mimeType: "image/jpeg", tamanoBytes: 10 };
    expect(crearEvidencia({ ...base, hashSha256: "a".repeat(64) }).ok).toBe(true);
    expect(crearEvidencia({ ...base, hashSha256: "abc" }).ok).toBe(false);
  });

  it("diagnóstico opcional", () => {
    expect(crearDiagnostico({ causa: "desgaste" }).ok).toBe(true);
    expect(crearDiagnostico({}).ok).toBe(true);
  });

  it("fechas respetan orden temporal", () => {
    expect(crearFechas({ inicio: "2026-01-01T00:00:00Z", finalizacion: "2026-01-02T00:00:00Z" }).ok).toBe(true);
    const mala = crearFechas({ inicio: "2026-01-03T00:00:00Z", finalizacion: "2026-01-02T00:00:00Z" });
    expect(mala.ok).toBe(false);
  });
});
