/**
 * DGP-005 · Componentes de formulario del Design System DeltaOps.
 * Todos consumen exclusivamente tokens (--do-*). Prohibido hardcodear valores.
 * Accesibilidad AA: etiquetas, aria-*, foco visible global y navegación por teclado.
 */
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Check, Eye, EyeOff, Minus, Search, X } from "lucide-react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export type FieldSize = "sm" | "md" | "lg";

/* --------------------------------- Field -------------------------------- */

interface FieldContextValue {
  controlId: string;
  descriptionId?: string;
  errorId?: string;
  required: boolean;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Devuelve las props aria-* que un control debe recibir dentro de un Field. */
export function useFieldControl(): {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  required?: boolean;
} {
  const ctx = useContext(FieldContext);
  if (!ctx) return {};
  const describedBy = [ctx.descriptionId, ctx.errorId].filter(Boolean).join(" ") || undefined;
  return {
    id: ctx.controlId,
    "aria-describedby": describedBy,
    "aria-invalid": ctx.invalid || undefined,
    "aria-required": ctx.required || undefined,
    required: ctx.required || undefined,
  };
}

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Texto de la etiqueta visible del campo. */
  label: ReactNode;
  /** Texto de ayuda/descripción opcional. */
  description?: ReactNode;
  /** Mensaje de error; si está presente, marca el campo como inválido. */
  error?: ReactNode;
  /** Marca el campo como obligatorio. */
  required?: boolean;
  /** Id del control asociado (por defecto se genera automáticamente). */
  htmlFor?: string;
}

export function Field({
  label,
  description,
  error,
  required = false,
  htmlFor,
  className,
  children,
  ...rest
}: FieldProps) {
  const autoId = useId();
  const controlId = htmlFor ?? `do-campo-${autoId}`;
  const descriptionId = description ? `${controlId}-desc` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const invalid = Boolean(error);

  return (
    <FieldContext.Provider value={{ controlId, descriptionId, errorId, required, invalid }}>
      <div className={cx("do-campo", invalid && "do-campo--error", className)} {...rest}>
        <label className="do-campo__label" htmlFor={controlId}>
          {label}
          {required && (
            <span className="do-campo__requerido" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
        {description && (
          <p className="do-campo__desc" id={descriptionId}>
            {description}
          </p>
        )}
        {children}
        {error && (
          <p className="do-campo__error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/* --------------------------------- Input -------------------------------- */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: FieldSize;
  /** Icono decorativo mostrado antes del texto. */
  prefijo?: ReactNode;
  /** Icono decorativo o acción mostrada después del texto. */
  sufijo?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", prefijo, sufijo, invalid, type = "text", className, disabled, readOnly, ...rest },
  ref,
) {
  const field = useFieldControl();
  const esInvalido = invalid ?? field["aria-invalid"] ?? false;
  return (
    <span
      className={cx(
        "do-input",
        `do-input--${size}`,
        esInvalido && "do-input--error",
        disabled && "do-input--disabled",
        readOnly && "do-input--readonly",
        className,
      )}
    >
      {prefijo && (
        <span className="do-input__adorno do-input__adorno--prefijo" aria-hidden="true">
          {prefijo}
        </span>
      )}
      <input
        ref={ref}
        type={type}
        className="do-input__control"
        disabled={disabled}
        readOnly={readOnly}
        {...field}
        aria-invalid={esInvalido || undefined}
        {...rest}
      />
      {sufijo && <span className="do-input__adorno do-input__adorno--sufijo">{sufijo}</span>}
    </span>
  );
});

/* ----------------------------- PasswordInput ---------------------------- */

export interface PasswordInputProps extends Omit<InputProps, "type" | "sufijo"> {
  /** Etiqueta accesible del botón de mostrar/ocultar. */
  mostrarLabel?: string;
  ocultarLabel?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { mostrarLabel = "Mostrar contraseña", ocultarLabel = "Ocultar contraseña", ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      type={visible ? "text" : "password"}
      sufijo={
        <button
          type="button"
          className="do-input__accion"
          aria-label={visible ? ocultarLabel : mostrarLabel}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          tabIndex={0}
        >
          {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      }
      {...rest}
    />
  );
});

/* ------------------------------ SearchInput ----------------------------- */

export interface SearchInputProps extends Omit<InputProps, "type" | "prefijo"> {
  /** Etiqueta accesible del botón limpiar. */
  limpiarLabel?: string;
  onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { limpiarLabel = "Limpiar búsqueda", onClear, value, defaultValue, onChange, ...rest },
  ref,
) {
  const [interno, setInterno] = useState<string>(
    typeof defaultValue === "string" ? defaultValue : "",
  );
  const controlado = value !== undefined;
  const actual = controlado ? String(value ?? "") : interno;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLInputElement | null }).current = node;
  };

  const manejarCambio = (e: ChangeEvent<HTMLInputElement>) => {
    if (!controlado) setInterno(e.target.value);
    onChange?.(e);
  };

  const limpiar = () => {
    if (!controlado) setInterno("");
    onClear?.();
    inputRef.current?.focus();
  };

  return (
    <Input
      ref={setRefs}
      type="search"
      role="searchbox"
      value={controlado ? value : interno}
      onChange={manejarCambio}
      prefijo={<Search size={20} aria-hidden="true" />}
      sufijo={
        actual ? (
          <button
            type="button"
            className="do-input__accion"
            aria-label={limpiarLabel}
            onClick={limpiar}
          >
            <X size={20} aria-hidden="true" />
          </button>
        ) : undefined
      }
      {...rest}
    />
  );
});

