/**
 * DGP-016 · Panel de filtros globales reutilizable.
 *
 * Renderiza controles para las dimensiones canónicas (activo/ubicación/bodega/
 * categoría/tipo/estado/prioridad/responsable/cuadrilla/fecha/rango). Al cambiar,
 * notifica el nuevo estado para persistirlo en la URL (ruta→filtro). Las
 * opciones de los catálogos del tenant se cargan bajo demanda; las dimensiones
 * sin catálogo usan entrada libre. Sólo Design System.
 */
import React from "react";
import { Card, CardContent, CardHeader, Button, Input, Select, Badge } from "@workspace/design-system";
import { DIMENSIONES_FILTRO, ETIQUETA_DIMENSION, type DimensionFiltro } from "./constantes";
import { contarFiltros, type FiltrosGlobales as EstadoFiltros } from "./filtros";
import { useCatalogo } from "./hooks";
import type { OpcionCatalogo } from "./tipos";

/** Mapea una dimensión a su catálogo de tenant (si tiene uno). */
const CATALOGO_POR_DIMENSION: Partial<Record<DimensionFiltro, string>> = {
  categoria: "categorias-indicador",
  prioridad: "prioridades",
  estado: "estados",
  tipo: "tipos",
};

export interface FiltrosGlobalesPanelProps {
  valor: EstadoFiltros;
  onCambio: (nuevo: EstadoFiltros) => void;
  /** Restringe qué dimensiones se muestran (por defecto todas). */
  dimensiones?: readonly DimensionFiltro[];
}

export function FiltrosGlobalesPanel({ valor, onCambio, dimensiones = DIMENSIONES_FILTRO }: FiltrosGlobalesPanelProps) {
  const n = contarFiltros(valor);

  function set(dim: DimensionFiltro, v: string) {
    const nuevo = { ...valor };
    if (v === "") delete nuevo[dim];
    else nuevo[dim] = v;
    onCambio(nuevo);
  }

  return (
    <Card role="region" aria-label="Filtros globales">
      <CardHeader>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
          <strong>Filtros globales</strong>
          <span style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
            {n > 0 && <Badge variant="info" aria-label={`${n} filtros activos`}>{n} activo(s)</Badge>}
            {n > 0 && (
              <Button variant="fantasma" size="sm" onClick={() => onCambio({})}>
                Limpiar
              </Button>
            )}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(180px, 100%), 1fr))", gap: "var(--do-sp-3)" }}>
          {dimensiones.map((dim) => (
            <ControlDimension key={dim} dim={dim} valor={valor[dim] ?? ""} onCambio={(v) => set(dim, v)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ControlDimension({ dim, valor, onCambio }: { dim: DimensionFiltro; valor: string; onCambio: (v: string) => void }) {
  const idBase = `filtro-${dim}`;
  const etiqueta = ETIQUETA_DIMENSION[dim];

  if (dim === "fecha") {
    return (
      <label htmlFor={idBase} style={campoStyle}>
        <span style={etiquetaStyle}>{etiqueta} (desde)</span>
        <Input id={idBase} type="date" value={valor} onChange={(e) => onCambio(e.target.value)} />
      </label>
    );
  }
  if (dim === "rango") {
    const [desde, hasta] = valor.split("|");
    return (
      <fieldset style={{ ...campoStyle, border: "none", padding: 0, margin: 0 }}>
        <legend style={etiquetaStyle}>{etiqueta}</legend>
        <div style={{ display: "flex", gap: "var(--do-sp-1)" }}>
          <Input aria-label={`${etiqueta} desde`} type="date" value={desde ?? ""} onChange={(e) => onCambio(`${e.target.value}|${hasta ?? ""}`)} />
          <Input aria-label={`${etiqueta} hasta`} type="date" value={hasta ?? ""} onChange={(e) => onCambio(`${desde ?? ""}|${e.target.value}`)} />
        </div>
      </fieldset>
    );
  }

  const catalogo = CATALOGO_POR_DIMENSION[dim];
  if (catalogo) return <ControlCatalogo id={idBase} etiqueta={etiqueta} catalogo={catalogo} valor={valor} onCambio={onCambio} />;

  return (
    <label htmlFor={idBase} style={campoStyle}>
      <span style={etiquetaStyle}>{etiqueta}</span>
      <Input id={idBase} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={`Filtrar por ${etiqueta.toLowerCase()}`} />
    </label>
  );
}

function ControlCatalogo({ id, etiqueta, catalogo, valor, onCambio }: { id: string; etiqueta: string; catalogo: string; valor: string; onCambio: (v: string) => void }) {
  const { datos } = useCatalogo(catalogo);
  const opciones: OpcionCatalogo[] = datos ?? [];
  // Si el catálogo no está disponible (404/offline), degradar a entrada libre.
  if (!datos || datos.length === 0) {
    return (
      <label htmlFor={id} style={campoStyle}>
        <span style={etiquetaStyle}>{etiqueta}</span>
        <Input id={id} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={`Filtrar por ${etiqueta.toLowerCase()}`} />
      </label>
    );
  }
  return (
    <label htmlFor={id} style={campoStyle}>
      <span style={etiquetaStyle}>{etiqueta}</span>
      <Select id={id} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={`Todos`}>
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.clave} value={o.clave}>{o.etiqueta}</option>
        ))}
      </Select>
    </label>
  );
}

const campoStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" };
const etiquetaStyle: React.CSSProperties = { fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", fontWeight: 600 };
