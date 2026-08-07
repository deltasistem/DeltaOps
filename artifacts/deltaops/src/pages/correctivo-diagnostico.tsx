/**
 * DGP-015 · Panel de diagnóstico de una solicitud correctiva.
 *
 * El ciclo de diagnóstico se ancla SIEMPRE a una plantilla del motor de
 * formularios + su versión (≥1): la captura (causas, modo/efecto, criticidad,
 * impacto, recomendaciones) se declara con Dynamic Forms y viaja como
 * `respuestas` (opaco) + `causaRaiz` + `clasificacion` EXACTAS del contrato. Se
 * usa como pestaña de la ficha de la solicitud. Degrada offline (encolable).
 */
import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, Button, Alert, Badge } from "@workspace/design-system";
import { ShellCorrectivo } from "../lib/correctivo/Shell";
import { useParams } from "wouter";
import { useSolicitud, useCatalogo } from "../lib/correctivo/hooks";
import { useOffline } from "../lib/offline/contexto";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaDiagnostico } from "../lib/forms/plantillas-correctivo";
import { registrarDiagnostico } from "../lib/correctivo/mutaciones";
import { construirInputDiagnostico } from "../lib/correctivo/alta";
import {
  CATALOGO_MODO_FALLA, CATALOGO_CAUSA, CATALOGO_EFECTO, CATALOGO_SEVERIDAD,
  CATALOGO_IMPACTO,
} from "../lib/correctivo/constantes";
import type { SolicitudRow } from "../lib/correctivo/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

/** Identificador y versión de la plantilla de diagnóstico correctiva. */
const PLANTILLA_DIAGNOSTICO_ID = "correctivo.diagnostico";
const PLANTILLA_DIAGNOSTICO_VERSION = 1;

function mapa(r: { clave: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.clave, etiqueta: o.etiqueta }));
}

/** Panel reutilizable (usado como pestaña de la ficha de la solicitud). */
export function PanelDiagnostico({ solicitud, onCambio }: { solicitud: SolicitudRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const modosFalla = useCatalogo(CATALOGO_MODO_FALLA);
  const causas = useCatalogo(CATALOGO_CAUSA);
  const efectos = useCatalogo(CATALOGO_EFECTO);
  const severidades = useCatalogo(CATALOGO_SEVERIDAD);
  const impactos = useCatalogo(CATALOGO_IMPACTO);

  const def = useMemo(
    () => plantillaDiagnostico({
      modosFalla: mapa(modosFalla.datos ?? []),
      causas: mapa(causas.datos ?? []),
      efectos: mapa(efectos.datos ?? []),
      severidades: mapa(severidades.datos ?? []),
      impactos: mapa(impactos.datos ?? []),
    }),
    [modosFalla.datos, causas.datos, efectos.datos, severidades.datos, impactos.datos],
  );

  const inicial = useMemo(() => {
    const d = solicitud.diagnostico;
    if (!d) return {};
    return {
      ...(d.causaReportada ? { causaReportada: d.causaReportada } : {}),
      ...(d.causaEncontrada ? { causaEncontrada: d.causaEncontrada } : {}),
      ...(d.causaRaiz ? { causaRaiz: d.causaRaiz } : {}),
      ...(d.modoFalla ?? d.clasificacion?.modoFalla ? { modoFalla: d.modoFalla ?? d.clasificacion?.modoFalla } : {}),
      ...(d.efecto ?? d.clasificacion?.efecto ? { efecto: d.efecto ?? d.clasificacion?.efecto } : {}),
      ...(d.impacto ?? d.clasificacion?.impacto ? { impacto: d.impacto ?? d.clasificacion?.impacto } : {}),
      ...(d.criticidad ? { criticidad: d.criticidad } : {}),
      ...(d.recomendaciones ? { recomendaciones: d.recomendaciones } : {}),
    };
  }, [solicitud.diagnostico]);

  const form = useFormularioDinamico(def, {}, inicial);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const habilitado = solicitud.estado === "EN_DIAGNOSTICO" || solicitud.estado === "EN_TRIAGE" || solicitud.diagnostico != null;

  async function registrar() {
    setOcupado(true); setMsg(null);
    const input = construirInputDiagnostico(
      solicitud.id,
      { plantillaId: PLANTILLA_DIAGNOSTICO_ID, version: PLANTILLA_DIAGNOSTICO_VERSION },
      form.valores,
    );
    const r = await registrarDiagnostico(cola, input);
    setOcupado(false);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: el diagnóstico se encoló y se sincronizará." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Diagnóstico registrado." }); onCambio(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
            <strong>Diagnóstico</strong>
            <Badge variant="info">Plantilla {PLANTILLA_DIAGNOSTICO_ID} · v{PLANTILLA_DIAGNOSTICO_VERSION}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!habilitado && (
            <Alert variant="info" titulo="El diagnóstico está disponible durante el triage o la fase de diagnóstico.">
              Aplica primero «Iniciar diagnóstico» en las acciones de workflow.
            </Alert>
          )}
          <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} />
          <div style={{ marginTop: "var(--do-sp-3)" }}>
            <Button variant="primario" disabled={ocupado} onClick={() => void registrar()}>{ocupado ? "Registrando…" : "Registrar diagnóstico"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Página autónoma (deep link directo al diagnóstico de una solicitud). */
export default function CorrectivoDiagnosticoPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellCorrectivo>
      <Cargador id={id} />
    </ShellCorrectivo>
  );
}

function Cargador({ id }: { id: string }) {
  const { datos: solicitud, cargando, recargar } = useSolicitud(id);
  if (cargando || !solicitud) return null;
  return <PanelDiagnostico solicitud={solicitud} onCambio={recargar} />;
}