/* ------------------------------- Textarea ------------------------------- */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: FieldSize;
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = "md", invalid, className, disabled, readOnly, rows = 4, ...rest },
  ref,
) {
  const field = useFieldControl();
  const esInvalido = invalid ?? field["aria-invalid"] ?? false;
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cx(
        "do-textarea",
        `do-textarea--${size}`,
        esInvalido && "do-textarea--error",
        className,
      )}
      disabled={disabled}
      readOnly={readOnly}
      {...field}
      aria-invalid={esInvalido || undefined}
      {...rest}
    />
  );
});

/* ------------------------------- Checkbox ------------------------------- */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Etiqueta visible junto a la casilla. */
  label?: ReactNode;
  size?: FieldSize;
  /** Estado indeterminado (parcial). */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, size = "md", indeterminate = false, className, disabled, id, ...rest },
  ref,
) {
  const autoId = useId();
  const controlId = id ?? `do-check-${autoId}`;
  const innerRef = useRef<HTMLInputElement | null>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLInputElement | null }).current = node;
  };

  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label
      className={cx("do-checkbox", `do-checkbox--${size}`, disabled && "do-checkbox--disabled", className)}
      htmlFor={controlId}
    >
      <span className="do-checkbox__caja">
        <input
          ref={setRefs}
          id={controlId}
          type="checkbox"
          className="do-checkbox__control"
          disabled={disabled}
          aria-checked={indeterminate ? "mixed" : undefined}
          {...rest}
        />
        <span className="do-checkbox__marca" aria-hidden="true">
          {indeterminate ? <Minus size={16} /> : <Check size={16} />}
        </span>
      </span>
      {label && <span className="do-checkbox__label">{label}</span>}
    </label>
  );
});

/* ---------------------------- RadioGroup / Radio ------------------------ */

interface RadioContextValue {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  size: FieldSize;
  disabled?: boolean;
}

const RadioContext = createContext<RadioContextValue | null>(null);

export interface RadioGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Nombre compartido por los radios del grupo. */
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  size?: FieldSize;
  disabled?: boolean;
  /** Etiqueta accesible del grupo (obligatoria si no hay Field envolvente). */
  label?: string;
  orientation?: "vertical" | "horizontal";
}

