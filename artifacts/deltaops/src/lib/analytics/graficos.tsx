/**
 * DGP-016 · Primitivas de gráfico construidas con SVG/CSS puro + tokens del
 * Design System (--do-*). NO se añaden librerías de charts; se dibujan como en
 * fases previas (calendarios/Gantt). Todas son accesibles (role="img" + aria-
 * label / tablas ocultas para lectores) y responsive (viewBox escalable).
 *
 * Cada primitiva recibe SERIES YA CALCULADAS (grupos de la evaluación); nunca
 * inventan datos. Con series vacías, quien las use muestra el estado "vacío".
 */
import React, { useId } from "react";

export interface PuntoSerie {
  readonly etiqueta: string;
  readonly valor: number;
}

/** Paleta categórica basada en tokens del Design System. */
export const PALETA = [
  "var(--do-primario)",
  "var(--do-exito)",
  "var(--do-advertencia)",
  "var(--do-info)",
  "var(--do-error)",
  "var(--do-acento, var(--do-primario))",
];

function color(i: number): string {
  return PALETA[i % PALETA.length]!;
}

function maxValor(puntos: readonly PuntoSerie[]): number {
  return puntos.reduce((m, p) => Math.max(m, p.valor), 0) || 1;
}

/* ------------------------------- Barras --------------------------------- */

export function GraficoBarras({ puntos, altura = 200, label }: { puntos: readonly PuntoSerie[]; altura?: number; label: string }) {
  const max = maxValor(puntos);
  const n = puntos.length;
  const anchoBanda = n > 0 ? 100 / n : 100;
  return (
    <figure role="img" aria-label={label} style={{ margin: 0 }}>
      <svg viewBox={`0 0 100 100`} preserveAspectRatio="none" style={{ width: "100%", height: altura }}>
        {puntos.map((p, i) => {
          const h = (p.valor / max) * 92;
          const x = i * anchoBanda + anchoBanda * 0.15;
          const w = anchoBanda * 0.7;
          return <rect key={i} x={x} y={100 - h - 8} width={w} height={h} fill={color(i)} rx="0.5" />;
        })}
      </svg>
      <TablaOculta puntos={puntos} titulo={label} />
      <LeyendaEjes puntos={puntos} />
    </figure>
  );
}

/* ------------------------- Línea / Área --------------------------------- */

