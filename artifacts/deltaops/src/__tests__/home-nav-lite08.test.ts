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

/* ------------- §8 navegación por proceso (4 macro-grupos) --------------- */

describe("§8 · gruposNavegacion: cuatro macro-grupos por proceso", () => {
  it("produce el orden canónico OPERACIÓN → INFORMACIÓN → APOYO → ADMINISTRACIÓN", () => {
    const grupos = gruposNavegacion({ rol: "TENANT_ADMIN", modulos: TODOS_MODULOS });
    const claves = grupos.map((g) => g.clave);
    expect(claves).toEqual(["operacion", "informacion", "apoyo", "administracion"]);
  });

  it("OPERACIÓN contiene Equipos, Mantenimiento y Preoperacional", () => {
    const grupos = gruposNavegacion({ rol: "SUPERVISOR", modulos: TODOS_MODULOS });
    const op = grupos.find((g) => g.clave === "operacion");
    expect(op?.titulo).toBe("Operación");
    const claves = op?.items.map((i) => i.clave) ?? [];
    expect(claves).toContain("activos");
    expect(claves).toContain("ordenes");
    expect(claves).toContain("preoperacional");
    // El item de Equipos rotula «Equipos» para el no-técnico.
    expect(op?.items.find((i) => i.clave === "activos")?.nombre).toBe("Equipos");
  });

  it("el técnico ve «Mis equipos» y «Mis órdenes» y NO ve Planes/Preventivo/Correctivo en OPERACIÓN", () => {
    const grupos = gruposNavegacion({ rol: "TECNICO", modulos: TODOS_MODULOS });
    const op = grupos.find((g) => g.clave === "operacion");
    expect(op?.items.find((i) => i.clave === "activos")?.nombre).toBe("Mis equipos");
    expect(op?.items.find((i) => i.clave === "ordenes")?.nombre).toBe("Mis órdenes");
    expect(op?.items.some((i) => i.clave === "planes")).toBe(false);
    expect(op?.items.some((i) => i.clave === "preventivo")).toBe(false);
    expect(op?.items.some((i) => i.clave === "correctivo")).toBe(false);
  });

  it("INFORMACIÓN contiene Hoja de vida, Combustible (si utilización visible) e Indicadores", () => {
    const grupos = gruposNavegacion(
      { rol: "SUPERVISOR", modulos: TODOS_MODULOS },
      { utilizacionVisible: true },
    );
    const info = grupos.find((g) => g.clave === "informacion");
    expect(info?.titulo).toBe("Información");
    const claves = info?.items.map((i) => i.clave) ?? [];
    expect(claves).toContain("hoja-de-vida");
    expect(claves).toContain("combustible");
    expect(claves).toContain("analytics");
    expect(info?.items.find((i) => i.clave === "hoja-de-vida")?.ruta).toBe("/activos");
    expect(info?.items.find((i) => i.clave === "combustible")?.ruta).toBe("/utilizacion/tanqueos");
  });

  it("Combustible NO aparece si Utilización no está visible", () => {
    const grupos = gruposNavegacion({ rol: "SUPERVISOR", modulos: TODOS_MODULOS });
    const info = grupos.find((g) => g.clave === "informacion");
    expect(info?.items.some((i) => i.clave === "combustible")).toBe(false);
  });

  // LITE-10 · regresión SEVERO-1 (code-review): la recomposición del nav había
  // eliminado el punto de entrada a /utilizacion/lecturas. Contrato: con
  // Utilización visible deben ser accesibles TANTO Lecturas (OPERACIÓN, flujo
  // Equipo→Lectura) COMO Combustible/tanqueos (INFORMACIÓN), para TODO rol con
  // la capacidad. Esta prueba impide que la omisión se vuelva a codificar.
  describe("SEVERO-1 · Utilización visible expone Lecturas Y Tanqueos por rol", () => {
    const ROLES_UTIL: Rol[] = ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR", "PLANIFICADOR", "TECNICO", "CONSULTA"];
    for (const rol of ROLES_UTIL) {
      it(`${rol}: Lecturas en OPERACIÓN y Combustible(tanqueos) en INFORMACIÓN`, () => {
        const grupos = gruposNavegacion(
          { rol, modulos: TODOS_MODULOS },
          { utilizacionVisible: true },
        );
        const op = grupos.find((g) => g.clave === "operacion");
        const info = grupos.find((g) => g.clave === "informacion");
        const lecturas = op?.items.find((i) => i.clave === "lecturas");
        const tanqueos = info?.items.find((i) => i.clave === "combustible");
        // Lecturas: presente y apuntando al flujo real (sin ruta nueva).
        expect(lecturas, `${rol} debe ver Lecturas de horómetro`).toBeDefined();
        expect(lecturas?.ruta).toBe("/utilizacion/lecturas");
        // Tanqueos: la capacidad existente NO se oculta.
        expect(tanqueos, `${rol} debe ver Combustible/tanqueos`).toBeDefined();
        expect(tanqueos?.ruta).toBe("/utilizacion/tanqueos");
      });
    }

    it("sin Utilización visible NO aparece Lecturas (visibilidad, no omisión codificada)", () => {
      const grupos = gruposNavegacion({ rol: "TECNICO", modulos: TODOS_MODULOS });
      const op = grupos.find((g) => g.clave === "operacion");
      expect(op?.items.some((i) => i.clave === "lecturas")).toBe(false);
    });
  });

  it("expone Preoperacional (sin ruta nueva) cuando activos está habilitado", () => {
    const grupos = gruposNavegacion({ rol: "TECNICO", modulos: ["activos"] });
    const op = grupos.find((g) => g.clave === "operacion");
    const preop = op?.items.find((i) => i.clave === "preoperacional");
    expect(preop).toBeDefined();
    expect(preop?.ruta).toBe("/activos?accion=preoperacional");
  });

  it("APOYO (inventario/referencia/abastecimiento) es secundario y va tras OPERACIÓN/INFORMACIÓN", () => {
    const grupos = gruposNavegacion({ rol: "TENANT_ADMIN", modulos: TODOS_MODULOS });
    const claves = grupos.map((g) => g.clave);
    expect(claves.indexOf("apoyo")).toBeGreaterThan(claves.indexOf("operacion"));
    expect(claves.indexOf("apoyo")).toBeGreaterThan(claves.indexOf("informacion"));
    expect(esGrupoSecundario("apoyo")).toBe(true);
    expect(esGrupoSecundario("operacion")).toBe(false);
    expect(esGrupoSecundario("administracion")).toBe(false);
  });

  it("ADMINISTRACIÓN solo aparece para roles con capacidad de administración", () => {
    const admin = gruposNavegacion({ rol: "TENANT_ADMIN", modulos: TODOS_MODULOS });
    expect(admin.some((g) => g.clave === "administracion")).toBe(true);
    const tecnico = gruposNavegacion({ rol: "TECNICO", modulos: TODOS_MODULOS });
    expect(tecnico.some((g) => g.clave === "administracion")).toBe(false);
  });
});

