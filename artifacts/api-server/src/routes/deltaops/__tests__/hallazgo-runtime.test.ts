/**
 * DELTAOPS LITE-05 §19 · Dominio del runtime de DESCARTE de hallazgo.
 *
 * Runtime AISLADO con adaptadores Fake (sin PostgreSQL): valida la semántica del
 * store genérico de descarte —idempotencia por opId, conflicto al re-descartar
 * un descarte vigente, reversión (reabrir) y re-descarte tras reabrir— y la
 * guarda fail-closed del principal (CONSULTA sólo lectura). Rápido y determinista.
 */
import { describe, expect, it } from "vitest";
import {
  crearHallazgoRuntime,
  contextForHallazgo,
  principalHallazgo,
  SERVICIO_HALLAZGO,
  PERMISOS_HALLAZGO,
} from "../hallazgo-runtime";

const TENANT = "hallazgo-dominio";
const HALLAZGO = "preop:activo-1:preop-movil:v1:op-x::frenos";
const ID = `descarte:${HALLAZGO}`;

function ctx(rol = "SUPERVISOR") {
  return contextForHallazgo("u-1", rol, TENANT);
}

function baseDescartar(opId: string, extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    opId,
    hallazgoId: HALLAZGO,
    ejecucionId: "preop:activo-1:preop-movil:v1:op-x",
    itemClave: "frenos",
    activoId: "activo-1",
    descartadoAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

describe("LITE-05 · hallazgo-runtime (dominio, fakes)", () => {
  it("descartar es idempotente por opId (mismo opId ⇒ idempotente=true)", async () => {
    const rt = crearHallazgoRuntime();
    const a = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.descartar`, baseDescartar("op-1", { motivo: "ok" }));
    expect(a.ok).toBe(true);
    const b = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.descartar`, baseDescartar("op-1", { motivo: "ok" }));
    expect(b.ok).toBe(true);
    if (b.ok) expect((b.value as { idempotente: boolean }).idempotente).toBe(true);
  });

  it("re-descartar un descarte VIGENTE (otro opId) ⇒ conflicto", async () => {
    const rt = crearHallazgoRuntime();
    const a = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.descartar`, baseDescartar("op-1"));
    expect(a.ok).toBe(true);
    const b = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.descartar`, baseDescartar("op-2"));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code.startsWith("KRN-CFL")).toBe(true);
  });

  it("reabrir un descartado ⇒ REABIERTO; luego se puede re-descartar (reversibilidad)", async () => {
    const rt = crearHallazgoRuntime();
    await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.descartar`, baseDescartar("op-1"));
    const reab = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.reabrir`, {
      id: ID, opId: "reab-1", hallazgoId: HALLAZGO, reabiertoAt: "2026-01-02T00:00:00.000Z",
    });
    expect(reab.ok).toBe(true);
    if (reab.ok) expect((reab.value as { estado: string }).estado).toBe("REABIERTO");

    const q = await rt.platform.kernel.queries.execute(ctx(), `${SERVICIO_HALLAZGO}.obtener`, { id: ID });
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as { status: string }).status).toBe("REABIERTO");

    // Re-descartar tras reabrir (nuevo opId) ⇒ vuelve a DESCARTADO con historial.
    const red = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.descartar`, baseDescartar("op-3"));
    expect(red.ok).toBe(true);
    if (red.ok) expect((red.value as { estado: string }).estado).toBe("DESCARTADO");
  });

  it("reabrir es idempotente y no reabre dos veces", async () => {
    const rt = crearHallazgoRuntime();
    await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.descartar`, baseDescartar("op-1"));
    const r1 = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.reabrir`, { id: ID, opId: "reab-1", hallazgoId: HALLAZGO, reabiertoAt: "t1" });
    expect(r1.ok).toBe(true);
    const r2 = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_HALLAZGO}.reabrir`, { id: ID, opId: "reab-2", hallazgoId: HALLAZGO, reabiertoAt: "t2" });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });

  it("principalHallazgo es fail-closed: CONSULTA/lector sólo lectura; otros escriben", () => {
    for (const rol of ["CONSULTA", "lector"]) {
      const p = principalHallazgo("u", rol);
      expect(p.permisos).toContain(PERMISOS_HALLAZGO.read);
      expect(p.permisos).not.toContain(PERMISOS_HALLAZGO.write);
    }
    for (const rol of ["SUPERVISOR", "TENANT_ADMIN", "PLANIFICADOR", "TECNICO"]) {
      const p = principalHallazgo("u", rol);
      expect(p.permisos).toContain(PERMISOS_HALLAZGO.write);
    }
  });
});
