/**
 * DGP-005 · Componentes núcleo del Design System DeltaOps.
 * Todos consumen exclusivamente tokens (--do-*). Prohibido hardcodear valores.
 */
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

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
import isotipoColor from "../assets/isotipo-color.png";

export type LogoVariant = "imagotipo" | "imagotipo-oscuro" | "isotipo";

const LOGO_SRC: Record<LogoVariant, string> = {
  imagotipo: logoColorNegro,
  "imagotipo-oscuro": logoBlanco,
  isotipo: isotipoColor,
};

/** Tamaños mínimos oficiales (Brandbook pág. 3): imagotipo 90px, isotipo 20px. */
export interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: LogoVariant;
  /** Ancho en px; se fuerza el mínimo oficial del Brandbook. */
  width?: number;
  alt?: string;
}

export function Logo({ variant = "imagotipo", width, alt = "DELTA", className, ...rest }: LogoProps) {
  const minimo = variant === "isotipo" ? 20 : 90;
  const ancho = Math.max(width ?? minimo, minimo);
  const clase = variant === "isotipo" ? "do-logo--isotipo" : "do-logo--imagotipo";
  return (
    <span className={cx("do-logo", clase, className)} {...rest}>
      <img src={LOGO_SRC[variant]} width={ancho} alt={alt} />
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
