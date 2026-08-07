/**
 * DGP-015 · Wizard de alta rápida de una solicitud correctiva.
 * Construido sobre el Dynamic Forms Engine (`plantillaSolicitud`) y el DS
 * `Wizard`. Pasos: identificación, objeto afectado (activo real), síntomas y
 * prioridad (catálogos reales), clasificación de la falla y evidencias
 * referencia-only. Validación por paso, revisión y creación con degradación
 * offline (client-minted id). Puede anclarse a un activo (`?activo=`), p. ej.
 * desde el escaneo QR o la ficha del activo.
 */
import React, { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { PageHeader, Card, CardContent, Wizard, Button, Alert } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellCorrectivo } from "../lib/correctivo/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo } from "../lib/correctivo/hooks";
import { useListado as useActivosListado } from "../lib/activos/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaSolicitud } from "../lib/forms/plantillas-correctivo";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearSolicitud } from "../lib/correctivo/mutaciones";
import { construirInputSolicitud } from "../lib/correctivo/alta";
import { nuevoOpId } from "../lib/offline/cola";
import {
  CATALOGO_ORIGEN, CATALOGO_PRIORIDAD, CATALOGO_SINTOMA, CATALOGO_TIPO_FALLA,
  CATALOGO_MODO_FALLA, CATALOGO_CAUSA, CATALOGO_EFECTO, CATALOGO_SEVERIDAD,
  CATALOGO_IMPACTO, ORIGENES_SOLICITUD,
} from "../lib/correctivo/constantes";
import { urlSolicitud, leerParam } from "../lib/correctivo/deep-links";

const REGLAS = {};

const PASOS: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "identificacion", etiqueta: "Identificación", campos: ["titulo", "origen", "descripcion"] },
  { clave: "objeto", etiqueta: "Objeto afectado", campos: ["activoId", "componenteId", "ubicacionId"] },
  { clave: "sintomas", etiqueta: "Síntomas y prioridad", campos: ["sintomaClave", "sintomaTexto", "prioridad"] },
  { clave: "clasificacion", etiqueta: "Clasificación", campos: ["tipoFalla", "modoFalla", "causa", "efecto", "severidad", "impacto"] },
  { clave: "evidencias", etiqueta: "Evidencias", campos: ["evidencias"] },
];

export default function CorrectivoSolicitudNuevaPage() {
  return (
    <ShellCorrectivo activo="/correctivo/solicitudes/nueva">
      <WizardSolicitud />
    </ShellCorrectivo>
  );
}

function mapa(r: { clave: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.clave, etiqueta: o.etiqueta }));
}

function WizardSolicitud() {
  const [, navegar] = useLocation();
  const search = useSearch();
  const activoAncla = leerParam(search, "activo");
  const { cola } = useOffline();

  const origenes = useCatalogo(CATALOGO_ORIGEN);
  const prioridades = useCatalogo(CATALOGO_PRIORIDAD);
  const sintomas = useCatalogo(CATALOGO_SINTOMA);
  const tiposFalla = useCatalogo(CATALOGO_TIPO_FALLA);
  const modosFalla = useCatalogo(CATALOGO_MODO_FALLA);
  const causas = useCatalogo(CATALOGO_CAUSA);
  const efectos = useCatalogo(CATALOGO_EFECTO);
  const severidades = useCatalogo(CATALOGO_SEVERIDAD);
  const impactos = useCatalogo(CATALOGO_IMPACTO);
  const activos = useActivosListado({});

  const opcActivos = useMemo<OpcionSeleccion[]>(
    () => (activos.datos ?? []).map((a) => ({ valor: a.id, etiqueta: `${a.nombre} (${a.codigoEmpresarial})` })),
    [activos.datos],
  );
  const opcOrigenes = (origenes.datos ?? []).length ? mapa(origenes.datos ?? []) : ORIGENES_SOLICITUD.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));

  const definicion = useMemo(
    () => plantillaSolicitud({
      origenes: opcOrigenes,
      activos: opcActivos,
      prioridades: mapa(prioridades.datos ?? []),
      sintomas: mapa(sintomas.datos ?? []),
      tiposFalla: mapa(tiposFalla.datos ?? []),
      modosFalla: mapa(modosFalla.datos ?? []),
      causas: mapa(causas.datos ?? []),
      efectos: mapa(efectos.datos ?? []),
      severidades: mapa(severidades.datos ?? []),
      impactos: mapa(impactos.datos ?? []),
    }),
    [origenes.datos, opcActivos, prioridades.datos, sintomas.datos, tiposFalla.datos, modosFalla.datos, causas.datos, efectos.datos, severidades.datos, impactos.datos],
  );

  const [valores, setValores] = useState<ValoresFormulario>(() => ({
    ...(activoAncla ? { activoId: activoAncla } : {}),
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
    const input = construirInputSolicitud(valores);
    if (!input.titulo || !input.origen || !input.objeto.activoId) {
      setResultado({ tono: "error", texto: "Título, origen y activo afectado son obligatorios." });
      return;
    }
    setEnviando(true);
    const id = nuevoOpId();
    const r = await crearSolicitud(cola, input, { id });
    setEnviando(false);
    if (r.encolada) {
      setResultado({ tono: "info", texto: "Sin conexión: la solicitud se ha encolado y se sincronizará automáticamente.", id });
    } else if (r.error) {
      setResultado({ tono: "error", texto: r.error.message });
    } else {
      const idResp = (r.resultado as { id?: string } | undefined)?.id ?? id;
      setResultado({ tono: "exito", texto: "Solicitud registrada. Continúa con triage y diagnóstico desde la ficha.", id: idResp });
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
          <p>Al confirmar se registrará la solicitud <strong>{String(valores.titulo ?? "")}</strong>.</p>
          <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>El triage, el diagnóstico y la validación (gobernados por Workflow) son decisiones explícitas posteriores. Sin conexión, el alta se guardará en la cola de sincronización.</p>
        </CardContent></Card>
      ),
    },
  ];

  if (resultado?.tono === "exito" || resultado?.tono === "info") {
    return (
      <>
        <PageHeader titulo="Nueva solicitud" />
        <Alert variant={resultado.tono === "exito" ? "exito" : "info"} titulo={resultado.texto} />
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {resultado.id && <Button variant="primario" onClick={() => navegar(urlSolicitud(resultado.id!))}>Ver solicitud</Button>}
          <Button variant="secundario" onClick={() => navegar("/correctivo/solicitudes")}>Ir a solicitudes</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Nueva solicitud correctiva"
        descripcion="Completa los pasos para registrar la falla de forma 100% declarativa."
      />
      {activoAncla && <Alert variant="info" titulo={`Solicitud anclada al activo ${activoAncla}`} />}
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
            etiquetaFinalizar={enviando ? "Registrando…" : "Registrar solicitud"}
          />
        </CardContent>
      </Card>
    </>
  );
}
