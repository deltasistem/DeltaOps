/**
 * DGP-005 · Componentes avanzados del Design System DeltaOps.
 * Stepper, Wizard, ChartWrapper, ThemeProvider/useTheme, I18nProvider/useI18n.
 * Todos consumen exclusivamente tokens (--do-*). Prohibido hardcodear valores.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";
import { Button } from "./core";
import { FormActions } from "./forms";
import { Skeleton } from "./overlays";
import { EmptyState, ErrorState } from "./data";
import { brand, gris, semantico } from "../tokens";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ===================================================================== */
/* Stepper                                                               */
/* ===================================================================== */

export interface StepperPaso {
  id: string;
  etiqueta: string;
  descripcion?: string;
}

export type StepperOrientacion = "horizontal" | "vertical";

export interface StepperProps extends Omit<HTMLAttributes<HTMLOListElement>, "children"> {
  pasos: StepperPaso[];
  /** Índice (0-indexado) del paso actual. */
  actual: number;
  orientation?: StepperOrientacion;
  label?: string;
}

export function Stepper({
  pasos,
  actual,
  orientation = "horizontal",
  label = "Progreso por pasos",
  className,
  ...rest
}: StepperProps) {
  return (
    <ol
      className={cx("do-stepper", `do-stepper--${orientation}`, className)}
      aria-label={label}
      {...rest}
    >
      {pasos.map((paso, i) => {
        const completado = i < actual;
        const esActual = i === actual;
        const estado = completado ? "completado" : esActual ? "actual" : "pendiente";
        return (
          <li
            key={paso.id}
            className={cx("do-stepper__item", `do-stepper__item--${estado}`)}
            aria-current={esActual ? "step" : undefined}
          >
            <span className="do-stepper__marcador" aria-hidden="true">
              {completado ? <Check size={16} /> : <span className="do-stepper__numero">{i + 1}</span>}
            </span>
            <span className="do-stepper__texto">
              <span className="do-stepper__etiqueta">{paso.etiqueta}</span>
              {paso.descripcion && <span className="do-stepper__descripcion">{paso.descripcion}</span>}
            </span>
            {i < pasos.length - 1 && <span className="do-stepper__linea" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ===================================================================== */
/* Wizard                                                                */
/* ===================================================================== */

export interface WizardPaso {
  id: string;
  etiqueta: string;
  contenido: ReactNode;
  /** Si devuelve false, se bloquea el avance al siguiente paso. */
  validar?: () => boolean;
}

export interface WizardProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  pasos: WizardPaso[];
  /** Índice (0-indexado) del paso activo. Componente controlado. */
  actual: number;
  onCambio: (indice: number) => void;
  onFinalizar?: () => void;
  etiquetaSiguiente?: string;
  etiquetaAnterior?: string;
  etiquetaFinalizar?: string;
  orientation?: StepperOrientacion;
}

export function Wizard({
  pasos,
  actual,
  onCambio,
  onFinalizar,
  etiquetaSiguiente = "Siguiente",
  etiquetaAnterior = "Anterior",
  etiquetaFinalizar = "Finalizar",
  orientation = "horizontal",
  className,
  ...rest
}: WizardProps) {
  const baseId = useId();
  const pasoActual = pasos[actual];
  const esPrimero = actual <= 0;
  const esUltimo = actual >= pasos.length - 1;
  const puedeAvanzar = pasoActual?.validar ? pasoActual.validar() !== false : true;

  const panelId = `${baseId}-panel`;
  const tabId = `${baseId}-tab`;

  function anterior() {
    if (!esPrimero) onCambio(actual - 1);
  }

  function siguiente() {
    if (!puedeAvanzar) return;
    if (esUltimo) {
      onFinalizar?.();
    } else {
      onCambio(actual + 1);
    }
  }

  return (
    <div className={cx("do-wizard", className)} {...rest}>
      <Stepper pasos={pasos} actual={actual} orientation={orientation} />
      <div
        role="group"
        id={panelId}
        aria-labelledby={tabId}
        className="do-wizard__panel"
      >
        <span id={tabId} className="do-wizard__paso-etiqueta">
          {pasoActual?.etiqueta}
        </span>
        <div className="do-wizard__contenido">{pasoActual?.contenido}</div>
      </div>
      <FormActions align="distribuido" className="do-wizard__acciones">
        <Button variant="secundario" onClick={anterior} disabled={esPrimero}>
          {etiquetaAnterior}
        </Button>
        <Button variant="primario" onClick={siguiente} disabled={!puedeAvanzar}>
          {esUltimo ? etiquetaFinalizar : etiquetaSiguiente}
        </Button>
      </FormActions>
    </div>
  );
}

/* ===================================================================== */
/* ChartWrapper                                                          */
/* ===================================================================== */

/**
 * Paleta categórica derivada de los tokens tipados (`../tokens`).
 * Rojo oficial primero, seguido de Oceano, grises y semánticos.
 * No usa getComputedStyle: los valores provienen de la fuente de verdad.
 */
export const paletaCategorica: string[] = [
  brand.rojo,
  brand.oceano,
  semantico.info,
  semantico.exito,
  semantico.advertencia,
  gris[400],
  brand.rojoOscuro,
  gris[600],
];

export interface ChartContexto {
  colores: string[];
}

export interface ChartWrapperProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  titulo: string;
  descripcion?: string;
  /** Alto del área del gráfico en px. Por defecto 280. */
  altura?: number;
  cargando?: boolean;
  error?: boolean;
  onReintentar?: () => void;
  vacio?: boolean;
  /** Mensaje del estado vacío. */
  vacioTexto?: string;
  children?: ReactNode;
  render?: (ctx: ChartContexto) => ReactNode;
}

export function ChartWrapper({
  titulo,
  descripcion,
  altura = 280,
  cargando = false,
  error = false,
  onReintentar,
  vacio = false,
  vacioTexto = "No hay datos para mostrar.",
  children,
  render,
  className,
  ...rest
}: ChartWrapperProps) {
  const baseId = useId();
  const tituloId = `${baseId}-titulo`;
  const descId = `${baseId}-desc`;

  function cuerpo() {
    if (cargando) {
      return (
        <div className="do-chart__cargando" aria-hidden="true">
          <Skeleton forma="bloque" ancho="100%" alto="100%" />
        </div>
      );
    }
    if (error) {
      return <ErrorState onReintentar={onReintentar} />;
    }
    if (vacio) {
      return <EmptyState titulo="Sin datos" descripcion={vacioTexto} />;
    }
    if (render) return render({ colores: paletaCategorica });
    return children;
  }

  return (
    <figure
      className={cx("do-chart", className)}
      role="figure"
      aria-labelledby={tituloId}
      aria-describedby={descripcion ? descId : undefined}
      {...rest}
    >
      <figcaption className="do-chart__cabecera">
        <span id={tituloId} className="do-chart__titulo">
          {titulo}
        </span>
        {descripcion && (
          <span id={descId} className="do-chart__descripcion">
            {descripcion}
          </span>
        )}
      </figcaption>
      <div className="do-chart__area" style={{ height: altura }}>
        {cuerpo()}
      </div>
    </figure>
  );
}

/* ===================================================================== */
/* ThemeProvider + useTheme (Theme Engine)                               */
/* ===================================================================== */

export type Tema = "light" | "dark" | "auto";

const TEMA_CLAVE = "do-tema";

export interface ThemeContextValor {
  tema: Tema;
  setTema: (tema: Tema) => void;
}

const ThemeContext = createContext<ThemeContextValor | null>(null);

function leerTemaPersistido(porDefecto: Tema): Tema {
  if (typeof window === "undefined") return porDefecto;
  const guardado = window.localStorage?.getItem(TEMA_CLAVE);
  if (guardado === "light" || guardado === "dark" || guardado === "auto") return guardado;
  return porDefecto;
}

function prefiereOscuro(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Aplica `data-do-theme` y sincroniza la clase `dark` (puente Tailwind). */
function aplicarTema(tema: Tema): void {
  if (typeof document === "undefined") return;
  const raiz = document.documentElement;
  raiz.setAttribute("data-do-theme", tema);
  const oscuro = tema === "dark" || (tema === "auto" && prefiereOscuro());
  raiz.classList.toggle("dark", oscuro);
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Tema inicial cuando no hay valor persistido. Por defecto 'auto'. */
  temaInicial?: Tema;
}

export function ThemeProvider({ children, temaInicial = "auto" }: ThemeProviderProps) {
  const [tema, setTemaEstado] = useState<Tema>(() => leerTemaPersistido(temaInicial));

  const setTema = useCallback((nuevo: Tema) => {
    setTemaEstado(nuevo);
    if (typeof window !== "undefined") {
      window.localStorage?.setItem(TEMA_CLAVE, nuevo);
    }
  }, []);

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  // Reacciona a cambios del sistema mientras el tema es 'auto'.
  useEffect(() => {
    if (tema !== "auto") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onCambio = () => aplicarTema("auto");
    mq.addEventListener?.("change", onCambio);
    return () => mq.removeEventListener?.("change", onCambio);
  }, [tema]);

  const valor = useMemo<ThemeContextValor>(() => ({ tema, setTema }), [tema, setTema]);

  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValor {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme debe usarse dentro de <ThemeProvider>.");
  }
  return ctx;
}

/* ===================================================================== */
/* I18nProvider + useI18n (internacionalización preparada)               */
/* ===================================================================== */

export type MensajesI18n = Record<string, Record<string, string>>;

export interface I18nContextValor {
  idioma: string;
  setIdioma: (idioma: string) => void;
  /** Traduce una clave; devuelve `porDefecto` (o la clave) si no existe. */
  t: (clave: string, porDefecto?: string) => string;
}

const I18nContext = createContext<I18nContextValor | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  /** Idioma activo. Por defecto 'es'. */
  idioma?: string;
  /** Diccionario por idioma: `{ es: { clave: texto } }`. */
  mensajes?: MensajesI18n;
}

export function I18nProvider({ children, idioma = "es", mensajes = {} }: I18nProviderProps) {
  const [idiomaActivo, setIdioma] = useState<string>(idioma);

  const t = useCallback(
    (clave: string, porDefecto?: string): string => {
      return mensajes[idiomaActivo]?.[clave] ?? porDefecto ?? clave;
    },
    [idiomaActivo, mensajes],
  );

  const valor = useMemo<I18nContextValor>(
    () => ({ idioma: idiomaActivo, setIdioma, t }),
    [idiomaActivo, t],
  );

  return <I18nContext.Provider value={valor}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValor {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n debe usarse dentro de <I18nProvider>.");
  }
  return ctx;
}