export function GraficoLinea({ puntos, altura = 200, area = false, label }: { puntos: readonly PuntoSerie[]; altura?: number; area?: boolean; label: string }) {
  const max = maxValor(puntos);
  const n = puntos.length;
  const paso = n > 1 ? 100 / (n - 1) : 100;
  const coords = puntos.map((p, i) => ({ x: n > 1 ? i * paso : 50, y: 92 - (p.valor / max) * 84 + 4 }));
  const linea = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const areaPath = coords.length
    ? `${linea} L${coords[coords.length - 1]!.x.toFixed(2)},100 L${coords[0]!.x.toFixed(2)},100 Z`
    : "";
  return (
    <figure role="img" aria-label={label} style={{ margin: 0 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: altura }}>
        {area && areaPath && <path d={areaPath} fill="var(--do-primario)" opacity="0.15" />}
        {linea && <path d={linea} fill="none" stroke="var(--do-primario)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="1.2" fill="var(--do-primario)" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <TablaOculta puntos={puntos} titulo={label} />
      <LeyendaEjes puntos={puntos} />
    </figure>
  );
}

/* --------------------------- Pie / Donut -------------------------------- */

export function GraficoCircular({ puntos, donut = false, label }: { puntos: readonly PuntoSerie[]; donut?: boolean; label: string }) {
  const total = puntos.reduce((s, p) => s + p.valor, 0);
  const id = useId();
  let acumulado = 0;
  const radio = 16;
  const cx = 21;
  const cy = 21;
  return (
    <figure role="img" aria-label={label} style={{ margin: 0, display: "flex", alignItems: "center", gap: "var(--do-sp-4)", flexWrap: "wrap" }}>
      <svg viewBox="0 0 42 42" style={{ width: 160, height: 160 }}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={radio} fill="none" stroke="var(--do-borde)" strokeWidth={donut ? 6 : 32} />
        ) : (
          puntos.map((p, i) => {
            const frac = p.valor / total;
            const dash = frac * (2 * Math.PI * radio);
            const resto = 2 * Math.PI * radio - dash;
            const offset = 2 * Math.PI * radio * (1 - acumulado);
            acumulado += frac;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={radio}
                fill="none"
                stroke={color(i)}
                strokeWidth={donut ? 6 : 32}
                strokeDasharray={`${dash} ${resto}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              >
                <title>{`${p.etiqueta}: ${p.valor}`}</title>
              </circle>
            );
          })
        )}
        {donut && <circle cx={cx} cy={cy} r={radio - 4} fill="var(--do-surface)" />}
      </svg>
      <ul aria-hidden="false" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
        {puntos.map((p, i) => (
          <li key={`${id}-${i}`} style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", fontSize: "var(--do-text-sm)" }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: color(i), display: "inline-block" }} />
            <span>{p.etiqueta}</span>
            <strong style={{ marginLeft: "auto" }}>{p.valor}</strong>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ------------------------------- Gauge ---------------------------------- */

export function Gauge({ valor, max = 100, label, colorArco = "var(--do-primario)" }: { valor: number; max?: number; label: string; colorArco?: string }) {
  const frac = Math.max(0, Math.min(1, max === 0 ? 0 : valor / max));
  const radio = 16;
  const circ = Math.PI * radio; // media circunferencia
  const dash = frac * circ;
  return (
    <figure role="img" aria-label={`${label}: ${valor} de ${max}`} style={{ margin: 0, textAlign: "center" }}>
      <svg viewBox="0 0 42 24" style={{ width: 180, height: 100 }}>
        <path d="M5,21 A16,16 0 0,1 37,21" fill="none" stroke="var(--do-borde)" strokeWidth="4" strokeLinecap="round" />
        <path
          d="M5,21 A16,16 0 0,1 37,21"
          fill="none"
          stroke={colorArco}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
        <text x="21" y="20" textAnchor="middle" fontSize="7" fill="var(--do-texto)" fontWeight="700">
          {Number.isFinite(valor) ? valor : "—"}
        </text>
      </svg>
    </figure>
  );
}

/* ------------------------------ Heatmap --------------------------------- */

export function Heatmap({ puntos, label }: { puntos: readonly PuntoSerie[]; label: string }) {
  const max = maxValor(puntos);
  return (
    <div role="img" aria-label={label} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(72px, 100%), 1fr))", gap: "var(--do-sp-2)" }}>
      {puntos.map((p, i) => {
        const intensidad = p.valor / max;
        return (
          <div
            key={i}
            title={`${p.etiqueta}: ${p.valor}`}
            style={{
              padding: "var(--do-sp-2)",
              borderRadius: "var(--do-radio-sm, 6px)",
              background: `color-mix(in srgb, var(--do-primario) ${Math.round(intensidad * 100)}%, var(--do-surface-2))`,
              color: intensidad > 0.55 ? "var(--do-sobre-primario, #fff)" : "var(--do-texto)",
              fontSize: "var(--do-text-sm)",
              minHeight: 48,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <span style={{ opacity: 0.85 }}>{p.etiqueta}</span>
            <strong>{p.valor}</strong>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------- Utilidades A11y --------------------------- */

/** Tabla oculta visualmente con los datos (accesibilidad de los gráficos). */
function TablaOculta({ puntos, titulo }: { puntos: readonly PuntoSerie[]; titulo: string }) {
  return (
    <table style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
      <caption>{titulo}</caption>
      <thead>
        <tr>
          <th scope="col">Serie</th>
          <th scope="col">Valor</th>
        </tr>
      </thead>
      <tbody>
        {puntos.map((p, i) => (
          <tr key={i}>
            <td>{p.etiqueta}</td>
            <td>{p.valor}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Etiquetas de eje X debajo del gráfico (visibles). */
function LeyendaEjes({ puntos }: { puntos: readonly PuntoSerie[] }) {
  if (puntos.length === 0) return null;
  return (
    <div aria-hidden="true" style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-1)", marginTop: "var(--do-sp-1)", fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", overflow: "hidden" }}>
      {puntos.map((p, i) => (
        <span key={i} style={{ flex: 1, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.etiqueta}
        </span>
      ))}
    </div>
  );
}
