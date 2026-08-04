/**
 * DGP-008.3 · Visualizador gráfico de relaciones (SVG con tokens --do-*).
 * Dibuja el activo central y sus relacionados como nodos navegables.
 */
import React from "react";
import type { Relacion } from "./tipos";

export interface RelacionesGrafoProps {
  centroId: string;
  centroNombre: string;
  relaciones: Relacion[];
  onNavegar: (id: string) => void;
}

export function RelacionesGrafo({ centroId, centroNombre, relaciones, onNavegar }: RelacionesGrafoProps) {
  const ancho = 640;
  const alto = Math.max(240, 120 + relaciones.length * 8);
  const cx = ancho / 2;
  const cy = alto / 2;
  const radio = Math.min(cx, cy) - 70;

  const nodos = relaciones.map((r, i) => {
    const angulo = (2 * Math.PI * i) / Math.max(1, relaciones.length) - Math.PI / 2;
    const x = cx + radio * Math.cos(angulo);
    const y = cy + radio * Math.sin(angulo);
    const otro = r.origenId === centroId ? r.destinoId : r.origenId;
    const nombre = r.origenId === centroId ? r.destinoNombre : r.origenNombre;
    return { r, x, y, otro, nombre: nombre ?? otro.slice(0, 8) };
  });

  return (
    <svg
      role="group"
      aria-label={`Relaciones de ${centroNombre}`}
      viewBox={`0 0 ${ancho} ${alto}`}
      style={{ width: "100%", height: "auto", background: "var(--do-surface-2)", borderRadius: "var(--do-radius-md)" }}
    >
      {nodos.map((n, i) => (
        <line key={`l-${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="var(--do-borde-fuerte)" strokeWidth={1.5} />
      ))}
      {nodos.map((n, i) => (
        <g key={`ml-${i}`}>
          <text x={(cx + n.x) / 2} y={(cy + n.y) / 2 - 4} textAnchor="middle" fontSize={10} fill="var(--do-texto-suave)">
            {n.r.tipo}
          </text>
        </g>
      ))}
      {/* Nodos relacionados */}
      {nodos.map((n, i) => (
        <g
          key={`n-${i}`}
          role="button"
          tabIndex={0}
          aria-label={`Ir a ${n.nombre}`}
          style={{ cursor: "pointer" }}
          onClick={() => onNavegar(n.otro)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavegar(n.otro); }
          }}
        >
          <circle cx={n.x} cy={n.y} r={34} fill="var(--do-surface)" stroke="var(--do-primario)" strokeWidth={1.5} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={11} fill="var(--do-texto)">
            {truncar(n.nombre, 12)}
          </text>
        </g>
      ))}
      {/* Nodo central */}
      <circle cx={cx} cy={cy} r={42} fill="var(--do-primario)" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fill="var(--do-sobre-primario, #fff)" fontWeight={600}>
        {truncar(centroNombre, 14)}
      </text>
    </svg>
  );
}

function truncar(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
