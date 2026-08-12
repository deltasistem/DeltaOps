/**
 * DGP-019.2 · Matriz de capacidades de PRESENTACIÓN del módulo Órdenes.
 *
 * Verifica que `capacidadesOrdenes` replica la cadena canónica del backend
 * `aRolLegacy` → `principalOrdenes` (crear OT = admin u operador; nunca lector),
 * y que una señal EXPLÍCITA del namespace `modulo.ordenes.*` en la sesión actúa
 * como override (sin que permisos de otros módulos contaminen el gating).
 */
import { describe, it, expect } from "vitest";
import { capacidadesOrdenes, puedeCrearOrden } from "../lib/ordenes/capacidades";

const s = (rol: string, extra: { capacidades?: string[]; permisos?: string[] } = {}) =>
  ({ rol, ...extra }) as Parameters<typeof capacidadesOrdenes>[0];

describe("capacidadesOrdenes · mapeo por rol (réplica aRolLegacy→principalOrdenes)", () => {
  it("TENANT_ADMIN / SUPER_ADMIN (admin) → crear/ejecutar/validar/administrar", () => {
    for (const rol of ["TENANT_ADMIN", "SUPER_ADMIN"]) {
      const c = capacidadesOrdenes(s(rol));
      expect(c).toMatchObject({ leer: true, crear: true, ejecutar: true, validar: true, administrar: true });
    }
  });

  it("SUPERVISOR / PLANIFICADOR / TECNICO (operador) → crear + ejecutar; NO validar/administrar", () => {
    for (const rol of ["SUPERVISOR", "PLANIFICADOR", "TECNICO"]) {
      const c = capacidadesOrdenes(s(rol));
      expect(c).toMatchObject({ leer: true, crear: true, ejecutar: true, validar: false, administrar: false });
    }
  });

  it("CONSULTA (lector) → sólo leer; NO crear", () => {
    const c = capacidadesOrdenes(s("CONSULTA"));
    expect(c).toMatchObject({ leer: true, crear: false, ejecutar: false, validar: false, administrar: false });
  });

  it("rol desconocido → tratado como lector (sin crear)", () => {
    expect(capacidadesOrdenes(s("OTRO")).crear).toBe(false);
  });

  it("insensible a mayúsculas/minúsculas del rol", () => {
    expect(capacidadesOrdenes(s("supervisor")).crear).toBe(true);
    expect(capacidadesOrdenes(s("consulta")).crear).toBe(false);
  });
});

describe("capacidadesOrdenes · override por PERMISOS REALES del contrato", () => {
  it("read+write (permiso real de crear) ⇒ crear visible aunque el rol sea lector", () => {
    const c = capacidadesOrdenes(s("CONSULTA", { permisos: ["modulo.ordenes.read", "modulo.ordenes.write"] }));
    expect(c.crear).toBe(true);
    // write no concede operar/validar/admin.
    expect(c).toMatchObject({ leer: true, ejecutar: false, validar: false, administrar: false });
  });

  it("SOLO read ⇒ crear oculto (señal presente pero sin write)", () => {
    const c = capacidadesOrdenes(s("SUPERVISOR", { permisos: ["modulo.ordenes.read"] }));
    expect(c.crear).toBe(false);
    expect(c.ejecutar).toBe(false);
  });

  it("mapea cada permiso REAL a su acción (operar/validar/admin)", () => {
    expect(capacidadesOrdenes(s("CONSULTA", { permisos: ["modulo.ordenes.read", "modulo.ordenes.operar"] })).ejecutar).toBe(true);
    expect(capacidadesOrdenes(s("CONSULTA", { permisos: ["modulo.ordenes.read", "modulo.ordenes.validar"] })).validar).toBe(true);
    // admin es super-permiso: concede TODAS las acciones.
    const adminPerm = capacidadesOrdenes(s("CONSULTA", { permisos: ["modulo.ordenes.admin"] }));
    expect(adminPerm).toMatchObject({ crear: true, ejecutar: true, validar: true, administrar: true });
  });

  it("capacidades cortas ⇒ crear visible (gestionar-ordenes)", () => {
    expect(capacidadesOrdenes(s("CONSULTA", { capacidades: ["gestionar-ordenes"] })).crear).toBe(true);
    expect(capacidadesOrdenes(s("CONSULTA", { capacidades: ["ejecutar-ordenes"] })).ejecutar).toBe(true);
  });

  it("comodín global / de módulo concede crear aunque el rol sea lector", () => {
    expect(capacidadesOrdenes(s("CONSULTA", { permisos: ["*"] })).crear).toBe(true);
    expect(capacidadesOrdenes(s("CONSULTA", { capacidades: ["*"] })).crear).toBe(true);
    expect(capacidadesOrdenes(s("CONSULTA", { permisos: ["modulo.ordenes.*"] })).crear).toBe(true);
  });

  it("señal explícita del módulo puede RESTRINGIR crear a un admin", () => {
    // Hay señal del namespace (operar) pero NO write/gestionar → crear=false.
    const c = capacidadesOrdenes(s("TENANT_ADMIN", { permisos: ["modulo.ordenes.read", "modulo.ordenes.operar"] }));
    expect(c.crear).toBe(false);
    expect(c.ejecutar).toBe(true);
  });

  it("permisos de OTROS módulos NO afectan el gating de órdenes (usa el rol)", () => {
    // Un TENANT_ADMIN real trae permisos de referencia, no de órdenes.
    const c = capacidadesOrdenes(
      s("TENANT_ADMIN", { permisos: ["modulo.referencia.write", "platform.search.read"], capacidades: ["gestionar-elementos-referencia"] }),
    );
    expect(c.crear).toBe(true); // por rol, sin contaminación
  });
});

describe("puedeCrearOrden", () => {
  it("null/undefined → false", () => {
    expect(puedeCrearOrden(null)).toBe(false);
    expect(puedeCrearOrden(undefined)).toBe(false);
  });
  it("delega en capacidadesOrdenes().crear", () => {
    expect(puedeCrearOrden(s("SUPERVISOR"))).toBe(true);
    expect(puedeCrearOrden(s("CONSULTA"))).toBe(false);
  });
});
