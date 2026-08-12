/**
 * DGP-020.3 · Sección «Mano de obra» integrada en el DETALLE DE OT (§17/§34).
 *
 * Junto al panel de sesión, muestra por sesión CERRADA valorada: técnico
 * (nombre resuelto por backend), tiempo efectivo (del read model, NO se
 * recalcula), tarifa aplicada, costo (moneda de la valoración) y estado. La
 * ausencia de tarifa se muestra DIFERENCIADA de $0 (§15): «Sin tarifa
 * configurada», jamás «$0». Incluye resumen (tiempo/costo totales + aviso de
 * pendientes/sin tarifa) y, si hay sesión ABIERTA propia, «Costo estimado»
 * claramente etiquetado «Estimado» (§14/§29).
 *
 * Móvil primero (§38): tarjetas en pantallas estrechas; sin overflow. Tema
 * claro/oscuro por tokens (§39). RBAC de presentación (§22): CONSULTA/otros ven
 * lectura; nadie ve CTAs de tarifas aquí (eso vive en Administración).
 */
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, Badge, Alert, Spinner } from "@workspace/design-system";
import type { BadgeVariant } from "@workspace/design-system";
import { useSesion } from "../identidad/sesion";
import { useSesionActiva } from "../ordenes/hooks";
import { capacidadesManoDeObra } from "./capacidades";
import { useResumenManoDeObra, useCostoEstimado } from "./hooks";
import {
  formatearTiempo,
  formatearTarifa,
  costoPresentacion,
  nombrePresentacion,
  ETIQUETA_VALORACION,
  TONO_VALORACION,
  SIN_TARIFA_TEXTO,
} from "./formato";
import type { Resumen, Valoracion, CostoEstimado } from "./tipos";

/** Fila de dato compacta reutilizable. */
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>{etiqueta}</div>
      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{children}</div>
    </div>
  );
}

/** Tarjeta de una valoración (técnico / tiempo / tarifa / costo / estado). */
function TarjetaValoracion({ v, moneda }: { v: Valoracion; moneda?: string | null }) {
  const hayTarifa = v.estado === "VALORADA" && v.costo != null;
  const costo = costoPresentacion(v.costo, v.moneda ?? moneda, hayTarifa);
  const tarifa = v.tarifaValor != null
    ? formatearTarifa(v.tarifaValor, v.moneda ?? moneda, v.unidad)
    : SIN_TARIFA_TEXTO;
  const tono: BadgeVariant = TONO_VALORACION[v.estado] ?? "neutro";
  const sinTarifa = v.estado === "SIN_TARIFA";
  return (
    <li
      style={{
        listStyle: "none",
        border: "1px solid var(--do-borde)",
        borderRadius: "var(--do-radius-md)",
        padding: "var(--do-sp-3)",
        display: "grid",
        gap: "var(--do-sp-3)",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))",
        alignItems: "start",
      }}
    >
      <Dato etiqueta="Técnico">{nombrePresentacion(v.nombre, v.identityId)}</Dato>
      <Dato etiqueta="Tiempo efectivo">
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatearTiempo(v.efectivoMs)}</span>
      </Dato>
      <Dato etiqueta="Tarifa aplicada">
        <span style={sinTarifa ? { color: "var(--do-texto-suave)" } : undefined}>{tarifa}</span>
      </Dato>
      <Dato etiqueta="Costo">
        {hayTarifa
          ? <strong>{costo}</strong>
          : <span style={{ color: "var(--do-texto-suave)", fontWeight: 600 }}>{SIN_TARIFA_TEXTO}</span>}
      </Dato>
      <div>
        <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Estado</div>
        <Badge variant={tono}>{ETIQUETA_VALORACION[v.estado] ?? v.estado}</Badge>
      </div>
    </li>
  );
}

export interface VistaSeccionManoDeObraProps {
  readonly resumen: Resumen | null;
  readonly estimado?: CostoEstimado | null;
  readonly cargando?: boolean;
  readonly error?: string | null;
}

