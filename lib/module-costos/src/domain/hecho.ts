/**
 * DGP-021.1 · HECHO ECONÓMICO de mantenimiento — DOMINIO PURO.
 *
 * Un HECHO ECONÓMICO es la materialización AUDITABLE e INMUTABLE de un costo
 * exacto atribuible a una OT (y, cuando la relación canónica lo permite, a un
 * activo). Separa deliberadamente:
 *   - IDENTIDAD DEL HECHO: costoId, tipo, origen (originType/originId), OT, activo,
 *     identityId (sólo cuando aplica), opId de materialización.
 *   - DATOS SNAPSHOT (congelados al materializar): fecha, cantidad, unidad,
 *     costoUnitario, costoTotal, moneda y `snapshot` (copia cruda de la fuente).
 *   - CICLO DE VIDA AUDITABLE: estado ACTIVO/ANULADO (append-only; nunca se borra
 *     ni edita silenciosamente) + metadatos de registro/anulación.
 *
 * INVARIANTE DE INMUTABILIDAD (caso test §25.13): una vez materializado, cambiar
 * el precio en el módulo ORIGEN NO altera este hecho — sus importes son un
 * snapshot en punto fijo. La única transición posible es ACTIVO → ANULADO.
 *
 * PROHIBIDO en la fundación: costo total OT/activo, costo/hora, costo/km,
 * agregados o KPIs. Este módulo materializa HECHOS; NO los suma.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { multiplicar, normalizarImporte, type Dinero } from "./dinero";

/**
 * TIPOS de hecho económico PREPARADOS por la fundación. Sólo se MATERIALIZAN
 * los tipos con una fuente de verdad accesible SIN duplicar el módulo origen:
 *  - MATERIAL: snapshot del costo exacto de Abastecimiento (DGP-021.0).
 *  - OTROS: costo manual autorizado con importe explícito (única fuente manual).
 * MANO_DE_OBRA y COMBUSTIBLE quedan DECLARADOS pero SIN comando de
 * materialización: sus hechos ya son snapshots en su módulo ORIGEN y copiarlos
 * aquí sería duplicar la fuente de verdad (prohibido). Su ingreso llegará por
 * orquestación en fases posteriores, nunca leyendo tablas ajenas.
 */
export const TIPOS_HECHO = ["MATERIAL", "COMBUSTIBLE", "MANO_DE_OBRA", "OTROS"] as const;
export type TipoHecho = (typeof TIPOS_HECHO)[number];

/** Tipos que la FUNDACIÓN materializa con comando propio (verificable E2E). */
export const TIPOS_MATERIALIZABLES = ["MATERIAL", "OTROS"] as const;
export type TipoMaterializable = (typeof TIPOS_MATERIALIZABLES)[number];

export function esTipoMaterializable(t: string): t is TipoMaterializable {
  return (TIPOS_MATERIALIZABLES as readonly string[]).includes(t);
}

/** Estados mínimos auditables (§directiva). Sin workflow: sólo ACTIVO/ANULADO. */
export const ESTADOS_HECHO = ["ACTIVO", "ANULADO"] as const;
export type EstadoHecho = (typeof ESTADOS_HECHO)[number];

/**
 * ORIGEN auditable del hecho: tipo de fuente + identificador canónico en esa
 * fuente. NUNCA texto libre como único rastro. Ejemplos:
 *  - MATERIAL: originType="abastecimiento.costo-exacto", originId=articuloId.
 *  - OTROS: originType="manual", originId=referencia externa del autorizante.
 */
export interface OrigenHecho {
  readonly originType: string;
  readonly originId: string;
}

/** IDENTIDAD del hecho (no cambia jamás). */
export interface IdentidadHecho {
  readonly costoId: string;
  readonly tenantId: string;
  readonly tipo: TipoHecho;
  readonly origen: OrigenHecho;
  readonly otId: string;
  /** Derivado de la relación canónica OT→activo; null sólo si la OT no tiene activo principal. */
  readonly activoId: string | null;
  /** Identidad canónica atribuible (p.ej. autorizante de OTROS). null si no aplica. */
  readonly identityId: string | null;
  /**
   * DGP-021.2 · Trazabilidad de ORIGEN FÍSICO. Movimiento de inventario que
   * originó el hecho (MATERIAL vía orquestación). Es la identidad determinista
   * movimiento→hecho: `opId = "inv:" + movimientoId` garantiza 1 hecho por
   * movimiento. NULL cuando el hecho NO proviene de un movimiento (p.ej. OTROS).
   */
  readonly movimientoId: string | null;
  /**
   * DGP-021.2 · Artículo/ítem del hecho (read model «por artículo»). Para
   * MATERIAL es el `articuloId` de Abastecimiento (== `itemId` de inventario);
   * NULL cuando no aplica.
   */
  readonly articuloId: string | null;
  /** opId de la materialización (idempotencia durable). */
  readonly opId: string;
}

