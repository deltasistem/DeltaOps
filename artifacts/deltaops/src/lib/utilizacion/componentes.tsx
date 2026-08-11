/**
 * DGP-019.1 · Componentes de presentación del módulo Utilización.
 * Sólo composición del Design System + tokens `--do-*`. No introduce controles
 * nuevos ni duplica componentes del DS.
 */
import React from "react";
import { Badge, Field, Select, Spinner } from "@workspace/design-system";
import { useListado } from "../activos/hooks";
import type { ResultadoCalculo } from "./tipos";
import {
  etiquetaEstadoLectura,
  tonoEstadoLectura,
  ETIQUETA_SYNC_ACTIVO,
  tonoSyncActivo,
  ETIQUETA_COMBUSTIBLE,
} from "./constantes";

/* -------------------------------- Badges -------------------------------- */

/** Estado de una lectura: Válida / Inconsistente / Anulada. */
export function BadgeEstadoLectura({ estado, inconsistente }: { estado?: string; inconsistente?: boolean }) {
  return <Badge variant={tonoEstadoLectura(estado, inconsistente)}>{etiquetaEstadoLectura(estado, inconsistente)}</Badge>;
}

/** Estado de propagación hacia Activos (siempre visible en la consulta). */
export function BadgeSyncActivo({ valor, motivo }: { valor?: string; motivo?: string | null }) {
  const v = valor ?? "pendiente";
  const etiqueta = ETIQUETA_SYNC_ACTIVO[v] ?? v;
  return (
    <Badge variant={tonoSyncActivo(v)} title={v === "fallida" && motivo ? motivo : undefined}>
      {etiqueta}
    </Badge>
  );
}

/** Estado de un tanqueo (vigente / anulada). */
export function BadgeEstadoTanqueo({ estado }: { estado?: string }) {
  const anulada = estado === "anulada";
  return <Badge variant={anulada ? "neutro" : "exito"}>{anulada ? "Anulado" : "Vigente"}</Badge>;
}

/** Etiqueta legible de un tipo de combustible (respaldo si no hay catálogo). */
export function etiquetaCombustible(clave?: string): string {
  if (!clave) return "—";
  return ETIQUETA_COMBUSTIBLE[clave] ?? clave;
}

/* -------------------------- Resultado de cálculo ------------------------ */

/**
 * Renderiza un `ResultadoCalculo` del resumen. Cuando el backend responde
 * `tipo: "sin-datos"` (o el valor es nulo), muestra literalmente "Sin datos"
 * y NUNCA 0 (mandato §7/§18). `unidad` es un sufijo opcional (h, km, L/h…).
 */
export function ValorCalculo({ resultado, unidad, decimales = 2 }: { resultado?: ResultadoCalculo | null; unidad?: string; decimales?: number }) {
  const sinDatos = !resultado || resultado.tipo === "sin-datos" || resultado.valor == null;
  if (sinDatos) {
    return (
      <span style={{ color: "var(--do-texto-suave)" }} title={resultado?.motivo ?? undefined}>
        Sin datos
      </span>
    );
  }
  const n = Number(resultado.valor);
  const texto = Number.isFinite(n) ? n.toFixed(decimales) : "Sin datos";
  return (
    <span>
      {texto}
      {unidad ? ` ${unidad}` : ""}
    </span>
  );
}

/* ---------------------------- Selector de activo ------------------------ */

export interface SelectorActivoProps {
  valor: string;
  onCambio: (activoId: string) => void;
  label?: string;
  /** Permite la opción "Todos" (para filtros de consulta). */
  permiteTodos?: boolean;
  obligatorio?: boolean;
  error?: string;
}

/**
 * Selector de activo alimentado por la consulta pública de Activos
 * (`useListado`, módulo /api/deltaops/activos). Reutiliza el hook existente
 * para no duplicar la fuente de verdad de los activos.
 */
export function SelectorActivo({ valor, onCambio, label = "Activo", permiteTodos = false, obligatorio = false, error }: SelectorActivoProps) {
  const { datos, cargando } = useListado({});
  const activos = datos ?? [];
  return (
    <Field label={label} required={obligatorio} error={error}>
      {cargando && activos.length === 0 ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-2)", color: "var(--do-texto-suave)" }}>
          <Spinner size="sm" /> Cargando activos…
        </span>
      ) : (
        <Select
          value={valor}
          placeholder={permiteTodos ? undefined : "Selecciona un activo"}
          onChange={(e) => onCambio(e.target.value)}
        >
          {permiteTodos && <option value="">Todos los activos</option>}
          {activos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codigoEmpresarial ? `${a.codigoEmpresarial} · ${a.nombre}` : a.nombre}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
