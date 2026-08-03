/**
 * DGP-005 · Design Tokens oficiales de DeltaOps.
 * ÚNICA fuente de verdad tipada. Los valores literales provienen de
 * `brand/tokens/tokens.json` (Brandbook oficial DELTA + decisiones
 * conservadoras documentadas en brand/documentation/ANALISIS-BRANDBOOK.md).
 *
 * Prohibido escribir valores visuales manualmente en componentes:
 * todo componente debe consumir estos tokens o las variables CSS `--do-*`.
 */

export const brand = {
  /** Brandbook pág. 5–6 (valores exactos) */
  blanco: "#FFFFFF",
  rojo: "#D2002B",
  rojoOscuro: "#BA0C2F",
  oceano: "#080A16",
  negro: "#000000",
  rojo50: "rgba(210, 0, 43, 0.5)",
  rojo20: "rgba(210, 0, 43, 0.2)",
} as const;

/** Escala de grises derivada (mezcla Blanco↔Oceano; decisión conservadora) */
export const gris = {
  50: "#F4F4F6",
  100: "#E8E9EC",
  200: "#D2D3D8",
  300: "#B0B2BA",
  400: "#83858F",
  500: "#5C5E6A",
  600: "#41434F",
  700: "#2B2D39",
  800: "#191B26",
  900: "#0E101B",
} as const;

/** Semánticos (error = Rojo oficial; resto conservador, solo feedback; AA como texto sobre claro) */
export const semantico = {
  exito: "#15803D",
  advertencia: "#A16207",
  error: brand.rojo,
  info: "#1D4ED8",
} as const;

export const tipografia = {
  familias: {
    principal: "'Montserrat', sans-serif",
    secundaria: "'Roboto', sans-serif",
    mono: "'Roboto Mono', monospace",
  },
  escala: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
  },
  pesos: { regular: 400, medio: 500, semibold: 600, bold: 700 },
  tracking: { normal: "0", etiquetas: "0.05em" },
  interlineado: { compacto: 1.25, normal: 1.5, amplio: 1.75 },
} as const;

export const espaciado = {
  0: "0",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

export const radios = { sm: "4px", md: "8px", lg: "12px", xl: "16px", full: "9999px" } as const;
export const bordes = { fino: "1px", medio: "2px", grueso: "4px" } as const;

export const sombras = {
  sm: "0 1px 2px rgba(8, 10, 22, 0.08)",
  md: "0 2px 8px rgba(8, 10, 22, 0.12)",
  lg: "0 8px 24px rgba(8, 10, 22, 0.16)",
  xl: "0 16px 48px rgba(8, 10, 22, 0.24)",
} as const;

export const opacidades = { disabled: 0.5, hover: 0.9, overlay: 0.6, sutil: 0.08 } as const;

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  drawer: 1200,
  modal: 1300,
  toast: 1400,
  tooltip: 1500,
} as const;

export const breakpoints = { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" } as const;

export const grilla = { columnas: 12, gutter: "24px", margen: "16px", maxAncho: "1280px" } as const;

export const motion = {
  duracion: { rapida: "150ms", normal: "200ms", lenta: "300ms" },
  curvas: { estandar: "cubic-bezier(0.2, 0, 0, 1)", salida: "ease-out", entrada: "ease-in" },
} as const;

export const focus = { anillo: `2px solid ${brand.rojo}`, offset: "2px" } as const;

export const iconografia = { familia: "lucide", trazo: 2, tamanos: { sm: 16, md: 20, lg: 24 } } as const;

/** Restricciones oficiales del logotipo (Brandbook pág. 3) */
export const logo = {
  imagotipoMinimoPx: 90,
  isotipoMinimoPx: 20,
  areaReserva: "contraforma interna de la letra A (su anchura)",
} as const;

export const tokens = {
  brand,
  gris,
  semantico,
  tipografia,
  espaciado,
  radios,
  bordes,
  sombras,
  opacidades,
  zIndex,
  breakpoints,
  grilla,
  motion,
  focus,
  iconografia,
  logo,
} as const;

export type Tokens = typeof tokens;
