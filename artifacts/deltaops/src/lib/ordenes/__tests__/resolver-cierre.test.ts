/**
 * DELTAOPS LITE-05 · Cierre gobernado en DOS pasos (fix del bloqueo de «Aprobar
 * y cerrar»). El contrato CONGELADO de Órdenes exige abrir el gate de aprobación
 * con `transicionar("cerrar")` ANTES de decidirlo con `aprobarCierre`. La ficha
 * llamaba sólo a `aprobarCierre` ⇒ el backend respondía «No hay aprobación
 * pendiente» (KRN-CFL). `resolverCierre` encadena ambos pasos con el mismo
 * soporte offline. Estos tests fijan esa secuencia y sus cortes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ColaSync } from "../../offline/cola";
import { resolverCierre } from "../mutaciones";

const OT = "11111111-2222-4333-8444-555555555555";

/** Cola real, pero sin enviador de red (no se usa en línea). */
function nuevaCola(): ColaSync {
  return new ColaSync("tenant-test", undefined, null, "ordenes");
}

describe("resolverCierre · gate de cierre en dos pasos", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function respuesta(body: unknown, status = 200): Response {
    return { ok: status < 400, status, text: async () => JSON.stringify(body) } as unknown as Response;
  }

  it("APROBAR: emite PRIMERO transicionar(cerrar) y LUEGO aprobar-cierre {decision:'aprobar'}", async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta({ id: OT, estado: "EN_VALIDACION", aprobacionPendiente: true }))
      .mockResolvedValueOnce(respuesta({ id: OT, estado: "CERRADA" }));

    const r = await resolverCierre(nuevaCola(), OT, true);
    expect(r.error).toBeUndefined();
    expect(r.encolada).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url1, opts1] = fetchMock.mock.calls[0];
    const [url2, opts2] = fetchMock.mock.calls[1];
    expect(String(url1)).toContain(`/${OT}/transicionar`);
    expect(JSON.parse(String(opts1.body))).toMatchObject({ comando: "cerrar", id: OT });
    expect(String(url2)).toContain(`/${OT}/aprobar-cierre`);
    const cuerpo2 = JSON.parse(String(opts2.body));
    expect(cuerpo2).toMatchObject({ decision: "aprobar", id: OT });
    expect(cuerpo2).not.toHaveProperty("aprobado");
  });

  it("RECHAZAR: abre el gate y decide {decision:'rechazar'} con motivo", async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta({ id: OT, estado: "EN_VALIDACION" }))
      .mockResolvedValueOnce(respuesta({ id: OT, estado: "EN_EJECUCION" }));

    await resolverCierre(nuevaCola(), OT, false, "faltan evidencias");
    const cuerpo2 = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(cuerpo2).toMatchObject({ decision: "rechazar", motivo: "faltan evidencias" });
  });

  it("si el paso 1 (abrir gate) FALLA, NO se intenta aprobar-cierre", async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ error: "No autorizado", code: "KRN-AUTH-001" }, 403));
    const r = await resolverCierre(nuevaCola(), OT, true);
    expect(r.error).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/transicionar");
  });

  it("OFFLINE: si el paso 1 se ENCOLA (fallo de red), NO se ejecuta el paso 2", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const r = await resolverCierre(nuevaCola(), OT, true);
    expect(r.encolada).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
