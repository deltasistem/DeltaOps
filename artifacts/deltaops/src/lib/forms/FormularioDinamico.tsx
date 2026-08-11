/**
 * DGP-008.3 · Renderer React genérico del Dynamic Forms Engine.
 *
 * Interpreta la estructura recursiva de una `DefinicionFormulario` (grupos,
 * secciones, pestañas, campos) y la pinta con componentes del DS. Las reglas
 * condicionales controlan visibilidad/obligatoriedad/solo-lectura/validación.
 *
 * Es controlado: recibe `valores` y `onCambio`. La validación se expone vía el
 * hook `useFormularioDinamico`.
 */
import React, { useMemo, useState } from "react";
import { Section, Card, CardContent, Tabs } from "@workspace/design-system";
import {
  hijosDe,
  type ContenedorFormulario,
  type DefinicionFormulario,
  type NodoFormulario,
} from "@workspace/dynamic-forms/definicion";
import type { EstadoCampoEvaluado } from "@workspace/dynamic-forms/condiciones";
import { CampoRenderer } from "./CampoRenderer";
import { evaluarEstados, validar, hayBloqueos } from "./motor";
import type { HallazgoCampo, MapaReglas, ValoresFormulario } from "./tipos";

export interface FormularioDinamicoProps {
  definicion: DefinicionFormulario;
  reglas?: MapaReglas;
  valores: ValoresFormulario;
  onCambio: (valores: ValoresFormulario) => void;
  /** Hallazgos de validación a mostrar (por clave). */
  hallazgos?: HallazgoCampo[];
  /** Limita el render a estas claves (pasos del wizard). */
  soloClaves?: readonly string[];
}

function Nodos({
  nodos,
  ctx,
  grid,
}: {
  nodos: readonly NodoFormulario[];
  ctx: ContextoRender;
  /** Distribuye los hijos en una rejilla responsive (útil para filtros). */
  grid?: boolean;
}) {
  const estilo: React.CSSProperties = grid
    ? { display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }
    : { display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" };
  return (
    <div style={estilo}>
      {nodos.map((n) => (
        <NodoRender key={n.clave} nodo={n} ctx={ctx} />
      ))}
    </div>
  );
}

interface ContextoRender {
  estados: Record<string, EstadoCampoEvaluado>;
  valores: ValoresFormulario;
  errores: Map<string, string>;
  advertencias: Map<string, string>;
  camposPorClave: Map<string, NodoFormulario>;
  onCampo: (clave: string, valor: unknown) => void;
  soloClaves?: readonly string[];
}

function NodoRender({ nodo, ctx }: { nodo: NodoFormulario; ctx: ContextoRender }) {
  if (nodo.clase === "campo") {
    if (ctx.soloClaves && !ctx.soloClaves.includes(nodo.clave)) return null;
    const estado = ctx.estados[nodo.clave];
    if (estado && !estado.visible) return null;
    return (
      <CampoRenderer
        campo={nodo}
        valor={ctx.valores[nodo.clave]}
        obligatorio={estado?.obligatorio ?? nodo.obligatorio ?? false}
        soloLectura={estado?.soloLectura ?? nodo.soloLectura ?? false}
        error={ctx.errores.get(nodo.clave)}
        advertencia={ctx.advertencias.get(nodo.clave)}
        onCambio={(v) => ctx.onCampo(nodo.clave, v)}
      />
    );
  }
  return <Contenedor nodo={nodo} ctx={ctx} />;
}

function Contenedor({ nodo, ctx }: { nodo: ContenedorFormulario; ctx: ContextoRender }) {
  if (nodo.tipo === "pestanas") {
    const items = (nodo.hijos ?? []).map((h) => ({
      id: h.clave,
      etiqueta: h.etiqueta,
      contenido: <NodoRender nodo={h} ctx={ctx} />,
    }));
    return <Tabs items={items} />;
  }
  if (nodo.tipo === "seccion") {
    return (
      <Section titulo={nodo.etiqueta}>
        <Card>
          <CardContent>
            <Nodos nodos={nodo.hijos ?? []} ctx={ctx} />
          </CardContent>
        </Card>
      </Section>
    );
  }
  // grupo / wizard (aplanado): render simple. Los grupos son PURA MAQUETACIÓN
  // (sin leyenda): sus hijos con varios campos hoja se distribuyen en rejilla
  // responsive (p. ej. filtros). El wizard aplanado conserva su leyenda.
  const hijos = hijosDe(nodo);
  const soloCampos = hijos.every((h) => h.clase === "campo");
  const usarGrid = nodo.tipo === "grupo" && soloCampos && hijos.length > 1;
  const mostrarLeyenda = nodo.tipo !== "grupo" && !!nodo.etiqueta;
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
      {mostrarLeyenda && (
        <legend style={{ fontWeight: "var(--do-peso-semibold)", marginBottom: "var(--do-sp-2)" }}>
          {nodo.etiqueta}
        </legend>
      )}
      <Nodos nodos={hijos} ctx={ctx} grid={usarGrid} />
    </fieldset>
  );
}

export function FormularioDinamico({
  definicion,
  reglas = {},
  valores,
  onCambio,
  hallazgos = [],
  soloClaves,
}: FormularioDinamicoProps) {
  const estados = useMemo(() => evaluarEstados(definicion, reglas, valores), [definicion, reglas, valores]);
  const errores = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of hallazgos) if (h.severidad !== "advertencia" && !m.has(h.campo)) m.set(h.campo, h.mensaje);
    return m;
  }, [hallazgos]);
  const advertencias = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of hallazgos) if (h.severidad === "advertencia" && !m.has(h.campo)) m.set(h.campo, h.mensaje);
    return m;
  }, [hallazgos]);

  const camposPorClave = useMemo(() => new Map<string, NodoFormulario>(), []);

  const ctx: ContextoRender = {
    estados,
    valores,
    errores,
    advertencias,
    camposPorClave,
    soloClaves,
    onCampo: (clave, valor) => onCambio({ ...valores, [clave]: valor }),
  };

  return <Nodos nodos={definicion.nodos} ctx={ctx} />;
}

/**
 * Hook de estado de un formulario dinámico. Gestiona los valores y expone la
 * validación bajo demanda.
 */
export function useFormularioDinamico(
  definicion: DefinicionFormulario,
  reglas: MapaReglas = {},
  inicial: ValoresFormulario = {},
) {
  const [valores, setValores] = useState<ValoresFormulario>(inicial);
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);

  const validarAhora = (claves?: readonly string[]): HallazgoCampo[] => {
    const h = validar(definicion, reglas, valores);
    const filtrado = claves ? h.filter((x) => claves.includes(x.campo)) : h;
    setHallazgos(filtrado);
    return filtrado;
  };

  return {
    valores,
    setValores,
    hallazgos,
    validarAhora,
    esValido: () => !hayBloqueos(validar(definicion, reglas, valores)),
  };
}
