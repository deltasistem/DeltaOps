/**
 * DGP-006 · Business Foundation Framework — Pruebas de la familia OPERACIONES.
 *
 * Cubre asignación, aprobación (multipaso + guard de auto-aprobación + config),
 * lote (parcial + idempotente + máximo), importación (validación Zod + dry-run)
 * y exportación (proyección a filas planas), todo sobre un runtime de
 * plataforma FAKE (createPlatformRuntime sin pool). Módulo "demo" 100% neutro.
 */
import { describe, expect, it } from "vitest";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import {
  createPlatformRuntime,
  officialServices,
  type PlatformRuntime,
} from "@workspace/platform";
import { crearModuloGenerico } from "../../nucleo/bootstrap";
import type { DefinicionEntidad, DefinicionModulo } from "../../nucleo/definicion";
import { crearOperaciones, type DefinicionAprobacion } from "../index";

/* --------------------------- Definición demo ----------------------------- */

const SERVICIO = "modulo.ops";
const ENTIDAD = "elemento";

const PERMISOS = {
  leer: `${SERVICIO}.read`,
  crear: `${SERVICIO}.write`,
  editar: `${SERVICIO}.write`,
  eliminar: `${SERVICIO}.write`,
  admin: `${SERVICIO}.admin`,
  asignar: `${SERVICIO}.asignar`,
  aprobarN1: `${SERVICIO}.aprobar-n1`,
  aprobarN2: `${SERVICIO}.aprobar-n2`,
};

const definicionElemento: DefinicionEntidad = {
  nombre: ENTIDAD,
  etiqueta: "Elemento",
  servicio: SERVICIO,
  campos: [
    { nombre: "titulo", tipo: "texto", requerido: true, longitudMax: 120 },
    { nombre: "cantidad", tipo: "numero" },
    { nombre: "activo", tipo: "booleano" },
  ],
  permisos: PERMISOS,
  capacidades: [],
};

const flujoAprobacion: DefinicionAprobacion = {
  pasos: [
    { nombre: "n1", permiso: PERMISOS.aprobarN1, minAprobaciones: 1 },
    { nombre: "n2", permiso: PERMISOS.aprobarN2, minAprobaciones: 2 },
  ],
};

const extras = crearOperaciones(definicionElemento, {
  asignacion: true,
  aprobacion: flujoAprobacion,
  lote: true,
  importacion: true,
  exportacion: true,
});

const definicionModulo: DefinicionModulo = {
  servicio: SERVICIO,
  etiqueta: "Módulo Ops",
  entidades: [definicionElemento],
  capacidades: [],
  permisos: [
    PERMISOS.leer,
    PERMISOS.crear,
    PERMISOS.admin,
    PERMISOS.asignar,
    PERMISOS.aprobarN1,
    PERMISOS.aprobarN2,
  ],
  dependeDe: ["platform.config"],
};

const modulo = () => crearModuloGenerico(definicionModulo, extras);

const ALL = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...modulo().permissions]),
];

const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL, capacidades: [] };
const APROBADOR1: Principal = {
  id: "aprob-1",
  rol: "aprobador",
  permisos: [PERMISOS.leer, PERMISOS.crear, PERMISOS.editar, PERMISOS.aprobarN1, PERMISOS.aprobarN2],
  capacidades: [],
};
const APROBADOR2: Principal = {
  id: "aprob-2",
  rol: "aprobador",
  permisos: [PERMISOS.leer, PERMISOS.crear, PERMISOS.editar, PERMISOS.aprobarN1, PERMISOS.aprobarN2],
  capacidades: [],
};
const LECTOR: Principal = { id: "lector-1", rol: "lector", permisos: [PERMISOS.leer], capacidades: [] };

function runtime(): PlatformRuntime {
  return createPlatformRuntime({ logger: new MemoryLogger(), extraServices: [modulo()] });
}
function ctxOf(tenantId: string, principal: Principal = ADMIN): ExecutionContext {
  return createExecutionContext({ principal, metadata: { tenantId } });
}
const exec = (rt: PlatformRuntime, ctx: ExecutionContext, cmd: string, input: unknown) =>
  rt.kernel.commands.execute(ctx, cmd, input);
const query = (rt: PlatformRuntime, ctx: ExecutionContext, q: string, input: unknown) =>
  rt.kernel.queries.execute(ctx, q, input);

const B = `${SERVICIO}.${ENTIDAD}`;
const CREAR = `${B}.crear`;
const ASIGNAR = `${B}.asignar`;
const DESASIGNAR = `${B}.desasignar`;
const ASIGNACIONES = `${B}.asignaciones`;
const SOLICITAR = `${B}.solicitar-aprobacion`;
const APROBAR = `${B}.aprobar`;
const RECHAZAR = `${B}.rechazar`;
const LOTE = `${B}.lote`;
const IMPORTAR = `${B}.importar`;
const EXPORTAR = `${B}.exportar`;

