/**
 * DGP-008.3 · Árbol expandible/colapsable accesible (roles WAI-ARIA tree).
 */
import React, { useState } from "react";
import { Badge, Button } from "@workspace/design-system";
import { etiquetaEstado, variantEstado, type NodoArbol } from "./tipos";

export interface ArbolProps {
  raiz: NodoArbol;
  onNavegar: (id: string) => void;
  label?: string;
}

export function Arbol({ raiz, onNavegar, label = "Árbol de activos" }: ArbolProps) {
  return (
    <ul role="tree" aria-label={label} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      <NodoRender nodo={raiz} onNavegar={onNavegar} nivel={1} />
    </ul>
  );
}

function NodoRender({ nodo, onNavegar, nivel }: { nodo: NodoArbol; onNavegar: (id: string) => void; nivel: number }) {
  const [abierto, setAbierto] = useState(nivel <= 2);
  const hijos = nodo.hijos ?? [];
  const tieneHijos = hijos.length > 0;

  return (
    <li role="treeitem" aria-expanded={tieneHijos ? abierto : undefined} aria-level={nivel} style={{ margin: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--do-sp-2)",
          padding: "var(--do-sp-1) var(--do-sp-2)",
          paddingLeft: `calc(${nivel} * var(--do-sp-3))`,
        }}
      >
        {tieneHijos ? (
          <button
            type="button"
            aria-label={abierto ? "Colapsar" : "Expandir"}
            onClick={() => setAbierto((a) => !a)}
            className="do-input"
            style={{ width: 24, height: 24, padding: 0, cursor: "pointer", borderRadius: "var(--do-radius-sm)" }}
          >
            {abierto ? "−" : "+"}
          </button>
        ) : (
          <span aria-hidden="true" style={{ width: 24, display: "inline-block", textAlign: "center", color: "var(--do-texto-suave)" }}>·</span>
        )}
        <button
          type="button"
          onClick={() => onNavegar(nodo.id)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--do-primario)", padding: 0, font: "inherit" }}
        >
          {nodo.nombre ?? nodo.codigoEmpresarial ?? nodo.id.slice(0, 8)}
        </button>
        {nodo.codigoEmpresarial && (
          <code style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{nodo.codigoEmpresarial}</code>
        )}
        {nodo.estado && <Badge variant={variantEstado(nodo.estado)}>{etiquetaEstado(nodo.estado)}</Badge>}
      </div>
      {tieneHijos && abierto && (
        <ul role="group" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {hijos.map((h) => (
            <NodoRender key={h.id} nodo={h} onNavegar={onNavegar} nivel={nivel + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
