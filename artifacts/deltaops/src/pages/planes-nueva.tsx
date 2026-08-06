/**
 * DGP-012 · Wizard de creación de un plan de mantenimiento.
 * Construido EXCLUSIVAMENTE sobre el Dynamic Forms Engine (`plantillaPlan`) y el
 * DS `Wizard`. Pasos: datos generales, alcance, frecuencias, rutina y
 * programación/calendario. Validación por paso (pura), revisión y creación con
 * degradación offline (client-minted id). Puede anclarse a un activo (`?activo=`).
 */
import React, { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { PageHeader, Card, CardContent, Wizard, Button, Alert } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellPlanes } from "../lib/planes/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo } from "../lib/planes/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaPlan } from "../lib/forms/plantillas-planes";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearPlan } from "../lib/planes/mutaciones";
import { construirInputPlan } from "../lib/planes/alta";
import { nuevoOpId } from "../lib/offline/cola";
import {
  CATALOGO_TIPO_PLAN,
  CATALOGO_ESTRATEGIA,
  CATALOGO_PRIORIDAD,
} from "../lib/planes/constantes";
import { urlPlan, leerParam } from "../lib/planes/deep-links";

const REGLAS = {};

/** Mapa de pasos del wizard → claves de campos (para validación por paso). */
const PASOS_PLAN: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "generales", etiqueta: "Datos generales", campos: ["nombre", "descripcion", "tipoPlan", "estrategia", "prioridad"] },
  { clave: "alcance", etiqueta: "Alcance de activos", campos: ["alcanceActivos", "alcanceCategorias", "alcanceFamilias", "alcanceSubfamilias", "alcanceEmpresas", "alcanceProyectos", "alcanceUbicaciones", "alcanceClases"] },
  { clave: "frecuencia", etiqueta: "Frecuencias", campos: ["frecuenciaModo", "reglas", "toleranciaAntes", "toleranciaDespues"] },
  { clave: "rutina", etiqueta: "Rutina y actividades", campos: ["rutinaNombre", "duracionTotalMin", "actividades"] },
  { clave: "programacion", etiqueta: "Programación y calendario", campos: ["vigenteDesde", "vigenteHasta", "calendarioId"] },
];

export default function PlanesNuevaPage() {
  return (
    <ShellPlanes activo="/planes/nuevo">
      <WizardPlan />
    </ShellPlanes>
  );
}

