/**
 * DELTAOPS LITE-09 · Parsers de los 6 Excel fuente (exceljs).
 * Cada parser produce filas TIPADAS con su `filaId` (Id de Forms | hash), el
 * literal crudo de campos normalizados y la clasificación de activo. NO inventa
 * columnas: mapea por nombre de encabezado real (robusto a reordenamientos).
 */
import ExcelJS from "exceljs";
import { hashFila } from "./idempotencia";
import { aIso, combinarFechaHora, normalizarCantidad, normalizarEncabezado, normalizarMedidor, texto } from "./normalizacion";

/** Tipos de fuente soportados (uno por Excel / familia de Excel). */
export type TipoFuente =
  | "checklist-cargador"
  | "checklist-montacargas"
  | "combustible"
  | "horas-hombre"
  | "pmp-cargadores"
  | "pmp-montacargas";

/** Nombres canónicos de archivo esperados (para selección desde la UI). */
export const ARCHIVOS_CONOCIDOS: Record<TipoFuente, RegExp> = {
  "checklist-cargador": /CHECKLIST.*CARGADOR/i,
  "checklist-montacargas": /CHECKLIST.*MONTACARGAS/i,
  combustible: /COMBUSTIBLE/i,
  "horas-hombre": /Horas Hombre/i,
  "pmp-cargadores": /MANTENIMIENTO.*CARGADORES/i,
  "pmp-montacargas": /MANTENIMIENTO.*MONTACARGAS/i,
};

export interface FilaCruda {
  readonly filaExcel: number;
  readonly filaId: string; // Id de Forms o "hash:<sha1>"
  readonly celdas: Record<string, unknown>; // por nombre de encabezado
}

/** Lee un workbook (buffer) a filas indexadas por encabezado. */
export async function leerHoja(buffer: Buffer): Promise<{ headers: string[]; filas: FilaCruda[] }> {
  const wb = new ExcelJS.Workbook();
  // exceljs acepta Buffer/ArrayBuffer; el tipo empaquetado es estricto con el
  // genérico de Buffer, por lo que se pasa la vista de ArrayBuffer subyacente.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  const idxToName = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    // Normalización Unicode del encabezado (NFKC + NBSP→espacio + colapso): sin
    // esto encabezados como "Supervisor 1" con NBSP no casaban con las claves
    // literales del mapeo y el campo quedaba sin capturar (MENOR-1).
    const name = normalizarEncabezado(String(cell.value ?? ""));
    if (name) {
      headers.push(name);
      idxToName.set(col, name);
    }
  });
  const filas: FilaCruda[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const celdas: Record<string, unknown> = {};
    let vacia = true;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const name = idxToName.get(col);
      if (!name) return;
      let v: unknown = cell.value;
      if (v && typeof v === "object") {
        const o = v as { text?: unknown; result?: unknown; hyperlink?: unknown };
        if (o.result != null) v = o.result;
        else if (o.text != null) v = o.text;
        else if (o.hyperlink != null) v = o.hyperlink;
      }
      if (v != null && String(v).trim() !== "") vacia = false;
      celdas[name] = v;
    });
    if (vacia) continue;
    const idCrudo = celdas["Id"];
    const filaId =
      idCrudo != null && String(idCrudo).trim() !== ""
        ? String(idCrudo).trim()
        : `hash:${hashFila(Object.values(celdas))}`;
    filas.push({ filaExcel: r, filaId, celdas });
  }
  return { headers, filas };
}

/** Detecta el tipo de fuente por encabezados presentes. */
export function detectarTipo(headers: string[]): TipoFuente | null {
  const h = new Set(headers.map((x) => x.toLowerCase()));
  const has = (s: string) => [...h].some((x) => x.includes(s.toLowerCase()));
  if (has("mantenimineto a realizar") || has("mantenimiento a realizar")) {
    // Discriminar cargadores/montacargas por columnas de ítems.
    return has("cucharón") || has("cucharon") || has("brazo y estructura")
      ? "pmp-cargadores"
      : "pmp-montacargas";
  }
  if (has("cantidad de galones")) return "combustible";
  if (has("horómetro inicial") || has("horometro inicial")) return "horas-hombre";
  if (has("montacarga")) return "checklist-montacargas";
  if (has("equipo") && has("orden y limpieza")) return "checklist-cargador";
  return null;
}

/* ------------------------- Tipos de fila mapeada -------------------------- */

export interface FilaChecklist {
  readonly filaExcel: number;
  readonly filaId: string;
  readonly codigoCrudo: string;
  readonly fechaHecho: string | null;
  readonly horometro: ReturnType<typeof normalizarMedidor>;
  readonly items: Array<{ etiqueta: string; valor: "CUMPLE" | "NO CUMPLE" | string }>;
  readonly operador: string;
  readonly supervisor: string;
  readonly centroCostoCrudo: string;
  readonly observaciones: string;
  readonly gps: string;
}

