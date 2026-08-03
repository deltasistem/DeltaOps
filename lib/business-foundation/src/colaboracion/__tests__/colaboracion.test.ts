/**
 * DGP-006 · Business Foundation Framework — Pruebas familia Colaboración.
 *
 * Cubre comentarios, adjuntos, historial/auditoría, cronología (timeline),
 * KPIs (contador y porEstado) y panel, sobre un runtime de plataforma FAKE
 * (createPlatformRuntime sin pool). Módulo de prueba "demo": 100% neutro.
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
import {
  crearColaboracion,
  referenciaEntidad,
  type DefinicionKpi,
  type DefinicionPanel,
} from "../index";

/* --------------------------- Definición demo ----------------------------- */

const SERVICIO = "modulo.colab";
const ENTIDAD = "ficha";

const PERMISOS = {
  leer: `${SERVICIO}.read`,
  crear: `${SERVICIO}.write`,
  editar: `${SERVICIO}.write`,
  eliminar: `${SERVICIO}.write`,
  admin: `${SERVICIO}.admin`,
};

const definicionFicha: DefinicionEntidad = {
  nombre: ENTIDAD,
  etiqueta: "Ficha",
  servicio: SERVICIO,
  campos: [
    { nombre: "titulo", tipo: "texto", requerido: true, longitudMax: 120 },
    { nombre: "categoria", tipo: "enum", enumValores: ["a", "b", "c"] },
  ],
  maquinaEstados: {
    estados: [
      { nombre: "borrador", inicial: true },
      { nombre: "publicado" },
      { nombre: "archivado", final: true },
    ],
    transiciones: [
      { de: "borrador", a: "publicado", comando: "publicar" },
      { de: "publicado", a: "archivado", comando: "archivar" },
    ],
  },
  permisos: PERMISOS,
  capacidades: [],
};

const KPIS: DefinicionKpi[] = [
  { nombre: "total", descripcion: "Total de fichas", tipo: "contador" },
  { nombre: "por-estado", descripcion: "Fichas por estado", tipo: "porEstado" },
];

const PANEL: DefinicionPanel = {
  titulo: "Panel de fichas",
  widgets: [
    { tipo: "kpi", titulo: "Total", kpi: "total" },
    { tipo: "estado", titulo: "Por estado", kpi: "por-estado" },
    { tipo: "lista", titulo: "Recientes", limite: 3 },
  ],
};

// ExtrasModulo COMPLETO (comandos, queries, handlers, capacidades, permisos,
// dependencias de plataforma y configuracionDefaults) — el descriptor final
// del módulo declara TODO el contrato de colaboración.
const extras = crearColaboracion(definicionFicha, { kpis: KPIS, panel: PANEL });

const definicionModulo: DefinicionModulo = {
  servicio: SERVICIO,
  etiqueta: "Módulo Colaboración Demo",
  entidades: [definicionFicha],
  capacidades: [],
  permisos: [PERMISOS.leer, PERMISOS.crear, PERMISOS.admin],
  // Solo la dependencia base; comment/attachment/timeline las aporta `extras`.
  dependeDe: ["platform.config"],
};

const modulo = () => crearModuloGenerico(definicionModulo, extras);

/* ----------------------------- Infra de test ----------------------------- */

const ALL_PERMISSIONS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...modulo().permissions]),
];
const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };
const LECTOR: Principal = { id: "u-2", rol: "lector", permisos: [PERMISOS.leer], capacidades: [] };

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
const drain = (rt: PlatformRuntime) => rt.kernel.outboxProcessor.processPending();

const CREAR = `${SERVICIO}.${ENTIDAD}.crear`;
const TRANSICIONAR = `${SERVICIO}.${ENTIDAD}.transicionar`;
const ELIMINAR = `${SERVICIO}.${ENTIDAD}.eliminar`;
const COMENTAR = `${SERVICIO}.${ENTIDAD}.comentar`;
const COMENTARIOS = `${SERVICIO}.${ENTIDAD}.comentarios`;
const ADJUNTAR = `${SERVICIO}.${ENTIDAD}.adjuntar`;
const ADJUNTOS = `${SERVICIO}.${ENTIDAD}.adjuntos`;
const HISTORIAL = `${SERVICIO}.${ENTIDAD}.historial`;
const AUDITORIA = `${SERVICIO}.${ENTIDAD}.auditoria`;
const CRONOLOGIA = `${SERVICIO}.${ENTIDAD}.cronologia`;
const KPIS_Q = `${SERVICIO}.${ENTIDAD}.kpis`;
const PANEL_Q = `${SERVICIO}.${ENTIDAD}.panel`;

