/**
 * DGP-014 · Wizard de creación de un programa preventivo.
 * Construido sobre el Dynamic Forms Engine (`plantillaPrograma`) y el DS
 * `Wizard`. Pasos: generales, jerarquía (padre real), planes (selección real de
 * modulo.planes), alcance de activos (selección real del inventario), vigencia/
 * SLA. Validación por paso, revisión y creación con degradación offline
 * (client-minted id). Puede anclarse a un activo (`?activo=`) o a un padre
 * (`?padreId=`).
 */
import React, { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { PageHeader, Card, CardContent, Wizard, Button, Alert } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellPreventivo } from "../lib/preventivo/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo, useProgramas } from "../lib/preventivo/hooks";
import { usePlanes } from "../lib/planes/hooks";
import { useListado as useActivosListado } from "../lib/activos/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaPrograma } from "../lib/forms/plantillas-preventivo";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearPrograma } from "../lib/preventivo/mutaciones";
import { construirInputPrograma } from "../lib/preventivo/alta";
import { nuevoOpId } from "../lib/offline/cola";
import { CATALOGO_TIPO_PROGRAMA, CATALOGO_CLASIFICACION } from "../lib/preventivo/constantes";
import { urlPrograma, leerParam } from "../lib/preventivo/deep-links";

const REGLAS = {};

const PASOS: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "generales", etiqueta: "Datos generales", campos: ["nombre", "codigo", "descripcion", "tipo", "clasificacion", "disparador"] },
  { clave: "jerarquia", etiqueta: "Jerarquía", campos: ["padreId"] },
  { clave: "planes", etiqueta: "Planes referenciados", campos: ["planes"] },
  { clave: "alcance", etiqueta: "Alcance de activos", campos: ["activos"] },
  { clave: "vigencia", etiqueta: "Vigencia y SLA", campos: ["vigenciaDesde", "vigenciaHasta"] },
];

export default function PreventivoProgramaNuevaPage() {
  return (
    <ShellPreventivo activo="/preventivo/programas/nuevo">
      <WizardPrograma />
    </ShellPreventivo>
  );
}

function mapa(r: { clave: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.clave, etiqueta: o.etiqueta }));
}

function WizardPrograma() {
  const [, navegar] = useLocation();
  const search = useSearch();
  const activoAncla = leerParam(search, "activo");
  const padreAncla = leerParam(search, "padreId");
  const { cola } = useOffline();

  const tipos = useCatalogo(CATALOGO_TIPO_PROGRAMA);
  const clasificaciones = useCatalogo(CATALOGO_CLASIFICACION);
  const programas = useProgramas({ limit: 300 });
  const planes = usePlanes({ limit: 300 });
  const activos = useActivosListado({});

  const opcPlanes = useMemo<OpcionSeleccion[]>(
    () => (planes.datos ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre })),
    [planes.datos],
  );
  const opcActivos = useMemo<OpcionSeleccion[]>(
    () => (activos.datos ?? []).map((a) => ({ valor: a.id, etiqueta: `${a.nombre} (${a.codigoEmpresarial})` })),
    [activos.datos],
  );
  const opcPadres = useMemo<OpcionSeleccion[]>(
    () => (programas.datos ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre })),
    [programas.datos],
  );

  const definicion = useMemo(
    () => plantillaPrograma({
      tipos: mapa(tipos.datos ?? []),
      clasificaciones: mapa(clasificaciones.datos ?? []),
      padres: opcPadres,
      planes: opcPlanes,
      activos: opcActivos,
    }),
    [tipos.datos, clasificaciones.datos, opcPadres, opcPlanes, opcActivos],
  );

  const [valores, setValores] = useState<ValoresFormulario>(() => ({
    ...(activoAncla ? { activos: [{ activoId: activoAncla }] } : {}),
    ...(padreAncla ? { padreId: padreAncla } : {}),
  }));
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [pasoActual, setPasoActual] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tono: "exito" | "info" | "error"; texto: string; id?: string } | null>(null);

  function pasoValido(indice: number): boolean {
    const paso = PASOS[indice];
    if (!paso) return true;
    const h = validar(definicion, REGLAS, valores).filter((x) => paso.campos.includes(x.campo));
    return !hayBloqueos(h);
  }

  function alCambiarPaso(indice: number) {
    const visibles = PASOS.slice(0, Math.max(indice, pasoActual)).flatMap((p) => p.campos);
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
    const input = construirInputPrograma(valores);
    if (!input.nombre || !input.tipo) {
      setResultado({ tono: "error", texto: "Nombre y tipo son obligatorios." });
      return;
    }
    setEnviando(true);
    const id = nuevoOpId();
    const r = await crearPrograma(cola, input, { id });
    setEnviando(false);
    if (r.encolada) {
      setResultado({ tono: "info", texto: "Sin conexión: el programa se ha encolado y se sincronizará automáticamente.", id });
    } else if (r.error) {
      setResultado({ tono: "error", texto: r.error.message });
    } else {
      const idResp = (r.resultado as { id?: string } | undefined)?.id ?? id;
      setResultado({ tono: "exito", texto: "Programa creado (en Borrador). Añade actividades y publícalo desde la ficha.", id: idResp });
    }
  }

  const pasosForm = PASOS.map((p, indice) => ({
    id: p.clave,
    etiqueta: p.etiqueta,
    contenido: (
      <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} soloClaves={p.campos} />
    ),
    validar: () => pasoValido(indice),
  }));

  const pasos = [
    ...pasosForm,
    {
      id: "confirmacion",
      etiqueta: "Confirmación",
      contenido: (
        <Card><CardContent>
          <p>Al confirmar se creará el programa <strong>{String(valores.nombre ?? "")}</strong> en estado <strong>Borrador</strong>.</p>
          <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>La publicación (gobernada por Workflow) es una decisión explícita posterior. Sin conexión, el alta se guardará en la cola de sincronización.</p>
        </CardContent></Card>
      ),
    },
  ];

  if (resultado?.tono === "exito" || resultado?.tono === "info") {
    return (
      <>
        <PageHeader titulo="Nuevo programa" />
        <Alert variant={resultado.tono === "exito" ? "exito" : "info"} titulo={resultado.texto} />
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {resultado.id && <Button variant="primario" onClick={() => navegar(urlPrograma(resultado.id!))}>Ver programa</Button>}
          <Button variant="secundario" onClick={() => navegar("/preventivo/programas")}>Ir a programas</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Nuevo programa preventivo"
        descripcion="Completa los pasos para definir el programa de forma 100% declarativa."
      />
      {activoAncla && <Alert variant="info" titulo={`Programa anclado al activo ${activoAncla}`} />}
      {padreAncla && <Alert variant="info" titulo={`Sub-programa del padre ${padreAncla}`} />}
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
            etiquetaFinalizar={enviando ? "Creando…" : "Crear programa"}
          />
        </CardContent>
      </Card>
    </>
  );
}
