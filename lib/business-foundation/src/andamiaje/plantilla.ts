/**
 * DGP-006 · Business Foundation Framework — Generic Module Scaffolding Runtime.
 *
 * Generador PROGRAMÁTICO (no CLI todavía) de módulos nuevos. Dado el mínimo
 * declarativo { slug, etiqueta, entidades } produce el CONTENIDO TEXTUAL de los
 * artefactos de un módulo del framework:
 *
 *   1. module.ts   — descriptor que invoca `crearModuloGenerico`.
 *   2. runtime.ts  — composición `crear<Slug>Runtime` con adaptadores fake/pg
 *                    (patrón createXRuntime del module-reference).
 *   3. rutas HTTP  — router Express fino (montaje, statusOf, drain outbox,
 *                    endpoint /sync con recibos idempotentes) — patrón
 *                    reference-module.ts.
 *   4. test base   — prueba end-to-end sobre runtime FAKE (crear→drain→listar).
 *
 * NO escribe a disco: devuelve `{ ruta, contenido }[]` para que una herramienta
 * futura (CLI) lo materialice. Función pura y 100% testeable. La definición se
 * valida con `validarDefinicionModulo` antes de generar (regla DGP-006).
 */
import type {
  DefinicionEntidad,
  DefinicionModulo,
} from "../nucleo/definicion";
import { asegurarDefinicionValida } from "./validacion";

/** Entrada mínima del generador programático. */
export interface EntradaScaffolding {
  /** Slug del servicio, p. ej. `modulo.demo` (kebab por segmentos). */
  readonly slug: string;
  /** Etiqueta legible del módulo. */
  readonly etiqueta: string;
  /** Entidades del módulo (definiciones del núcleo). */
  readonly entidades: readonly DefinicionEntidad[];
  /** Descripción opcional. */
  readonly descripcion?: string;
}

/** Artefacto textual generado: ruta relativa sugerida + contenido. */
export interface ArtefactoGenerado {
  readonly ruta: string;
  readonly contenido: string;
}

/* ----------------------------- Helpers de nombres ------------------------- */

