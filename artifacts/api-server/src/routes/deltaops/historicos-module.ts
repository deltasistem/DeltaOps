/**
 * DELTAOPS LITE-09 · API HTTP de la IMPORTACIÓN DE DATOS HISTÓRICOS.
 *
 * Router Express FINO que orquesta el runtime de composición histórica. NO es un
 * módulo ni entitlement nuevo: cuelga del prefijo `/deltaops/activos/historicos`
 * y por tanto lo gobierna el entitlement `activos` (igual que el preoperacional y
 * el bucle de hallazgos). Debe montarse ANTES del router de activos (catch-all
 * `/:id`). Solo ADMIN de empresa/SUPER_ADMIN importa; CONSULTA jamás (fail-closed
 * aquí y en el runtime). El tenant SIEMPRE proviene del contexto autenticado.
 *
 * Flujo de 8 pasos (la UI los recorre; el backend expone las capacidades):
 *  1) tipos de fuente · 2) cargar Excel (server/upload) · 3) analizar (detección)
 *  4) vista previa · 5) validar (dry-run + conteos) · 6) confirmar · 7) importar
 *  8) resultado (reporte con procedencia y lote).
 */
import { Router, type IRouter, type Response, raw } from "express";
import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { db, deltaopsUsersTable } from "@workspace/db";
import { aRolCanonico } from "../../deltaops/identity/rbac";
import {
  ARCHIVOS_CONOCIDOS, detectarTipo, leerHoja, type TipoFuente,
} from "./historicos/parsers";
import { contextoImportacion, importarArchivo } from "./historicos-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/activos/historicos";

// Directorio con los 6 Excel reales entregados por Delta (selección server-side).
const DIR_ASSETS = path.resolve(process.cwd(), "../../attached_assets");

// Directorio temporal de subidas locales. La subida binaria se PERSISTE aquí y
// las etapas siguientes la referencian por `uploadId` (basename saneado) en vez
// de reenviar el base64 en JSON (que chocaba con el límite de express.json de
// 100KB para 4/6 archivos ≥ 100KB). MENOR-2: referencia server-side por id.
const DIR_SUBIDAS = path.join(os.tmpdir(), "deltaops-historicos-subidas");

const ETIQUETAS_FUENTE: Record<TipoFuente, string> = {
  "checklist-cargador": "Checklist preoperacional · Cargadores",
  "checklist-montacargas": "Checklist preoperacional · Montacargas",
  combustible: "Control de combustible",
  "horas-hombre": "Horas hombre (jornadas)",
  "pmp-cargadores": "Plan de mantenimiento preventivo · Cargadores",
  "pmp-montacargas": "Plan de mantenimiento preventivo · Montacargas",
};

/* ------------------------------ Sesión + guard ---------------------------- */

interface SesionHistoricos {
  userId: string;
  rolCanonico: string;
  tenant: string;
}

router.use(BASE, async (req, res, next): Promise<void> => {
  const userId = req.session?.deltaopsUserId;
  if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }
  const [user] = await db
    .select({ id: deltaopsUsersTable.id, rol: deltaopsUsersTable.rol, tenant: deltaopsUsersTable.tenant })
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.id, userId));
  if (!user) { res.status(401).json({ error: "Sesión inválida" }); return; }
  const rolCanonico = req.session?.rolCanonico ?? aRolCanonico(user.rol);
  // Guard de importación: SOLO administración de empresa importa. CONSULTA nunca.
  const puedeImportar = rolCanonico === "SUPER_ADMIN" || rolCanonico === "TENANT_ADMIN";
  if (!puedeImportar) {
    res.status(403).json({ error: "La importación histórica es exclusiva de administración de empresa" });
    return;
  }
  res.locals.sesion = { userId: String(user.id), rolCanonico, tenant: user.tenant } satisfies SesionHistoricos;
  next();
});

function sesionOf(res: Response): SesionHistoricos {
  return res.locals.sesion as SesionHistoricos;
}

function nombreSeguro(nombre: string): string {
  // Evita traversal: solo el basename, sin separadores.
  return path.basename(String(nombre));
}

