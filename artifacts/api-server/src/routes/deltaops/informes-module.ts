/**
 * DELTAOPS FINAL-02 · API HTTP de INFORMES OPERACIONALES y EXPORTACIÓN.
 *
 * Router Express FINO de COMPOSICIÓN DE LECTURA (patrón DGP-021.3): no crea
 * datos, no introduce entidades ni módulos nuevos; delega en los builders de
 * `informes-datasets.ts`, que componen EXCLUSIVAMENTE queries públicas con el
 * principal de sesión. Rutas bajo /api/deltaops/informes...
 *
 *  - GET  /deltaops/informes                       → catálogo de informes.
 *  - GET  /deltaops/informes/:clave                → dataset paginado (offset/limit).
 *  - GET  /deltaops/informes/:clave/exportar       → Excel (xlsx) o CSV del MISMO dataset.
 *
 * «Lo que se ve = lo que se exporta»: consulta y exportación usan el MISMO
 * builder con los MISMOS filtros; la exportación entrega el dataset completo
 * (sin paginar) y la consulta visual el mismo conjunto paginado.
 *
 * Auditoría de exportación: cada descarga registra un job de exportación vía
 * los comandos oficiales `platform.export.request` → `.complete` (auditados en
 * `platform_audit`). El contexto de auditoría lleva SOLO permisos de export
 * (no amplía la lectura de datos: el dataset ya se compuso con el principal
 * de sesión y el RBAC de cada módulo autoridad).
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, deltaopsUsersTable } from "@workspace/db";
import { createExecutionContext, type KernelError, type Result } from "@workspace/kernel";
import { activosRuntime } from "./activos-runtime";
import { aRolCanonico } from "../../deltaops/identity/rbac";
import {
  INFORMES,
  informePorClave,
  type Dataset,
  type FiltrosInforme,
  type SesionInformes,
} from "./informes-datasets";

const router: IRouter = Router();
const BASE = "/deltaops/informes";

/* ------------------------------ Sesión ------------------------------------ */

router.use(BASE, async (req, res, next): Promise<void> => {
  const userId = req.session?.deltaopsUserId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const [user] = await db
    .select({ id: deltaopsUsersTable.id, rol: deltaopsUsersTable.rol, tenant: deltaopsUsersTable.tenant })
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Sesión inválida" });
    return;
  }
  const sesion: SesionInformes = {
    userId: String(user.id),
    rolCanonico: req.session?.rolCanonico ?? aRolCanonico(user.rol),
    rolLegacy: user.rol,
    tenant: user.tenant,
    identityId: req.session?.identityId,
  };
  res.locals.sesion = sesion;
  next();
});

/* ---------------------------- Utilidades ---------------------------------- */

const sesionOf = (res: { locals: Record<string, unknown> }): SesionInformes =>
  res.locals.sesion as SesionInformes;

function statusOf(err: KernelError): number {
  if (err.code.startsWith("KRN-AUTH")) return 403;
  if (err.code.startsWith("KRN-NF")) return 404;
  if (err.code.startsWith("KRN-CFL")) return 409;
  if (err.code.startsWith("KRN-VAL")) return 400;
  return 500;
}

const strQuery = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

function filtrosDe(q: Record<string, unknown>): FiltrosInforme {
  return {
    desde: strQuery(q.desde),
    hasta: strQuery(q.hasta),
    activoId: strQuery(q.activoId),
    estado: strQuery(q.estado),
    tipo: strQuery(q.tipo),
    veredicto: strQuery(q.veredicto),
    centroCosto: strQuery(q.centroCosto),
    origen: strQuery(q.origen),
    ordenId: strQuery(q.ordenId),
    moneda: strQuery(q.moneda),
  };
}

/** «—» para inexistentes en archivos exportados (misma convención que la UI). */
const celda = (v: unknown): string | number =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? v : String(v);

/* ---------------------- Auditoría de exportación -------------------------- */

/**
 * Registra el job de exportación (request→complete) con los comandos oficiales
 * de plataforma, que auditan en la MISMA UoW. FAIL-SAFE deliberado: si la
 * auditoría de plataforma fallara, la descarga NO se entrega (fail-closed en
 * request); `complete` posterior es best-effort (el job queda `pending` visible).
 */
async function auditarExportacion(
  s: SesionInformes,
  origen: string,
  formato: "csv" | "xlsx",
  filtros: FiltrosInforme,
  filas: number,
): Promise<Result<{ id: string }, KernelError>> {
  // Principal de sesión con permisos EXCLUSIVOS de export (no amplía lecturas).
  const ctx = createExecutionContext({
    principal: {
      id: s.userId,
      rol: s.rolCanonico,
      permisos: ["platform.export.write", "platform.export.read"],
      capacidades: [],
    },
    metadata: { tenantId: s.tenant, ...(s.identityId ? { identityId: s.identityId } : {}) },
  });
  const kernel = activosRuntime().platform.kernel;
  const r = await kernel.commands.execute(ctx, "platform.export.request", {
    origen: `informes.${origen}`,
    formato,
    filtros: { ...filtros, filas },
  });
  if (!r.ok) return r as Result<never, KernelError>;
  const id = (r.value as { id: string }).id;
  // Máquina de estados real del servicio: pending → running → completed. Cada
  // transición se VERIFICA (fail-closed): si el job no queda `completed`, la
  // descarga no se entrega — la auditoría exigida es request→complete completa.
  const prog = await kernel.commands.execute(ctx, "platform.export.updateProgress", { id, progreso: 100 });
  if (!prog.ok) return prog as Result<never, KernelError>;
  const fin = await kernel.commands.execute(ctx, "platform.export.complete", { id });
  if (!fin.ok) return fin as Result<never, KernelError>;
  await kernel.outboxProcessor.processPending();
  return { ok: true, value: { id } };
}

