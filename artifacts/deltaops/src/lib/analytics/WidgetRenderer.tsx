/**
 * DGP-016 · Renderizador declarativo de widgets.
 *
 * Motor GENÉRICO que renderiza CUALQUIER configuración de widget alimentándose
 * de POST evaluar. Un widget = { tipo, titulo, indicadorClave, filtros,
 * presentacion, ranking }. El renderer:
 *  - Evalúa el indicador combinando filtros globales + del widget.
 *  - Muestra estados HONESTOS: cargando / error (reintentable) / vacío. Nunca
 *    inventa datos.
 *  - Aplica semáforos por umbrales VISIBLES y accesibles (ARIA + contraste).
 *  - Ofrece deep links declarativos hacia módulos (presentacion.enlace).
 *
 * Los 13 tipos: card, line, bar, area, pie, donut, gauge, table, heatmap,
 * timeline, calendar, ranking, comparativo.
 */
import React from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, Badge, Button, Spinner, ErrorState, EmptyState, Table } from "@workspace/design-system";
import { useEvaluacion, type EstadoEvaluacion } from "./hooks";
import { combinarFiltros, type FiltrosGlobales } from "./filtros";
import { formatearValor } from "./formato";
import { resolverEnlaceWidget } from "./deep-links";
import { TONO_SEMAFORO, ETIQUETA_SEMAFORO, type SemaforoNivel } from "./constantes";
import {
  GraficoBarras,
  GraficoLinea,
  GraficoCircular,
  Gauge,
  Heatmap,
  type PuntoSerie,
} from "./graficos";
import type { Indicador, Widget } from "./tipos";
import type { CacheAnalytics } from "./cache";

export interface WidgetRendererProps {
  widget: Widget;
  /** Definición del indicador (para unidad/formato/umbrales). Opcional. */
  indicador?: Indicador | null;
  /** Filtros globales del dashboard (se combinan con los del widget). */
  filtrosGlobales?: FiltrosGlobales;
  /** Periodo para cumplimiento de meta (opcional). */
  periodo?: string;
  /** Caché por tenant (offline). */
  cache?: CacheAnalytics;
}

/** Convierte los grupos de la evaluación en puntos de serie. */
function gruposAPuntos(evaluacion: EstadoEvaluacion["datos"]): PuntoSerie[] {
  if (!evaluacion) return [];
  return evaluacion.grupos.map((g) => ({ etiqueta: g.clave, valor: g.valor }));
}

/** Aplica topN/bottomN a una serie según la config del widget. */
function aplicarRanking(puntos: PuntoSerie[], ranking?: Widget["ranking"]): PuntoSerie[] {
  if (!ranking) return puntos;
  const ordenados = [...puntos].sort((a, b) => (ranking.modo === "topN" ? b.valor - a.valor : a.valor - b.valor));
  return ordenados.slice(0, ranking.n);
}