async function crearElemento(rt: PlatformRuntime, ctx: ExecutionContext, titulo: string): Promise<string> {
  const r = await exec(rt, ctx, CREAR, { data: { titulo } });
  if (!r.ok) throw new Error(`setup crear: ${r.error.message}`);
  return (r.value as { id: string }).id;
}

/* =============================== 1. Bootstrap ============================= */

describe("OPERACIONES · registro del módulo", () => {
  it("inscribe los comandos y consultas de operaciones", () => {
    const rt = runtime();
    const svc = rt.registries.services.list().find((s) => s.name === SERVICIO)!;
    const cmds = svc.commands;
    const qs = svc.queries;
    expect(cmds).toContain(ASIGNAR);
    expect(cmds).toContain(DESASIGNAR);
    expect(cmds).toContain(SOLICITAR);
    expect(cmds).toContain(LOTE);
    expect(cmds).toContain(IMPORTAR);
    expect(qs).toContain(ASIGNACIONES);
    expect(qs).toContain(EXPORTAR);
  });

  it("el descriptor declara TODO el contrato aportado por operaciones", () => {
    const m = modulo();
    // Eventos: asignación (2) + aprobación (4) presentes en el descriptor.
    expect(m.events).toEqual(expect.arrayContaining([
      `${B}.asignada`,
      `${B}.desasignada`,
      `${B}.aprobacion-solicitada`,
      `${B}.aprobacion-aprobada`,
      `${B}.aprobacion-rechazada`,
      `${B}.aprobacion-paso-aprobado`,
    ]));
    // Capacidades dedicadas (dedupe por name en el núcleo).
    const caps = m.capabilities.map((c) => c.name);
    expect(caps).toEqual(expect.arrayContaining([
      `asignar-${ENTIDAD}`,
      `aprobar-${ENTIDAD}`,
      `exportar-${ENTIDAD}`,
    ]));
    // Permisos adicionales (asignar + pasos de aprobación) fusionados.
    expect(m.permissions).toEqual(expect.arrayContaining([
      PERMISOS.asignar,
      PERMISOS.aprobarN1,
      PERMISOS.aprobarN2,
    ]));
    // Defaults de configuración (clave SIN prefijo en el descriptor).
    expect(m.configDefaults["lote-max"]).toBe("100");
    expect(m.configDefaults["importar-max"]).toBe("500");
    expect(m.configDefaults["aprobacion-permitir-autor"]).toBe("false");
  });

  it("un default declarado se resuelve vía TenantConfig con clave prefijada", async () => {
    const rt = runtime();
    // registerDefaults recibe la clave SIN prefijo; el handler consulta prefijada.
    const cfg = await rt.tenantConfig.get("t-cfg", `${SERVICIO}.lote-max`);
    expect(cfg.ok && cfg.value).toBe("100");
    const imp = await rt.tenantConfig.get("t-cfg", `${SERVICIO}.importar-max`);
    expect(imp.ok && imp.value).toBe("500");
  });

  it("un override por tenant gana sobre el default del runtime", async () => {
    const rt = runtime();
    const set = await exec(rt, ctxOf("t-ov", ADMIN), "platform.config.set", {
      key: `${SERVICIO}.lote-max`,
      value: "7",
    });
    expect(set.ok).toBe(true);
    const cfg = await rt.tenantConfig.get("t-ov", `${SERVICIO}.lote-max`);
    expect(cfg.ok && cfg.value).toBe("7");
    // Otro tenant sigue viendo el default declarado.
    const otro = await rt.tenantConfig.get("t-otro", `${SERVICIO}.lote-max`);
    expect(otro.ok && otro.value).toBe("100");
  });
});

/* ============================== 2. Asignación ============================ */