/** DATOS SNAPSHOT del hecho (congelados; punto fijo string-safe). */
export interface SnapshotHecho {
  /** Cantidad materializada, en punto fijo (string). */
  readonly cantidad: Dinero;
  readonly unidad: string;
  /** Costo unitario exacto en el momento de materializar (string). */
  readonly costoUnitario: Dinero;
  /** costoTotal = cantidad × costoUnitario (derivado; string). */
  readonly costoTotal: Dinero;
  readonly moneda: string;
  /** Copia CRUDA de la fuente (auditoría del origen; nunca se recalcula). */
  readonly fuente: Record<string, unknown>;
  /** Fecha en que el costo OCURRIÓ (device/fuente-time). */
  readonly ocurridoAt: string;
}

/** Metadatos de ciclo de vida auditable. */
export interface AuditoriaHecho {
  readonly estado: EstadoHecho;
  readonly registradoAt: string;
  readonly registradoPor: string;
  readonly anuladoAt: string | null;
  readonly anuladoPor: string | null;
  readonly motivoAnulacion: string | null;
}

/** HECHO ECONÓMICO completo (identidad + snapshot + auditoría). */
export interface HechoEconomico extends IdentidadHecho, AuditoriaHecho {
  readonly snapshot: SnapshotHecho;
}

/** Entrada de materialización (validada y normalizada por {@link materializar}). */
export interface EntradaMaterializar {
  readonly costoId: string;
  readonly tenantId: string;
  readonly tipo: TipoMaterializable;
  readonly origen: OrigenHecho;
  readonly otId: string;
  readonly activoId: string | null;
  readonly identityId: string | null;
  /** DGP-021.2 · Movimiento de inventario de origen (null si no aplica). */
  readonly movimientoId?: string | null;
  /** DGP-021.2 · Artículo/ítem del hecho (null si no aplica). */
  readonly articuloId?: string | null;
  readonly opId: string;
  readonly cantidad: Dinero;
  readonly unidad: string;
  readonly costoUnitario: Dinero;
  readonly moneda: string;
  readonly fuente: Record<string, unknown>;
  readonly ocurridoAt: string;
  readonly registradoAt: string;
  readonly registradoPor: string;
}

/**
 * Construye un HECHO ECONÓMICO ACTIVO con su snapshot congelado. Valida el
 * formato string-safe de cantidad y costo unitario y DERIVA el costo total en
 * punto fijo exacto. Falla cerrado ante importes no-string o mal formados.
 */
export function materializar(e: EntradaMaterializar): Result<HechoEconomico, KernelError> {
  if (e.moneda.trim() === "") return fail(KernelErrors.validation("La moneda del hecho es obligatoria"));
  if (e.unidad.trim() === "") return fail(KernelErrors.validation("La unidad del hecho es obligatoria"));
  if (e.origen.originType.trim() === "" || e.origen.originId.trim() === "") {
    return fail(KernelErrors.validation("El origen del hecho (originType/originId) es obligatorio y no puede ser texto libre vacío"));
  }
  const cantidad = normalizarImporte(e.cantidad);
  if (!cantidad.ok) return cantidad;
  const unitario = normalizarImporte(e.costoUnitario);
  if (!unitario.ok) return unitario;
  const total = multiplicar(cantidad.value, unitario.value);
  if (!total.ok) return total;

  return ok({
    costoId: e.costoId,
    tenantId: e.tenantId,
    tipo: e.tipo,
    origen: e.origen,
    otId: e.otId,
    activoId: e.activoId,
    identityId: e.identityId,
    movimientoId: e.movimientoId ?? null,
    articuloId: e.articuloId ?? null,
    opId: e.opId,
    estado: "ACTIVO",
    registradoAt: e.registradoAt,
    registradoPor: e.registradoPor,
    anuladoAt: null,
    anuladoPor: null,
    motivoAnulacion: null,
    snapshot: {
      cantidad: cantidad.value,
      unidad: e.unidad,
      costoUnitario: unitario.value,
      costoTotal: total.value,
      moneda: e.moneda,
      fuente: e.fuente,
      ocurridoAt: e.ocurridoAt,
    },
  });
}

/**
 * Anula un hecho ACTIVO (append-only, auditable). El snapshot y los importes
 * NO se tocan: sólo cambia el estado y se añaden los metadatos de anulación.
 * Un hecho YA ANULADO no se puede reanular (idempotencia de negocio en comando).
 */
export function anular(
  hecho: HechoEconomico,
  anuladoPor: string,
  anuladoAt: string,
  motivo: string,
): Result<HechoEconomico, KernelError> {
  if (hecho.estado === "ANULADO") {
    return fail(KernelErrors.conflict("El hecho económico ya está ANULADO"));
  }
  if (motivo.trim() === "") {
    return fail(KernelErrors.validation("La anulación requiere un motivo auditable"));
  }
  return ok({ ...hecho, estado: "ANULADO", anuladoAt, anuladoPor, motivoAnulacion: motivo });
}
