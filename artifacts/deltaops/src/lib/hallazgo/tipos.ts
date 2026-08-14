/**
 * DELTAOPS LITE-05 · Tipos del bucle Hallazgo→OT. Reflejan EXACTAMENTE lo que el
 * backend resuelve/sella; el cliente no infiere estado ni procedencia.
 */
export type EstadoHallazgo = "pendiente" | "convertido" | "descartado";

export interface ProcedenciaHallazgo {
  hallazgoId: string;
  ejecucionId: string;
  itemClave: string;
  origen: "preoperacional";
  activo: {
    id: string;
    codigoEmpresarial: string;
    nombre: string;
    tipo: string;
    criticidad: string | null;
    centroCosto: string | null;
    ubicacionId: string | null;
    responsable: string | null;
  };
  item: {
    clave: string;
    etiqueta: string;
    critico: boolean;
    comentario?: string;
    evidencias?: string[];
  };
  respuestaId: string;
  plantilla: { clave: string; version: number; titulo: string | null };
  preoperacional: { selladoPor: string; selladoAt: string; veredicto: string };
}

export interface EstadoHallazgoResuelto {
  estado: EstadoHallazgo;
  ordenTrabajoId: string | null;
  solicitudId: string;
  descarte:
    | {
        motivo?: string | null;
        descartadoPor?: string;
        descartadoAt?: string;
      }
    | null;
  procedencia: ProcedenciaHallazgo;
}

/**
 * §15 · Resumen accionable por tenant, derivado en SERVIDOR por composición de
 * lectura sobre ejecuciones preoperacionales selladas + generaciones + descartes.
 */
export interface ResumenHallazgos {
  hallazgosPendientes: number;
  mantenimientosDerivados: number;
  descartados: number;
  totalHallazgos: number;
  ejecucionesInspeccionadas: number;
  acotado: boolean;
}