const CAMPOS_NO_ITEM_CHECKLIST = new Set([
  "Id", "Hora de inicio", "Hora de finalización", "Correo electrónico", "Nombre",
  "Equipo", "Montacarga", "Fecha", "Hora inicial", "Horómetro", "Centro de costo",
  "Operador de Máquina", "Operador de Máquina1", "Supervisor", "Supervisor 1",
  "Observaciones",
]);

export function mapChecklist(fila: FilaCruda, tipo: TipoFuente): FilaChecklist {
  const c = fila.celdas;
  const codigoCrudo = texto(c["Equipo"] ?? c["Montacarga"]);
  const gpsKey = Object.keys(c).find((k) => k.toLowerCase().includes("gps"));
  const items: FilaChecklist["items"] = [];
  for (const [k, v] of Object.entries(c)) {
    if (CAMPOS_NO_ITEM_CHECKLIST.has(k)) continue;
    if (gpsKey && k === gpsKey) continue;
    const val = texto(v);
    if (val === "") continue;
    if (/^(CUMPLE|NO CUMPLE)$/i.test(val)) {
      items.push({ etiqueta: k, valor: val.toUpperCase() as "CUMPLE" | "NO CUMPLE" });
    }
  }
  return {
    filaExcel: fila.filaExcel,
    filaId: fila.filaId,
    codigoCrudo,
    fechaHecho: aIso(c["Hora de inicio"]),
    horometro: normalizarMedidor(c["Horómetro"]),
    items,
    operador: texto(c["Operador de Máquina"] ?? c["Operador de Máquina1"]),
    supervisor: texto(c["Supervisor"] ?? c["Supervisor 1"]),
    centroCostoCrudo: texto(c["Centro de costo"]),
    observaciones: texto(c["Observaciones"]),
    gps: gpsKey ? texto(c[gpsKey]) : "",
  };
}

export interface FilaCombustible {
  readonly filaExcel: number;
  readonly filaId: string;
  readonly codigoCrudo: string;
  readonly fechaHecho: string | null;
  readonly galones: ReturnType<typeof normalizarCantidad>;
  readonly horometro: ReturnType<typeof normalizarMedidor>;
  readonly proveedor: string; // snapshot texto (vacío se conserva vacío)
  readonly responsable: string;
  readonly ticketUrl: string;
}

export function mapCombustible(fila: FilaCruda): FilaCombustible {
  const c = fila.celdas;
  return {
    filaExcel: fila.filaExcel,
    filaId: fila.filaId,
    codigoCrudo: texto(c["CARGADOR"]),
    fechaHecho: combinarFechaHora(c["FECHA"], c["HORA"]),
    galones: normalizarCantidad(c["CANTIDAD DE GALONES"]),
    horometro: normalizarMedidor(c["HOROMETRO ACTUAL"]),
    proveedor: texto(c["PROVEEDOR DE GASOLINA"]),
    responsable: texto(c["RESPONSABLES DEL CARGUE DE COMBUSTIBLE"]),
    ticketUrl: texto(c["ADJUNTAR TICKET DEL CARGUE DE COMBUSTIBLE"]),
  };
}

export interface FilaHorasHombre {
  readonly filaExcel: number;
  readonly filaId: string;
  readonly codigoCrudo: string;
  readonly fechaHecho: string | null;
  readonly cliente: string;
  readonly operacion: string;
  readonly material: string;
  readonly area: string;
  readonly propioTercerizado: string;
  readonly turno: string;
  readonly operador: string;
  readonly supervisor: string;
  readonly horometroInicial: ReturnType<typeof normalizarMedidor>;
  readonly horometroFinal: ReturnType<typeof normalizarMedidor>;
  readonly horometroInicialCrudo: string;
  readonly horometroFinalCrudo: string;
  readonly duracionDeclarada: number | null;
  readonly observaciones: string;
  readonly recibo: string;
}

export function mapHorasHombre(fila: FilaCruda): FilaHorasHombre {
  const c = fila.celdas;
  const hi = normalizarMedidor(c["Horómetro Inicial"]);
  const hf = normalizarMedidor(c["Horómetro Final"]);
  const dur = normalizarMedidor(c["Hora"]);
  return {
    filaExcel: fila.filaExcel,
    filaId: fila.filaId,
    codigoCrudo: texto(c["Cargador"]),
    fechaHecho: aIso(c["Fecha"]),
    cliente: texto(c["Cliente1"] ?? c["Cliente"]),
    operacion: texto(c["Operación"]),
    material: texto(c["Material"]),
    area: texto(c["Área"]),
    propioTercerizado: texto(c["Cargador propio o tercerizado"]),
    turno: texto(c["Turno"]),
    operador: texto(c["Operador de Máquina"]),
    supervisor: texto(c["Supervisor"] ?? c["Supervisor1"]),
    horometroInicial: hi,
    horometroFinal: hf,
    horometroInicialCrudo: texto(c["Horómetro Inicial"]),
    horometroFinalCrudo: texto(c["Horómetro Final"]),
    duracionDeclarada: dur ? dur.valor : null,
    observaciones: texto(c["Observaciones"]),
    recibo: texto(c["Recibo"]),
  };
}

