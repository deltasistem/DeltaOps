/**
 * DGP-009.3 (Ronda 3) · Comando orquestador `modulo.ordenes.capturarRespuesta`.
 *
 * Verifica que la captura de la respuesta de un checklist/formulario asociado:
 *   - Compone el flujo REAL de Dynamic Forms (guardarBorrador → enviar) contra
 *     el motor de formularios y ANCLA la respuesta a la OT (clave+versión).
 *   - Es una operación ÚNICA idempotente por `opId` (replay por /sync converge
 *     al mismo resultado, sin duplicar respuestas).
 *   - Es RECUPERABLE: si la ASOCIACIÓN falla DESPUÉS de enviar (p.ej. conflicto),
 *     un reintento con el MISMO opId completa el anclaje re-leyendo la versión
 *     actual de la OT, sin dejar una respuesta ENVIADA huérfana ni duplicarla.
 *
 * Usa el puerto de plantillas respaldado por el motor REAL (sin fake) para que
 * las respuestas creadas por el comando existan al verificar el anclaje.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, MemoryLogger, type ExecutionContext, type Principal } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { crearHarness, MODULO, MODULO_WORKFLOW, type OrdenesHarness } from "./harness";

const ALL = [
  ...new Set(officialServices().flatMap((s) => [...s.permissions])),
  `${MODULO}.read`, `${MODULO}.write`, `${MODULO}.operar`, `${MODULO}.validar`, `${MODULO}.admin`,
  `${MODULO_WORKFLOW}.read`, `${MODULO_WORKFLOW}.operar`, `${MODULO_WORKFLOW}.disenar`,
  "modulo.formularios.plantilla.read", "modulo.formularios.plantilla.write",
  "modulo.formularios.plantilla.publicar", "modulo.formularios.plantilla.admin",
  "modulo.formularios.respuesta.read", "modulo.formularios.respuesta.write", "modulo.formularios.respuesta.enviar",
];
const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL, capacidades: ["*"] };

let rt: OrdenesHarness;
const T = "t-cap";

const ctxOf = (p: Principal = ADMIN) => createExecutionContext({ principal: p, metadata: { tenantId: T } });
const exec = (ctx: ExecutionContext, cmd: string, input: unknown) => rt.platform.kernel.commands.execute(ctx, cmd, input);
const query = (ctx: ExecutionContext, q: string, input: unknown) => rt.platform.kernel.queries.execute(ctx, q, input);
const drenar = () => rt.platform.kernel.outboxProcessor.processPending();

// Definición de formulario simple (un campo `texto` ⇒ clase inferida "formulario").
const DEF_FORM = {
  clave: "form.diag",
  titulo: "Diagnóstico",
  nodos: [
    {
      clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Datos",
      hijos: [
        { clase: "campo", clave: "detalle", tipo: "texto", etiqueta: "Detalle", obligatorio: true },
      ],
    },
  ],
};

/** Publica una plantilla de formulario (v1 activa) en el motor real. */
async function publicarChecklist(ctx: ExecutionContext): Promise<void> {
  const id = "pl-form";
  const c = await exec(ctx, "modulo.formularios.plantilla.crear", { id, clave: "form.diag", contenido: { definicion: DEF_FORM } });
  if (!c.ok) throw new Error(`crear plantilla: ${c.error.message}`);
  const p = await exec(ctx, "modulo.formularios.plantilla.publicar", { id });
  if (!p.ok) throw new Error(`publicar plantilla: ${p.error.message}`);
  await drenar();
}

/** Crea una OT (BORRADOR) y devuelve su id. */
async function crearOT(ctx: ExecutionContext): Promise<string> {
  const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "correctiva" });
  if (!r.ok) throw new Error(r.error.message);
  await drenar();
  return (r.value as { id: string }).id;
}

/** Cuenta las respuestas de formulario existentes en el store (por prefijo). */
async function contarRespuestas(ctx: ExecutionContext, prefijo: string): Promise<number> {
  const r = await query(ctx, "modulo.formularios.respuesta.listar", {});
  if (!r.ok) return 0;
  const filas = (r.value as { id: string }[]) ?? [];
  return filas.filter((f) => f.id.startsWith(prefijo)).length;
}

beforeEach(() => {
  rt = crearHarness({ logger: new MemoryLogger() });
});

