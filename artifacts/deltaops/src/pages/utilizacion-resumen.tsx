/**
 * DGP-019.1 · Resumen operacional básico por activo.
 *
 * Consulta el resumen del backend (últimos medidores + consumo). Cuando un
 * cálculo responde `tipo: "sin-datos"` (o el valor es nulo), se muestra
 * literalmente "Sin datos" — NUNCA 0 (mandato §7/§18). La regularización de
 * medidor (reinicio de tramo auditado, motivo obligatorio) sólo aparece con la
 * capacidad `medidores.regularizar` (backend autoritativo, 403). Sólo Design
 * System + tokens `--do-*`.
 */
import React, { useMemo, useState } from "react";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState,
  ErrorState, KpiCard, Modal, Alert,
} from "@workspace/design-system";
import { ShellUtilizacion } from "../lib/utilizacion/Shell";
import { useResumen } from "../lib/utilizacion/hooks";
import { useSesion } from "../lib/identidad/sesion";
import { capacidadesUtilizacion } from "../lib/utilizacion/capacidades";
import { useOffline } from "../lib/offline/contexto";
import { SelectorActivo, ValorCalculo } from "../lib/utilizacion/componentes";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaReinicio, CAMPOS_REINICIO } from "../lib/utilizacion/plantillas";
import { reiniciarMedidor } from "../lib/utilizacion/mutaciones";
import type { ResumenActivo, ResultadoCalculo } from "../lib/utilizacion/tipos";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";

export default function UtilizacionResumenPage() {
  return (
    <ShellUtilizacion activo="/utilizacion/resumen">
      <Resumen />
    </ShellUtilizacion>
  );
}

/** KPI que muestra un `ResultadoCalculo` con degradación "Sin datos". */
function KpiCalculo({ titulo, resultado, unidad, decimales }: { titulo: string; resultado?: ResultadoCalculo; unidad?: string; decimales?: number }) {
  return (
    <KpiCard titulo={titulo} valor={<ValorCalculo resultado={resultado} unidad={unidad} decimales={decimales} />} />
  );
}

export function Resumen() {
  const { sesion } = useSesion();
  const cap = capacidadesUtilizacion(sesion ?? { rol: "CONSULTA" });
  const { cola } = useOffline();

  const [activoId, setActivoId] = useState("");
  const { datos, cargando, error, recargar } = useResumen(activoId);
  const [reiniciando, setReiniciando] = useState(false);

  return (
    <>
      <PageHeader titulo="Resumen operacional" descripcion="Últimos medidores y consumo por activo." />

      <Section titulo="Activo">
        <Card>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", alignItems: "end" }}>
              <SelectorActivo valor={activoId} onCambio={setActivoId} />
              {activoId && cap.regularizarMedidor && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <Button variant="secundario" onClick={() => setReiniciando(true)}>Regularizar medidor</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Section>

      {!activoId ? (
        <EmptyState titulo="Selecciona un activo" descripcion="Elige un activo para ver su resumen operacional." />
      ) : cargando ? (
        <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
      ) : error ? (
        <ErrorState titulo="No se pudo cargar el resumen" descripcion={error.message} onReintentar={recargar} />
      ) : !datos ? (
        <EmptyState titulo="Sin datos" descripcion="El activo no tiene resumen operacional disponible." />
      ) : (
        <ResumenContenido resumen={datos} />
      )}

      {reiniciando && activoId && (
        <ModalReinicio
          activoId={activoId}
          onCerrar={() => setReiniciando(false)}
          onConfirmado={() => { setReiniciando(false); recargar(); }}
          reiniciar={(input) => reiniciarMedidor(cola, { ...input, activoId })}
        />
      )}
    </>
  );
}

function ResumenContenido({ resumen }: { resumen: ResumenActivo }) {
  return (
    <>
      <Section titulo="Medidores">
        <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
          <KpiCalculo titulo="Δ Horómetro" resultado={resumen.deltaHorometro} unidad="h" />
          <KpiCalculo titulo="Δ Odómetro" resultado={resumen.deltaOdometro} unidad="km" />
          <KpiCard titulo="Lecturas" valor={String(resumen.lecturas ?? 0)} />
          <KpiCard titulo="Tanqueos" valor={String(resumen.tanqueos ?? 0)} />
        </div>
      </Section>

      <Section titulo="Consumo">
        <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
          <KpiCalculo titulo="L / h" resultado={resumen.litrosPorHora} unidad="L/h" />
          <KpiCalculo titulo="L / 100 km" resultado={resumen.litrosPor100Km} unidad="L/100km" />
          <KpiCalculo titulo="Costo / h" resultado={resumen.costoPorHora} unidad="/h" />
          <KpiCalculo titulo="Costo / km" resultado={resumen.costoPorKm} unidad="/km" />
        </div>
      </Section>
    </>
  );
}

function ModalReinicio({ activoId, onCerrar, onConfirmado, reiniciar }: {
  activoId: string;
  onCerrar: () => void;
  onConfirmado: () => void;
  reiniciar: (input: { tipoMedidor: string; valorNuevo: number; fechaHora: string; motivo: string; observacion?: string }) => Promise<{ encolada: boolean; error?: Error }>;
}) {
  const definicion = useMemo(() => plantillaReinicio(), []);
  const [valores, setValores] = useState<ValoresFormulario>({});
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirmar() {
    const h = validar(definicion, {}, valores).filter((x) => CAMPOS_REINICIO.includes(x.campo as (typeof CAMPOS_REINICIO)[number]));
    setHallazgos(h);
    if (hayBloqueos(h)) { setErr("Revisa los campos obligatorios (incluido el motivo)."); return; }
    setEnviando(true);
    setErr(null);
    const r = await reiniciar({
      tipoMedidor: String(valores.tipoMedidor ?? ""),
      valorNuevo: Number(valores.valorNuevo),
      fechaHora: new Date(String(valores.fechaHora)).toISOString(),
      motivo: String(valores.motivo ?? ""),
      observacion: valores.observacion ? String(valores.observacion) : undefined,
    });
    setEnviando(false);
    if (r.error) { setErr(r.error.message); return; }
    onConfirmado();
  }

  return (
    <Modal
      abierto
      titulo="Regularizar medidor"
      size="lg"
      onClose={onCerrar}
      pie={
        <>
          <Button variant="fantasma" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button variant="primario" onClick={confirmar} disabled={enviando}>{enviando ? "Aplicando…" : "Aplicar reinicio"}</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
        <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>
          Reinicio de tramo auditado del activo <strong>{activoId}</strong>. El motivo es obligatorio.
        </p>
        {err && <Alert variant="error">{err}</Alert>}
        <FormularioDinamico definicion={definicion} reglas={{}} valores={valores} onCambio={setValores} hallazgos={hallazgos} />
      </div>
    </Modal>
  );
}