const HASH = "a".repeat(64);

async function crearFicha(rt: PlatformRuntime, ctx: ExecutionContext, titulo: string): Promise<string> {
  const r = await exec(rt, ctx, CREAR, { data: { titulo } });
  if (!r.ok) throw new Error("setup crear");
  return (r.value as { id: string }).id;
}

/* ============================ 1. Referencia ============================== */

describe("referenciaEntidad", () => {
  it("produce la referencia estable <servicio>:<entidad>:<id>", () => {
    expect(referenciaEntidad(definicionFicha, "x1")).toBe(`${SERVICIO}:${ENTIDAD}:x1`);
  });
});

/* ============================ 2. Comentarios ============================== */

describe("Comentarios (fachada sobre platform.comment)", () => {
  it("comenta y lista por la referencia estable", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearFicha(rt, ctx, "Con comentario");
    const c = await exec(rt, ctx, COMENTAR, { id, texto: "Hola @juan" });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect((c.value as { entityRef: string }).entityRef).toBe(referenciaEntidad(definicionFicha, id));
    const lista = await query(rt, ctx, COMENTARIOS, { id });
    expect(lista.ok && (lista.value as unknown[]).length).toBe(1);
  });

  it("un lector no puede comentar (requiere permiso de edición)", async () => {
    const rt = runtime();
    const id = await crearFicha(rt, ctxOf("t1"), "X");
    const c = await exec(rt, ctxOf("t1", LECTOR), COMENTAR, { id, texto: "no" });
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.error.code).toBe("KRN-AUTH-002");
  });

  it("los comentarios no cruzan tenants", async () => {
    const rt = runtime();
    const id = await crearFicha(rt, ctxOf("t-a"), "A");
    await exec(rt, ctxOf("t-a"), COMENTAR, { id, texto: "hola" });
    const lista = await query(rt, ctxOf("t-b"), COMENTARIOS, { id });
    expect(lista.ok && (lista.value as unknown[]).length).toBe(0);
  });
});

/* ============================ 3. Adjuntos ================================= */

describe("Adjuntos (fachada sobre platform.attachment)", () => {
  it("registra un adjunto válido y lo lista", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearFicha(rt, ctx, "Con adjunto");
    const a = await exec(rt, ctx, ADJUNTAR, {
      id,
      nombreArchivo: "f.pdf",
      mimeType: "application/pdf",
      tamanoBytes: 1024,
      hashSha256: HASH,
    });
    expect(a.ok).toBe(true);
    const lista = await query(rt, ctx, ADJUNTOS, { id });
    expect(lista.ok && (lista.value as unknown[]).length).toBe(1);
  });

  it("rechaza un adjunto que excede el tamaño máximo (config por tenant)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearFicha(rt, ctx, "Grande");
    const a = await exec(rt, ctx, ADJUNTAR, {
      id,
      nombreArchivo: "big.bin",
      mimeType: "application/octet-stream",
      tamanoBytes: 10485761,
      hashSha256: HASH,
    });
    expect(a.ok).toBe(false);
    if (a.ok) return;
    expect(a.error.code).toBe("KRN-VAL-001");
  });

  it("aplica el default de configuración adjunto-max-bytes", async () => {
    const rt = runtime();
    const cfg = await rt.tenantConfig.get("t1", `${SERVICIO}.adjunto-max-bytes`);
    expect(cfg.ok && cfg.value).toBe("10485760");
  });
});

/* ======================= 4. Historial / Auditoría ======================== */

describe("Historial y auditoría (AuditTrailPort)", () => {
  it("reconstruye el historial del registro desde la auditoría", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearFicha(rt, ctx, "Historiable");
    await exec(rt, ctx, TRANSICIONAR, { id, version: 1, comando: "publicar" });
    const h = await query(rt, ctx, HISTORIAL, { id });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const acciones = (h.value as { entradas: { accion: string }[] }).entradas.map((e) => e.accion);
    expect(acciones).toContain("crear");
    expect(acciones.some((a) => a.startsWith("transicionar"))).toBe(true);
  });

  it("la auditoría cruda pagina las entradas del servicio", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    await crearFicha(rt, ctx, "Uno");
    await crearFicha(rt, ctx, "Dos");
    const a = await query(rt, ctx, AUDITORIA, { limit: 1, offset: 0 });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect((a.value as { total: number; entradas: unknown[] }).total).toBeGreaterThanOrEqual(2);
    expect((a.value as { entradas: unknown[] }).entradas).toHaveLength(1);
  });
});