describe("DGP-009.3 · capturarRespuesta (offline-first + idempotente)", () => {
  it("compone guardarBorrador→enviar y ANCLA la respuesta a la OT (clave+versión)", async () => {
    const ctx = ctxOf();
    await publicarChecklist(ctx);
    const id = await crearOT(ctx);

    const r = await exec(ctx, `${MODULO}.capturarRespuesta`, {
      id, opId: "cap-1", clase: "formulario",
      plantilla: { clave: "form.diag", version: 1 },
      datos: { detalle: "OK" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { respuestaId: string; clase: string; plantilla: { clave: string; version: number } };
      expect(v.clase).toBe("formulario");
      expect(v.plantilla).toEqual({ clave: "form.diag", version: 1 });
      expect(v.respuestaId).toContain("cap-1");
    }
    await drenar();

    // El formulario de la OT quedó ANCLADO al respuestaId con la versión exacta.
    const ot = await rt.adapters.repository.findById(T, id);
    expect(ot.ok).toBe(true);
    if (ot.ok && ot.value) {
      expect(ot.value.formulario?.respuesta?.respuestaId).toContain("cap-1");
      expect(ot.value.formulario?.version).toBe(1);
      expect(ot.value.formulario?.clave).toBe("form.diag");
    }
  });

  it("es idempotente por opId: re-ejecutar NO crea una segunda respuesta", async () => {
    const ctx = ctxOf();
    await publicarChecklist(ctx);
    const id = await crearOT(ctx);
    const input = { id, opId: "cap-2", clase: "formulario", plantilla: { clave: "form.diag", version: 1 }, datos: { detalle: "Segundo" } };

    const r1 = await exec(ctx, `${MODULO}.capturarRespuesta`, input);
    if (!r1.ok) throw new Error(`r1: ${r1.error.code} ${r1.error.message}`);
    expect(r1.ok).toBe(true);
    await drenar();
    const r2 = await exec(ctx, `${MODULO}.capturarRespuesta`, input);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
    await drenar();

    // Exactamente UNA respuesta para este opId (sin duplicados).
    expect(await contarRespuestas(ctx, "ord-resp:")).toBe(1);
  });

  it("RECUPERACIÓN: si asociar falla tras enviar, el reintento (mismo opId) ancla sin respuesta huérfana ni duplicado", async () => {
    const ctx = ctxOf();
    await publicarChecklist(ctx);
    const id = await crearOT(ctx);

    // Inyecta un fallo de UNA sola asociación (persistencia) DESPUÉS del envío.
    const repo = rt.adapters.repository;
    const updateReal = repo.update.bind(repo);
    let fallarUnaVez = true;
    (repo as unknown as { update: typeof repo.update }).update = async (uow, o, expectedVersion) => {
      if (fallarUnaVez) {
        fallarUnaVez = false;
        const { fail, KernelErrors } = await import("@workspace/kernel");
        return fail(KernelErrors.conflict("Conflicto simulado tras el envío"));
      }
      return updateReal(uow, o, expectedVersion);
    };

    const input = { id, opId: "cap-3", clase: "formulario", plantilla: { clave: "form.diag", version: 1 }, datos: { detalle: "Recuperable" } };

    // (1) Primer intento: la respuesta se crea y ENVÍA, pero la asociación falla
    //     ⇒ estado parcial (respuesta ENVIADA, OT sin anclar) = posible huérfana.
    const r1 = await exec(ctx, `${MODULO}.capturarRespuesta`, input);
    expect(r1.ok).toBe(false);
    await drenar();

    const ot1 = await rt.adapters.repository.findById(T, id);
    if (ot1.ok && ot1.value) {
      expect(ot1.value.formulario).toBeFalsy(); // aún NO anclado
    }

    // (2) Reintento con el MISMO opId: guardarBorrador/enviar son idempotentes
    //     (sub-opId), y la asociación se completa re-leyendo la versión actual.
    const r2 = await exec(ctx, `${MODULO}.capturarRespuesta`, input);
    expect(r2.ok).toBe(true);
    await drenar();

    // La OT quedó ANCLADA y NO se duplicó la respuesta: recuperación completa.
    const ot2 = await rt.adapters.repository.findById(T, id);
    expect(ot2.ok).toBe(true);
    if (ot2.ok && ot2.value) {
      expect(ot2.value.formulario?.respuesta?.respuestaId).toContain("cap-3");
    }
    expect(await contarRespuestas(ctx, "ord-resp:")).toBe(1);
  });
});
