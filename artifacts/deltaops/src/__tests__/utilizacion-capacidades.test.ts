/**
 * DGP-019.1 · Pruebas PURAS de capacidades, visibilidad de navegación y
 * presentación del módulo Utilización. El backend es la autoridad de
 * autorización; estas comprobaciones fijan que la UI OCULTA lo que el rol no
 * puede hacer (réplica del mapeo del runtime del backend) y que la ausencia de
 * datos se representa como "sin datos" (mandato §7/§18), nunca como 0.
 */
import { describe, it, expect } from "vitest";
import { capacidadesUtilizacion, utilizacionVisible } from "../lib/utilizacion/capacidades";
import { etiquetaEstadoLectura, tonoEstadoLectura, TIPOS_MEDIDOR, UNIDAD_POR_MEDIDOR } from "../lib/utilizacion/constantes";
import { plantillaReinicio, plantillaLectura, plantillaTanqueo, CAMPOS_REINICIO } from "../lib/utilizacion/plantillas";
import { validar, hayBloqueos } from "../lib/forms/motor";
import type { Sesion } from "../lib/identidad/tipos";

function sesion(rol: string, modulos: string[] = ["utilizacion"]): Sesion {
  return {
    identityId: "u", email: "u@x", nombre: "U",
    tenant: { id: "t", codigo: "t", nombre: "T", estado: "ACTIVO" },
    rol: rol as Sesion["rol"],
    modulos: modulos as Sesion["modulos"],
    membresias: [],
  };
}

describe("capacidades · mapeo por rol (réplica del backend)", () => {
  it("CONSULTA sólo puede leer (sin CTAs de escritura)", () => {
    const c = capacidadesUtilizacion(sesion("CONSULTA"));
    expect(c.leer).toBe(true);
    expect(c.registrarLectura).toBe(false);
    expect(c.registrarTanqueo).toBe(false);
    expect(c.anularLectura).toBe(false);
    expect(c.anularTanqueo).toBe(false);
    expect(c.regularizarMedidor).toBe(false);
  });

  it("PLANIFICADOR sólo puede leer", () => {
    const c = capacidadesUtilizacion(sesion("PLANIFICADOR"));
    expect(c.leer).toBe(true);
    expect(c.registrarLectura).toBe(false);
    expect(c.regularizarMedidor).toBe(false);
  });

  it("TECNICO registra lecturas y tanqueos, pero NO anula ni regulariza", () => {
    const c = capacidadesUtilizacion(sesion("TECNICO"));
    expect(c.registrarLectura).toBe(true);
    expect(c.registrarTanqueo).toBe(true);
    expect(c.anularLectura).toBe(false);
    expect(c.anularTanqueo).toBe(false);
    expect(c.regularizarMedidor).toBe(false);
  });

  it("SUPERVISOR tiene todas las capacidades (incluida regularizar)", () => {
    const c = capacidadesUtilizacion(sesion("SUPERVISOR"));
    expect(c.registrarLectura).toBe(true);
    expect(c.anularLectura).toBe(true);
    expect(c.anularTanqueo).toBe(true);
    expect(c.regularizarMedidor).toBe(true);
  });

  it("TENANT_ADMIN tiene todas las capacidades", () => {
    const c = capacidadesUtilizacion(sesion("TENANT_ADMIN"));
    expect(Object.values(c).every(Boolean)).toBe(true);
  });

  it("una señal explícita del módulo utilización tiene prioridad sobre el rol", () => {
    const s = { ...sesion("CONSULTA"), permisos: ["modulo.utilizacion.leer", "modulo.utilizacion.lecturas.registrar"] };
    const c = capacidadesUtilizacion(s);
    expect(c.registrarLectura).toBe(true);
    expect(c.anularLectura).toBe(false);
  });

  it(
    "REGRESIÓN E2E · la sesión REAL de TENANT_ADMIN (capacidades/permisos de " +
      "referencia, SIN ninguna de utilización) puede registrar y regularizar",
    () => {
      // Forma exacta observada en GET /auth/login para admin@delta.demo:
      // capacidades y permisos NO vacíos pero ajenos al módulo utilización.
      // Estos NO deben suprimir el mapeo por rol (bug corregido).
      const s = {
        rol: "TENANT_ADMIN",
        capacidades: ["gestionar-elementos-referencia", "consultar-elementos-referencia"],
        permisos: [
          "platform.config.write",
          "platform.attachment.read",
          "modulo.referencia.read",
          "modulo.referencia.write",
        ],
      } as unknown as Sesion;
      const c = capacidadesUtilizacion(s);
      expect(c.leer).toBe(true);
      expect(c.registrarLectura).toBe(true);
      expect(c.registrarTanqueo).toBe(true);
      expect(c.anularLectura).toBe(true);
      expect(c.anularTanqueo).toBe(true);
      expect(c.regularizarMedidor).toBe(true);
    },
  );

  it("REGRESIÓN · un TECNICO con permisos de referencia (sin utilización) NO anula", () => {
    const s = {
      rol: "TECNICO",
      capacidades: ["consultar-elementos-referencia"],
      permisos: ["platform.attachment.read", "modulo.referencia.read"],
    } as unknown as Sesion;
    const c = capacidadesUtilizacion(s);
    expect(c.registrarLectura).toBe(true);
    expect(c.anularLectura).toBe(false);
    expect(c.regularizarMedidor).toBe(false);
  });
});