export function WidgetRenderer({ widget, indicador, filtrosGlobales = {}, periodo, cache }: WidgetRendererProps) {
  const filtros = combinarFiltros(filtrosGlobales, widget.filtros);
  const estado = useEvaluacion(widget.indicadorClave, filtros, { periodo, cache });
  const { datos, cargando, error, origenCache, recargar } = estado;

  const cabecera = (
    <CardHeader>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <strong>{widget.titulo}</strong>
        <span style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
          <Badge variant="neutro" aria-label={`Tipo de widget ${widget.tipo}`}>{widget.tipo}</Badge>
          {datos?.semaforo && (
            <Badge variant={TONO_SEMAFORO[datos.semaforo as SemaforoNivel]} aria-label={`Semáforo ${ETIQUETA_SEMAFORO[datos.semaforo as SemaforoNivel]}`}>
              {ETIQUETA_SEMAFORO[datos.semaforo as SemaforoNivel]}
            </Badge>
          )}
        </span>
      </div>
    </CardHeader>
  );

  let cuerpo: React.ReactNode;
  if (cargando && !datos) {
    cuerpo = (
      <div role="status" aria-live="polite" style={{ display: "grid", placeItems: "center", minHeight: 120 }}>
        <Spinner />
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Cargando datos…</span>
      </div>
    );
  } else if (error) {
    cuerpo = <ErrorState titulo="No se pudo evaluar el indicador" descripcion={error.message} onReintentar={recargar} />;
  } else if (!datos || (datos.muestras === 0 && datos.grupos.length === 0)) {
    // DELTAOPS LITE-10 §24 · Honestidad de indicadores: sin muestras NO hay
    // insumos suficientes (MTTR/MTBF/disponibilidad, etc.). Mostrar el valor
    // (aunque no sea 0) induciría a error, así que se dice explícitamente que el
    // indicador no está disponible por falta de datos.
    cuerpo = (
      <EmptyState
        titulo="Indicador no disponible"
        descripcion="Sin datos suficientes para calcular este indicador con los filtros actuales."
      />
    );
  } else {
    cuerpo = <CuerpoWidget widget={widget} datos={datos} indicador={indicador} />;
  }

  return (
    <Card role="group" aria-label={widget.titulo}>
      {cabecera}
      <CardContent>
        {origenCache && !error && (
          <p role="note" style={{ margin: "0 0 var(--do-sp-2)", fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
            ⚠ Datos de caché (sin conexión) · {new Date(origenCache).toLocaleString("es")}
          </p>
        )}
        {cuerpo}
      </CardContent>
    </Card>
  );
}

/* --------------------------- Cuerpo por tipo ---------------------------- */

function CuerpoWidget({ widget, datos, indicador }: { widget: Widget; datos: NonNullable<EstadoEvaluacion["datos"]>; indicador?: Indicador | null }) {
  const unidad = datos.unidad ?? indicador?.unidad;
  const formato = datos.formato ?? indicador?.formato;
  const puntos = aplicarRanking(gruposAPuntos(datos), widget.ranking);
  const label = widget.titulo;

  switch (widget.tipo) {
    case "card":
      return <CuerpoCard datos={datos} formato={formato} unidad={unidad} indicador={indicador} periodoMeta={widget.presentacion} />;
    case "gauge": {
      const max = leerMax(widget, indicador) ?? 100;
      const colorArco = datos.semaforo ? tonoCss(datos.semaforo as SemaforoNivel) : "var(--do-primario)";
      return <Gauge valor={round(datos.valor)} max={max} label={label} colorArco={colorArco} />;
    }
    case "bar":
      return puntos.length ? <GraficoBarras puntos={puntos} label={label} /> : <ValorUnico datos={datos} formato={formato} unidad={unidad} />;
    case "line":
      return puntos.length ? <GraficoLinea puntos={puntos} label={label} /> : <ValorUnico datos={datos} formato={formato} unidad={unidad} />;
    case "area":
      return puntos.length ? <GraficoLinea puntos={puntos} area label={label} /> : <ValorUnico datos={datos} formato={formato} unidad={unidad} />;
    case "pie":
      return puntos.length ? <GraficoCircular puntos={puntos} label={label} /> : <ValorUnico datos={datos} formato={formato} unidad={unidad} />;
    case "donut":
      return puntos.length ? <GraficoCircular puntos={puntos} donut label={label} /> : <ValorUnico datos={datos} formato={formato} unidad={unidad} />;
    case "heatmap":
      return puntos.length ? <Heatmap puntos={puntos} label={label} /> : <EmptyState titulo="Sin agrupación" descripcion="El indicador no devolvió grupos para el mapa de calor." />;
    case "table":
      return <TablaWidget datos={datos} formato={formato} unidad={unidad} titulo={label} presentacion={widget.presentacion} />;
    case "ranking":
      return <RankingWidget puntos={puntos} formato={formato} unidad={unidad} modo={widget.ranking?.modo ?? "topN"} titulo={label} presentacion={widget.presentacion} />;
    case "comparativo":
      return <Comparativo datos={datos} formato={formato} unidad={unidad} indicador={indicador} presentacion={widget.presentacion} />;
    case "timeline":
      return <TimelineWidget puntos={puntos} datos={datos} formato={formato} unidad={unidad} />;
    case "calendar":
      return <CalendarWidget puntos={puntos} datos={datos} formato={formato} unidad={unidad} />;
    default:
      return <ValorUnico datos={datos} formato={formato} unidad={unidad} />;
  }
}

/* --------------------------- Sub-componentes ---------------------------- */

function ValorUnico({ datos, formato, unidad }: { datos: NonNullable<EstadoEvaluacion["datos"]>; formato?: string; unidad?: string }) {
  return (
    <p style={{ fontSize: "var(--do-text-2xl, 2rem)", fontWeight: 700, margin: 0 }}>
      {formatearValor(datos.valor, formato, unidad)}
    </p>
  );
}

function CuerpoCard({
  datos,
  formato,
  unidad,
  indicador,
  periodoMeta,
}: {
  datos: NonNullable<EstadoEvaluacion["datos"]>;
  formato?: string;
  unidad?: string;
  indicador?: Indicador | null;
  periodoMeta?: Record<string, unknown>;
}) {
  const meta = indicador?.metas?.find((m) => m.periodo === (periodoMeta?.periodo as string));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
      <span style={{ fontSize: "var(--do-text-3xl, 2.4rem)", fontWeight: 700 }}>{formatearValor(datos.valor, formato, unidad)}</span>
      <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{datos.muestras} muestra(s)</span>
      {indicador?.umbrales && <BarraUmbrales umbrales={indicador.umbrales} valor={datos.valor} />}
      {datos.cumplimiento != null && (
        <span style={{ fontSize: "var(--do-text-sm)" }}>
          Cumplimiento: <strong>{Math.round(datos.cumplimiento * 100)}%</strong>
          {meta ? ` (meta ${meta.valor})` : ""}
        </span>
      )}
    </div>
  );
}

/** Barra de umbrales VISIBLE (bueno/alerta/crítico) con la posición del valor. */
function BarraUmbrales({ umbrales, valor }: { umbrales: NonNullable<Indicador["umbrales"]>; valor: number }) {
  const puntos = [umbrales.bueno, umbrales.alerta, umbrales.critico, valor];
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const span = max - min || 1;
  const pos = ((valor - min) / span) * 100;
  return (
    <div>
      <div
        aria-hidden="true"
        style={{ position: "relative", height: 8, borderRadius: 4, background: "linear-gradient(90deg, var(--do-error), var(--do-advertencia), var(--do-exito))" }}
      >
        <span style={{ position: "absolute", left: `${Math.max(0, Math.min(100, pos))}%`, top: -3, width: 3, height: 14, background: "var(--do-texto)", borderRadius: 2, transform: "translateX(-50%)" }} />
      </div>
      <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
        Umbrales — bueno: {umbrales.bueno} · alerta: {umbrales.alerta} · crítico: {umbrales.critico}
        {umbrales.mayorEsMejor ? " (mayor es mejor)" : " (menor es mejor)"}
      </span>
    </div>
  );
}

function TablaWidget({
  datos,
  formato,
  unidad,
  titulo,
  presentacion,
}: {
  datos: NonNullable<EstadoEvaluacion["datos"]>;
  formato?: string;
  unidad?: string;
  titulo: string;
  presentacion: Record<string, unknown>;
}) {
  const filas = datos.grupos.length ? datos.grupos : [{ clave: "Total", valor: datos.valor, muestras: datos.muestras }];
  return (
    <Table caption={titulo} captionOculto compacta hover>
      <thead>
        <tr>
          <th scope="col">Grupo</th>
          <th scope="col" style={{ textAlign: "right" }}>Valor</th>
          <th scope="col" style={{ textAlign: "right" }}>Muestras</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => {
          const enlace = resolverEnlaceWidget(presentacion, f.clave);
          return (
            <tr key={i}>
              <td>{enlace ? <Link href={enlace}><a style={{ color: "var(--do-primario)" }}>{f.clave}</a></Link> : f.clave}</td>
              <td style={{ textAlign: "right" }}>{formatearValor(f.valor, formato, unidad)}</td>
              <td style={{ textAlign: "right" }}>{f.muestras}</td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function RankingWidget({
  puntos,
  formato,
  unidad,
  modo,
  titulo,
  presentacion,
}: {
  puntos: PuntoSerie[];
  formato?: string;
  unidad?: string;
  modo: "topN" | "bottomN";
  titulo: string;
  presentacion: Record<string, unknown>;
}) {
  if (puntos.length === 0) return <EmptyState titulo="Sin ranking" descripcion="El indicador no devolvió grupos para el ranking." />;
  const max = puntos.reduce((m, p) => Math.max(m, p.valor), 0) || 1;
  return (
    <ol aria-label={`${titulo} (${modo === "topN" ? "mayores" : "menores"})`} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
      {puntos.map((p, i) => {
        const enlace = resolverEnlaceWidget(presentacion, p.etiqueta);
        const etiqueta = enlace ? <Link href={enlace}><a style={{ color: "var(--do-primario)" }}>{p.etiqueta}</a></Link> : p.etiqueta;
        return (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "1.5rem 1fr auto", alignItems: "center", gap: "var(--do-sp-2)" }}>
            <Badge variant="neutro">{i + 1}</Badge>
            <div>
              <div style={{ fontSize: "var(--do-text-sm)" }}>{etiqueta}</div>
              <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: "var(--do-primario)", width: `${(p.valor / max) * 100}%`, minWidth: 4 }} />
            </div>
            <strong>{formatearValor(p.valor, formato, unidad)}</strong>
          </li>
        );
      })}
    </ol>
  );
}

function Comparativo({
  datos,
  formato,
  unidad,
  indicador,
  presentacion,
}: {
  datos: NonNullable<EstadoEvaluacion["datos"]>;
  formato?: string;
  unidad?: string;
  indicador?: Indicador | null;
  presentacion: Record<string, unknown>;
}) {
  // Comparativo: valor actual vs meta del periodo (si existe) o vs primer grupo.
  const periodo = presentacion?.periodo as string | undefined;
  const meta = indicador?.metas?.find((m) => m.periodo === periodo)?.valor;
  const referencia = meta ?? datos.grupos[0]?.valor;
  const delta = referencia != null && referencia !== 0 ? (datos.valor - referencia) / referencia : null;
  return (
    <div style={{ display: "flex", gap: "var(--do-sp-5)", flexWrap: "wrap", alignItems: "flex-end" }}>
      <div>
        <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>Actual</div>
        <div style={{ fontSize: "var(--do-text-2xl, 2rem)", fontWeight: 700 }}>{formatearValor(datos.valor, formato, unidad)}</div>
      </div>
      {referencia != null && (
        <div>
          <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{meta != null ? "Meta" : "Referencia"}</div>
          <div style={{ fontSize: "var(--do-text-2xl, 2rem)", fontWeight: 700 }}>{formatearValor(referencia, formato, unidad)}</div>
        </div>
      )}
      {delta != null && (
        <Badge variant={delta >= 0 ? "exito" : "error"} aria-label={`Variación ${Math.round(delta * 100)} por ciento`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}%
        </Badge>
      )}
    </div>
  );
}

function TimelineWidget({
  puntos,
  datos,
  formato,
  unidad,
}: {
  puntos: PuntoSerie[];
  datos: NonNullable<EstadoEvaluacion["datos"]>;
  formato?: string;
  unidad?: string;
}) {
  const filas = puntos.length ? puntos : [{ etiqueta: "Evaluado", valor: datos.valor }];
  return (
    <ol aria-label="Línea de tiempo de valores" style={{ listStyle: "none", margin: 0, padding: 0, borderLeft: "2px solid var(--do-borde)" }}>
      {filas.map((p, i) => (
        <li key={i} style={{ position: "relative", padding: "0 0 var(--do-sp-3) var(--do-sp-4)" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: -5, top: 4, width: 8, height: 8, borderRadius: "50%", background: "var(--do-primario)" }} />
          <div style={{ fontSize: "var(--do-text-sm)" }}>{p.etiqueta}</div>
          <strong>{formatearValor(p.valor, formato, unidad)}</strong>
        </li>
      ))}
    </ol>
  );
}

function CalendarWidget({
  puntos,
  datos,
  formato,
  unidad,
}: {
  puntos: PuntoSerie[];
  datos: NonNullable<EstadoEvaluacion["datos"]>;
  formato?: string;
  unidad?: string;
}) {
  // Retícula tipo calendario: cada grupo es una celda (o una única celda con el
  // valor total). Intensidad por valor (mapa de calor por día).
  const celdas = puntos.length ? puntos : [{ etiqueta: "Total", valor: datos.valor }];
  const max = celdas.reduce((m, p) => Math.max(m, p.valor), 0) || 1;
  return (
    <div role="img" aria-label="Calendario de valores" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "var(--do-sp-1)" }}>
      {celdas.map((p, i) => {
        const intensidad = p.valor / max;
        return (
          <div
            key={i}
            title={`${p.etiqueta}: ${formatearValor(p.valor, formato, unidad)}`}
            style={{
              aspectRatio: "1 / 1",
              borderRadius: 4,
              background: `color-mix(in srgb, var(--do-primario) ${Math.round(intensidad * 100)}%, var(--do-surface-2))`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--do-text-xs)",
              color: intensidad > 0.55 ? "var(--do-sobre-primario, #fff)" : "var(--do-texto)",
            }}
          >
            {p.etiqueta}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Helpers --------------------------------- */

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function leerMax(widget: Widget, indicador?: Indicador | null): number | undefined {
  const p = widget.presentacion?.max;
  if (typeof p === "number") return p;
  // Para porcentajes, el máximo natural es 100.
  const formato = (indicador?.formato ?? "").toLowerCase();
  if (formato === "porcentaje" || formato === "percent" || formato === "%") return 100;
  return undefined;
}

function tonoCss(nivel: SemaforoNivel): string {
  return nivel === "bueno" ? "var(--do-exito)" : nivel === "alerta" ? "var(--do-advertencia)" : "var(--do-error)";
}