/* ============================ 5. Cronología =============================== */

describe("Cronología (proyección a platform.timeline)", () => {
  it("proyecta eventos del núcleo a la línea temporal y los consulta", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearFicha(rt, ctx, "Cronología");
    await exec(rt, ctx, TRANSICIONAR, { id, version: 1, comando: "publicar" });
    await drain(rt);
    const c = await query(rt, ctx, CRONOLOGIA, { id });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const tipos = (c.value as { data: Record<string, unknown> }[]).map((e) => e.data["eventType"]);
    expect(tipos).toContain(`${SERVICIO}.${ENTIDAD}.creada`);
    expect(tipos).toContain(`${SERVICIO}.${ENTIDAD}.transicionada`);
  });

  it("la proyección es idempotente (drain repetido no duplica entradas)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearFicha(rt, ctx, "Idempotente");
    await drain(rt);
    await drain(rt);
    const c = await query(rt, ctx, CRONOLOGIA, { id });
    expect(c.ok && (c.value as unknown[]).length).toBe(1);
  });
});

/* ============================ 6. KPIs ==================================== */

describe("Indicadores (KPI contador y porEstado)", () => {
  it("el contador crece con cada creación y cae al eliminar", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    await crearFicha(rt, ctx, "K1");
    const id2 = await crearFicha(rt, ctx, "K2");
    await drain(rt);
    let k = await query(rt, ctx, KPIS_Q, {});
    if (!k.ok) throw new Error("kpis");
    const total1 = (k.value as { kpis: { nombre: string; valor: number }[] }).kpis.find((x) => x.nombre === "total")!.valor;
    expect(total1).toBe(2);
    await exec(rt, ctx, ELIMINAR, { id: id2 });
    await drain(rt);
    k = await query(rt, ctx, KPIS_Q, {});
    if (!k.ok) throw new Error("kpis2");
    const total2 = (k.value as { kpis: { nombre: string; valor: number }[] }).kpis.find((x) => x.nombre === "total")!.valor;
    expect(total2).toBe(1);
  });

  it("porEstado refleja las transiciones de estado", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearFicha(rt, ctx, "Estado");
    await drain(rt);
    await exec(rt, ctx, TRANSICIONAR, { id, version: 1, comando: "publicar" });
    await drain(rt);
    const k = await query(rt, ctx, KPIS_Q, {});
    expect(k.ok).toBe(true);
    if (!k.ok) return;
    const porEstado = (k.value as { kpis: { nombre: string; porEstado: Record<string, number> }[] }).kpis.find(
      (x) => x.nombre === "por-estado",
    )!.porEstado;
    expect(porEstado["publicado"]).toBe(1);
    expect(porEstado["borrador"] ?? 0).toBe(0);
  });

  it("los KPIs son idempotentes ante reentrega (drain repetido)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    await crearFicha(rt, ctx, "Idem");
    await drain(rt);
    await drain(rt);
    const k = await query(rt, ctx, KPIS_Q, {});
    if (!k.ok) throw new Error("kpis");
    const total = (k.value as { kpis: { nombre: string; valor: number }[] }).kpis.find((x) => x.nombre === "total")!.valor;
    expect(total).toBe(1);
  });
});

/* ============================ 7. Panel =================================== */

describe("Panel (dashboard genérico)", () => {
  it("resuelve los widgets a datos en una sola respuesta", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const id = await crearFicha(rt, ctx, "Panel A");
    await drain(rt);
    await exec(rt, ctx, TRANSICIONAR, { id, version: 1, comando: "publicar" });
    await drain(rt);
    const p = await query(rt, ctx, PANEL_Q, {});
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const val = p.value as { titulo: string; widgets: Record<string, unknown>[] };
    expect(val.titulo).toBe("Panel de fichas");
    expect(val.widgets).toHaveLength(3);
    const kpiWidget = val.widgets.find((w) => w["tipo"] === "kpi")!;
    expect(kpiWidget["valor"]).toBe(1);
    const listaWidget = val.widgets.find((w) => w["tipo"] === "lista")!;
    expect((listaWidget["items"] as unknown[]).length).toBe(1);
  });

  it("el panel se puede sobrescribir por tenant vía platform.config.set", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const nuevoPanel = JSON.stringify({ titulo: "Custom", widgets: [] });
    const setRes = await exec(rt, ctx, "platform.config.set", {
      key: `${SERVICIO}.panel-${ENTIDAD}`,
      value: nuevoPanel,
    });
    expect(setRes.ok).toBe(true);
    const p = await query(rt, ctx, PANEL_Q, {});
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect((p.value as { titulo: string }).titulo).toBe("Custom");
  });
});

