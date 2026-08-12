/**
 * DGP-019.2 · Matriz de capacidades de PRESENTACIÓN del módulo Activos.
 *
 * Verifica que `capacidadesActivos` replica la cadena canónica del backend
 * `aRolLegacy` → `principalActivos` (editar/transicionar/retirar = admin u
 * operador; administrar = sólo admin; lector = sólo leer), y que una señal
 * EXPLÍCITA del namespace `modulo.activos.*` en la sesión actúa como override
 * sin que permisos de otros módulos contaminen el gating. Cubre el fix de la
 * cabecera de la ficha (CTAs «Editar» y «Registrar»/transiciones ocultos a
 * CONSULTA — §22).
 */
import { describe, it, expect } from "vitest";
import { capacidadesActivos, puedeEditarActivo } from "../lib/activos/capacidades";

const s = (rol: string, extra: { capacidades?: string[]; permisos?: string[] } = {}) =>
  ({ rol, ...extra }) as Parameters<typeof capacidadesActivos>[0];

describe("capacidadesActivos · mapeo por rol (réplica aRolLegacy→principalActivos)", () => {
  it("TENANT_ADMIN / SUPER_ADMIN (admin) → editar/transicionar/retirar/administrar", () => {
    for (const rol of ["TENANT_ADMIN", "SUPER_ADMIN"]) {
      expect(capacidadesActivos(s(rol))).toMatchObject({
        leer: true, editar: true, transicionar: true, retirar: true, administrar: true,
      });
    }
  });

  it("SUPERVISOR / PLANIFICADOR / TECNICO (operador) → editar/transicionar/retirar; NO administrar", () => {
    for (const rol of ["SUPERVISOR", "PLANIFICADOR", "TECNICO"]) {
      expect(capacidadesActivos(s(rol))).toMatchObject({
        leer: true, editar: true, transicionar: true, retirar: true, administrar: false,
      });
    }
  });

  it("CONSULTA (lector) → sólo leer; NO editar/transicionar/retirar/administrar", () => {
    expect(capacidadesActivos(s("CONSULTA"))).toMatchObject({
      leer: true, editar: false, transicionar: false, retirar: false, administrar: false,
    });
  });

  it("rol desconocido → tratado como lector (sin escrituras)", () => {
    const c = capacidadesActivos(s("OTRO"));
    expect(c.editar).toBe(false);
    expect(c.transicionar).toBe(false);
  });

  it("insensible a mayúsculas/minúsculas del rol", () => {
    expect(capacidadesActivos(s("supervisor")).editar).toBe(true);
    expect(capacidadesActivos(s("consulta")).editar).toBe(false);
  });

  it("null/undefined → sólo leer", () => {
    for (const v of [null, undefined]) {
      expect(capacidadesActivos(v)).toMatchObject({
        leer: true, editar: false, transicionar: false, retirar: false, administrar: false,
      });
    }
  });
});

describe("capacidadesActivos · override por PERMISOS REALES del contrato", () => {
  it("write (permiso real de editar) ⇒ editar visible aunque el rol sea lector", () => {
    const c = capacidadesActivos(s("CONSULTA", { permisos: ["modulo.activos.read", "modulo.activos.write"] }));
    expect(c.editar).toBe(true);
    // write NO concede operar/retirar/admin.
    expect(c).toMatchObject({ transicionar: false, retirar: false, administrar: false });
  });

  it("SOLO read ⇒ toda escritura oculta (señal presente pero sin write)", () => {
    const c = capacidadesActivos(s("SUPERVISOR", { permisos: ["modulo.activos.read"] }));
    expect(c).toMatchObject({ editar: false, transicionar: false, retirar: false, administrar: false });
  });

  it("mapea cada permiso REAL a su acción (operar/retirar/admin)", () => {
    expect(capacidadesActivos(s("CONSULTA", { permisos: ["modulo.activos.read", "modulo.activos.operar"] })).transicionar).toBe(true);
    expect(capacidadesActivos(s("CONSULTA", { permisos: ["modulo.activos.read", "modulo.activos.retirar"] })).retirar).toBe(true);
    // admin es super-permiso: concede TODAS las acciones.
    expect(capacidadesActivos(s("CONSULTA", { permisos: ["modulo.activos.admin"] }))).toMatchObject({
      editar: true, transicionar: true, retirar: true, administrar: true,
    });
  });

  it("capacidad corta gestionar-activos ⇒ editar/transicionar visibles", () => {
    const c = capacidadesActivos(s("CONSULTA", { capacidades: ["gestionar-activos"] }));
    expect(c.editar).toBe(true);
    expect(c.transicionar).toBe(true);
  });

  it("comodín global / de módulo concede editar aunque el rol sea lector", () => {
    expect(capacidadesActivos(s("CONSULTA", { permisos: ["*"] })).editar).toBe(true);
    expect(capacidadesActivos(s("CONSULTA", { capacidades: ["*"] })).editar).toBe(true);
    expect(capacidadesActivos(s("CONSULTA", { permisos: ["modulo.activos.*"] })).editar).toBe(true);
  });

  it("señal explícita del módulo puede RESTRINGIR editar a un admin", () => {
    const c = capacidadesActivos(s("TENANT_ADMIN", { permisos: ["modulo.activos.read", "modulo.activos.operar"] }));
    expect(c.editar).toBe(false); // sin write/gestionar
    expect(c.transicionar).toBe(true);
  });

  it("permisos de OTROS módulos NO afectan el gating de activos (usa el rol)", () => {
    const c = capacidadesActivos(
      s("TENANT_ADMIN", { permisos: ["modulo.referencia.write", "platform.search.read"], capacidades: ["gestionar-elementos-referencia"] }),
    );
    expect(c.editar).toBe(true); // por rol, sin contaminación
  });
});

describe("puedeEditarActivo", () => {
  it("null/undefined → false", () => {
    expect(puedeEditarActivo(null)).toBe(false);
    expect(puedeEditarActivo(undefined)).toBe(false);
  });
  it("delega en capacidadesActivos().editar", () => {
    expect(puedeEditarActivo(s("SUPERVISOR"))).toBe(true);
    expect(puedeEditarActivo(s("CONSULTA"))).toBe(false);
  });
});