/* ------------------------------ Serialización ----------------------------- */

/** Advertencias de ventana declaradas por el builder (estado explícito). */
function advertenciasDe(ds: Dataset): string[] {
  const a = ds.meta["advertencias"];
  return Array.isArray(a) ? a.map((x) => String(x)) : [];
}

/** Export SOLO para tests de la barrera de serialización CSV. */
export const aCsvParaTest = (ds: Dataset): string => aCsv(ds);

function aCsv(ds: Dataset): string {
  const esc = (v: string | number): string => {
    let t = String(v);
    // Neutralización de INYECCIÓN DE FÓRMULAS (CSV injection): un valor que
    // comience por = + - @ o TAB/CR se prefija con apóstrofo para que Excel/
    // LibreOffice lo traten como texto y jamás lo evalúen. («—» no casa.)
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lineas = [ds.columnas.map((c) => esc(c.titulo)).join(";")];
  for (const fila of ds.filas) {
    lineas.push(ds.columnas.map((c) => esc(celda(fila[c.clave]))).join(";"));
  }
  // Advertencias de ventana (estado explícito, jamás truncamiento mudo): se
  // anexan como líneas finales para que el archivo mismo declare su alcance.
  for (const adv of advertenciasDe(ds)) lineas.push(esc(`Advertencia: ${adv}`));
  // BOM UTF-8 para que Excel en Windows abra acentos correctamente.
  return "\uFEFF" + lineas.join("\r\n");
}

async function aXlsx(clave: string, titulo: string, ds: Dataset): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DeltaOps";
  const hoja = wb.addWorksheet(titulo.slice(0, 31));
  hoja.columns = ds.columnas.map((c) => ({ header: c.titulo, key: c.clave, width: Math.max(14, c.titulo.length + 4) }));
  hoja.getRow(1).font = { bold: true };
  for (const fila of ds.filas) {
    hoja.addRow(Object.fromEntries(ds.columnas.map((c) => [c.clave, celda(fila[c.clave])])));
  }
  const nota = typeof ds.meta["nota"] === "string" ? (ds.meta["nota"] as string) : null;
  const advertencias = advertenciasDe(ds);
  if (nota || advertencias.length) {
    hoja.addRow([]);
    if (nota) {
      const filaNota = hoja.addRow([`Nota: ${nota}`]);
      filaNota.getCell(1).font = { italic: true, size: 9 };
    }
    for (const adv of advertencias) {
      const filaAdv = hoja.addRow([`Advertencia: ${adv}`]);
      filaAdv.getCell(1).font = { italic: true, bold: true, size: 9 };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* -------------------------------- Rutas ----------------------------------- */

router.get(BASE, (_req, res) => {
  res.json({
    informes: INFORMES.map(({ clave, titulo, descripcion, filtros }) => ({ clave, titulo, descripcion, filtros })),
  });
});

router.get(`${BASE}/:clave`, async (req, res) => {
  const def = informePorClave(req.params.clave);
  if (!def) {
    res.status(404).json({ error: `Informe desconocido: ${req.params.clave}`, code: "KRN-NF-001" });
    return;
  }
  const filtros = filtrosDe(req.query as Record<string, unknown>);
  const r = await def.builder(sesionOf(res), filtros);
  if (!r.ok) {
    res.status(statusOf(r.error)).json({ error: r.error.message, code: r.error.code });
    return;
  }
  const limitRaw = Number(strQuery(req.query.limit) ?? "50");
  const offsetRaw = Number(strQuery(req.query.offset) ?? "0");
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 500 ? limitRaw : 50;
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const { columnas, filas, meta } = r.value;
  res.json({
    informe: def.clave,
    titulo: def.titulo,
    columnas,
    total: filas.length,
    offset,
    limit,
    filas: filas.slice(offset, offset + limit),
    meta,
  });
});

router.get(`${BASE}/:clave/exportar`, async (req, res) => {
  const def = informePorClave(req.params.clave);
  if (!def) {
    res.status(404).json({ error: `Informe desconocido: ${req.params.clave}`, code: "KRN-NF-001" });
    return;
  }
  const formato = strQuery(req.query.formato);
  if (formato !== "csv" && formato !== "xlsx") {
    res.status(400).json({ error: "Formato de exportación inválido (csv|xlsx).", code: "KRN-VAL-001" });
    return;
  }
  const s = sesionOf(res);
  const filtros = filtrosDe(req.query as Record<string, unknown>);
  // MISMO builder y MISMOS filtros que la consulta visual (dataset completo).
  const r = await def.builder(s, filtros);
  if (!r.ok) {
    res.status(statusOf(r.error)).json({ error: r.error.message, code: r.error.code });
    return;
  }
  // Auditoría OBLIGATORIA antes de entregar el archivo (fail-closed).
  const auditado = await auditarExportacion(s, def.clave, formato, filtros, r.value.filas.length);
  if (!auditado.ok) {
    res.status(statusOf(auditado.error)).json({ error: auditado.error.message, code: auditado.error.code });
    return;
  }
  const fecha = new Date().toISOString().slice(0, 10);
  const nombre = `deltaops-informe-${def.clave}-${fecha}.${formato}`;
  if (formato === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.send(aCsv(r.value));
    return;
  }
  const buf = await aXlsx(def.clave, def.titulo, r.value);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  res.send(buf);
});

export default router;
