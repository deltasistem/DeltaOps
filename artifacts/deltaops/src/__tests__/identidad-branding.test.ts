/**
 * DGP-017 · Branding por tenant SÓLO con tokens seguros del Design System.
 * DELTA/DEMO conserva su identidad oficial exacta; nunca se acepta CSS
 * arbitrario ni URLs/colores no seguros.
 */
import { describe, it, expect } from "vitest";
import { resolverBranding, colorSeguro, urlSegura } from "../lib/identidad/branding";
import type { Tenant } from "../lib/identidad/tipos";

function tenant(codigo: string, branding: Record<string, unknown> = {}): Tenant {
  return { id: "t-" + codigo, codigo, nombre: `Empresa ${codigo}`, estado: "ACTIVO", branding };
}

describe("validadores de tokens seguros", () => {
  it("colorSeguro sólo acepta HEX de 6 dígitos", () => {
    expect(colorSeguro("#0A5FB4")).toBe("#0A5FB4");
    expect(colorSeguro("#fff")).toBeNull();
    expect(colorSeguro("red")).toBeNull();
    expect(colorSeguro("javascript:alert(1)")).toBeNull();
    expect(colorSeguro("expression(x)")).toBeNull();
    expect(colorSeguro(undefined)).toBeNull();
  });

  it("urlSegura sólo acepta http(s) absolutas", () => {
    expect(urlSegura("https://cdn.x/logo.png")).toBe("https://cdn.x/logo.png");
    expect(urlSegura("http://x/logo.png")).toBe("http://x/logo.png");
    expect(urlSegura("javascript:alert(1)")).toBeNull();
    expect(urlSegura("data:image/png;base64,AAA")).toBeNull();
    expect(urlSegura("/relativa.png")).toBeNull();
    expect(urlSegura(undefined)).toBeNull();
  });
});

describe("resolución de branding", () => {
  it("DEMO conserva EXACTAMENTE la identidad DELTA (sin tokens personalizados)", () => {
    const r = resolverBranding(
      tenant("DEMO", { nombreApp: "OtraApp", colorPrimario: "#123456", logoUrl: "https://x/l.png" }),
    );
    expect(r.esDeltaOficial).toBe(true);
    expect(r.nombreApp).toBe("DeltaOps");
    expect(r.colorPrimario).toBeNull();
    expect(r.logoUrl).toBeNull();
  });

  it("DELTA también conserva la identidad oficial", () => {
    expect(resolverBranding(tenant("DELTA")).esDeltaOficial).toBe(true);
  });

  it("un tenant externo aplica sólo tokens seguros", () => {
    const r = resolverBranding(
      tenant("ACME", {
        nombreApp: "ACME Mantenimiento",
        colorPrimario: "#0A5FB4",
        colorSecundario: "no-valido",
        logoUrl: "https://cdn.acme/logo.png",
        faviconUrl: "javascript:alert(1)",
      }),
    );
    expect(r.esDeltaOficial).toBe(false);
    expect(r.nombreApp).toBe("ACME Mantenimiento");
    expect(r.colorPrimario).toBe("#0A5FB4");
    // Un color no HEX se descarta (degradación a token del DS).
    expect(r.colorSecundario).toBeNull();
    expect(r.logoUrl).toBe("https://cdn.acme/logo.png");
    // Un favicon inseguro se descarta.
    expect(r.faviconUrl).toBeNull();
  });

  it("sin branding, cae en el nombre del tenant y valores nulos (sin CSS)", () => {
    const r = resolverBranding(tenant("ACME"));
    expect(r.nombreApp).toBe("DeltaOps");
    expect(r.nombreEmpresa).toBe("Empresa ACME");
    expect(r.colorPrimario).toBeNull();
    expect(r.colorSecundario).toBeNull();
  });
});
