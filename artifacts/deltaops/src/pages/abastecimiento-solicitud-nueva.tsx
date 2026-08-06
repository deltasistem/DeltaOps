/**
 * DGP-013 · Wizard de creación de una solicitud de compra.
 * Pasos: datos generales, origen declarativo (inventario/orden/plan/usuario con
 * referencia navegable) y líneas (tabla). Puede anclarse a un origen entrante
 * (`?origen=&refId=&refTipo=&etiqueta=`), p. ej. desde la ficha de inventario.
 */
import React, { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { PageHeader, Card, CardContent, Wizard, Button, Alert } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo } from "../lib/abastecimiento/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaSolicitud } from "../lib/forms/plantillas-abastecimiento";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearSolicitud } from "../lib/abastecimiento/mutaciones";
import { construirInputSolicitud } from "../lib/abastecimiento/alta";
import { CATALOGO_PRIORIDAD, CATALOGO_ORIGEN_SOLICITUD, CATALOGO_UNIDAD } from "../lib/abastecimiento/constantes";
import { urlSolicitud, leerParam } from "../lib/abastecimiento/deep-links";

const REGLAS = {};

const PASOS: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "generales", etiqueta: "Datos generales", campos: ["titulo", "descripcion", "prioridad"] },
  { clave: "origen", etiqueta: "Origen de la necesidad", campos: ["origenTipo", "origenReferenciaTipo", "origenReferenciaId", "origenEtiqueta"] },
  { clave: "lineas", etiqueta: "Líneas", campos: ["lineas"] },
];

export default function AbastecimientoSolicitudNuevaPage() {
  return (
    <ShellAbastecimiento activo="/abastecimiento/solicitudes/nueva">
      <WizardSolicitud />
    </ShellAbastecimiento>
  );
}

function mapa(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

function WizardSolicitud() {
  const [, navegar] = useLocation();
  const search = useSearch();
  const { cola } = useOffline();

  const origenAncla = leerParam(search, "origen");
  const refId = leerParam(search, "refId");
  const refTipo = leerParam(search, "refTipo");
  const etiqueta = leerParam(search, "etiqueta");

  const prioridades = useCatalogo(CATALOGO_PRIORIDAD);
  const origenes = useCatalogo(CATALOGO_ORIGEN_SOLICITUD);
  const unidades = useCatalogo(CATALOGO_UNIDAD);

  const definicion = useMemo(
    () => plantillaSolicitud({ prioridades: mapa(prioridades.datos ?? []), origenes: mapa(origenes.datos ?? []), unidades: mapa(unidades.datos ?? []) }),
    [prioridades.datos, origenes.datos, unidades.datos],
  );

  const [valores, setValores] = useState<ValoresFormulario>(() => ({
    ...(origenAncla ? { origenTipo: origenAncla } : {}),
    ...(refId ? { origenReferenciaId: refId } : {}),
    ...(refTipo ? { origenReferenciaTipo: refTipo } : {}),
    ...(etiqueta ? { origenEtiqueta: etiqueta } : {}),
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
    if (input.lineas.length === 0) {
      setResultado({ tono: "error", texto: "La solicitud requiere al menos una línea." });
      return;
    }
    setEnviando(true);
    const r = await crearSolicitud(cola, input);
    setEnviando(false);
    if (r.encolada) setResultado({ tono: "info", texto: "Sin conexión: la solicitud se ha encolado y se sincronizará automáticamente." });
    else if (r.error) setResultado({ tono: "error", texto: r.error.message });
    else setResultado({ tono: "exito", texto: "Solicitud creada (en Borrador). Envíala desde la ficha para iniciar el workflow.", id: (r.resultado as { id?: string } | undefined)?.id });
  }

  const pasosForm = PASOS.map((p, indice) => ({
    id: p.clave,
    etiqueta: p.etiqueta,
    contenido: <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} soloClaves={p.campos} />,
    validar: () => pasoValido(indice),
  }));

  const pasos = [
    ...pasosForm,
    {
      id: "confirmacion", etiqueta: "Confirmación",
      contenido: (
        <Card><CardContent>
          <p>Al confirmar se creará la solicitud <strong>{String(valores.titulo ?? "")}</strong> en estado <strong>Borrador</strong>.</p>
          <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>El envío/aprobación son decisiones explícitas posteriores, gobernadas por Workflow. Sin conexión, el alta se guardará en la cola.</p>
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
          <Button variant="secundario" onClick={() => navegar("/abastecimiento/solicitudes")}>Ir a solicitudes</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader titulo="Nueva solicitud de compra" descripcion="Completa los pasos para declarar la necesidad de compra." />
      {origenAncla && <Alert variant="info" titulo={`Solicitud anclada al origen «${origenAncla}»${refId ? ` (referencia ${refId})` : ""}`} />}
      {resultado?.tono === "error" && <Alert variant="error" titulo={resultado.texto} />}
      <Card><CardContent>
        <Wizard
          pasos={pasos}
          actual={pasoActual}
          onCambio={alCambiarPaso}
          onFinalizar={() => void finalizar()}
          etiquetaSiguiente="Siguiente"
          etiquetaAnterior="Anterior"
          etiquetaFinalizar={enviando ? "Creando…" : "Crear solicitud"}
        />
      </CardContent></Card>
    </>
  );
}
