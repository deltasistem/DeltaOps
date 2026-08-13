/**
 * DGP-021.3 (§20) · Costos del ACTIVO integrados en la ficha operacional 360°.
 * Todo el dato proviene de `GET /composicion/activo/:activoId` — CERO reglas
 * económicas en React (§26).
 *
 * Muestra: selector de PERÍODO (actual/30d/90d/año/histórico/rango), costo del
 * período por componente y POR MONEDA (nunca mezclado), estado de la información
 * y el COMBUSTIBLE claramente SEPARADO como valor CONTEXTUAL (no atribuible a
 * OT, precisión de origen aproximada). «Sin datos suficientes» ≠ «$0» (§4).
 * DGP-021.4: costo/hora y costo/km REALES por moneda + horas/km del período y
 * estado de calidad por indicador (NO APLICA para km sin odómetro, etc.).
 *
 * RBAC de presentación (§22): se oculta a quien no puede leer. Responsive §22,
 * tema §23. No duplica la ficha: es una sección más de la ficha operacional.
 */
import React, { useState } from "react";
import { Card, CardContent, CardHeader, Field, Input, Select, Alert, Spinner } from "@workspace/design-system";
import { useSesion } from "../identidad/sesion";
import { capacidadesCostos } from "./capacidades";
import { useComposicionActivo, type FiltroPeriodo } from "./hooks";
import { mensajeDeError } from "./api";
import { PERIODOS, type PeriodoClave } from "./constantes";
import { EstadoBadge, TotalesPorMoneda, TarjetaComponente, TarjetaCombustible, TarjetaIndicador } from "./componentes";
import type { ComposicionActivo } from "./tipos";

export interface VistaCostosActivoProps {
  readonly datos: ComposicionActivo | null;
  readonly cargando?: boolean;
  readonly error?: string | null;
  readonly vistaRecortada?: boolean;
  readonly periodo: PeriodoClave;
  readonly desde: string;
  readonly hasta: string;
  readonly onPeriodo: (p: PeriodoClave) => void;
  readonly onDesde: (v: string) => void;
  readonly onHasta: (v: string) => void;
}

/** Núcleo PRESENTACIONAL puro (sin fetching). */
export function VistaCostosActivo(props: VistaCostosActivoProps) {
  const { datos, cargando, error, vistaRecortada, periodo, desde, hasta } = props;
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
          <strong>Costos del activo</strong>
          {datos && <EstadoBadge estado={datos.estado} />}
        </div>
      </CardHeader>
      <CardContent>
        {/* Selector de período (§20). */}
        <div
          style={{
            display: "grid",
            gap: "var(--do-sp-3)",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
            marginBottom: "var(--do-sp-4)",
          }}
        >
          <Field label="Período">
            <Select value={periodo} onChange={(e) => props.onPeriodo(e.target.value as PeriodoClave)}>
              {PERIODOS.map((p) => (
                <option key={p.clave} value={p.clave}>{p.etiqueta}</option>
              ))}
            </Select>
          </Field>
          {periodo === "rango" && (
            <>
              <Field label="Desde">
                <Input type="date" value={desde} onChange={(e) => props.onDesde(e.target.value)} />
              </Field>
              <Field label="Hasta">
                <Input type="date" value={hasta} onChange={(e) => props.onHasta(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: "var(--do-sp-3)" }}>
            <Alert variant="error" titulo="No se pudieron cargar los costos">{error}</Alert>
          </div>
        )}

        {vistaRecortada && (
          <div style={{ marginBottom: "var(--do-sp-3)" }}>
            <Alert variant="info" titulo="Vista parcial">
              Ves los costos que tu perfil permite. El total puede incluir conceptos
              no visibles para tu rol.
            </Alert>
          </div>
        )}

        {cargando && !datos ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-4)" }}>
            <Spinner />
          </div>
        ) : !datos ? (
          <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>
            Aún no hay costos registrados para este activo en el período elegido.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
            {/* Resumen del período: total económico POR MONEDA + estado. */}
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
                  Costo de mantenimiento del período (por moneda)
                </div>
                <TotalesPorMoneda totales={datos.totalesPorMoneda} estado={datos.estado} destacar />
                <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)", marginTop: "var(--do-sp-2)" }}>
                  No incluye combustible (se muestra aparte como valor contextual).
                </div>
              </div>
              <div>
                <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>Estado de la información</div>
                <div style={{ marginTop: "var(--do-sp-1)" }}><EstadoBadge estado={datos.estado} /></div>
              </div>
            </div>

            {/* Desglose por componente económico. */}
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
            </div>

            {/* Combustible CONTEXTUAL, claramente separado del total económico. */}
            <TarjetaCombustible c={datos.componentes.combustible} />

            {/* Indicadores económicos operacionales (DGP-021.4): costo/hora y costo/km,
                por moneda, con estado de calidad. Ausencia ≠ $0 (§4). */}
            <div>
              <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)", marginBottom: "var(--do-sp-2)" }}>
                Indicadores por uso (mismo período)
              </div>
              <div
                style={{
                  display: "grid",
                  gap: "var(--do-sp-3)",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
                }}
              >
                <TarjetaIndicador titulo="Costo por hora" ind={datos.costoPorHora} />
                <TarjetaIndicador titulo="Costo por km" ind={datos.costoPorKm} />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Sección conectada: selector de período + carga de la composición del activo. */
export function CostosActivo({ activoId }: { activoId: string }) {
  const { sesion } = useSesion();
  const cap = capacidadesCostos(sesion);

  const [periodo, setPeriodo] = useState<PeriodoClave>("total");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const filtro: FiltroPeriodo = { periodo, desde: desde || undefined, hasta: hasta || undefined };
  const { datos, cargando, error } = useComposicionActivo(cap.leer ? activoId : null, filtro);

  if (!cap.leer) return null;

  return (
    <VistaCostosActivo
      datos={datos}
      cargando={cargando}
      error={error ? mensajeDeError(error) : null}
      vistaRecortada={cap.vistaRecortada}
      periodo={periodo}
      desde={desde}
      hasta={hasta}
      onPeriodo={setPeriodo}
      onDesde={setDesde}
      onHasta={setHasta}
    />
  );
}
