/**
 * DELTAOPS LITE-08 §23 · Composición PURA de «¿Qué necesita tu atención?».
 *
 * Deriva, a partir de read models YA existentes (Órdenes vía `ResumenOperacional`,
 * hallazgos de preoperacional vía `ResumenHallazgos`, y activos «fuera de
 * servicio» vía el listado de Activos), la lista PRIORIZADA de señales que
 * requieren atención del operador. No abre endpoints ni contiene lógica de
 * dominio: sólo cuenta y ordena por severidad. Prohibido BI (sin tendencias ni
 * KPIs financieros): son conteos accionables del estado puntual del tenant.
 *
 * Orden de prioridad ESTRICTO (§23):
 *   1. Mantenimiento vencido (OT con SLA vencido)
 *   2. Preoperacionales / hallazgos pendientes de gestionar
 *   3. Órdenes pendientes (sin ejecutar)
 *   4. Órdenes sin asignar / críticas
 *   5. Equipos fuera de servicio
 *
 * GAP-HOME-RUTINAS: «rutinas próximas» a nivel de TODOS los equipos exige un
 * agregado read-only nuevo (evaluar frecuencias por activo × plan con medidores
 * server-side, N×M). Se documenta en el CIERRE y se ofrece como acceso a la
 * superficie de Equipos/Planes en lugar de forzar un agregado costoso aquí.
 */
import type { ResumenOperacional } from "./resumen";
import type { ResumenHallazgos } from "../hallazgo/tipos";

/** Señal accionable priorizada del inicio operacional. */
export interface SenalAtencion {
  readonly clave: string;
  readonly tono: "error" | "advertencia" | "info";
  readonly titulo: string;
  readonly cantidad: number;
  /** Ruta accionable (deep link a una superficie/bandeja REAL existente). */
  readonly ruta: string;
}

export interface EntradaAtencion {
  /** Resumen de Órdenes (null si el módulo no está habilitado). */
  readonly resumen: ResumenOperacional | null;
  /** Resumen de hallazgos de preoperacional (null si no aplica). */
  readonly hallazgos: ResumenHallazgos | null;
  /** Nº de equipos en estado «fuera de servicio» (0 si no aplica). */
  readonly equiposFueraServicio: number;
  /** Rutas de bandejas (inyectadas por el llamador para no acoplar deep-links). */
  readonly rutas: {
    readonly slaVencido: string;
    readonly pendientes: string;
    readonly sinAsignar: string;
    readonly criticas: string;
    readonly hallazgosPendientes: string;
    readonly equiposFuera: string;
  };
}

/**
 * Construye la lista priorizada de señales de atención. Sólo incluye señales con
 * cantidad > 0 (nunca ruido cero). Devuelve [] cuando «todo bajo control».
 */
export function atencionHome(entrada: EntradaAtencion): SenalAtencion[] {
  const { resumen, hallazgos, equiposFueraServicio, rutas } = entrada;
  const senales: SenalAtencion[] = [];

  // 1 · Mantenimiento vencido (máxima prioridad).
  if (resumen && resumen.vencidas.length > 0) {
    senales.push({
      clave: "mantenimiento-vencido",
      tono: "error",
      titulo: "Mantenimiento vencido",
      cantidad: resumen.vencidas.length,
      ruta: rutas.slaVencido,
    });
  }

  // 2 · Preoperacionales / hallazgos pendientes de gestionar.
  if (hallazgos && hallazgos.hallazgosPendientes > 0) {
    senales.push({
      clave: "hallazgos-pendientes",
      tono: "advertencia",
      titulo: "Hallazgos de preoperacional pendientes",
      cantidad: hallazgos.hallazgosPendientes,
      ruta: rutas.hallazgosPendientes,
    });
  }

  // 3 · Órdenes pendientes (abiertas sin ejecutar).
  if (resumen && resumen.pendientes.length > 0) {
    senales.push({
      clave: "ordenes-pendientes",
      tono: "advertencia",
      titulo: "Órdenes pendientes",
      cantidad: resumen.pendientes.length,
      ruta: rutas.pendientes,
    });
  }

  // 4 · Órdenes sin asignar y críticas.
  if (resumen && resumen.sinAsignar.length > 0) {
    senales.push({
      clave: "sin-asignar",
      tono: "advertencia",
      titulo: "Órdenes sin asignar",
      cantidad: resumen.sinAsignar.length,
      ruta: rutas.sinAsignar,
    });
  }
  if (resumen && resumen.criticas.length > 0) {
    senales.push({
      clave: "criticas",
      tono: "info",
      titulo: "Órdenes críticas abiertas",
      cantidad: resumen.criticas.length,
      ruta: rutas.criticas,
    });
  }

  // 5 · Equipos fuera de servicio.
  if (equiposFueraServicio > 0) {
    senales.push({
      clave: "equipos-fuera-servicio",
      tono: "error",
      titulo: "Equipos fuera de servicio",
      cantidad: equiposFueraServicio,
      ruta: rutas.equiposFuera,
    });
  }

  return senales;
}
