/**
 * DGP-020.3 · Mano de obra por ACTIVO (§18/§34, «si corresponde»).
 *
 * Consulta las valoraciones filtradas por `activoId` (el backend deriva el
 * activo de la OT/sesión; el frontend NO envía un activo arbitrario, §12). Vista
 * de sólo lectura: OT, técnico, tiempo efectivo, costo y estado de valoración.
 * NO construye dashboards de costos (§18/§44): sólo la base consultable.
 */
import React from "react";
import { Card, CardContent, Badge, Spinner, EmptyState, ErrorState } from "@workspace/design-system";
import { useSesion } from "../identidad/sesion";
import { capacidadesManoDeObra } from "./capacidades";
import { useValoraciones } from "./hooks";
import {
  formatearTiempo,
  costoPresentacion,
  nombrePresentacion,
  ETIQUETA_VALORACION,
  TONO_VALORACION,
  SIN_TARIFA_TEXTO,
} from "./formato";
import type { Valoracion } from "./tipos";

function Fila({ v }: { v: Valoracion }) {
  const hayTarifa = v.estado === "VALORADA" && v.costo != null;
  // Sesión sin snapshot de valoración: horas visibles, costo honesto (nunca «$0»
  // ni «Sin tarifa» falso). EN_CURSO = trabajo activo; PENDIENTE = cerrada por
  // valorar.
  const textoCosto =
    v.estado === "EN_CURSO" ? "En curso" : v.estado === "PENDIENTE" ? "Pendiente de valorar" : SIN_TARIFA_TEXTO;
  return (
    <li
      style={{
        listStyle: "none",
        border: "1px solid var(--do-borde)",
        borderRadius: "var(--do-radius-md)",
        padding: "var(--do-sp-3)",
        display: "grid",
        gap: "var(--do-sp-3)",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))",
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Orden</div>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{v.ordenId}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Técnico</div>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{nombrePresentacion(v.nombre, v.identityId)}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Tiempo efectivo</div>
        <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatearTiempo(v.efectivoMs)}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Costo</div>
        <div style={{ fontWeight: 600 }}>
          {hayTarifa ? costoPresentacion(v.costo, v.moneda, true) : <span style={{ color: "var(--do-texto-suave)" }}>{textoCosto}</span>}
        </div>
      </div>
      <div>
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Estado</div>
        <Badge variant={TONO_VALORACION[v.estado] ?? "neutro"}>{ETIQUETA_VALORACION[v.estado] ?? v.estado}</Badge>
      </div>
    </li>
  );
}

export interface VistaManoDeObraActivoProps {
  readonly valoraciones: readonly Valoracion[];
  readonly cargando?: boolean;
  readonly error?: string | null;
  readonly onReintentar?: () => void;
}

/** Núcleo presentacional puro. */
export function VistaManoDeObraActivo({ valoraciones, cargando, error, onReintentar }: VistaManoDeObraActivoProps) {
  if (cargando && valoraciones.length === 0) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  }
  if (error) {
    return <ErrorState titulo="No se pudo cargar la mano de obra" descripcion={error} onReintentar={onReintentar} />;
  }
  if (valoraciones.length === 0) {
    return (
      <Card><CardContent>
        <EmptyState titulo="Sin mano de obra" descripcion="Este activo aún no tiene sesiones de trabajo valoradas." />
      </CardContent></Card>
    );
  }
  return (
    <ul style={{ margin: 0, padding: 0, display: "grid", gap: "var(--do-sp-3)" }}>
      {valoraciones.map((v) => <Fila key={v.sesionId} v={v} />)}
    </ul>
  );
}

/** Tab conectado del detalle de activo. */
export function ManoDeObraActivo({ activoId }: { activoId: string }) {
  const { sesion } = useSesion();
  const capacidades = capacidadesManoDeObra(sesion);
  const valoraciones = useValoraciones(capacidades.leer ? { activoId } : {});

  if (!capacidades.leer) return null;

  return (
    <VistaManoDeObraActivo
      valoraciones={valoraciones.datos ?? []}
      cargando={valoraciones.cargando}
      error={valoraciones.error ? valoraciones.error.message : null}
      onReintentar={valoraciones.recargar}
    />
  );
}
