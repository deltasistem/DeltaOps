/**
 * DGP-016 · Capacidades por rol (presentación). Deben coincidir con el runtime
 * del api-server: admin=read+admin+dashboard+export, operador=read+dashboard+
 * export, lector=read. El backend es la autoridad; esto sólo decide qué ofrecer.
 */
import { describe, it, expect } from "vitest";
import { capacidadesDe } from "../lib/analytics/constantes";

describe("capacidadesDe", () => {
  it("admin tiene todas las capacidades", () => {
    expect(capacidadesDe("admin")).toEqual({ read: true, dashboard: true, export: true, admin: true });
  });
  it("platform_admin equivale a admin", () => {
    expect(capacidadesDe("platform_admin")).toEqual({ read: true, dashboard: true, export: true, admin: true });
  });
  it("operador puede leer, componer dashboards y exportar; no administra", () => {
    expect(capacidadesDe("operador")).toEqual({ read: true, dashboard: true, export: true, admin: false });
  });
  it("lector sólo lee (sin dashboard/export/admin)", () => {
    expect(capacidadesDe("lector")).toEqual({ read: true, dashboard: false, export: false, admin: false });
  });
  it("rol desconocido degrada a sólo lectura", () => {
    expect(capacidadesDe("desconocido")).toEqual({ read: true, dashboard: false, export: false, admin: false });
  });
});
