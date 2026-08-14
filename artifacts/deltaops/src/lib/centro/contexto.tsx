/**
 * DELTAOPS LITE-03 · Contexto de CENTRO DE COSTOS (estado cliente de navegación).
 *
 * Decisión de Dirección (LITE-03 §3, LITE-02 §6 / DP-5): multicentro = varios
 * centros de costos DENTRO del mismo tenant. Un activo pertenece a UN centro de
 * costos; cambiar de contexto NUNCA duplica activos ni datos: sólo re-filtra la
 * experiencia. Es un estado de PRESENTACIÓN persistido por dispositivo, no un
 * cambio de modelo de datos, contrato ni RLS (el backend sigue siendo la
 * autoridad y filtra por tenant vía RLS).
 *
 * Valores REALES: el catálogo `centros-costo` del módulo de Activos
 * (`useCatalogo("centros-costo")`). No se inventan centros. Si el catálogo está
 * vacío, el selector no se muestra (estado vacío honesto) y el contexto
 * permanece en "Todos los centros".
 *
 * La persistencia vive por TENANT en localStorage para que cambiar de empresa no
 * arrastre el centro del tenant anterior.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** Valor sentinela: sin filtro de centro (ver todos). */
export const CENTRO_TODOS = "__todos__";

export interface OpcionCentro {
  readonly valor: string;
  readonly etiqueta: string;
}

export interface ContextoCentro {
  /** Centro activo (`CENTRO_TODOS` = todos los centros). */
  readonly centro: string;
  /** ¿Hay un centro específico seleccionado (distinto de "Todos")? */
  readonly hayCentro: boolean;
  /** Etiqueta legible del centro activo. */
  readonly etiquetaCentro: string;
  /** Cambia el centro activo (persiste por tenant). */
  readonly setCentro: (valor: string) => void;
  /** Opciones disponibles (del catálogo real). */
  readonly opciones: readonly OpcionCentro[];
}

const Ctx = createContext<ContextoCentro | null>(null);

function claveAlmacen(tenantId: string): string {
  return `deltaops:centro-costos:${tenantId}`;
}

export interface CentroCostosProviderProps {
  /** Tenant activo (aísla la preferencia por empresa). */
  readonly tenantId: string;
  /** Opciones reales del catálogo `centros-costo`. */
  readonly opciones: readonly OpcionCentro[];
  readonly children: React.ReactNode;
}

/**
 * Provider del contexto de centro de costos. Lee la preferencia persistida del
 * tenant; si el centro guardado ya no existe en el catálogo, cae a "Todos".
 */
export function CentroCostosProvider({ tenantId, opciones, children }: CentroCostosProviderProps) {
  const [centro, setCentroEstado] = useState<string>(CENTRO_TODOS);

  // Rehidratar la preferencia por tenant (una sola autoridad: localStorage).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const guardado = window.localStorage.getItem(claveAlmacen(tenantId));
      setCentroEstado(guardado && guardado !== "" ? guardado : CENTRO_TODOS);
    } catch {
      setCentroEstado(CENTRO_TODOS);
    }
  }, [tenantId]);

  // Si el catálogo carga y el centro persistido ya no existe, degradar a "Todos".
  useEffect(() => {
    if (centro === CENTRO_TODOS) return;
    if (opciones.length === 0) return;
    if (!opciones.some((o) => o.valor === centro)) {
      setCentroEstado(CENTRO_TODOS);
    }
  }, [opciones, centro]);

  const setCentro = useCallback(
    (valor: string) => {
      const limpio = valor && valor !== CENTRO_TODOS ? valor : CENTRO_TODOS;
      setCentroEstado(limpio);
      if (typeof window === "undefined") return;
      try {
        if (limpio === CENTRO_TODOS) window.localStorage.removeItem(claveAlmacen(tenantId));
        else window.localStorage.setItem(claveAlmacen(tenantId), limpio);
      } catch {
        /* almacenamiento no disponible: el contexto sigue vivo en memoria */
      }
    },
    [tenantId],
  );

  const valor = useMemo<ContextoCentro>(() => {
    const hayCentro = centro !== CENTRO_TODOS;
    const etiqueta = hayCentro ? opciones.find((o) => o.valor === centro)?.etiqueta ?? centro : "Todos los centros";
    return { centro, hayCentro, etiquetaCentro: etiqueta, setCentro, opciones };
  }, [centro, opciones, setCentro]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Consume el contexto de centro de costos. Devuelve un contexto NEUTRO
 * ("Todos", sin opciones) cuando no hay provider, para que las superficies
 * fuera de la experiencia empresarial no fallen.
 */
export function useCentroCostos(): ContextoCentro {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    centro: CENTRO_TODOS,
    hayCentro: false,
    etiquetaCentro: "Todos los centros",
    setCentro: () => {},
    opciones: [],
  };
}

/**
 * Lee el centro de costos de un registro heterogéneo (activo/orden). El módulo
 * de Activos guarda `centroCosto` dentro de `datos`; se toleran variantes de
 * nombre/anidamiento comunes sin cambiar el contrato del backend.
 */
export function centroDeRegistro(datos: Record<string, unknown> | null | undefined): string | null {
  if (!datos || typeof datos !== "object") return null;
  const directo = datos["centroCosto"] ?? datos["centro_costo"] ?? datos["centroDeCostos"] ?? datos["centroCostos"];
  if (typeof directo === "string" && directo !== "") return directo;
  if (directo && typeof directo === "object") {
    const o = directo as Record<string, unknown>;
    const v = o["valor"] ?? o["value"] ?? o["id"] ?? o["codigo"];
    if (typeof v === "string" && v !== "") return v;
  }
  return null;
}
