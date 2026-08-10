/**
 * DGP-017 · Plataforma de correo — plantillas, proveedor Fake, seguridad.
 */
import { describe, expect, it } from "vitest";
import { FakeEmailProvider, renderPlantilla } from "../email";

describe("Email · plantillas ES y branding", () => {
  it("renderiza la plantilla de invitación con branding e i18n", () => {
    const { asunto, cuerpo } = renderPlantilla({
      tipo: "invitacion",
      datos: { rol: "TECNICO", enlace: "https://x/inv", expira: "2026-01-01" },
      branding: { nombreApp: "DeltaOps", nombreEmpresa: "ACME" },
    });
    expect(asunto).toContain("ACME");
    expect(asunto).toContain("DeltaOps");
    expect(cuerpo).toContain("TECNICO");
    expect(cuerpo).toContain("https://x/inv");
  });

  it("escapa contenido para impedir HTML/inyección de usuarios", () => {
    const { cuerpo } = renderPlantilla({
      tipo: "seguridad",
      datos: { nombre: "<script>alert(1)</script>", detalle: "línea1\nlínea2" },
    });
    expect(cuerpo).not.toContain("<script>");
    expect(cuerpo).not.toContain("\n\n\n");
  });

  it("falla explícito si la plantilla no existe", () => {
    expect(() => renderPlantilla({ tipo: "ot-asignada", datos: {} })).toThrow();
  });

  it("el proveedor Fake acumula los envíos sin salida real", async () => {
    const fake = new FakeEmailProvider();
    await fake.send({
      tenantId: "t1",
      idempotencyKey: "k1",
      tipo: "bienvenida",
      destinatario: "u@x",
      asunto: "hola",
      cuerpo: "cuerpo",
    });
    expect(fake.enviados).toHaveLength(1);
    expect(fake.enviados[0]?.destinatario).toBe("u@x");
  });
});
