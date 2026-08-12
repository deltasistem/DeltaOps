/**
 * DGP-019.2 · Helper genérico de capacidad de ESCRITURA por módulo (presentación).
 *
 * `puedeEscribirModulo` replica la cadena canónica compartida por planes,
 * preventivo y correctivo (`aRolLegacy` → `principal*`: admin/operador escriben,
 * lector no) y respeta una señal EXPLÍCITA del namespace `<modulo>.*` como
 * override, sin contaminación entre módulos. Gatea los CTAs de creación de las
 * pestañas de la ficha (Nuevo plan / Nuevo programa / Nueva solicitud) para que
 * CONSULTA no vea escrituras (§22).
 */
import { describe, it, expect } from "vitest";
import { puedeEscribirModulo } from "../lib/identidad/capacidades-modulo";

const s = (rol: string, extra: { capacidades?: string[]; permisos?: string[] } = {}) =>
  ({ rol, ...extra }) as Parameters<typeof puedeEscribirModulo>[0];

describe("puedeEscribirModulo · mapeo por rol", () => {
  it("admin (TENANT_ADMIN/SUPER_ADMIN) → escribe", () => {
    for (const rol of ["TENANT_ADMIN", "SUPER_ADMIN"]) {
      expect(puedeEscribirModulo(s(rol), "modulo.planes")).toBe(true);
    }
  });

  it("operador (SUPERVISOR/PLANIFICADOR/TECNICO) → escribe", () => {
    for (const rol of ["SUPERVISOR", "PLANIFICADOR", "TECNICO"]) {
      expect(puedeEscribirModulo(s(rol), "modulo.preventivo", "programas")).toBe(true);
    }
  });

  it("lector (CONSULTA / desconocido) → NO escribe", () => {
    expect(puedeEscribirModulo(s("CONSULTA"), "modulo.correctivo", "solicitudes")).toBe(false);
    expect(puedeEscribirModulo(s("OTRO"), "modulo.planes")).toBe(false);
  });

  it("null/undefined → NO escribe", () => {
    expect(puedeEscribirModulo(null, "modulo.planes")).toBe(false);
    expect(puedeEscribirModulo(undefined, "modulo.planes")).toBe(false);
  });

  it("insensible a mayúsculas/minúsculas", () => {
    expect(puedeEscribirModulo(s("supervisor"), "modulo.planes")).toBe(true);
    expect(puedeEscribirModulo(s("consulta"), "modulo.planes")).toBe(false);
  });
});

describe("puedeEscribirModulo · override por señal explícita del módulo", () => {
  it("write real ⇒ escribe aunque el rol sea lector", () => {
    expect(puedeEscribirModulo(s("CONSULTA", { permisos: ["modulo.planes.read", "modulo.planes.write"] }), "modulo.planes")).toBe(true);
  });

  it("SOLO read ⇒ NO escribe (señal presente, sin write)", () => {
    expect(puedeEscribirModulo(s("SUPERVISOR", { permisos: ["modulo.planes.read"] }), "modulo.planes")).toBe(false);
  });

  it("admin como super-permiso ⇒ escribe", () => {
    expect(puedeEscribirModulo(s("CONSULTA", { permisos: ["modulo.planes.admin"] }), "modulo.planes")).toBe(true);
  });

  it("capacidad corta gestionar-<sufijo> ⇒ escribe", () => {
    expect(puedeEscribirModulo(s("CONSULTA", { capacidades: ["gestionar-programas"] }), "modulo.preventivo", "programas")).toBe(true);
  });

  it("comodines conceden escritura", () => {
    expect(puedeEscribirModulo(s("CONSULTA", { permisos: ["*"] }), "modulo.planes")).toBe(true);
    expect(puedeEscribirModulo(s("CONSULTA", { permisos: ["modulo.planes.*"] }), "modulo.planes")).toBe(true);
  });

  it("señal explícita puede RESTRINGIR a un admin", () => {
    expect(puedeEscribirModulo(s("TENANT_ADMIN", { permisos: ["modulo.correctivo.read"] }), "modulo.correctivo", "solicitudes")).toBe(false);
  });

  it("permisos de OTROS módulos NO contaminan (usa el rol)", () => {
    expect(
      puedeEscribirModulo(s("TENANT_ADMIN", { permisos: ["modulo.activos.write"], capacidades: ["gestionar-activos"] }), "modulo.planes"),
    ).toBe(true); // por rol, sin señal de planes
    // Y un lector con permisos de otro módulo sigue sin escribir en planes.
    expect(
      puedeEscribirModulo(s("CONSULTA", { permisos: ["modulo.activos.write"] }), "modulo.planes"),
    ).toBe(false);
  });
});
