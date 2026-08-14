/**
 * DELTAOPS LITE-08 · §22 (navegación por perfil) + §23 (home operacional) +
 * §21 (visibilidad por preferencia del tenant). Pruebas puras sobre los helpers
 * de composición. Contrato clave: la visibilidad NUNCA revela un módulo no
 * habilitado; el orden de atención es ESTRICTO; el nav se reordena por perfil.
 */
import { describe, it, expect } from "vitest";
import { atencionHome, type EntradaAtencion } from "../lib/centro/atencion";
import { gruposNavegacion, esGrupoSecundario } from "../lib/identidad/rbac";
import type { Modulo, Rol } from "../lib/identidad/tipos";

const TODOS_MODULOS: Modulo[] = [
  "referencia",
  "activos",
  "ordenes",
  "inventario",
  "planes",
  "abastecimiento",
  "preventivo",
  "correctivo",
  "analytics",
];

const RUTAS: EntradaAtencion["rutas"] = {
  slaVencido: "/ordenes?bandeja=vencer",
  pendientes: "/ordenes?bandeja=pendientes",
  sinAsignar: "/ordenes",
  criticas: "/ordenes?bandeja=criticas",
  hallazgosPendientes: "/activos",
  equiposFuera: "/activos?estado=FUERA_SERVICIO",
};

function resumen(over: Partial<Record<string, unknown[]>> = {}): any {
  return {
    abiertas: [],
    enEjecucion: [],
    pendientes: [],
    sinAsignar: [],
    criticas: [],
    vencidas: [],
    enRiesgo: [],
    ...over,
  };
}

/* ------------------------------- §23 atención ---------------------------- */

describe("§23 · atencionHome (orden estricto y filtrado de ceros)", () => {
  it("sin señales devuelve lista vacía (todo bajo control)", () => {
    const r = atencionHome({ resumen: resumen(), hallazgos: null, equiposFueraServicio: 0, rutas: RUTAS });
    expect(r).toEqual([]);
  });

  it("respeta el orden de prioridad §23 cuando todas las señales están presentes", () => {
    const entrada: EntradaAtencion = {
      resumen: resumen({
        vencidas: [1],
        pendientes: [1, 2],
        sinAsignar: [1],
        criticas: [1],
      }) as any,
      hallazgos: { hallazgosPendientes: 3 } as any,
      equiposFueraServicio: 2,
      rutas: RUTAS,
    };
    const claves = atencionHome(entrada).map((s) => s.clave);
    expect(claves).toEqual([
      "mantenimiento-vencido",
      "hallazgos-pendientes",
      "ordenes-pendientes",
      "sin-asignar",
      "criticas",
      "equipos-fuera-servicio",
    ]);
  });

  it("nunca incluye señales con cantidad cero", () => {
    const entrada: EntradaAtencion = {
      resumen: resumen({ vencidas: [1] }) as any,
      hallazgos: { hallazgosPendientes: 0 } as any,
      equiposFueraServicio: 0,
      rutas: RUTAS,
    };
    const r = atencionHome(entrada);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ clave: "mantenimiento-vencido", cantidad: 1, ruta: RUTAS.slaVencido });
  });

  it("cada señal apunta a una ruta accionable inyectada", () => {
    const entrada: EntradaAtencion = {
      resumen: resumen({ sinAsignar: [1] }) as any,
      hallazgos: { hallazgosPendientes: 1 } as any,
      equiposFueraServicio: 1,
      rutas: RUTAS,
    };
    const porClave = Object.fromEntries(atencionHome(entrada).map((s) => [s.clave, s.ruta]));
    expect(porClave["hallazgos-pendientes"]).toBe(RUTAS.hallazgosPendientes);
    expect(porClave["sin-asignar"]).toBe(RUTAS.sinAsignar);
    expect(porClave["equipos-fuera-servicio"]).toBe(RUTAS.equiposFuera);
  });
});

/* --------------------------- §22 navegación por perfil ------------------- */

