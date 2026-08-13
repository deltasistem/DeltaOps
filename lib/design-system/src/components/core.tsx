/**
 * DGP-005 · Componentes núcleo del Design System DeltaOps.
 * Todos consumen exclusivamente tokens (--do-*). Prohibido hardcodear valores.
 */
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------- Button --------------------------------- */

export type ButtonVariant = "primario" | "secundario" | "fantasma" | "peligro";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primario", size = "md", loading = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx("do-btn", `do-btn--${variant}`, `do-btn--${size}`, loading && "do-btn--cargando", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
      {loading && (
        <span className="do-btn__spinner" aria-hidden="true">
          <Spinner size="sm" />
        </span>
      )}
    </button>
  );
});

/* ------------------------------ IconButton ------------------------------ */

export interface IconButtonProps extends ButtonProps {
  /** Etiqueta accesible obligatoria (el botón solo muestra un icono). */
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", className, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      size={size}
      aria-label={label}
      title={label}
      className={cx(`do-iconbtn--${size}`, className)}
      {...rest}
    />
  );
});

/* -------------------------------- Spinner ------------------------------- */

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function Spinner({ size = "md", label = "Cargando", className, ...rest }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx("do-spinner", `do-spinner--${size}`, className)}
      {...rest}
    />
  );
}

/* -------------------------------- Divider ------------------------------- */

export function Divider({ vertical = false, className, ...rest }: { vertical?: boolean } & HTMLAttributes<HTMLHRElement>) {
  if (vertical) return <span className={cx("do-divider--vertical", className)} aria-hidden="true" />;
  return <hr className={cx("do-divider", className)} {...rest} />;
}

/* --------------------------------- Logo --------------------------------- */

import logoColorNegro from "../assets/logo-color-negro.png";
import logoBlanco from "../assets/logo-blanco.png";
import logoFullColorBlanco from "../assets/logo-full-color-blanco.png";
import isotipoColor from "../assets/isotipo-color.png";

// DGP-021.3 (§30.1/§30.2) · variantes del imagotipo:
//   - `imagotipo`        → delta a color + tipografía NEGRA (fondos CLAROS).
//   - `imagotipo-oscuro` → «Full color-Blanco»: delta ROJO + tipografía crema
//                          (fondos OSCUROS). Reemplaza el antiguo todo-blanco;
//                          `imagotipo-oscuro-legacy` conserva el blanco puro por
//                          si alguna superficie lo requiere explícitamente.
//   - `imagotipo-auto`   → selección AUTOMÁTICA según el tema EFECTIVO del
//                          ThemeProvider GLOBAL (nunca recolorea; sólo elige asset).
export type LogoVariant =
  | "imagotipo"
  | "imagotipo-oscuro"
  | "imagotipo-oscuro-legacy"
  | "imagotipo-auto"
  | "isotipo";

const LOGO_SRC: Record<Exclude<LogoVariant, "imagotipo-auto">, string> = {
  imagotipo: logoColorNegro,
  "imagotipo-oscuro": logoFullColorBlanco,
  "imagotipo-oscuro-legacy": logoBlanco,
  isotipo: isotipoColor,
};

/**
 * ¿El tema EFECTIVO es oscuro? Lee el estado que el `ThemeProvider` GLOBAL aplica
 * al `<html>` (clase `.dark`, que ya resuelve `auto` contra el sistema) y, como
 * respaldo, `data-do-theme` + `prefers-color-scheme`. NO crea un segundo sistema
 * de temas ni escribe nada: sólo OBSERVA para elegir el asset correcto.
 */
function usaTemaOscuro(): boolean {
  const suscribe = (cb: () => void): (() => void) => {
    if (typeof window === "undefined") return () => undefined;
    const raiz = document.documentElement;
    const mo = new MutationObserver(cb);
    mo.observe(raiz, { attributes: true, attributeFilter: ["class", "data-do-theme"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", cb);
    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", cb);
    };
  };
  const leer = (): boolean => {
    if (typeof document === "undefined") return false;
    const raiz = document.documentElement;
    if (raiz.classList.contains("dark")) return true;
    const tema = raiz.getAttribute("data-do-theme");
    if (tema === "dark") return true;
    if (tema === "light") return false;
    // Sin ThemeProvider montado o tema 'auto' sin clase aplicada: preferencia del SO.
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  };
  return useTemaOscuroImpl(suscribe, leer);
}

function useTemaOscuroImpl(suscribe: (cb: () => void) => () => void, leer: () => boolean): boolean {
  const [oscuro, setOscuro] = useState<boolean>(() => leer());
  useEffect(() => {
    setOscuro(leer());
    return suscribe(() => setOscuro(leer()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return oscuro;
}

/** Tamaños mínimos oficiales (Brandbook pág. 3): imagotipo 90px, isotipo 20px. */
export interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: LogoVariant;
  /** Ancho en px; se fuerza el mínimo oficial del Brandbook. */
  width?: number;
  alt?: string;
}

export function Logo({ variant = "imagotipo", width, alt = "DELTA", className, ...rest }: LogoProps) {
  // Selección AUTOMÁTICA por tema efectivo (§30.2): claro → color/negro; oscuro
  // → «Full color-Blanco» (delta rojo + tipografía crema). El logo nunca pierde
  //   contraste con el fondo del tema.
  const oscuro = usaTemaOscuro();
  const resuelto: Exclude<LogoVariant, "imagotipo-auto"> =
    variant === "imagotipo-auto" ? (oscuro ? "imagotipo-oscuro" : "imagotipo") : variant;

  const minimo = resuelto === "isotipo" ? 20 : 90;
  const ancho = Math.max(width ?? minimo, minimo);
  const clase = resuelto === "isotipo" ? "do-logo--isotipo" : "do-logo--imagotipo";
  return (
    <span className={cx("do-logo", clase, className)} {...rest}>
      <img src={LOGO_SRC[resuelto]} width={ancho} alt={alt} />
    </span>
  );
}

/* ---------------------------- Badge / Tag / Chip ------------------------- */

export type BadgeVariant = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "neutro", className, ...rest }: BadgeProps) {
  return <span className={cx("do-badge", variant !== "neutro" && `do-badge--${variant}`, className)} {...rest} />;
}

/** Tag: alias semántico de Badge neutro para clasificación de contenido. */
export function Tag(props: BadgeProps) {
  return <Badge {...props} />;
}

export interface ChipProps extends BadgeProps {
  onRemove?: () => void;
  removeLabel?: string;
}

export function Chip({ onRemove, removeLabel = "Quitar", children, className, ...rest }: ChipProps) {
  return (
    <Badge className={cx("do-chip", className)} {...rest}>
      {children}
      {onRemove && (
        <button type="button" className="do-chip__cerrar" aria-label={removeLabel} onClick={onRemove}>
          ×
        </button>
      )}
    </Badge>
  );
}

/* -------------------------------- Avatar -------------------------------- */

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  nombre: string;
  src?: string;
  size?: "sm" | "md" | "lg";
}

export function Avatar({ nombre, src, size = "md", className, ...rest }: AvatarProps) {
  const iniciales = nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className={cx("do-avatar", `do-avatar--${size}`, className)} role="img" aria-label={nombre} {...rest}>
      {src ? <img src={src} alt="" /> : iniciales}
    </span>
  );
}
