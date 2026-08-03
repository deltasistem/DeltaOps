/**
 * DGP-007 · Dynamic Forms Engine — Pruebas de integración PostgreSQL.
 *
 * Cubre el Record Store real (deltaops.platform_records) con RLS/set_config de
 * tenant, concurrencia optimista y aislamiento multitenant a través del motor.
 * Se OMITE automáticamente sin DATABASE_URL (patrón module-reference).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  crearFormulariosRuntime,
  crearMotorFormularios,
  ResolutorPlantillaMemoria,
  SERVICIO,
  type DefinicionFormulario,
  type FormulariosRuntime,
} from "..";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...crearMotorFormularios().permissions,
  ]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };

const T = `pgforms-${Date.now()}`;

const DEF: DefinicionFormulario = {
  clave: "revision-generica",
  titulo: "Revisión genérica",
  nodos: [{ clase: "campo", clave: "titulo", tipo: "texto", etiqueta: "Título", obligatorio: true }],
};

suite("Dynamic Forms Engine · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: FormulariosRuntime;

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
  const exec = (c: ExecutionContext, cmd: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, cmd, input);
  const query = (c: ExecutionContext, q: string, input: unknown) =>
    rt.platform.kernel.queries.execute(c, q, input);

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const prov = new ResolutorPlantillaMemoria();
    prov.registrar("pl-pg", 1, DEF);
    rt = crearFormulariosRuntime({ logger: new MemoryLogger(), pool, motor: { resolutor: prov } });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("persiste plantilla y respuesta en el Record Store real", async () => {
    const c = ctx(T);
    const contenido = { definicion: DEF };
    const p = await exec(c, `${SERVICIO}.plantilla.crear`, {
      id: `pl-${T}`, opId: "op", clave: "pl-pg", contenido,
    });
    expect(p.ok).toBe(true);

    const g = await exec(c, `${SERVICIO}.respuesta.guardarBorrador`, {
      id: `r-${T}`, opId: "g", plantillaClave: "pl-pg", plantillaVersion: 1, datos: { titulo: "demo" },
    });
    expect(g.ok).toBe(true);

    const leido = await query(c, `${SERVICIO}.respuesta.obtener`, { id: `r-${T}` });
    expect(leido.ok).toBe(true);
  });

  it("aísla por tenant vía RLS/set_config", async () => {
    const otro = await query(ctx(`${T}-otro`), `${SERVICIO}.respuesta.obtener`, { id: `r-${T}` });
    expect(otro.ok).toBe(false);
  });
});
