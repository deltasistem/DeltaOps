/**
 * DGP-021.3 (§19) · Sección «COSTOS DE MANTENIMIENTO» integrada en el DETALLE
 * DE OT. Todo el dato proviene de `GET /composicion/ot/:otId` — CERO reglas
 * económicas en React (§26): sólo formateo de presentación.
 *
 * Muestra: resumen (estado agregado + totales POR MONEDA, nunca mezclados),
 * desglose por componente (Mano de obra / Repuestos / Otros), pendientes de
 * materialización, evidencia/fuentes, y el combustible como NO APLICA a la OT
 * (GAP-FUEL-OT: no atribuible a órdenes). «Sin datos suficientes» ≠ «$0» (§4).
 *
 * NOTA §13: el `costoReal` MANUAL de la OT NO es fuente económica de esta
 * sección; si en el futuro se mostrara en la ficha, debe etiquetarse
 * explícitamente como «declaración manual», separado de esta composición.
 *
 * RBAC de presentación (§22): se oculta a quien no puede leer; el TECNICO ve una
 * vista recortada por el backend (su mano de obra). Responsive §22, tema §23.
 */
import React from "react";
import { Card, CardContent, CardHeader, Badge, Alert, Spinner } from "@workspace/design-system";
import { useSesion } from "../identidad/sesion";
import { capacidadesCostos } from "./capacidades";
import { useComposicionOt } from "./hooks";
import { mensajeDeError } from "./api";
import { EstadoBadge, TotalesPorMoneda, TarjetaComponente, ListaPendientes } from "./componentes";
import { ETIQUETA_ESTADO } from "./formato";
import type { ComposicionOt } from "./tipos";

export interface VistaCostosOtProps {
  readonly datos: ComposicionOt | null;
  readonly cargando?: boolean;
  readonly error?: string | null;
  readonly vistaRecortada?: boolean;
}

/** Núcleo PRESENTACIONAL puro (sin fetching). */
export function VistaCostosOt({ datos, cargando, error, vistaRecortada }: VistaCostosOtProps) {
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
          <strong>Costos de mantenimiento</strong>
          {datos && <EstadoBadge estado={datos.estado} />}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div style={{ marginBottom: "var(--do-sp-3)" }}>
            <Alert variant="error" titulo="No se pudieron cargar los costos">{error}</Alert>
          </div>
        )}

        {vistaRecortada && (
          <div style={{ marginBottom: "var(--do-sp-3)" }}>
            <Alert variant="info" titulo="Vista parcial">
              Ves los costos que tu perfil permite (tu mano de obra). El total puede
              incluir conceptos no visibles para tu rol.
            </Alert>
          </div>
        )}

        {cargando && !datos ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-4)" }}>
            <Spinner />
          </div>
        ) : !datos ? (
          <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>
            Aún no hay costos registrados para esta orden.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
            {/* Resumen: total POR MONEDA + estado. */}
            <div
              style={{
                display: "grid",
                gap: "var(--do-sp-4)",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
                alignItems: "start",
                border: "1px solid var(--do-borde)",
                borderRadius: "var(--do-radius-lg)",
                padding: "var(--do-sp-4)",
                background: "var(--do-surface-2)",
              }}
            >
              <div>
                <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                  Costo total de la orden (por moneda)
                </div>
                <TotalesPorMoneda totales={datos.totalesPorMoneda} estado={datos.estado} destacar />
              </div>
              <div>
                <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Estado de la información</div>
                <div style={{ marginTop: "var(--do-sp-1)" }}><EstadoBadge estado={datos.estado} /></div>
                <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)", marginTop: "var(--do-sp-2)" }}>
                  {leyendaEstado(datos)}
                </div>
              </div>
            </div>

            {/* Pendientes de materialización a nivel de OT. */}
            <ListaPendientes
              items={datos.pendientesMaterializacion}
              titulo="Repuestos pendientes de materializar (no se asume $0)"
            />

            {/* Desglose por componente. */}
            <div
              style={{
                display: "grid",
                gap: "var(--do-sp-4)",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
              }}
            >
              <TarjetaComponente c={datos.componentes.manoObra} />
              <TarjetaComponente c={datos.componentes.materiales} />
              <TarjetaComponente c={datos.componentes.otros} />
              {/* Combustible: NO APLICA a la OT (no atribuible a órdenes). */}
              <div
                style={{
                  border: "1px dashed var(--do-borde)",
                  borderRadius: "var(--do-radius-lg)",
                  padding: "var(--do-sp-4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--do-sp-2)",
                  minWidth: 0,
                  background: "var(--do-surface-2)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
                  <strong>Combustible</strong>
                  <Badge variant="neutro">{ETIQUETA_ESTADO.NO_APLICA}</Badge>
                </div>
                <p style={{ margin: 0, color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
                  El combustible no se atribuye a órdenes de trabajo. Consúltalo en la
                  ficha operacional del activo.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function leyendaEstado(d: ComposicionOt): string {
  switch (d.estado) {
    case "COMPLETO":
      return "Todos los componentes con datos están completos.";
    case "PARCIAL":
      return "Hay datos y también operaciones pendientes de resolver.";
    case "PENDIENTE":
      return "Hay operaciones pendientes de materializar/valorar.";
    case "SIN_DATOS_SUFICIENTES":
      return "Aún no hay costos registrados para esta orden.";
    default:
      return "";
  }
}

/** Sección conectada: carga la composición y aplica el RBAC de presentación. */
export function SeccionCostosOt({ ordenId }: { ordenId: string }) {
  const { sesion } = useSesion();
  const cap = capacidadesCostos(sesion);
  const { datos, cargando, error } = useComposicionOt(cap.leer ? ordenId : null);

  if (!cap.leer) return null;

  return (
    <VistaCostosOt
      datos={datos}
      cargando={cargando}
      error={error ? mensajeDeError(error) : null}
      vistaRecortada={cap.vistaRecortada}
    />
  );
}
