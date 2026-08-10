/**
 * DGP-016 · DefinicionIndicador — aggregate DECLARATIVO por tenant.
 *
 * Un indicador NUNCA es código: es una descripción declarativa (clave, categoría,
 * fuente declarativa módulo+dataset, expresión de cálculo, unidad, formato,
 * umbrales, metas por periodo). El versionado es INMUTABLE: cada `actualizar`
 * produce una nueva versión; el número de versión sólo crece.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { INDICADOR_ACTUALIZADO, INDICADOR_DEFINIDO, INDICADOR_HABILITADO } from "./events";
import type { ExpresionCalculo } from "./expresion";

/** Fuente declarativa de datos: módulo + dataset expuesto por su puerto read-only. */
export interface FuenteDeclarativa {
  /** Clave de módulo/fuente: ordenes|inventario|activos|correctivo|preventivo|abastecimiento|planes|timeline. */
  readonly modulo: string;
  /** Dataset dentro del módulo (p.ej. "ordenes", "movimientos", "eventos-activo"). */
  readonly dataset: string;
}

/** Umbrales de semáforo (bueno/alerta/crítico). Neutro respecto a la dirección. */
export interface Umbrales {
  /** Si true, valores ALTOS son buenos (disponibilidad); si false, bajos son buenos (MTTR). */
  readonly mayorEsMejor: boolean;
  readonly bueno: number;
  readonly alerta: number;
  readonly critico: number;
}

/** Meta por periodo (valor objetivo). */
export interface MetaPeriodo {
  readonly periodo: string;
  readonly valor: number;
}

export type SemaforoNivel = "bueno" | "alerta" | "critico";

export interface DefinicionIndicador {
  readonly id: string;
  readonly tenantId: string;
  readonly clave: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly categoria: string;
  readonly fuente: FuenteDeclarativa;
  readonly expresion: ExpresionCalculo;
  readonly unidad: string;
  readonly formato: string;
  readonly umbrales: Umbrales | null;
  readonly metas: readonly MetaPeriodo[];
  readonly habilitado: boolean;
  /** Versión INMUTABLE: sólo crece. */
  readonly version: number;
  readonly actualizadoAt: string;
  readonly actorId: string;
  /** true ⇒ definición del catálogo del sistema (canónica); false ⇒ del tenant. */
  readonly delSistema: boolean;
}

export interface EntradaDefinicion {
  readonly id: string;
  readonly tenantId: string;
  readonly clave: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly categoria: string;
  readonly fuente: FuenteDeclarativa;
  readonly expresion: ExpresionCalculo;
  readonly unidad: string;
  readonly formato: string;
  readonly umbrales?: Umbrales | null;
  readonly metas?: readonly MetaPeriodo[];
  readonly delSistema?: boolean;
  readonly actorId: string;
  readonly ahora: string;
}

interface Evento {
  readonly tipo: string;
  readonly payload: Record<string, unknown>;
}

function payloadDe(d: DefinicionIndicador, eventoTipo: string): Record<string, unknown> {
  return {
    tenantId: d.tenantId,
    id: d.id,
    entityRef: `indicador:${d.id}`,
    clave: d.clave,
    nombre: d.nombre,
    descripcion: d.descripcion,
    categoria: d.categoria,
    fuente: d.fuente,
    expresion: d.expresion,
    unidad: d.unidad,
    formato: d.formato,
    umbrales: d.umbrales,
    metas: d.metas,
    habilitado: d.habilitado,
    version: d.version,
    delSistema: d.delSistema,
    actorId: d.actorId,
    actualizadoAt: d.actualizadoAt,
    eventoTipo,
  };
}

function validarUmbrales(u: Umbrales | null | undefined): Result<Umbrales | null, KernelError> {
  if (!u) return ok(null);
  for (const [k, v] of Object.entries({ bueno: u.bueno, alerta: u.alerta, critico: u.critico })) {
    if (typeof v !== "number" || Number.isNaN(v)) return fail(KernelErrors.validation(`Umbral "${k}" inválido`));
  }
  return ok(Object.freeze({ ...u }));
}

