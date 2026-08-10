/**
 * DGP-017 · BrandingProvider compatible con el Design System.
 *
 * Aplica el branding del tenant de la sesión SÓLO mediante tokens seguros del
 * DS (`--do-*` controlados) y atributos verificados: nunca CSS arbitrario. Los
 * colores se validan como HEX antes de tocar variables; cualquier valor no
 * conforme se ignora (degradación a la identidad oficial DELTA). El tenant DEMO
 * conserva EXACTAMENTE el branding oficial DELTA: no se sobreescribe ningún
 * token cuando el branding no aporta valores válidos.
 */
import React, { createContext, useContext, useEffect, useMemo } from "react";
import type { Branding, Tenant } from "./tipos";

/** Códigos de tenant que SIEMPRE conservan la identidad oficial DELTA/DEMO. */
export const TENANTS_DELTA_OFICIAL = new Set(["DEMO", "DELTA"]);

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Un color es aplicable sólo si es HEX de 6 dígitos (token seguro). */
export function colorSeguro(valor: string | undefined): string | null {
  return valor && HEX.test(valor) ? valor : null;
}

/** URL es aplicable sólo si es http(s) absoluta (evita `javascript:` y datos). */
export function urlSegura(valor: string | undefined): string | null {
  if (!valor) return null;
  try {
    const u = new URL(valor);
    return u.protocol === "https:" || u.protocol === "http:" ? valor : null;
  } catch {
    return null;
  }
}

export interface BrandingResuelto {
  /** Nombre de la aplicación mostrado en la barra (por defecto DeltaOps). */
  readonly nombreApp: string;
  /** Nombre comercial de la empresa. */
  readonly nombreEmpresa: string;
  /** Logo permitido (URL segura) o null → usar el Logo oficial del DS. */
  readonly logoUrl: string | null;
  readonly logoAltUrl: string | null;
  readonly faviconUrl: string | null;
  readonly colorPrimario: string | null;
  readonly colorSecundario: string | null;
  /** True cuando el tenant mantiene la identidad oficial DELTA. */
  readonly esDeltaOficial: boolean;
}

const CtxBranding = createContext<BrandingResuelto | null>(null);

export function useBranding(): BrandingResuelto {
  const ctx = useContext(CtxBranding);
  if (!ctx) throw new Error("useBranding debe usarse dentro de <BrandingProvider>");
  return ctx;
}

/** Resuelve el branding efectivo a partir del tenant de la sesión. */
export function resolverBranding(tenant: Tenant): BrandingResuelto {
  const esDeltaOficial = TENANTS_DELTA_OFICIAL.has(tenant.codigo);
  const b: Branding = tenant.branding ?? {};
  // Para DELTA/DEMO no se aplican tokens de color/logo personalizados.
  return {
    nombreApp: (!esDeltaOficial && b.nombreApp) || "DeltaOps",
    nombreEmpresa: b.nombre || tenant.nombre,
    logoUrl: esDeltaOficial ? null : urlSegura(b.logoUrl),
    logoAltUrl: esDeltaOficial ? null : urlSegura(b.logoAltUrl),
    faviconUrl: esDeltaOficial ? null : urlSegura(b.faviconUrl),
    colorPrimario: esDeltaOficial ? null : colorSeguro(b.colorPrimario),
    colorSecundario: esDeltaOficial ? null : colorSeguro(b.colorSecundario),
    esDeltaOficial,
  };
}

export interface BrandingProviderProps {
  tenant: Tenant;
  children: React.ReactNode;
  /** Nodo raíz al que aplicar los tokens (por defecto document root). */
  target?: HTMLElement | null;
}

/**
 * Aplica los tokens del branding al contenedor y expone el branding resuelto.
 * Sólo se tocan variables `--do-primario`/`--do-secundario` (existentes en el
 * DS) con valores HEX validados; al desmontar/cambiar de tenant se limpian
 * para no filtrar branding entre empresas.
 */
export function BrandingProvider({ tenant, children, target }: BrandingProviderProps) {
  const resuelto = useMemo(() => resolverBranding(tenant), [tenant]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = target ?? document.documentElement;
    const previos = {
      primario: el.style.getPropertyValue("--do-primario"),
      secundario: el.style.getPropertyValue("--do-secundario"),
    };
    if (resuelto.colorPrimario) el.style.setProperty("--do-primario", resuelto.colorPrimario);
    if (resuelto.colorSecundario) el.style.setProperty("--do-secundario", resuelto.colorSecundario);
    return () => {
      // Restaurar para que un cambio de tenant no filtre branding anterior.
      if (previos.primario) el.style.setProperty("--do-primario", previos.primario);
      else el.style.removeProperty("--do-primario");
      if (previos.secundario) el.style.setProperty("--do-secundario", previos.secundario);
      else el.style.removeProperty("--do-secundario");
    };
  }, [resuelto, target]);

  // Favicon del tenant (solo URL segura; DELTA conserva el oficial del index).
  useEffect(() => {
    if (typeof document === "undefined" || !resuelto.faviconUrl) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const anterior = link?.getAttribute("href") ?? null;
    if (link) link.setAttribute("href", resuelto.faviconUrl);
    return () => {
      if (link && anterior) link.setAttribute("href", anterior);
    };
  }, [resuelto.faviconUrl]);

  return <CtxBranding.Provider value={resuelto}>{children}</CtxBranding.Provider>;
}