/** Núcleo PRESENTACIONAL puro (sin fetching), probable por estados. */
export function VistaSeccionManoDeObra({ resumen, estimado, cargando, error }: VistaSeccionManoDeObraProps) {
  const valoraciones = resumen?.valoraciones ?? [];
  const pendientes = resumen?.pendientes ?? [];
  const costos = resumen?.costoPorMoneda ?? [];
  const haySinTarifa = valoraciones.some((v) => v.estado === "SIN_TARIFA");
  const haySinRecurso = valoraciones.some((v) => v.estado === "SIN_RECURSO");
  const vacio = !cargando && valoraciones.length === 0 && pendientes.length === 0 && !estimado;

  return (
    <Card>
      <CardHeader>
        <strong>Mano de obra</strong>
      </CardHeader>
      <CardContent>
        {error && (
          <div style={{ marginBottom: "var(--do-sp-3)" }}>
            <Alert variant="error" titulo="No se pudo cargar la mano de obra">{error}</Alert>
          </div>
        )}

        {/* Costo ESTIMADO de la sesión en curso (claramente diferenciado). */}
        {estimado && (
          <div style={{ marginBottom: "var(--do-sp-4)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--do-sp-3)",
                flexWrap: "wrap",
                border: "1px dashed var(--do-borde)",
                borderRadius: "var(--do-radius-md)",
                padding: "var(--do-sp-3)",
              }}
            >
              <Badge variant="info">Estimado</Badge>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                  Costo estimado (sesión en curso)
                </div>
                <div style={{ fontWeight: 700, fontSize: "var(--do-text-lg)" }}>
                  {estimado.sinTarifa
                    ? <span style={{ color: "var(--do-texto-suave)", fontWeight: 600 }}>{SIN_TARIFA_TEXTO}</span>
                    : costoPresentacion(estimado.costo, estimado.moneda, !estimado.sinTarifa)}
                </div>
                <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                  {estimado.sinTarifa
                    ? "El tiempo se registra; el costo se valorará al configurar la tarifa."
                    : `No es un costo final; se recalcula con el tiempo trabajado (${formatearTiempo(estimado.efectivoMs)}).`}
                </div>
              </div>
            </div>
          </div>
        )}

        {cargando && valoraciones.length === 0 && !estimado ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-4)" }}>
            <Spinner />
          </div>
        ) : vacio ? (
          <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>
            Aún no hay mano de obra registrada. Cuando el técnico cierre una sesión de trabajo, aquí verás el
            tiempo efectivo y su valoración.
          </p>
        ) : (
          <>
            {/* Resumen: totales + avisos. */}
            {(resumen?.efectivoMsTotal || costos.length > 0) && (
              <div
                style={{
                  display: "grid",
                  gap: "var(--do-sp-3)",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))",
                  marginBottom: "var(--do-sp-4)",
                }}
              >
                <Dato etiqueta="Tiempo efectivo total">
                  <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "var(--do-text-lg)" }}>
                    {formatearTiempo(resumen?.efectivoMsTotal)}
                  </span>
                </Dato>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                    Costo total valorado
                  </div>
                  {costos.length === 0 ? (
                    <div style={{ color: "var(--do-texto-suave)", fontWeight: 600 }}>—</div>
                  ) : (
                    <div style={{ display: "flex", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
                      {costos.map((c) => (
                        <strong key={c.moneda} style={{ fontSize: "var(--do-text-lg)" }}>
                          {costoPresentacion(c.costo, c.moneda, true)}
                        </strong>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(pendientes.length > 0 || haySinTarifa || haySinRecurso) && (
              <div style={{ marginBottom: "var(--do-sp-4)" }}>
                <Alert variant="advertencia" titulo="Pendiente de valoración">
                  {pendientes.length > 0 && (
                    <div>{pendientes.length} sesión(es) cerradas aún sin valorar.</div>
                  )}
                  {haySinTarifa && <div>Hay tiempo efectivo sin tarifa configurada (no se asume costo $0).</div>}
                  {haySinRecurso && <div>Hay sesiones sin recurso de mano de obra asociado.</div>}
                </Alert>
              </div>
            )}

            {valoraciones.length > 0 && (
              <ul style={{ margin: 0, padding: 0, display: "grid", gap: "var(--do-sp-3)" }}>
                {valoraciones.map((v) => (
                  <TarjetaValoracion key={v.sesionId} v={v} moneda={costos[0]?.moneda} />
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Sección conectada: carga el resumen de la OT y, si hay una sesión ABIERTA
 * PROPIA, el costo estimado. Oculta la sección a quien no puede leer (§22).
 */
export function SeccionManoDeObra({ ordenId }: { ordenId: string }) {
  const { sesion } = useSesion();
  const capacidades = capacidadesManoDeObra(sesion);

  const resumen = useResumenManoDeObra(capacidades.leer ? ordenId : null);
  // Sesión ABIERTA propia → costo estimado (§14/§29). Sólo la del usuario actual.
  const activa = useSesionActiva(ordenId, sesion?.identityId);
  const sesionAbiertaId = activa.datos && activa.datos.estado !== "CERRADA" ? activa.datos.id : null;
  const estimado = useCostoEstimado(sesionAbiertaId);

  const estimadoDato = useMemo(() => estimado.datos ?? null, [estimado.datos]);

  if (!capacidades.leer) return null;

  return (
    <VistaSeccionManoDeObra
      resumen={resumen.datos}
      estimado={estimadoDato}
      cargando={resumen.cargando}
      error={resumen.error ? resumen.error.message : null}
    />
  );
}
