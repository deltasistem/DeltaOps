/**
 * DGP-008.3 · Enterprise Asset Experience (backend) — Pruebas con adaptadores
 * Fake (offline). Cubre: indexación automática en platform.search y búsqueda
 * rápida/contextual con filtros; etiquetas QR (emitir idempotente, resolver,
 * revocada→404); código en el detalle; filtros avanzados de listado (categoría/
 * familia/responsable/texto) + paginación; y URL firmada de documentación
 * (válida, cruce de tenant → 404, adjunto ajeno → 404).
 */
import { describe, expect, it } from "vitest";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { activosModule, crearActivosRuntime, MODULO, type ActivosRuntime } from "..";

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...activosModule({
      repository: null as never,
      readModel: null as never,
      relaciones: null as never,
      relacionesRead: null as never,
      historial: null as never,
      syncReceipts: null as never,
      consola: null as never,
      eventLog: null as never,
    }).permissions,
  ]),
];
const ADMIN: Principal = { id: "admin-83", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };

function runtime(): ActivosRuntime {
  return crearActivosRuntime({ logger: new MemoryLogger() });
}
function ctxOf(tenantId: string): ExecutionContext {
  return createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
}
async function drain(rt: ActivosRuntime): Promise<void> {
  await rt.platform.kernel.outboxProcessor.processPending();
}
const exec = (rt: ActivosRuntime, ctx: ExecutionContext, cmd: string, input: unknown) =>
  rt.platform.kernel.commands.execute(ctx, cmd, input);
const query = (rt: ActivosRuntime, ctx: ExecutionContext, q: string, input: unknown) =>
  rt.platform.kernel.queries.execute(ctx, q, input);

async function sembrarCatalogos(rt: ActivosRuntime, ctx: ExecutionContext): Promise<void> {
  const c = [
    ["tipos", "movil", "Equipo móvil"],
    ["tipos", "fijo", "Equipo fijo"],
    ["categorias", "maquinaria", "Maquinaria"],
    ["categorias", "electrico", "Eléctrico"],
    ["familias", "excavadoras", "Excavadoras"],
    ["familias", "generadores", "Generadores"],
    ["criticidades", "alta", "Alta"],
    ["criticidades", "baja", "Baja"],
    ["ubicaciones", "planta-1", "Planta 1"],
    ["fabricantes", "cat", "Caterpillar"],
    ["modelos", "320", "320"],
    ["monedas", "USD", "Dólar"],
    ["unidades", "h", "Horas"],
  ] as const;
  for (const [catalogo, clave, etiqueta] of c) {
    await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo, clave, etiqueta });
  }
}

interface CrearOpts {
  tipo?: string;
  categoria?: string;
  familia?: string;
  criticidad?: string;
  responsable?: string;
  fabricante?: string;
  modelo?: string;
  serie?: string;
  descripcion?: string;
}
async function crear(
  rt: ActivosRuntime,
  ctx: ExecutionContext,
  id: string,
  codigo: string,
  nombre: string,
  o: CrearOpts = {},
): Promise<void> {
  const r = await exec(rt, ctx, `${MODULO}.crear`, {
    id,
    codigoEmpresarial: codigo,
    nombre,
    tipo: o.tipo ?? "movil",
    categoria: o.categoria ?? "maquinaria",
    familia: o.familia ?? "excavadoras",
    criticidad: o.criticidad ?? "alta",
    responsable: o.responsable,
    fabricante: o.fabricante,
    modelo: o.modelo,
    serie: o.serie,
    descripcion: o.descripcion,
  });
  expect(r.ok, r.ok ? "" : JSON.stringify((r as { error: unknown }).error)).toBe(true);
  await drain(rt);
}

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

/* ------------------------------- Búsqueda -------------------------------- */

