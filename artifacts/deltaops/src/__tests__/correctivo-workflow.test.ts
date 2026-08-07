/**
 * DGP-015 · Pruebas PURAS del Workflow por botón (solicitud e intervención),
 * los deep links (ruta → estado inicial de filtros/pestaña) y el anclaje del
 * diagnóstico a plantilla+versión. Sin red ni DOM: la presentación de acciones
 * por estado, la construcción de URLs y el empaquetado del diagnóstico son
 * deterministas. Se apoya en el catálogo de acciones EXACTO del contrato.
 */
import { describe, it, expect } from "vitest";
import {
  ACCIONES_SOLICITUD, ACCIONES_SOLICITUD_POR_ESTADO,
  ACCIONES_INTERVENCION, ACCIONES_INTERVENCION_POR_ESTADO,
} from "../lib/correctivo/constantes";
import {
  urlSolicitudes, urlSolicitud, urlSolicitudTab, urlNuevaSolicitud,
  urlIntervencion, urlIntervencionTab, urlEscanear, urlSincronizacion, leerParam,
} from "../lib/correctivo/deep-links";
import { construirInputDiagnostico } from "../lib/correctivo/alta";

/* --------------------- Workflow por botón · solicitud ------------------- */

describe("workflow · acciones de solicitud EXACTAS del contrato", () => {
  it("el catálogo cubre las 5 transiciones del contrato y ninguna más", () => {
    expect(ACCIONES_SOLICITUD.map((a) => a.clave).sort()).toEqual(
      ["aprobar", "enviarTriage", "enviarValidacion", "iniciarDiagnostico", "rechazar"],
    );
  });

  it("rechazar es destructivo y exige motivo; el resto no", () => {
    const rechazar = ACCIONES_SOLICITUD.find((a) => a.clave === "rechazar")!;
    expect(rechazar.peligro).toBe(true);
    expect(rechazar.exigeMotivo).toBe(true);
    for (const a of ACCIONES_SOLICITUD.filter((x) => x.clave !== "rechazar")) {
      expect(a.exigeMotivo).toBeFalsy();
    }
  });

  it("cada estado ofrece sólo SUS transiciones (validación en EN_VALIDACION)", () => {
    expect(ACCIONES_SOLICITUD_POR_ESTADO.EN_TRIAGE).toEqual(["iniciarDiagnostico"]);
    expect(ACCIONES_SOLICITUD_POR_ESTADO.EN_DIAGNOSTICO).toEqual(["enviarValidacion"]);
    expect(ACCIONES_SOLICITUD_POR_ESTADO.EN_VALIDACION).toEqual(["aprobar", "rechazar"]);
  });

  it("toda acción ofrecida por estado existe en el catálogo (sin claves fantasma)", () => {
    const claves = new Set(ACCIONES_SOLICITUD.map((a) => a.clave));
    for (const lista of Object.values(ACCIONES_SOLICITUD_POR_ESTADO)) {
      for (const c of lista) expect(claves.has(c)).toBe(true);
    }
  });
});

/* ------------------ Workflow por botón · intervención ------------------- */

describe("workflow · acciones de intervención EXACTAS del contrato", () => {
  it("el catálogo cubre las 4 transiciones del contrato y ninguna más", () => {
    expect(ACCIONES_INTERVENCION.map((a) => a.clave).sort()).toEqual(
      ["asignar", "cerrar", "enviarVerificacion", "iniciarEjecucion"],
    );
  });

  it("cerrar es destructivo", () => {
    expect(ACCIONES_INTERVENCION.find((a) => a.clave === "cerrar")!.peligro).toBe(true);
  });

  it("cada estado ofrece sólo SU transición", () => {
    expect(ACCIONES_INTERVENCION_POR_ESTADO.PREPARACION).toEqual(["asignar"]);
    expect(ACCIONES_INTERVENCION_POR_ESTADO.ASIGNACION).toEqual(["iniciarEjecucion"]);
    expect(ACCIONES_INTERVENCION_POR_ESTADO.EJECUCION).toEqual(["enviarVerificacion"]);
    expect(ACCIONES_INTERVENCION_POR_ESTADO.VERIFICACION).toEqual(["cerrar"]);
  });

  it("toda acción ofrecida por estado existe en el catálogo (sin claves fantasma)", () => {
    const claves = new Set(ACCIONES_INTERVENCION.map((a) => a.clave));
    for (const lista of Object.values(ACCIONES_INTERVENCION_POR_ESTADO)) {
      for (const c of lista) expect(claves.has(c)).toBe(true);
    }
  });
});