/* --------------------- §21 visibilidad (nunca es seguridad) -------------- */

describe("§21 · ocultos filtra presentación sin tocar seguridad", () => {
  it("ocultar un macro-grupo lo retira de la navegación", () => {
    const base = gruposNavegacion({ rol: "TENANT_ADMIN", modulos: TODOS_MODULOS });
    expect(base.some((g) => g.clave === "apoyo")).toBe(true);
    const filtrados = gruposNavegacion(
      { rol: "TENANT_ADMIN", modulos: TODOS_MODULOS },
      { ocultos: new Set(["apoyo"]) },
    );
    expect(filtrados.some((g) => g.clave === "apoyo")).toBe(false);
  });

  it("ocultos JAMÁS revela un módulo no habilitado (visibilidad ≠ seguridad)", () => {
    // El tenant NO tiene inventario/analytics/planes/referencia/abastecimiento:
    // aunque no se pidan ocultar, APOYO e INFORMACIÓN (indicadores) no aparecen
    // porque el entitlement manda. OPERACIÓN sí (activos+ordenes).
    const grupos = gruposNavegacion(
      { rol: "TENANT_ADMIN", modulos: ["activos", "ordenes"] },
      { ocultos: new Set() },
    );
    expect(grupos.some((g) => g.clave === "apoyo")).toBe(false);
    const info = grupos.find((g) => g.clave === "informacion");
    // Sin analytics ni utilización: sólo «Hoja de vida» (reutiliza activos).
    expect(info?.items.some((i) => i.clave === "analytics")).toBe(false);
    expect(info?.items.some((i) => i.clave === "combustible")).toBe(false);
  });

  it("ocultar el macro-grupo secundario no afecta a OPERACIÓN/INFORMACIÓN habilitados", () => {
    const grupos = gruposNavegacion(
      { rol: "TENANT_ADMIN", modulos: TODOS_MODULOS },
      { ocultos: new Set(["apoyo"]) },
    );
    expect(grupos.some((g) => g.clave === "operacion")).toBe(true);
    expect(grupos.some((g) => g.clave === "informacion")).toBe(true);
    expect(grupos.some((g) => g.clave === "apoyo")).toBe(false);
  });
});