describe("§22 · gruposNavegacion por perfil", () => {
  it("el técnico ve «Mis equipos» y NO ve Planes en Mantenimiento", () => {
    const grupos = gruposNavegacion({ rol: "TECNICO", modulos: TODOS_MODULOS });
    const equipos = grupos.find((g) => g.clave === "equipos");
    expect(equipos?.titulo).toBe("Mis equipos");
    expect(equipos?.items.find((i) => i.clave === "activos")?.nombre).toBe("Mis equipos");
    const mantenimiento = grupos.find((g) => g.clave === "mantenimiento");
    expect(mantenimiento?.items.some((i) => i.clave === "planes")).toBe(false);
  });

  it("el no-técnico (SUPERVISOR) sí ve Planes y el rótulo «Activos»/«Equipos»", () => {
    const grupos = gruposNavegacion({ rol: "SUPERVISOR", modulos: TODOS_MODULOS });
    const equipos = grupos.find((g) => g.clave === "equipos");
    expect(equipos?.titulo).toBe("Equipos");
    expect(equipos?.items.find((i) => i.clave === "activos")?.nombre).toBe("Activos");
    const mantenimiento = grupos.find((g) => g.clave === "mantenimiento");
    expect(mantenimiento?.items.some((i) => i.clave === "planes")).toBe(true);
  });

  it("expone el grupo Preoperacional cuando activos está habilitado (sin ruta nueva)", () => {
    const grupos = gruposNavegacion({ rol: "TECNICO", modulos: ["activos"] });
    const preop = grupos.find((g) => g.clave === "preoperacional");
    expect(preop).toBeDefined();
    expect(preop?.items[0]?.ruta).toBe("/activos?accion=preoperacional");
  });

  it("los grupos secundarios (inventario, referencia) se relegan al final", () => {
    const grupos = gruposNavegacion({ rol: "TENANT_ADMIN", modulos: TODOS_MODULOS });
    const claves = grupos.map((g) => g.clave);
    const idxInventario = claves.indexOf("inventario");
    const idxMantenimiento = claves.indexOf("mantenimiento");
    expect(idxInventario).toBeGreaterThan(idxMantenimiento);
    expect(esGrupoSecundario("inventario")).toBe(true);
    expect(esGrupoSecundario("referencia")).toBe(true);
    expect(esGrupoSecundario("mantenimiento")).toBe(false);
  });

  it("el orden refleja la prioridad del perfil (técnico: mantenimiento/equipos primero)", () => {
    const grupos = gruposNavegacion({ rol: "TECNICO", modulos: TODOS_MODULOS });
    const primeras = grupos.slice(0, 2).map((g) => g.clave);
    expect(primeras).toContain("equipos");
    expect(primeras).toContain("mantenimiento");
  });
});

/* --------------------- §21 visibilidad (nunca es seguridad) -------------- */

describe("§21 · ocultos filtra presentación sin tocar seguridad", () => {
  it("ocultar un grupo lo retira de la navegación", () => {
    const base = gruposNavegacion({ rol: "TENANT_ADMIN", modulos: TODOS_MODULOS });
    expect(base.some((g) => g.clave === "inventario")).toBe(true);
    const filtrados = gruposNavegacion(
      { rol: "TENANT_ADMIN", modulos: TODOS_MODULOS },
      { ocultos: new Set(["inventario"]) },
    );
    expect(filtrados.some((g) => g.clave === "inventario")).toBe(false);
  });

  it("ocultos JAMÁS revela un módulo no habilitado (visibilidad ≠ seguridad)", () => {
    // El tenant NO tiene inventario/analytics/planes: aunque se pida «mostrar»
    // (ausente de ocultos), no aparecen porque el entitlement manda.
    const grupos = gruposNavegacion(
      { rol: "TENANT_ADMIN", modulos: ["activos", "ordenes"] },
      { ocultos: new Set() },
    );
    expect(grupos.some((g) => g.clave === "inventario")).toBe(false);
    expect(grupos.some((g) => g.clave === "indicadores")).toBe(false);
  });

  it("ocultar todos los grupos secundarios no afecta a los primarios habilitados", () => {
    const grupos = gruposNavegacion(
      { rol: "TENANT_ADMIN", modulos: TODOS_MODULOS },
      { ocultos: new Set(["inventario", "referencia", "indicadores"]) },
    );
    expect(grupos.some((g) => g.clave === "mantenimiento")).toBe(true);
    expect(grupos.some((g) => g.clave === "equipos")).toBe(true);
    expect(grupos.some((g) => g.clave === "inventario")).toBe(false);
    expect(grupos.some((g) => g.clave === "indicadores")).toBe(false);
  });
});