/** Crea una definición de indicador en su versión 1. */
export function crearDefinicion(input: EntradaDefinicion): Result<{ definicion: DefinicionIndicador; evento: Evento }, KernelError> {
  if (input.clave.trim() === "") return fail(KernelErrors.validation("La clave del indicador es obligatoria"));
  if (input.nombre.trim() === "") return fail(KernelErrors.validation("El nombre del indicador es obligatorio"));
  const u = validarUmbrales(input.umbrales);
  if (!u.ok) return u;
  const definicion: DefinicionIndicador = Object.freeze({
    id: input.id,
    tenantId: input.tenantId,
    clave: input.clave,
    nombre: input.nombre,
    descripcion: input.descripcion ?? null,
    categoria: input.categoria,
    fuente: Object.freeze({ ...input.fuente }),
    expresion: input.expresion,
    unidad: input.unidad,
    formato: input.formato,
    umbrales: u.value,
    metas: Object.freeze([...(input.metas ?? [])]),
    habilitado: true,
    version: 1,
    actualizadoAt: input.ahora,
    actorId: input.actorId,
    delSistema: input.delSistema ?? false,
  });
  return ok({ definicion, evento: { tipo: INDICADOR_DEFINIDO, payload: payloadDe(definicion, INDICADOR_DEFINIDO) } });
}

export interface CambiosDefinicion {
  nombre?: string;
  descripcion?: string | null;
  categoria?: string;
  fuente?: FuenteDeclarativa;
  expresion?: ExpresionCalculo;
  unidad?: string;
  formato?: string;
  umbrales?: Umbrales | null;
  metas?: readonly MetaPeriodo[];
}

/** Produce una NUEVA versión inmutable de la definición (versión = anterior + 1). */
export function actualizarDefinicion(
  actual: DefinicionIndicador,
  cambios: CambiosDefinicion,
  actorId: string,
  ahora: string,
): Result<{ definicion: DefinicionIndicador; evento: Evento }, KernelError> {
  const u = cambios.umbrales !== undefined ? validarUmbrales(cambios.umbrales) : ok(actual.umbrales);
  if (!u.ok) return u;
  const definicion: DefinicionIndicador = Object.freeze({
    ...actual,
    nombre: cambios.nombre ?? actual.nombre,
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion : actual.descripcion,
    categoria: cambios.categoria ?? actual.categoria,
    fuente: cambios.fuente ? Object.freeze({ ...cambios.fuente }) : actual.fuente,
    expresion: cambios.expresion ?? actual.expresion,
    unidad: cambios.unidad ?? actual.unidad,
    formato: cambios.formato ?? actual.formato,
    umbrales: u.value,
    metas: cambios.metas ? Object.freeze([...cambios.metas]) : actual.metas,
    version: actual.version + 1,
    actualizadoAt: ahora,
    actorId,
  });
  return ok({ definicion, evento: { tipo: INDICADOR_ACTUALIZADO, payload: payloadDe(definicion, INDICADOR_ACTUALIZADO) } });
}

/** Habilita/deshabilita una definición (nueva versión inmutable). */
export function habilitarDefinicion(
  actual: DefinicionIndicador,
  habilitado: boolean,
  actorId: string,
  ahora: string,
): Result<{ definicion: DefinicionIndicador; evento: Evento }, KernelError> {
  const definicion: DefinicionIndicador = Object.freeze({
    ...actual,
    habilitado,
    version: actual.version + 1,
    actualizadoAt: ahora,
    actorId,
  });
  return ok({ definicion, evento: { tipo: INDICADOR_HABILITADO, payload: payloadDe(definicion, INDICADOR_HABILITADO) } });
}

/** Clasifica un valor según los umbrales (semáforo). */
export function clasificarSemaforo(umbrales: Umbrales | null, valor: number): SemaforoNivel | null {
  if (!umbrales) return null;
  if (umbrales.mayorEsMejor) {
    if (valor >= umbrales.bueno) return "bueno";
    if (valor >= umbrales.alerta) return "alerta";
    return "critico";
  }
  if (valor <= umbrales.bueno) return "bueno";
  if (valor <= umbrales.alerta) return "alerta";
  return "critico";
}

/** Cumplimiento de meta: valor / meta del periodo (o null si no hay meta). */
export function cumplimientoMeta(def: DefinicionIndicador, valor: number, periodo: string): number | null {
  const m = def.metas.find((x) => x.periodo === periodo);
  if (!m || m.valor === 0) return null;
  return valor / m.valor;
}