async function leerArchivoServidor(nombre: string): Promise<Buffer | null> {
  const seguro = nombreSeguro(nombre);
  const ruta = path.join(DIR_ASSETS, seguro);
  if (!ruta.startsWith(DIR_ASSETS)) return null;
  try {
    return await fs.readFile(ruta);
  } catch {
    return null;
  }
}

/** Lee un archivo previamente SUBIDO por `uploadId` (basename saneado). */
async function leerArchivoSubido(uploadId: string): Promise<{ nombre: string; buffer: Buffer } | null> {
  const seguro = nombreSeguro(uploadId);
  const ruta = path.join(DIR_SUBIDAS, seguro);
  if (!ruta.startsWith(DIR_SUBIDAS)) return null;
  try {
    const buffer = await fs.readFile(ruta);
    let nombre = seguro;
    try {
      const meta = JSON.parse(await fs.readFile(`${ruta}.json`, "utf8")) as { nombre?: unknown };
      if (typeof meta.nombre === "string" && meta.nombre.trim() !== "") nombre = nombreSeguro(meta.nombre);
    } catch {
      // sin metadatos: se usa el uploadId como nombre lógico.
    }
    return { nombre, buffer };
  } catch {
    return null;
  }
}

function manejarError(res: Response, e: unknown): void {
  const msg = e instanceof Error ? e.message : "Error inesperado";
  res.status(500).json({ error: msg });
}

/* ------------------------------ 1 · Tipos --------------------------------- */

router.get(`${BASE}/tipos-fuente`, (_req, res) => {
  res.json({
    tipos: (Object.keys(ETIQUETAS_FUENTE) as TipoFuente[]).map((t) => ({ tipo: t, etiqueta: ETIQUETAS_FUENTE[t] })),
  });
});

/* --------------------- 2 · Archivos disponibles (server) ------------------ */

router.get(`${BASE}/archivos-disponibles`, async (_req, res) => {
  try {
    const entradas = await fs.readdir(DIR_ASSETS).catch(() => [] as string[]);
    const xlsx = entradas.filter((f) => /\.xlsx$/i.test(f));
    const archivos = xlsx.map((nombre) => {
      let tipo: TipoFuente | null = null;
      for (const [t, re] of Object.entries(ARCHIVOS_CONOCIDOS) as Array<[TipoFuente, RegExp]>) {
        if (re.test(nombre)) { tipo = t; break; }
      }
      return { nombre, tipo, etiqueta: tipo ? ETIQUETAS_FUENTE[tipo] : null };
    });
    res.json({ archivos });
  } catch (e) {
    manejarError(res, e);
  }
});

/* ----------------------------- carga del buffer --------------------------- */

/**
 * Obtiene el buffer y el nombre lógico desde el body JSON. Fuentes admitidas:
 *  - `uploadId`: archivo SUBIDO server-side (referencia liviana, sin base64).
 *  - `archivo`: archivo de servidor (assets entregados por Delta).
 *  - `contenidoBase64` + `nombre`: compat legado (sólo archivos pequeños; el
 *    flujo preferido es `uploadId` para no chocar con el límite de JSON).
 */
async function bufferDesdeBody(body: unknown): Promise<{ nombre: string; buffer: Buffer } | { error: string }> {
  const b = (body ?? {}) as { uploadId?: unknown; archivo?: unknown; contenidoBase64?: unknown; nombre?: unknown };
  if (typeof b.uploadId === "string" && b.uploadId.trim() !== "") {
    const subido = await leerArchivoSubido(b.uploadId);
    if (!subido) return { error: `Subida no encontrada: ${nombreSeguro(b.uploadId)}` };
    return subido;
  }
  if (typeof b.archivo === "string" && b.archivo.trim() !== "") {
    const buffer = await leerArchivoServidor(b.archivo);
    if (!buffer) return { error: `Archivo no encontrado: ${nombreSeguro(b.archivo)}` };
    return { nombre: nombreSeguro(b.archivo), buffer };
  }
  if (typeof b.contenidoBase64 === "string" && b.contenidoBase64.trim() !== "") {
    const nombre = typeof b.nombre === "string" && b.nombre.trim() !== "" ? nombreSeguro(b.nombre) : "cargado.xlsx";
    try {
      return { nombre, buffer: Buffer.from(b.contenidoBase64, "base64") };
    } catch {
      return { error: "contenidoBase64 inválido" };
    }
  }
  return { error: "Debe indicar `uploadId` (subida), `archivo` (servidor) o `contenidoBase64` + `nombre`" };
}