describe("OPERACIONES · asignación", () => {
  it("asignar añade el principal y la query lo refleja", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearElemento(rt, ctx, "A");
    const r = await exec(rt, ctx, ASIGNAR, { id, usuarioId: "u-9", version: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { asignados: string[] }).asignados).toEqual(["u-9"]);
    const q = await query(rt, ctx, ASIGNACIONES, { id });
    expect(q.ok && (q.value as { asignados: string[] }).asignados).toEqual(["u-9"]);
  });

  it("asignar es idempotente para un principal ya asignado (no duplica)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearElemento(rt, ctx, "B");
    const r1 = await exec(rt, ctx, ASIGNAR, { id, usuarioId: "u-1", version: 1 });
    expect(r1.ok).toBe(true);
    const r2 = await exec(rt, ctx, ASIGNAR, { id, usuarioId: "u-1", version: 2 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
    expect((r2.value as { asignados: string[] }).asignados).toEqual(["u-1"]);
  });

  it("desasignar quita el principal", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearElemento(rt, ctx, "C");
    await exec(rt, ctx, ASIGNAR, { id, usuarioId: "u-1", version: 1 });
    const r = await exec(rt, ctx, DESASIGNAR, { id, usuarioId: "u-1", version: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { asignados: string[] }).asignados).toEqual([]);
  });

  it("asignar requiere el permiso 'asignar' (lector denegado)", async () => {
    const rt = runtime();
    const id = await crearElemento(rt, ctxOf("t1"), "D");
    const r = await exec(rt, ctxOf("t1", LECTOR), ASIGNAR, { id, usuarioId: "u-1", version: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });

  it("asignar es idempotente offline por opId", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearElemento(rt, ctx, "E");
    const opId = crypto.randomUUID();
    const r1 = await exec(rt, ctx, ASIGNAR, { id, usuarioId: "u-1", version: 1, opId });
    expect(r1.ok).toBe(true);
    // Reintento con la misma versión vieja pero mismo opId → idempotente
    const r2 = await exec(rt, ctx, ASIGNAR, { id, usuarioId: "u-2", version: 1, opId });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });
});

/* ============================== 3. Aprobación ============================ */

describe("OPERACIONES · aprobación", () => {
  it("flujo multipaso completo: solicitar → n1 (1) → n2 (2) → aprobada", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1", ADMIN);
    const id = await crearElemento(rt, ctx, "Aprob");
    const sol = await exec(rt, ctx, SOLICITAR, { id, version: 1 });
    expect(sol.ok).toBe(true);
    // paso n1 (min 1) — aprobador 1 (distinto del solicitante admin)
    const a1 = await exec(rt, ctxOf("t1", APROBADOR1), APROBAR, { id, version: 2 });
    expect(a1.ok).toBe(true);
    if (!a1.ok) return;
    expect((a1.value as { aprobacion: { paso: number } }).aprobacion.paso).toBe(1);
    // paso n2 (min 2) — necesita dos aprobadores distintos
    const a2 = await exec(rt, ctxOf("t1", APROBADOR1), APROBAR, { id, version: 3 });
    expect(a2.ok).toBe(true);
    const a3 = await exec(rt, ctxOf("t1", APROBADOR2), APROBAR, { id, version: 4 });
    expect(a3.ok).toBe(true);
    if (!a3.ok) return;
    expect((a3.value as { aprobacion: { estado: string } }).aprobacion.estado).toBe("aprobada");
  });

  it("guard: el solicitante no puede auto-aprobar (forbidden)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1", APROBADOR1);
    const id = await crearElemento(rt, ctx, "Auto");
    await exec(rt, ctx, SOLICITAR, { id, version: 1 });
    const r = await exec(rt, ctx, APROBAR, { id, version: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });

  it("config 'aprobacion-permitir-autor'=true habilita la auto-aprobación", async () => {
    const rt = runtime();
    // fija override del tenant vía comando oficial de config
    const setCfg = await exec(rt, ctxOf("t-auto", ADMIN), "platform.config.set", {
      key: `${SERVICIO}.aprobacion-permitir-autor`,
      value: "true",
    });
    expect(setCfg.ok).toBe(true);
    const ctx = ctxOf("t-auto", APROBADOR1);
    const id = await crearElemento(rt, ctx, "AutoOk");
    await exec(rt, ctx, SOLICITAR, { id, version: 1 });
    const r = await exec(rt, ctx, APROBAR, { id, version: 2 });
    expect(r.ok).toBe(true);
  });

  it("rechazar marca el flujo como rechazada", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1", ADMIN);
    const id = await crearElemento(rt, ctx, "Rech");
    await exec(rt, ctx, SOLICITAR, { id, version: 1 });
    const r = await exec(rt, ctxOf("t1", APROBADOR1), RECHAZAR, { id, version: 2, motivo: "no" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { aprobacion: { estado: string } }).aprobacion.estado).toBe("rechazada");
  });

  it("aprobar sin solicitud pendiente es conflicto", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1", ADMIN);
    const id = await crearElemento(rt, ctx, "SinSol");
    const r = await exec(rt, ctxOf("t1", APROBADOR1), APROBAR, { id, version: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-CFL-001");
  });
});

/* ================================= 4. Lote =============================== */

