/**
 * DGP-019.1 · Tipos TOLERANTES del read model de Utilización (frontend).
 *
 * Las respuestas GET del contrato son objetos opacos (sin propiedades
 * enumeradas): estos tipos describen la forma ESPERADA de manera tolerante
 * (campos opcionales) para la PRESENTACIÓN, alineada con la proyección del
 * backend (`lib/module-utilizacion/src/projection.ts`), sin acoplar el frontend
 * a un esquema de respuesta que el contrato deja libre. Los cuerpos de comando
 * (POST) sí coinciden EXACTAMENTE con los esquemas del OpenAPI congelado.
 */

/** Fila de lectura del read model (horómetro/odómetro). */
export interface LecturaRow {
  readonly id: string;
  readonly activoId?: string;
  readonly tipoMedidor?: string;
  readonly valor?: number;
  readonly unidad?: string;
  readonly fechaHora?: string;
  readonly identityId?: string;
  readonly origen?: string;
  readonly estado?: string;
  readonly inconsistente?: boolean;
  readonly sincronizacionActivo?: string;
  /** Motivo visible cuando la sincronización falló (o la anulación). */
  readonly motivo?: string | null;
  readonly actualizadoAt?: string;
  readonly [k: string]: unknown;
}

/** Fila de tanqueo del read model (combustible). */
export interface TanqueoRow {
  readonly id: string;
  readonly activoId?: string;
  readonly fechaHora?: string;
  readonly litros?: number;
  readonly tipoCombustible?: string;
  readonly precioUnitario?: number | null;
  readonly costoTotal?: number | null;
  readonly moneda?: string | null;
  readonly lecturaMedidorRef?: string | null;
  readonly proveedorId?: string | null;
  readonly estado?: string;
  readonly observacion?: string | null;
  readonly actualizadoAt?: string;
  readonly [k: string]: unknown;
}

/**
 * Resultado de un cálculo de utilización/consumo (contrato `ResultadoCalculo`).
 * `tipo: "sin-datos"` es la representación CONTRACTUAL de la ausencia de datos:
 * el frontend NUNCA la sustituye por 0 (mandato §7/§18).
 */
export interface ResultadoCalculo {
  readonly tipo: "valor" | "sin-datos";
  readonly valor?: number | null;
  readonly motivo?: string | null;
}

/** Resumen operacional por activo (contrato `Resumen`). */
export interface ResumenActivo {
  readonly activoId: string;
  readonly lecturas?: number;
  readonly tanqueos?: number;
  readonly deltaHorometro?: ResultadoCalculo;
  readonly deltaOdometro?: ResultadoCalculo;
  readonly litrosTotal?: number | null;
  readonly costoTotal?: number | null;
  readonly litrosPorHora?: ResultadoCalculo;
  readonly litrosPor100Km?: ResultadoCalculo;
  readonly costoPorHora?: ResultadoCalculo;
  readonly costoPorKm?: ResultadoCalculo;
  readonly [k: string]: unknown;
}

/** Última lectura de un medidor (contrato `GET /ultima-lectura`). */
export interface UltimaLectura {
  readonly activoId?: string;
  readonly tipoMedidor?: string;
  readonly valor?: number;
  readonly unidad?: string;
  readonly fechaHora?: string;
  readonly [k: string]: unknown;
}

/** Opción de un catálogo del tenant (`GET /catalogos/{catalogo}`). */
export interface OpcionCatalogo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly habilitado?: boolean;
  readonly [k: string]: unknown;
}

/** Evento del flujo del módulo (event log). */
export interface EventoUtilizacion {
  readonly id?: string;
  readonly tipo?: string;
  readonly ocurridoEn?: string;
  readonly [k: string]: unknown;
}