export interface FilaPmp {
  readonly filaExcel: number;
  readonly filaId: string;
  readonly codigoCrudo: string;
  readonly fechaHecho: string | null;
  readonly horometro: ReturnType<typeof normalizarMedidor>;
  readonly estadoEquipo: string;
  readonly tipoMantenimiento: "RUTINA" | "CORRECTIVO" | string;
  readonly rutina: string;
  readonly tecnicos: string[];
  readonly items: Array<{ etiqueta: string; valor: string }>;
  // Campos de correctivo (vacíos si es RUTINA).
  readonly sistemaSubsistema: string;
  readonly modoFalla: string;
  readonly efectoFalla: string;
  readonly descripcionFalla: string;
  readonly descripcionActividades: string;
  readonly tiempoReparacion: number | null;
  readonly downtime: number | null;
  readonly supervisor: string;
  readonly observaciones: string;
}

const CAMPOS_NO_ITEM_PMP = new Set([
  "Id", "Hora de inicio", "Hora de finalización", "Correo electrónico", "Nombre",
  "Fecha PMP", "Cargador", "Montacarga", "Horómetro Actual", "Estado",
  "Técnico # 1", "Técnico # 2", "MANTENIMINETO A REALIZAR", "MANTENIMIENTO A REALIZAR",
  "Rutina a Realizar", "Centro de costo", "SISTEMA-SUBSISTEMA AFECTADO",
  "Descripción de la falla Existente", "Descripción de Actividades a Realizar",
  "Tiempo de reparación EN HORAS", "Downtime (Tiempo inoperante) EN HORAS",
  "Supervisor", "Supervisor1", "Observaciones", "Observaciones1", "Mecánico Ejecutor",
]);

function buscarCol(c: Record<string, unknown>, sub: string): unknown {
  const k = Object.keys(c).find((x) => x.toLowerCase().includes(sub.toLowerCase()));
  return k ? c[k] : undefined;
}

export function mapPmp(fila: FilaCruda): FilaPmp {
  const c = fila.celdas;
  const items: FilaPmp["items"] = [];
  for (const [k, v] of Object.entries(c)) {
    if (CAMPOS_NO_ITEM_PMP.has(k)) continue;
    if (/modo de falla|efecto de falla/i.test(k)) continue;
    const val = texto(v);
    if (val === "") continue;
    if (/^(CUMPLE|NO CUMPLE)$/i.test(val)) items.push({ etiqueta: k, valor: val.toUpperCase() });
  }
  const tec: string[] = [];
  for (const t of [texto(c["Técnico # 1"]), texto(c["Técnico # 2"])]) if (t) tec.push(t);
  const tr = normalizarMedidor(c["Tiempo de reparación EN HORAS"]);
  const dt = normalizarMedidor(buscarCol(c, "Downtime"));
  return {
    filaExcel: fila.filaExcel,
    filaId: fila.filaId,
    codigoCrudo: texto(c["Cargador"] ?? c["Montacargas"] ?? c["Montacarga"]),
    fechaHecho: aIso(c["Fecha PMP"]),
    horometro: normalizarMedidor(c["Horómetro Actual"]),
    estadoEquipo: texto(c["Estado"]),
    tipoMantenimiento: texto(c["MANTENIMINETO A REALIZAR"] ?? c["MANTENIMIENTO A REALIZAR"]).toUpperCase(),
    rutina: texto(c["Rutina a Realizar"]),
    tecnicos: tec,
    items,
    sistemaSubsistema: texto(c["SISTEMA-SUBSISTEMA AFECTADO"]),
    modoFalla: texto(buscarCol(c, "MODO DE FALLA")),
    efectoFalla: texto(buscarCol(c, "EFECTO DE FALLA")),
    descripcionFalla: texto(c["Descripción de la falla Existente"]),
    descripcionActividades: texto(c["Descripción de Actividades a Realizar"]),
    tiempoReparacion: tr ? tr.valor : null,
    downtime: dt ? dt.valor : null,
    supervisor: texto(c["Supervisor"] ?? c["Supervisor1"]),
    observaciones: texto(c["Observaciones"] ?? c["Observaciones1"]),
  };
}