/* =================== 8. Contrato completo del descriptor ================== */

describe("crearColaboracion aporta el contrato completo al ExtrasModulo", () => {
  it("el descriptor declara capacidades, permisos y dependencias de colaboración", () => {
    const svc = modulo();
    const caps = svc.capabilities.map((c) => c.name);
    expect(caps).toContain(`comentar-${ENTIDAD}`);
    expect(caps).toContain(`adjuntar-${ENTIDAD}`);
    expect(caps).toContain(`auditar-${ENTIDAD}`);
    expect(caps).toContain(`indicadores-${ENTIDAD}`);
    expect(caps).toContain(`panel-${ENTIDAD}`);
    // Dependencias de plataforma fusionadas (dedupe con platform.config).
    expect(svc.dependsOn).toContain("platform.comment");
    expect(svc.dependsOn).toContain("platform.attachment");
    expect(svc.dependsOn).toContain("platform.timeline");
    expect(svc.dependsOn).toContain("platform.config");
    // Permisos usados por los runtimes quedan en el contrato.
    expect(svc.permissions).toContain(PERMISOS.leer);
    expect(svc.permissions).toContain(PERMISOS.editar);
    // configDefaults con clave SIN prefijo de servicio.
    expect(svc.configDefaults["adjunto-max-bytes"]).toBe("10485760");
    expect(svc.configDefaults[`panel-${ENTIDAD}`]).toBeDefined();
  });

  it("se registra en el runtime con esas capacidades", () => {
    const rt = runtime();
    const caps = rt.registries.capabilities.list().map((c) => c.name);
    expect(caps).toContain(`comentar-${ENTIDAD}`);
    expect(caps).toContain(`indicadores-${ENTIDAD}`);
  });
});

/* ================= 9. Convenio de configuración por tenant ================ */

describe("Convenio de configuración (registerDefaults SIN prefijo → get prefijado)", () => {
  it("un default declarado se resuelve efectivamente vía TenantConfig", async () => {
    const rt = runtime();
    // La familia declara la clave SIN prefijo; registerDefaults la prefija y el
    // handler la consulta como '<servicio>.<clave>'.
    const cfg = await rt.tenantConfig.get("t1", `${SERVICIO}.adjunto-max-bytes`);
    expect(cfg.ok && cfg.value).toBe("10485760");
  });

  it("un override por tenant gana sobre el default (adjunto-max-bytes)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    // Baja el máximo a 100 bytes para este tenant.
    const setRes = await exec(rt, ctx, "platform.config.set", {
      key: `${SERVICIO}.adjunto-max-bytes`,
      value: "100",
    });
    expect(setRes.ok).toBe(true);
    const resuelto = await rt.tenantConfig.get("t1", `${SERVICIO}.adjunto-max-bytes`);
    expect(resuelto.ok && resuelto.value).toBe("100");

    // El override se aplica realmente en el comando de adjuntar.
    const id = await crearFicha(rt, ctx, "Config");
    const a = await exec(rt, ctx, ADJUNTAR, {
      id,
      nombreArchivo: "f.bin",
      mimeType: "application/octet-stream",
      tamanoBytes: 500, // > 100 (override) pero << default (10 MiB)
      hashSha256: HASH,
    });
    expect(a.ok).toBe(false);
    if (a.ok) return;
    expect(a.error.code).toBe("KRN-VAL-001");

    // Otro tenant SIN override sigue con el default (acepta 500 bytes).
    const ctxB = ctxOf("t-b");
    const idB = await crearFicha(rt, ctxB, "Config B");
    const b = await exec(rt, ctxB, ADJUNTAR, {
      id: idB,
      nombreArchivo: "f.bin",
      mimeType: "application/octet-stream",
      tamanoBytes: 500,
      hashSha256: HASH,
    });
    expect(b.ok).toBe(true);
  });
});
