/**
 * DGP-008.3 · Renderer de un campo hoja del Dynamic Forms Engine.
 * Interpreta un `CampoFormulario` usando SÓLO componentes de formulario del DS.
 */
import React from "react";
import {
  Field,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch,
  RadioGroup,
  Radio,
} from "@workspace/design-system";
import type { CampoFormulario } from "@workspace/dynamic-forms/definicion";

export interface CampoRendererProps {
  campo: CampoFormulario;
  valor: unknown;
  onCambio: (valor: unknown) => void;
  obligatorio: boolean;
  soloLectura: boolean;
  error?: string;
  advertencia?: string;
}

export function CampoRenderer({
  campo,
  valor,
  onCambio,
  obligatorio,
  soloLectura,
  error,
  advertencia,
}: CampoRendererProps) {
  const id = `df-${campo.clave}`;
  const opciones = campo.opciones ?? campo.fuente?.opciones ?? [];
  const descripcion = advertencia && !error ? advertencia : campo.ayuda;

  let control: React.ReactNode;
  switch (campo.tipo) {
    case "numero":
    case "decimal":
      control = (
        <Input
          id={id}
          type="number"
          inputMode={campo.tipo === "numero" ? "numeric" : "decimal"}
          step={campo.tipo === "numero" ? 1 : "any"}
          value={valor == null ? "" : String(valor)}
          disabled={soloLectura}
          invalid={!!error}
          onChange={(e) => {
            const v = e.target.value;
            onCambio(v === "" ? undefined : Number(v));
          }}
        />
      );
      break;
    case "fecha":
      control = (
        <Input
          id={id}
          type="date"
          value={valor == null ? "" : String(valor)}
          disabled={soloLectura}
          invalid={!!error}
          onChange={(e) => onCambio(e.target.value || undefined)}
        />
      );
      break;
    case "hora":
      control = (
        <Input id={id} type="time" value={valor == null ? "" : String(valor)} disabled={soloLectura}
          invalid={!!error} onChange={(e) => onCambio(e.target.value || undefined)} />
      );
      break;
    case "fechaHora":
      control = (
        <Input id={id} type="datetime-local" value={valor == null ? "" : String(valor)} disabled={soloLectura}
          invalid={!!error} onChange={(e) => onCambio(e.target.value || undefined)} />
      );
      break;
    case "booleano":
      control = (
        <Switch
          id={id}
          label={campo.etiqueta}
          checked={valor === true}
          disabled={soloLectura}
          onChange={(e) => onCambio(e.target.checked)}
        />
      );
      break;
    case "select":
    case "autocomplete":
      control = (
        <Select
          id={id}
          placeholder="Seleccione…"
          value={valor == null ? "" : String(valor)}
          disabled={soloLectura}
          invalid={!!error}
          onChange={(e) => onCambio(e.target.value || undefined)}
        >
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </Select>
      );
      break;
    case "multiSelect": {
      const seleccion = Array.isArray(valor) ? (valor as string[]) : [];
      control = (
        <div role="group" aria-label={campo.etiqueta} style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
          {opciones.map((o) => (
            <Checkbox
              key={o.valor}
              label={o.etiqueta}
              checked={seleccion.includes(o.valor)}
              disabled={soloLectura}
              onChange={(e) => {
                const set = new Set(seleccion);
                if (e.target.checked) set.add(o.valor);
                else set.delete(o.valor);
                onCambio([...set]);
              }}
            />
          ))}
        </div>
      );
      break;
    }
    case "checklist":
      control = (
        <RadioGroup
          label={campo.etiqueta}
          name={id}
          value={valor == null ? undefined : String(valor)}
          onChange={(v) => onCambio(v)}
          disabled={soloLectura}
        >
          {opciones.map((o) => (
            <Radio key={o.valor} value={o.valor} label={o.etiqueta} />
          ))}
        </RadioGroup>
      );
      break;
    case "adjunto":
    case "imagen":
      control = (
        <input
          id={id}
          type="file"
          className="do-input"
          accept={campo.tipo === "imagen" ? "image/*" : undefined}
          disabled={soloLectura}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onCambio(e.target.files?.[0] ?? undefined)}
          style={{ width: "100%" }}
        />
      );
      break;
    default: {
      // texto y variantes (codigoQr/codigoBarras/nfc) usan Input o Textarea.
      const largo = campo.restricciones?.longitudMax != null && campo.restricciones.longitudMax > 120;
      control = largo ? (
        <Textarea
          id={id}
          value={valor == null ? "" : String(valor)}
          disabled={soloLectura}
          invalid={!!error}
          onChange={(e) => onCambio(e.target.value || undefined)}
        />
      ) : (
        <Input
          id={id}
          value={valor == null ? "" : String(valor)}
          disabled={soloLectura}
          invalid={!!error}
          onChange={(e) => onCambio(e.target.value || undefined)}
        />
      );
    }
  }

  // booleano ya trae su propia etiqueta en el Switch.
  if (campo.tipo === "booleano") {
    return (
      <Field label={campo.etiqueta} htmlFor={id} required={obligatorio} error={error} description={descripcion}>
        {control}
      </Field>
    );
  }

  return (
    <Field label={campo.etiqueta} htmlFor={id} required={obligatorio} error={error} description={descripcion}>
      {control}
    </Field>
  );
}