function mapa(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

function WizardPlan() {
  const [, navegar] = useLocation();
  const search = useSearch();
  const activoAncla = leerParam(search, "activo");
  const { cola } = useOffline();

  const tipos = useCatalogo(CATALOGO_TIPO_PLAN);
  const estrategias = useCatalogo(CATALOGO_ESTRATEGIA);
  const prioridades = useCatalogo(CATALOGO_PRIORIDAD);
  const definicion = useMemo(
    () => plantillaPlan({ tipos: mapa(tipos.datos ?? []), estrategias: mapa(estrategias.datos ?? []), prioridades: mapa(prioridades.datos ?? []) }),
    [tipos.datos, estrategias.datos, prioridades.datos],
  );

  const [valores, setValores] = useState<ValoresFormulario>(() => (activoAncla ? { alcanceActivos: activoAncla } : {}));
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [pasoActual, setPasoActual] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tono: "exito" | "info" | "error"; texto: string; id?: string } | null>(null);

  function pasoValido(indice: number): boolean {
    const paso = PASOS_PLAN[indice];
    if (!paso) return true;
    const h = validar(definicion, REGLAS, valores).filter((x) => paso.campos.includes(x.campo));
    return !hayBloqueos(h);
  }

  function alCambiarPaso(indice: number) {
    const visibles = PASOS_PLAN.slice(0, Math.max(indice, pasoActual)).flatMap((p) => p.campos);
    setHallazgos(validar(definicion, REGLAS, valores).filter((x) => visibles.includes(x.campo)));
    setPasoActual(indice);
  }

  async function finalizar() {
    const todos = validar(definicion, REGLAS, valores);
    setHallazgos(todos);
    if (hayBloqueos(todos)) {
      setResultado({ tono: "error", texto: "Hay campos obligatorios sin completar. Revisa los pasos marcados." });
      return;
    }
    const input = construirInputPlan(valores);
    if (input.rutina.actividades.length === 0) {
      setResultado({ tono: "error", texto: "La rutina requiere al menos una actividad." });
      return;
    }
    if (input.programa.frecuencia.reglas.length === 0) {
      setResultado({ tono: "error", texto: "Define al menos una regla de frecuencia." });
      return;
    }
    setEnviando(true);
    const conId = { ...input, id: input.id ?? nuevoOpId() };
    const r = await crearPlan(cola, conId);
    setEnviando(false);
    if (r.encolada) {
      setResultado({ tono: "info", texto: "Sin conexión: el plan se ha encolado y se sincronizará automáticamente.", id: conId.id });
    } else if (r.error) {
      setResultado({ tono: "error", texto: r.error.message });
    } else {
      const idResp = (r.resultado as { id?: string } | undefined)?.id ?? conId.id;
      setResultado({ tono: "exito", texto: "Plan creado correctamente (en Borrador). Publícalo desde la ficha para activarlo.", id: idResp });
    }
  }

  const pasosForm = PASOS_PLAN.map((p, indice) => ({
    id: p.clave,
    etiqueta: p.etiqueta,
    contenido: (
      <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} soloClaves={p.campos} />
    ),
    validar: () => pasoValido(indice),
  }));

  const pasos = [
    ...pasosForm,
    { id: "revision", etiqueta: "Revisión", contenido: <Revision valores={valores} /> },
    {
      id: "confirmacion",
      etiqueta: "Confirmación",
      contenido: (
        <Card><CardContent>
          <p>Al confirmar se creará el plan <strong>{String(valores.nombre ?? "")}</strong> en estado <strong>Borrador</strong>.</p>
          <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>La publicación (que lo pone Vigente) es una decisión explícita posterior, gobernada por Workflow. Si no hay conexión, el alta se guardará en la cola de sincronización.</p>
        </CardContent></Card>
      ),
    },
  ];

  if (resultado?.tono === "exito" || resultado?.tono === "info") {
    return (
      <>
        <PageHeader titulo="Nuevo plan" />
        <Alert variant={resultado.tono === "exito" ? "exito" : "info"} titulo={resultado.texto} />
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {resultado.id && <Button variant="primario" onClick={() => navegar(urlPlan(resultado.id!))}>Ver plan</Button>}
          <Button variant="secundario" onClick={() => navegar("/planes")}>Ir a planes</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Nuevo plan de mantenimiento"
        descripcion="Completa los pasos para definir el plan de forma 100% declarativa."
      />
      {activoAncla && <Alert variant="info" titulo={`Plan anclado al activo ${activoAncla}`} />}
      {resultado?.tono === "error" && <Alert variant="error" titulo={resultado.texto} />}
      <Card>
        <CardContent>
          <Wizard
            pasos={pasos}
            actual={pasoActual}
            onCambio={alCambiarPaso}
            onFinalizar={() => void finalizar()}
            etiquetaSiguiente="Siguiente"
            etiquetaAnterior="Anterior"
            etiquetaFinalizar={enviando ? "Creando…" : "Crear plan"}
          />
        </CardContent>
      </Card>
    </>
  );
}

function Revision({ valores }: { valores: ValoresFormulario }) {
  const reglas = Array.isArray(valores.reglas) ? valores.reglas : [];
  const actividades = Array.isArray(valores.actividades) ? valores.actividades : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <Card><CardContent>
        <strong>Resumen del plan</strong>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)", marginTop: "var(--do-sp-2)" }}>
          <dt style={{ color: "var(--do-texto-suave)" }}>Nombre</dt><dd style={{ margin: 0 }}>{String(valores.nombre ?? "—")}</dd>
          <dt style={{ color: "var(--do-texto-suave)" }}>Tipo</dt><dd style={{ margin: 0 }}>{String(valores.tipoPlan ?? "—")}</dd>
          <dt style={{ color: "var(--do-texto-suave)" }}>Estrategia</dt><dd style={{ margin: 0 }}>{String(valores.estrategia ?? "—")}</dd>
          <dt style={{ color: "var(--do-texto-suave)" }}>Prioridad</dt><dd style={{ margin: 0 }}>{String(valores.prioridad ?? "—")}</dd>
          <dt style={{ color: "var(--do-texto-suave)" }}>Reglas de frecuencia</dt><dd style={{ margin: 0 }}>{reglas.length}</dd>
          <dt style={{ color: "var(--do-texto-suave)" }}>Actividades</dt><dd style={{ margin: 0 }}>{actividades.length}</dd>
          <dt style={{ color: "var(--do-texto-suave)" }}>Vigente desde</dt><dd style={{ margin: 0 }}>{String(valores.vigenteDesde ?? "—")}</dd>
        </dl>
      </CardContent></Card>
    </div>
  );
}