/* ------------------------------ 3 · Analizar ------------------------------ */

router.post(`${BASE}/analizar`, async (req, res) => {
  try {
    const cargado = await bufferDesdeBody(req.body);
    if ("error" in cargado) { res.status(400).json({ error: cargado.error }); return; }
    const { headers, filas } = await leerHoja(cargado.buffer);
    const tipo = detectarTipo(headers);
    res.json({
      archivo: cargado.nombre,
      tipo,
      etiqueta: tipo ? ETIQUETAS_FUENTE[tipo] : null,
      reconocido: tipo != null,
      totalFilas: filas.length,
      columnas: headers.length,
      muestraEncabezados: headers.slice(0, 30),
    });
  } catch (e) {
    manejarError(res, e);
  }
});

/* ---------------------- 4·5 · Vista previa / Validar (dry-run) ------------ */

router.post(`${BASE}/validar`, async (req, res) => {
  try {
    const cargado = await bufferDesdeBody(req.body);
    if ("error" in cargado) { res.status(400).json({ error: cargado.error }); return; }
    const s = sesionOf(res);
    const ci = contextoImportacion(s.userId, s.rolCanonico, s.tenant);
    const r = await importarArchivo(ci, cargado.nombre, cargado.buffer, true);
    if (!r.ok) { res.status(400).json({ error: r.error.message, code: r.error.code }); return; }
    res.json(r.value);
  } catch (e) {
    manejarError(res, e);
  }
});

/* ---------------------- 6·7·8 · Confirmar / Importar / Resultado ---------- */

router.post(`${BASE}/importar`, async (req, res) => {
  try {
    const cargado = await bufferDesdeBody(req.body);
    if ("error" in cargado) { res.status(400).json({ error: cargado.error }); return; }
    const s = sesionOf(res);
    const ci = contextoImportacion(s.userId, s.rolCanonico, s.tenant);
    const r = await importarArchivo(ci, cargado.nombre, cargado.buffer, false);
    if (!r.ok) { res.status(statusOf(r.error.code)).json({ error: r.error.message, code: r.error.code }); return; }
    res.json(r.value);
  } catch (e) {
    manejarError(res, e);
  }
});

function statusOf(code: string): number {
  if (code.startsWith("KRN-AUTH")) return 403;
  if (code.startsWith("KRN-NF")) return 404;
  if (code.startsWith("KRN-CFL")) return 409;
  if (code.startsWith("KRN-VAL")) return 400;
  return 500;
}

/* ------------------ Upload binario (octet-stream, sin dep) ---------------- */
// Body parser raw solo para este endpoint (evita el límite del json global).

router.post(
  `${BASE}/subir`,
  raw({ type: "application/octet-stream", limit: "25mb" }),
  async (req, res) => {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: "Cuerpo binario vacío (envíe application/octet-stream)" });
      return;
    }
    const nombre = nombreSeguro(String(req.query.nombre ?? "cargado.xlsx"));
    try {
      // PERSISTE server-side y devuelve una REFERENCIA liviana (`uploadId`), en
      // lugar del base64 que luego chocaba con el límite de express.json. El id
      // deriva del contenido (hash) + nombre ⇒ estable e idempotente por archivo.
      await fs.mkdir(DIR_SUBIDAS, { recursive: true });
      const hash = createHash("sha1").update(buf).digest("hex").slice(0, 16);
      const uploadId = `${hash}-${nombre}`;
      const ruta = path.join(DIR_SUBIDAS, uploadId);
      await fs.writeFile(ruta, buf);
      await fs.writeFile(`${ruta}.json`, JSON.stringify({ nombre, bytes: buf.length }), "utf8");
      res.json({ uploadId, nombre, bytes: buf.length });
    } catch (e) {
      manejarError(res, e);
    }
  },
);

export default router;