/** camelCase → PascalCase. */
function pascal(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Convierte un identificador kebab/punto en PascalCase (para nombres de tipo). */
function aPascalDesdeSlug(slug: string): string {
  return slug
    .split(/[.\-]+/)
    .filter((s) => s.length > 0)
    .map((seg) => pascal(seg))
    .join("");
}

/** Último segmento del slug (tras el punto), usado como sufijo corto. */
function segmentoCorto(slug: string): string {
  const partes = slug.split(".");
  return partes[partes.length - 1] ?? slug;
}

/* -------------------------- Construcción de DefinicionModulo -------------- */

/** Reúne capacidades y permisos de las entidades en una DefinicionModulo. */
export function definicionDesdeEntrada(entrada: EntradaScaffolding): DefinicionModulo {
  const capacidades = entrada.entidades.flatMap((e) => e.capacidades);
  const permisos = [
    ...new Set(
      entrada.entidades.flatMap((e) => [
        e.permisos.leer,
        e.permisos.crear,
        e.permisos.editar,
        e.permisos.eliminar,
        e.permisos.admin,
      ]),
    ),
  ];
  return {
    servicio: entrada.slug,
    etiqueta: entrada.etiqueta,
    entidades: entrada.entidades,
    capacidades,
    permisos,
    descripcion: entrada.descripcion,
  };
}

/* ------------------------------ Plantillas -------------------------------- */

function encabezado(titulo: string): string {
  return `/**\n * DGP-006 · ${titulo}\n * ARCHIVO GENERADO por el andamiaje de Business Foundation.\n * Neutro (cero nombres de negocio). Reglas y patrón: DGP-006.\n */`;
}

function contenidoModuloTs(def: DefinicionModulo): string {
  const entidadesLiteral = JSON.stringify(
    def.entidades.map((e) => descriptorEntidadPlano(e)),
    null,
    2,
  );
  return `${encabezado(`Descriptor del módulo "${def.etiqueta}"`)}
import {
  crearModuloGenerico,
  type DefinicionEntidad,
  type DefinicionModulo,
} from "@workspace/business-foundation";
import type { PlatformServiceDefinition } from "@workspace/platform";

export const SLUG = ${JSON.stringify(def.servicio)} as const;

/** Entidades declarativas del módulo (sin lógica de negocio). */
const ENTIDADES: readonly DefinicionEntidad[] = ${entidadesLiteral} as const;

export const definicionModulo: DefinicionModulo = {
  servicio: SLUG,
  etiqueta: ${JSON.stringify(def.etiqueta)},
  entidades: ENTIDADES,
  capacidades: ENTIDADES.flatMap((e) => e.capacidades),
  permisos: [
    ...new Set(
      ENTIDADES.flatMap((e) => [
        e.permisos.leer,
        e.permisos.crear,
        e.permisos.editar,
        e.permisos.eliminar,
        e.permisos.admin,
      ]),
    ),
  ],
};

/** Descriptor listo para \`extraServices\` de createPlatformRuntime. */
export function definirModulo(): PlatformServiceDefinition {
  return crearModuloGenerico(definicionModulo);
}
`;
}

/** Representación JSON-serializable de la entidad (sin funciones/guards). */
function descriptorEntidadPlano(e: DefinicionEntidad): Record<string, unknown> {
  const plano: Record<string, unknown> = {
    nombre: e.nombre,
    etiqueta: e.etiqueta,
    servicio: e.servicio,
    campos: e.campos,
    permisos: e.permisos,
    capacidades: e.capacidades,
  };
  if (e.configuracionDefaults) plano["configuracionDefaults"] = e.configuracionDefaults;
  if (e.maquinaEstados) {
    plano["maquinaEstados"] = {
      estados: e.maquinaEstados.estados,
      // Los guards son funciones: no se serializan; se re-añaden a mano tras generar.
      transiciones: e.maquinaEstados.transiciones.map((t) => ({
        de: t.de,
        a: t.a,
        comando: t.comando,
        ...(t.permiso ? { permiso: t.permiso } : {}),
      })),
    };
  }
  return plano;
}

function contenidoRuntimeTs(def: DefinicionModulo): string {
  const Pascal = aPascalDesdeSlug(def.servicio);
  return `${encabezado(`Composición del runtime del módulo "${def.etiqueta}"`)}
import type { Pool } from "pg";
import {
  createPlatformRuntime,
  type PlatformRuntime,
  type PlatformRuntimeOptions,
} from "@workspace/platform";
import { definirModulo } from "./module";

export interface ${Pascal}Runtime {
  readonly platform: PlatformRuntime;
}

/**
 * Monta Kernel + Plataforma + este módulo. Selecciona adaptadores según haya
 * \`pool\` (PostgreSQL) o no (Fake / offline). El módulo genérico persiste vía
 * Record Store, por lo que no requiere adaptadores propios.
 */
export function crear${Pascal}Runtime(
  options: Omit<PlatformRuntimeOptions, "extraServices"> & { pool?: Pool } = {},
): ${Pascal}Runtime {
  const platform = createPlatformRuntime({
    ...options,
    extraServices: [definirModulo()],
  });
  return { platform };
}
`;
}

function contenidoRutasTs(def: DefinicionModulo): string {
  const primera = def.entidades[0]!;
  const recurso = primera.nombre;
  const conMaquina = Boolean(primera.maquinaEstados);
  const comandosSync = conMaquina
    ? `["crear", "editar", "eliminar", "transicionar"]`
    : `["crear", "editar", "eliminar"]`;
  return `${encabezado(`API HTTP del módulo "${def.etiqueta}"`)}
import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import {
  contextoDesdeAutenticacion,
  resolverHttp,
  type DatosAutenticados,
} from "@workspace/business-foundation";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { SLUG } from "./module";
// TODO: proveer el runtime real del módulo (fake/pg) donde se monten estas rutas.
import { crear${aPascalDesdeSlug(def.servicio)}Runtime } from "./runtime";

const router: IRouter = Router();
const BASE = ${JSON.stringify(`/${def.servicio.replace(/\./g, "/")}/${recurso}`)};
const ENTIDAD = ${JSON.stringify(recurso)};

const runtime = crear${aPascalDesdeSlug(def.servicio)}Runtime();

/* ------------------------------ Sesión ------------------------------------ */
// El principal se deriva de datos YA autenticados por el borde (sesión/JWT).
router.use(BASE, (req, res, next): void => {
  const autenticado = res.locals.autenticado as DatosAutenticados | undefined;
  if (!autenticado) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  res.locals.ctx = contextoDesdeAutenticacion(autenticado);
  next();
});

/* ---------------------------- Utilidades ---------------------------------- */
function ctxOf(res: Response): ExecutionContext {
  return res.locals.ctx as ExecutionContext;
}
function send(res: Response, r: Result<unknown, KernelError>): void {
  const { status, body } = resolverHttp(r);
  res.status(status).json(body);
}
const exec = (ctx: ExecutionContext, name: string, input: unknown) =>
  runtime.platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  runtime.platform.kernel.queries.execute(ctx, name, input);
/** Procesa el outbox tras cada comando (proyección inmediata). */
async function drain(): Promise<void> {
  await runtime.platform.kernel.outboxProcessor.processPending();
}

/* ------------------------------ Consultas --------------------------------- */
router.get(BASE, async (req, res) => {
  send(res, await query(ctxOf(res), \`\${SLUG}.\${ENTIDAD}.listar\`, {
    estado: typeof req.query.estado === "string" ? req.query.estado : undefined,
  }));
});
router.get(\`\${BASE}/:id\`, async (req, res) => {
  send(res, await query(ctxOf(res), \`\${SLUG}.\${ENTIDAD}.obtener\`, { id: req.params.id }));
});

/* ------------------------------ Comandos ---------------------------------- */
router.post(BASE, async (req, res) => {
  const r = await exec(ctxOf(res), \`\${SLUG}.\${ENTIDAD}.crear\`, req.body);
  await drain();
  send(res, r);
});
router.put(\`\${BASE}/:id\`, async (req, res) => {
  const r = await exec(ctxOf(res), \`\${SLUG}.\${ENTIDAD}.editar\`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});
router.delete(\`\${BASE}/:id\`, async (req, res) => {
  const r = await exec(ctxOf(res), \`\${SLUG}.\${ENTIDAD}.eliminar\`, { id: req.params.id });
  await drain();
  send(res, r);
});${
  conMaquina
    ? `
router.post(\`\${BASE}/:id/transicionar\`, async (req, res) => {
  const r = await exec(ctxOf(res), \`\${SLUG}.\${ENTIDAD}.transicionar\`, { id: req.params.id, ...req.body });
  await drain();
  send(res, r);
});`
    : ""
}

/* --------------------------- Sincronización offline ----------------------- */
// Contrato Offline First: el CLIENTE genera un id (UUID) estable por entidad y
// un opId por operación. Para \`crear\`, el id es OBLIGATORIO: es la clave de
// deduplicación durable del núcleo (crud.ts deduplica \`crear\` por id de cliente
// dentro del tenant). Sin id, cada reintento crearía un registro nuevo.
const SyncOp = z
  .object({
    opId: z.string().min(1),
    comando: z.enum(${comandosSync}),
    input: z.record(z.string(), z.unknown()),
  })
  .refine(
    (op) => op.comando !== "crear" || typeof op.input["id"] === "string",
    {
      message:
        "Offline First: 'crear' exige input.id (UUID generado por el cliente) para garantizar deduplicación durable por tenant en reintentos.",
    },
  );

/**
 * Sincroniza una cola de operaciones capturadas offline. La idempotencia NO se
 * gestiona con estado en memoria: se delega en el núcleo, siempre por tenant
 * (el tenant sale del ExecutionContext, \`ctxOf(res)\`):
 *   - \`crear\`: deduplicación durable por el id de cliente (obligatorio); un
 *     reintento con el mismo id no crea otro registro ni emite otro evento.
 *   - \`editar\`/\`eliminar\`/\`transicionar\`: idempotentes por \`opId\`, que el
 *     núcleo guarda como \`_opIds\` en el propio registro.
 * Por eso se propaga \`op.opId\` dentro del input de cada comando. El recibo de
 * respuesta se deriva del resultado del comando (que marca \`idempotente: true\`
 * al reintentar), sin cachés globales.
 */
router.post(\`\${BASE}/sync\`, async (req, res): Promise<void> => {
  const parsed = z.array(SyncOp).max(100).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Cola de sincronización inválida" });
    return;
  }
  const resultados = [];
  for (const op of parsed.data) {
    // opId dentro del input → idempotencia del núcleo (por id en crear; por
    // _opIds en el resto). Siempre tenant-scoped porque el tenant sale del ctx.
    const input = { ...op.input, opId: op.opId };
    const r = await exec(ctxOf(res), \`\${SLUG}.\${ENTIDAD}.\${op.comando}\`, input);
    if (r.ok) {
      const idempotente = (r.value as { idempotente?: boolean }).idempotente === true;
      resultados.push({ opId: op.opId, ok: true, resultado: r.value, recibo: idempotente });
    } else {
      resultados.push({ opId: op.opId, ok: false, code: r.error.code, error: r.error.message });
    }
  }
  await drain();
  res.json({ resultados });
});

export default router;
`;
}

function contenidoTestTs(def: DefinicionModulo): string {
  const Pascal = aPascalDesdeSlug(def.servicio);
  const primera = def.entidades[0]!;
  const recurso = primera.nombre;
  const primerCampoRequerido = primera.campos.find((c) => c.requerido) ?? primera.campos[0];
  const dataEjemplo = primerCampoRequerido
    ? `{ ${JSON.stringify(primerCampoRequerido.nombre)}: ${JSON.stringify(valorEjemplo(primerCampoRequerido.tipo))} }`
    : `{}`;
  return `${encabezado(`Test base del módulo "${def.etiqueta}"`)}
import { describe, expect, it } from "vitest";
import { createExecutionContext, MemoryLogger, type ExecutionContext, type Principal } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { crear${Pascal}Runtime } from "../runtime";
import { definicionModulo, SLUG } from "../module";

const ENTIDAD = ${JSON.stringify(recurso)};
const PERMISOS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...definicionModulo.permisos]),
];
const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: PERMISOS, capacidades: [] };

function runtime() {
  return crear${Pascal}Runtime({ logger: new MemoryLogger() }).platform;
}
function ctxOf(tenantId: string): ExecutionContext {
  return createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
}

describe("${def.etiqueta} — CRUD end-to-end (runtime fake)", () => {
  it("registra el módulo en la plataforma", () => {
    const rt = runtime();
    expect(rt.registries.services.list().map((s) => s.name)).toContain(SLUG);
  });

  it("crear → drain → listar", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const creado = await rt.kernel.commands.execute(ctx, \`\${SLUG}.\${ENTIDAD}.crear\`, { data: ${dataEjemplo} });
    expect(creado.ok).toBe(true);
    await rt.kernel.outboxProcessor.processPending();
    const lista = await rt.kernel.queries.execute(ctx, \`\${SLUG}.\${ENTIDAD}.listar\`, {});
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect((lista.value as unknown[]).length).toBe(1);
  });
});
`;
}

function valorEjemplo(tipo: string): unknown {
  switch (tipo) {
    case "numero":
      return 1;
    case "booleano":
      return true;
    default:
      return "ejemplo";
  }
}

/* ------------------------------ Generador --------------------------------- */

/**
 * Genera los artefactos textuales de un módulo nuevo a partir de la entrada
 * mínima. Valida la definición (DGP-006) antes de generar; lanza Error explícito
 * si es inválida. NO escribe a disco: devuelve `{ ruta, contenido }[]`.
 */
export function generarModulo(entrada: EntradaScaffolding): readonly ArtefactoGenerado[] {
  const def = definicionDesdeEntrada(entrada);
  asegurarDefinicionValida(def);
  const carpeta = `src`;
  return [
    { ruta: `${carpeta}/module.ts`, contenido: contenidoModuloTs(def) },
    { ruta: `${carpeta}/runtime.ts`, contenido: contenidoRuntimeTs(def) },
    { ruta: `${carpeta}/routes.ts`, contenido: contenidoRutasTs(def) },
    { ruta: `${carpeta}/__tests__/modulo.test.ts`, contenido: contenidoTestTs(def) },
  ];
}
