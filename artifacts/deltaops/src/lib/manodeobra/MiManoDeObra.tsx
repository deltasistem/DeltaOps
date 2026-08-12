/**
 * DGP-020.3 · «Mi mano de obra» — experiencia del TÉCNICO (§35).
 *
 * El técnico ve SUS sesiones/valoraciones: OT, tiempo efectivo, estado de
 * valoración y costo (si el contrato lo hace visible). SIN CTAs de tarifas ni
 * valoración manual (§35): sólo lectura de lo suyo. La identidad la resuelve el
 * backend (`/mias`, match canónico estricto); el frontend nunca la envía.
 *
 * Móvil primero (§38) y tema por tokens (§39).
 */
import React from "react";
import { Card, CardContent, CardHeader, Badge, Spinner, Alert } from "@workspace/design-system";
import { useSesion } from "../identidad/sesion";
import { capacidadesManoDeObra } from "./capacidades";
import { useMiManoDeObra } from "./hooks";
import {
  formatearTiempo,
  costoPresentacion,
  ETIQUETA_VALORACION,
  TONO_VALORACION,
  SIN_TARIFA_TEXTO,
} from "./formato";
import type { Valoracion } from "./tipos";

function FilaMia({ v }: { v: Valoracion }) {
  const hayTarifa = v.estado === "VALORADA" && v.costo != null;
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
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Orden de trabajo</div>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{v.ordenId}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Tiempo efectivo</div>
        <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatearTiempo(v.efectivoMs)}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Costo</div>
        <div style={{ fontWeight: 600 }}>
          {hayTarifa
            ? costoPresentacion(v.costo, v.moneda, true)
            : <span style={{ color: "var(--do-texto-suave)" }}>{SIN_TARIFA_TEXTO}</span>}
        </div>
      </div>
      <div>
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Valoración</div>
        <Badge variant={TONO_VALORACION[v.estado] ?? "neutro"}>{ETIQUETA_VALORACION[v.estado] ?? v.estado}</Badge>
      </div>
    </li>
  );
}

export interface VistaMiManoDeObraProps {
  readonly valoraciones: readonly Valoracion[];
  readonly cargando?: boolean;
  readonly error?: string | null;
}

/** Núcleo presentacional puro. */
export function VistaMiManoDeObra({ valoraciones, cargando, error }: VistaMiManoDeObraProps) {
  const totalMs = valoraciones.reduce((acc, v) => acc + (v.efectivoMs ?? 0), 0);
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <strong>Mi mano de obra</strong>
          {valoraciones.length > 0 && (
            <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)", fontVariantNumeric: "tabular-nums" }}>
              Total efectivo: {formatearTiempo(totalMs)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div style={{ marginBottom: "var(--do-sp-3)" }}>
            <Alert variant="error" titulo="No se pudo cargar tu mano de obra">{error}</Alert>
          </div>
        )}
        {cargando && valoraciones.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-4)" }}>
            <Spinner />
          </div>
        ) : valoraciones.length === 0 ? (
          <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>
            Todavía no tienes sesiones de trabajo valoradas. Al cerrar una sesión, aquí verás tu tiempo efectivo y
            su valoración.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, display: "grid", gap: "var(--do-sp-3)" }}>
            {valoraciones.map((v) => (
              <FilaMia key={v.sesionId} v={v} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Vista conectada del técnico (`/mias`). Oculta si el rol no ve lo propio. */
export function MiManoDeObra() {
  const { sesion } = useSesion();
  const capacidades = capacidadesManoDeObra(sesion);
  const mias = useMiManoDeObra();

  if (!capacidades.verPropia) return null;

  return (
    <VistaMiManoDeObra
      valoraciones={mias.datos ?? []}
      cargando={mias.cargando}
      error={mias.error ? mias.error.message : null}
    />
  );
}