export function RadioGroup({
  name,
  value,
  defaultValue,
  onChange,
  size = "md",
  disabled,
  label,
  orientation = "vertical",
  className,
  children,
  ...rest
}: RadioGroupProps) {
  const autoName = useId();
  const [interno, setInterno] = useState<string | undefined>(defaultValue);
  const controlado = value !== undefined;
  const actual = controlado ? value : interno;
  const groupRef = useRef<HTMLDivElement | null>(null);

  const seleccionar = (v: string) => {
    if (!controlado) setInterno(v);
    onChange?.(v);
  };

  const manejarTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    const teclas = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"];
    if (!teclas.includes(e.key)) return;
    const nodo = groupRef.current;
    if (!nodo) return;
    const radios = Array.from(
      nodo.querySelectorAll<HTMLInputElement>("input[type='radio']:not(:disabled)"),
    );
    if (radios.length === 0) return;
    e.preventDefault();
    const indiceActual = radios.findIndex((r) => r.checked);
    const adelante = e.key === "ArrowDown" || e.key === "ArrowRight";
    let siguiente = indiceActual + (adelante ? 1 : -1);
    if (siguiente < 0) siguiente = radios.length - 1;
    if (siguiente >= radios.length) siguiente = 0;
    const objetivo = radios[siguiente];
    objetivo.focus();
    seleccionar(objetivo.value);
  };

  return (
    <RadioContext.Provider value={{ name: name ?? `do-radio-${autoName}`, value: actual, onChange: seleccionar, size, disabled }}>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={label}
        aria-orientation={orientation}
        className={cx("do-radiogroup", `do-radiogroup--${orientation}`, className)}
        onKeyDown={manejarTeclado}
        {...rest}
      >
        {children}
      </div>
    </RadioContext.Provider>
  );
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "onChange"> {
  value: string;
  label?: ReactNode;
  size?: FieldSize;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { value, label, size, className, disabled, id, ...rest },
  ref,
) {
  const ctx = useContext(RadioContext);
  const autoId = useId();
  const controlId = id ?? `do-radio-op-${autoId}`;
  const tamano = size ?? ctx?.size ?? "md";
  const inhabilitado = disabled || ctx?.disabled;
  const marcado = ctx ? ctx.value === value : undefined;

  return (
    <label
      className={cx("do-radio", `do-radio--${tamano}`, inhabilitado && "do-radio--disabled", className)}
      htmlFor={controlId}
    >
      <span className="do-radio__caja">
        <input
          ref={ref}
          id={controlId}
          type="radio"
          className="do-radio__control"
          name={ctx?.name}
          value={value}
          checked={marcado}
          disabled={inhabilitado}
          onChange={() => ctx?.onChange?.(value)}
          {...rest}
        />
        <span className="do-radio__punto" aria-hidden="true" />
      </span>
      {label && <span className="do-radio__label">{label}</span>}
    </label>
  );
});

/* -------------------------------- Switch -------------------------------- */

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  size?: FieldSize;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, size = "md", className, disabled, checked, defaultChecked, onChange, id, ...rest },
  ref,
) {
  const autoId = useId();
  const controlId = id ?? `do-switch-${autoId}`;
  return (
    <label
      className={cx("do-switch", `do-switch--${size}`, disabled && "do-switch--disabled", className)}
      htmlFor={controlId}
    >
      <input
        ref={ref}
        id={controlId}
        type="checkbox"
        role="switch"
        className="do-switch__control"
        disabled={disabled}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        {...rest}
      />
      <span className="do-switch__pista" aria-hidden="true">
        <span className="do-switch__perilla" />
      </span>
      {label && <span className="do-switch__label">{label}</span>}
    </label>
  );
});

/* -------------------------------- Select -------------------------------- */

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: FieldSize;
  invalid?: boolean;
  /** Texto de la opción placeholder inicial (deshabilitada). */
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", invalid, placeholder, className, disabled, children, value, defaultValue, ...rest },
  ref,
) {
  const field = useFieldControl();
  const esInvalido = invalid ?? field["aria-invalid"] ?? false;
  return (
    <span
      className={cx(
        "do-select",
        `do-select--${size}`,
        esInvalido && "do-select--error",
        disabled && "do-select--disabled",
        className,
      )}
    >
      <select
        ref={ref}
        className="do-select__control"
        disabled={disabled}
        value={value}
        defaultValue={defaultValue ?? (placeholder && value === undefined ? "" : undefined)}
        {...field}
        aria-invalid={esInvalido || undefined}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <span className="do-select__flecha" aria-hidden="true" />
    </span>
  );
});

/* ------------------------------ FormActions ----------------------------- */

export interface FormActionsProps extends HTMLAttributes<HTMLDivElement> {
  /** Alineación horizontal de las acciones. */
  align?: "inicio" | "centro" | "fin" | "distribuido";
}

export function FormActions({ align = "fin", className, children, ...rest }: FormActionsProps) {
  return (
    <div className={cx("do-form-actions", `do-form-actions--${align}`, className)} {...rest}>
      {children}
    </div>
  );
}