describe("DGP-008.3 · búsqueda (platform.search)", () => {
  it("indexa activos y los encuentra por nombre/código/atributo (payload-only)", async () => {
    const rt = runtime();
    const ctx = ctxOf("s-1");
    await sembrarCatalogos(rt, ctx);
    await crear(rt, ctx, ID_A, "EXC-320", "Excavadora Caterpillar", { fabricante: "cat", modelo: "320" });
    await crear(rt, ctx, ID_B, "GEN-01", "Generador diesel", {
      tipo: "fijo", categoria: "electrico", familia: "generadores", criticidad: "baja",
    });

    const porNombre = await query(rt, ctx, `${MODULO}.busqueda`, { q: "excavadora" });
    expect(porNombre.ok).toBe(true);
    if (!porNombre.ok) return;
    const ids = (porNombre.value as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(ID_A);
    expect(ids).not.toContain(ID_B);

    // El fabricante viaja al índice (payload-only): "caterpillar" es buscable.
    const porFabricante = await query(rt, ctx, `${MODULO}.busqueda`, { q: "caterpillar" });
    expect(porFabricante.ok && (porFabricante.value as unknown[]).length).toBe(1);
  });

  it("filtra los resultados por atributos estructurados (estado/tipo/familia)", async () => {
    const rt = runtime();
    const ctx = ctxOf("s-2");
    await sembrarCatalogos(rt, ctx);
    await crear(rt, ctx, ID_A, "EXC-1", "Equipo alfa", { familia: "excavadoras" });
    await crear(rt, ctx, ID_B, "GEN-1", "Equipo alfa", {
      tipo: "fijo", categoria: "electrico", familia: "generadores",
    });

    const soloGen = await query(rt, ctx, `${MODULO}.busqueda`, { q: "equipo", familia: "generadores" });
    expect(soloGen.ok).toBe(true);
    if (!soloGen.ok) return;
    expect((soloGen.value as Array<{ id: string }>).map((r) => r.id)).toEqual([ID_B]);
  });

  it("reproyectar mantiene el índice consistente (docs siguen resolviéndose)", async () => {
    const rt = runtime();
    const ctx = ctxOf("s-3");
    await sembrarCatalogos(rt, ctx);
    await crear(rt, ctx, ID_A, "EXC-9", "Excavadora nueve");
    const rep = await exec(rt, ctx, `${MODULO}.reproyectar`, {});
    expect(rep.ok).toBe(true);
    await drain(rt);
    const r = await query(rt, ctx, `${MODULO}.busqueda`, { q: "excavadora" });
    expect(r.ok && (r.value as Array<{ id: string }>).map((x) => x.id)).toContain(ID_A);
  });
});

/* ------------------------- Identificación (QR) --------------------------- */

describe("DGP-008.3 · etiquetas QR/barcode/NFC (platform.qr)", () => {
  it("emite una etiqueta idempotente por activo+tipo y la incluye en el detalle", async () => {
    const rt = runtime();
    const ctx = ctxOf("q-1");
    await sembrarCatalogos(rt, ctx);
    await crear(rt, ctx, ID_A, "QR-A", "Activo con QR");

    const e1 = await exec(rt, ctx, `${MODULO}.qr-emitir`, { id: ID_A });
    expect(e1.ok).toBe(true);
    if (!e1.ok) return;
    const codigo = (e1.value as { codigo: string; reutilizada: boolean }).codigo;
    expect((e1.value as { reutilizada: boolean }).reutilizada).toBe(false);
    await drain(rt);

    // Segunda emisión ⇒ reutiliza (no reemite).
    const e2 = await exec(rt, ctx, `${MODULO}.qr-emitir`, { id: ID_A });
    expect(e2.ok).toBe(true);
    if (!e2.ok) return;
    expect((e2.value as { codigo: string; reutilizada: boolean }).codigo).toBe(codigo);
    expect((e2.value as { reutilizada: boolean }).reutilizada).toBe(true);

    // El detalle incluye la etiqueta vigente.
    const det = await query(rt, ctx, `${MODULO}.detalle`, { id: ID_A });
    expect(det.ok).toBe(true);
    if (!det.ok) return;
    expect((det.value as { etiqueta: { codigo: string } | null }).etiqueta?.codigo).toBe(codigo);
  });

  it("resuelve el código → activoId y falla 404 si la etiqueta está revocada", async () => {
    const rt = runtime();
    const ctx = ctxOf("q-2");
    await sembrarCatalogos(rt, ctx);
    await crear(rt, ctx, ID_A, "QR-B", "Activo QR B");
    const e = await exec(rt, ctx, `${MODULO}.qr-emitir`, { id: ID_A });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const { id: tagId, codigo } = e.value as { id: string; codigo: string };
    await drain(rt);

    const resuelto = await query(rt, ctx, `${MODULO}.qr-resolver`, { codigo });
    expect(resuelto.ok).toBe(true);
    if (!resuelto.ok) return;
    expect((resuelto.value as { activoId: string }).activoId).toBe(ID_A);

    // Revocar la etiqueta y volver a resolver ⇒ conflicto/no-encontrado.
    const rev = await exec(rt, ctx, "platform.qr.revoke", { id: tagId });
    expect(rev.ok).toBe(true);
    await drain(rt);
    const tras = await query(rt, ctx, `${MODULO}.qr-resolver`, { codigo });
    expect(tras.ok).toBe(false);
    if (tras.ok) return;
    expect(["KRN-NF", "KRN-CFL"].some((p) => tras.error.code.startsWith(p))).toBe(true);
  });

  it("resolver un código inexistente falla (not found)", async () => {
    const rt = runtime();
    const ctx = ctxOf("q-3");
    const r = await query(rt, ctx, `${MODULO}.qr-resolver`, { codigo: "NO-EXISTE-123" });
    expect(r.ok).toBe(false);
  });
});

/* --------------------------- Filtros de listado -------------------------- */

describe("DGP-008.3 · listado con filtros avanzados y paginación", () => {
  it("filtra por categoría/familia/responsable y texto; pagina por limit/offset", async () => {
    const rt = runtime();
    const ctx = ctxOf("l-1");
    await sembrarCatalogos(rt, ctx);
    await crear(rt, ctx, ID_A, "AAA-1", "Excavadora Ana", { responsable: "ana", familia: "excavadoras" });
    await crear(rt, ctx, ID_B, "BBB-1", "Generador Beto", {
      responsable: "beto", tipo: "fijo", categoria: "electrico", familia: "generadores",
    });

    const porFamilia = await query(rt, ctx, `${MODULO}.listar`, { familia: "generadores" });
    expect(porFamilia.ok && (porFamilia.value as Array<{ id: string }>).map((r) => r.id)).toEqual([ID_B]);

    const porResponsable = await query(rt, ctx, `${MODULO}.listar`, { responsable: "ana" });
    expect(porResponsable.ok && (porResponsable.value as Array<{ id: string }>).map((r) => r.id)).toEqual([ID_A]);

    const porTexto = await query(rt, ctx, `${MODULO}.listar`, { q: "beto" });
    expect(porTexto.ok && (porTexto.value as Array<{ id: string }>).map((r) => r.id)).toEqual([ID_B]);

    const pag1 = await query(rt, ctx, `${MODULO}.listar`, { limit: 1, offset: 0 });
    const pag2 = await query(rt, ctx, `${MODULO}.listar`, { limit: 1, offset: 1 });
    expect(pag1.ok && (pag1.value as unknown[]).length).toBe(1);
    expect(pag2.ok && (pag2.value as unknown[]).length).toBe(1);
  });
});

/* ----------------------- Documentación: URL firmada ---------------------- */

describe("DGP-008.3 · URL firmada de documentación (platform.attachment)", () => {
  const HASH = "a".repeat(64);

  it("devuelve URL firmada de un adjunto del activo (referencia-only)", async () => {
    const rt = runtime();
    const ctx = ctxOf("d-1");
    await sembrarCatalogos(rt, ctx);
    await crear(rt, ctx, ID_A, "DOC-A", "Activo doc");
    const adj = await exec(rt, ctx, `${MODULO}.adjuntar`, {
      id: ID_A, categoria: "manual", nombreArchivo: "manual.pdf",
      mimeType: "application/pdf", tamanoBytes: 10, hashSha256: HASH,
    });
    expect(adj.ok).toBe(true);
    if (!adj.ok) return;
    await drain(rt);
    const attachmentId = (adj.value as { id: string }).id;

    const url = await query(rt, ctx, `${MODULO}.documentacion-url`, { id: ID_A, attachmentId });
    expect(url.ok).toBe(true);
    if (!url.ok) return;
    const v = url.value as { url: string; expiresAt: number; almacenamiento: string };
    expect(v.url).toContain(`attachments/${attachmentId}`);
    expect(v.url).toContain("signature=");
    expect(v.expiresAt).toBeGreaterThan(0);
    expect(v.almacenamiento).toBe("referencia");
  });

  it("rechaza un adjunto que no pertenece al activo (404)", async () => {
    const rt = runtime();
    const ctx = ctxOf("d-2");
    await sembrarCatalogos(rt, ctx);
    await crear(rt, ctx, ID_A, "DOC-X", "Activo X");
    await crear(rt, ctx, ID_B, "DOC-Y", "Activo Y");
    const adj = await exec(rt, ctx, `${MODULO}.adjuntar`, {
      id: ID_B, categoria: "manual", nombreArchivo: "y.pdf",
      mimeType: "application/pdf", tamanoBytes: 5, hashSha256: HASH,
    });
    expect(adj.ok).toBe(true);
    if (!adj.ok) return;
    await drain(rt);
    const attachmentId = (adj.value as { id: string }).id;

    // El adjunto es de ID_B; pedirlo bajo ID_A ⇒ 404.
    const cruce = await query(rt, ctx, `${MODULO}.documentacion-url`, { id: ID_A, attachmentId });
    expect(cruce.ok).toBe(false);
    if (cruce.ok) return;
    expect(cruce.error.code.startsWith("KRN-NF")).toBe(true);
  });

  it("aísla por tenant: un adjunto de otro tenant no se resuelve (404)", async () => {
    const rt = runtime();
    const ctxA = ctxOf("d-3a");
    const ctxB = ctxOf("d-3b");
    await sembrarCatalogos(rt, ctxA);
    await sembrarCatalogos(rt, ctxB);
    await crear(rt, ctxA, ID_A, "T-A", "Activo tenant A");
    await crear(rt, ctxB, ID_A, "T-B", "Activo tenant B");
    const adjA = await exec(rt, ctxA, `${MODULO}.adjuntar`, {
      id: ID_A, categoria: "manual", nombreArchivo: "a.pdf",
      mimeType: "application/pdf", tamanoBytes: 5, hashSha256: HASH,
    });
    expect(adjA.ok).toBe(true);
    if (!adjA.ok) return;
    await drain(rt);
    const attachmentId = (adjA.value as { id: string }).id;

    // Tenant B intenta resolver el adjunto de A ⇒ 404 (no visible).
    const cruce = await query(rt, ctxB, `${MODULO}.documentacion-url`, { id: ID_A, attachmentId });
    expect(cruce.ok).toBe(false);
  });
});
