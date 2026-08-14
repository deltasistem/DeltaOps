/**
 * DELTAOPS LITE-08 §21 · Dominio del runtime de VISIBILIDAD de navegación.
 *
 * Runtime AISLADO con adaptadores Fake (sin PostgreSQL). Valida la semántica de
 * la preferencia por tenant: idempotencia por opId, actualización con histórico
 * de opIds, lectura, y —crítico— la guarda fail-closed del principal (sólo el
 * admin de empresa/SUPER_ADMIN escribe; el resto sólo lee). Visibilidad ≠
 * seguridad: la preferencia jamás concede permisos de negocio.
 */
import { describe, expect, it } from "vitest";
import {
  crearVisibilidadRuntime,
  contextForVisibilidad,
  principalVisibilidad,
  SERVICIO_VISIBILIDAD,
  PERMISOS_VISIBILIDAD,
} from "../visibilidad-runtime";

const TENANT = "vis-dominio";

function ctx(rol = "TENANT_ADMIN") {
  return contextForVisibilidad("u-1", rol, TENANT);
}

describe("LITE-08 §21 · visibilidad-runtime (dominio, fakes)", () => {
  it("guardar es idempotente por opId (mismo opId ⇒ idempotente=true)", async () => {
    const rt = crearVisibilidadRuntime();
    const a = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_VISIBILIDAD}.guardar`, {
      opId: "op-1",
      ocultos: ["inventario"],
      actualizadoAt: "2026-01-01T00:00:00.000Z",
    });
    expect(a.ok).toBe(true);
    const b = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_VISIBILIDAD}.guardar`, {
      opId: "op-1",
      ocultos: ["inventario"],
      actualizadoAt: "2026-01-01T00:00:00.000Z",
    });
    expect(b.ok).toBe(true);
    if (b.ok) expect((b.value as { idempotente: boolean }).idempotente).toBe(true);
  });

  it("una nueva guarda (otro opId) actualiza los grupos ocultos", async () => {
    const rt = crearVisibilidadRuntime();
    await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_VISIBILIDAD}.guardar`, {
      opId: "op-1",
      ocultos: ["inventario"],
      actualizadoAt: "2026-01-01T00:00:00.000Z",
    });
    const upd = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_VISIBILIDAD}.guardar`, {
      opId: "op-2",
      ocultos: ["inventario", "referencia"],
      actualizadoAt: "2026-01-02T00:00:00.000Z",
    });
    expect(upd.ok).toBe(true);
    if (upd.ok) expect((upd.value as { idempotente: boolean }).idempotente).toBe(false);

    const q = await rt.platform.kernel.queries.execute(ctx(), `${SERVICIO_VISIBILIDAD}.obtener`, {});
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as { ocultos: string[] }).ocultos.sort()).toEqual(["inventario", "referencia"]);
  });

  it("obtener sin preferencia previa devuelve lista vacía (fail-open de presentación)", async () => {
    const rt = crearVisibilidadRuntime();
    const q = await rt.platform.kernel.queries.execute(ctx("SUPERVISOR"), `${SERVICIO_VISIBILIDAD}.obtener`, {});
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as { ocultos: string[] }).ocultos).toEqual([]);
  });

  it("un rol NO admin no tiene permiso de escritura (write ⇒ sólo admin)", async () => {
    for (const rol of ["SUPERVISOR", "PLANIFICADOR", "TECNICO", "CONSULTA"]) {
      const p = principalVisibilidad("u-1", rol);
      expect(p.permisos ?? []).toContain(PERMISOS_VISIBILIDAD.read);
      expect(p.permisos ?? []).not.toContain(PERMISOS_VISIBILIDAD.write);
    }
    for (const rol of ["TENANT_ADMIN", "SUPER_ADMIN"]) {
      const p = principalVisibilidad("u-1", rol);
      expect(p.permisos ?? []).toContain(PERMISOS_VISIBILIDAD.write);
    }
  });

  it("un principal sin permiso de escritura NO puede guardar (autorización del kernel)", async () => {
    const rt = crearVisibilidadRuntime();
    const r = await rt.platform.kernel.commands.execute(ctx("CONSULTA"), `${SERVICIO_VISIBILIDAD}.guardar`, {
      opId: "op-x",
      ocultos: ["inventario"],
      actualizadoAt: "2026-01-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code.startsWith("KRN-AUTH")).toBe(true);
  });

  it("rechaza claves de grupo desconocidas (frontera estricta; jamás persiste basura)", async () => {
    const rt = crearVisibilidadRuntime();
    const r = await rt.platform.kernel.commands.execute(ctx(), `${SERVICIO_VISIBILIDAD}.guardar`, {
      opId: "op-1",
      ocultos: ["no-existe"],
      actualizadoAt: "2026-01-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code.startsWith("KRN-VAL")).toBe(true);
  });
});