describe("navegación · visibilidad del módulo (entitlement + capacidad)", () => {
  it("visible con entitlement 'utilizacion' y rol con lectura", () => {
    expect(utilizacionVisible(sesion("CONSULTA", ["utilizacion"]))).toBe(true);
    expect(utilizacionVisible(sesion("TECNICO", ["activos", "utilizacion"]))).toBe(true);
  });

  it("oculto sin el entitlement del tenant", () => {
    expect(utilizacionVisible(sesion("TENANT_ADMIN", ["activos", "ordenes"]))).toBe(false);
  });
});

describe("presentación · estado de lectura", () => {
  it("anulada → 'Anulada'; inconsistente → 'Inconsistente'; resto → 'Válida'", () => {
    expect(etiquetaEstadoLectura("anulada", false)).toBe("Anulada");
    expect(etiquetaEstadoLectura("vigente", true)).toBe("Inconsistente");
    expect(etiquetaEstadoLectura("vigente", false)).toBe("Válida");
    expect(tonoEstadoLectura("vigente", true)).toBe("advertencia");
    expect(tonoEstadoLectura("anulada", false)).toBe("neutro");
  });

  it("las unidades se derivan del tipo de medidor", () => {
    expect(TIPOS_MEDIDOR).toEqual(["horometro", "odometro"]);
    expect(UNIDAD_POR_MEDIDOR.horometro).toBe("h");
    expect(UNIDAD_POR_MEDIDOR.odometro).toBe("km");
  });
});

describe("formularios · reinicio de medidor exige motivo", () => {
  it("sin motivo hay bloqueo; con motivo válido no lo hay", () => {
    const def = plantillaReinicio();
    const sinMotivo = validar(def, {}, { tipoMedidor: "horometro", valorNuevo: 0, fechaHora: "2024-01-01T00:00" })
      .filter((h) => CAMPOS_REINICIO.includes(h.campo as (typeof CAMPOS_REINICIO)[number]));
    expect(hayBloqueos(sinMotivo)).toBe(true);
    const conMotivo = validar(def, {}, { tipoMedidor: "horometro", valorNuevo: 0, fechaHora: "2024-01-01T00:00", motivo: "Cambio de motor" })
      .filter((h) => CAMPOS_REINICIO.includes(h.campo as (typeof CAMPOS_REINICIO)[number]));
    expect(hayBloqueos(conMotivo)).toBe(false);
  });

  it("las plantillas de lectura y tanqueo se construyen (Dynamic Forms)", () => {
    expect(plantillaLectura().nodos.length).toBeGreaterThan(0);
    expect(plantillaTanqueo([]).nodos.length).toBeGreaterThan(0);
  });
});