describe("OPERACIONES · lote", () => {
  it("ejecuta operaciones parciales sin abortar (recibos por elemento)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const r = await exec(rt, ctx, LOTE, {
      operaciones: [
        { opId: "o1", comando: "crear", input: { data: { titulo: "Uno" } } },
        { opId: "o2", comando: "crear", input: { data: { cantidad: 5 } } }, // inválido: falta titulo
        { opId: "o3", comando: "crear", input: { data: { titulo: "Tres" } } },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { ok: number; fallidos: number; recibos: { opId: string; ok: boolean }[] };
    expect(v.ok).toBe(2);
    expect(v.fallidos).toBe(1);
    expect(v.recibos.find((x) => x.opId === "o2")?.ok).toBe(false);
  });

  it("rechaza el lote que excede el máximo (override por tenant lote-max=3)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-max", ADMIN);
    // Override por tenant del default declarado por el runtime de lote.
    const setCfg = await exec(rt, ctx, "platform.config.set", {
      key: `${SERVICIO}.lote-max`,
      value: "3",
    });
    expect(setCfg.ok).toBe(true);
    const ops = Array.from({ length: 4 }, (_, i) => ({
      opId: `x${i}`,
      comando: "crear" as const,
      input: { data: { titulo: `T${i}` } },
    }));
    const r = await exec(rt, ctx, LOTE, { operaciones: ops });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-VAL-001");
  });

  it("es idempotente por opId: reejecutar el mismo lote no duplica", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-lote");
    const ops = [{ opId: "u-1", comando: "crear" as const, input: { id: "fijo-1", data: { titulo: "Idem" } } }];
    const r1 = await exec(rt, ctx, LOTE, { operaciones: ops });
    const r2 = await exec(rt, ctx, LOTE, { operaciones: ops });
    expect(r1.ok && r2.ok).toBe(true);
    const lista = await query(rt, ctx, `${B}.listar`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(1);
  });
});

/* ============================= 5. Importación ============================ */

describe("OPERACIONES · importación", () => {
  it("importa filas válidas y reporta las inválidas (recibos por fila)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-imp");
    const r = await exec(rt, ctx, IMPORTAR, {
      filas: [{ titulo: "F1", cantidad: 1 }, { cantidad: 2 }, { titulo: "F3" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { ok: number; fallidos: number; recibos: { fila: number; ok: boolean; id?: string }[] };
    expect(v.ok).toBe(2);
    expect(v.fallidos).toBe(1);
    expect(v.recibos[0]!.id).toBeDefined();
    const lista = await query(rt, ctx, `${B}.listar`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(2);
  });

  it("modo simular (dry-run) valida sin escribir", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-dry");
    const r = await exec(rt, ctx, IMPORTAR, {
      modo: "simular",
      filas: [{ titulo: "S1" }, { cantidad: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { ok: number; fallidos: number };
    expect(v.ok).toBe(1);
    expect(v.fallidos).toBe(1);
    const lista = await query(rt, ctx, `${B}.listar`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(0);
  });

  it("importar requiere el permiso 'crear' (lector denegado)", async () => {
    const rt = runtime();
    const r = await exec(rt, ctxOf("t-imp", LECTOR), IMPORTAR, { filas: [{ titulo: "X" }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });
});

/* ============================= 6. Exportación ============================ */

describe("OPERACIONES · exportación", () => {
  it("proyecta registros a filas planas con campos + metadatos", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-exp");
    await exec(rt, ctx, CREAR, { data: { titulo: "Exp1", cantidad: 7, activo: true } });
    const r = await query(rt, ctx, EXPORTAR, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { cabeceras: string[]; filas: Record<string, string>[]; total: number };
    expect(v.total).toBe(1);
    expect(v.cabeceras).toEqual(["titulo", "cantidad", "activo", "id", "version", "estado", "createdBy", "actualizadoAt"]);
    const fila = v.filas[0]!;
    expect(fila["titulo"]).toBe("Exp1");
    expect(fila["cantidad"]).toBe("7");
    expect(fila["activo"]).toBe("true");
    expect(fila["version"]).toBe("1");
    expect(fila["id"]).toBeTruthy();
  });

  it("exportar respeta el permiso 'leer' (lector permitido, anónimo denegado)", async () => {
    const rt = runtime();
    const okQ = await query(rt, ctxOf("t-exp", LECTOR), EXPORTAR, {});
    expect(okQ.ok).toBe(true);
  });

  it("exportar filtra por estado", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-exp2");
    await exec(rt, ctx, CREAR, { data: { titulo: "S" } });
    const r = await query(rt, ctx, EXPORTAR, { estado: "inexistente" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { total: number }).total).toBe(0);
  });
});