/* ---------------------------- Deep links -------------------------------- */

describe("deep links · ruta ↔ estado inicial de filtros/pestaña", () => {
  it("urlSolicitudes serializa estado/origen/activo como query", () => {
    const url = urlSolicitudes({ estado: "EN_VALIDACION", origen: "operador", activoId: "act-1" });
    const q = new URLSearchParams(url.split("?")[1] ?? "");
    expect(q.get("estado")).toBe("EN_VALIDACION");
    expect(q.get("origen")).toBe("operador");
    expect(q.get("activoId")).toBe("act-1");
  });

  it("urlSolicitudes sin filtros no añade query", () => {
    expect(urlSolicitudes()).not.toContain("?");
  });

  it("urlSolicitud y urlSolicitudTab apuntan a la ficha (y su pestaña)", () => {
    expect(urlSolicitud("s-1")).toContain("/correctivo/solicitudes/s-1");
    const tab = urlSolicitudTab("s-1", "diagnostico");
    expect(tab).toContain("/correctivo/solicitudes/s-1");
    expect(new URLSearchParams(tab.split("?")[1]).get("tab")).toBe("diagnostico");
  });

  it("urlNuevaSolicitud ancla el activo de origen (flujo QR)", () => {
    const url = urlNuevaSolicitud({ activo: "act-9" });
    expect(url).toContain("/correctivo/solicitudes/nueva");
    expect(new URLSearchParams(url.split("?")[1]).get("activo")).toBe("act-9");
  });

  it("urlIntervencion/urlIntervencionTab y utilitarios de escaneo/sync", () => {
    expect(urlIntervencion("i-1")).toContain("/correctivo/intervenciones/i-1");
    expect(new URLSearchParams(urlIntervencionTab("i-1", "repuestos").split("?")[1]).get("tab")).toBe("repuestos");
    expect(urlEscanear()).toContain("/correctivo/escanear");
    expect(urlSincronizacion()).toContain("/correctivo/sincronizacion");
  });

  it("leerParam recupera el valor de un query string", () => {
    expect(leerParam("?estado=EN_TRIAGE&origen=iot", "estado")).toBe("EN_TRIAGE");
    expect(leerParam("?estado=EN_TRIAGE", "origen")).toBeUndefined();
  });
});

/* -------------------- Diagnóstico anclado plantilla+versión ------------- */

describe("diagnóstico · anclaje a plantilla+versión y empaquetado opaco", () => {
  it("conserva la referencia plantilla{plantillaId,version} EXACTA", () => {
    const input = construirInputDiagnostico("s-1", { plantillaId: "correctivo.diagnostico", version: 3 }, {});
    expect(input.plantilla).toEqual({ plantillaId: "correctivo.diagnostico", version: 3 });
    expect(input.solicitudId).toBe("s-1");
  });

  it("empaqueta los campos de captura en `respuestas` (objeto libre del contrato)", () => {
    const input = construirInputDiagnostico(
      "s-1",
      { plantillaId: "p", version: 1 },
      { causaReportada: "Ruido", causaEncontrada: "Rodamiento", recomendaciones: "Cambiar", respuesta_horas: "3" },
    );
    expect(input.respuestas).toMatchObject({
      causaReportada: "Ruido", causaEncontrada: "Rodamiento", recomendaciones: "Cambiar", respuesta_horas: "3",
    });
  });

  it("promueve causaRaíz y clasificación a campos declarados del comando", () => {
    const input = construirInputDiagnostico("s-1", { plantillaId: "p", version: 1 }, { causaRaiz: "Lubricación", tipoFalla: "mecanica" });
    expect(input.causaRaiz).toBe("Lubricación");
    expect(input.clasificacion).toEqual({ tipoFalla: "mecanica" });
  });
});
