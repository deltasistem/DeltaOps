/**
 * DGP-012 · Calendario operacional de planes.
 *
 * Muestra las próximas ocurrencias planificadas de los planes VIGENTES y
 * permite gestionar calendarios (por empresa/proyecto/activo) con festivos,
 * ventanas y paradas. Alta de calendario 100% Dynamic Forms.
 */
import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  Modal,
  Alert,
  Badge,
} from "@workspace/design-system";
import { ShellPlanes } from "../lib/planes/Shell";
import { usePlanes } from "../lib/planes/hooks";
import { useOffline } from "../lib/offline/contexto";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaCalendario } from "../lib/forms/plantillas-planes";
import { crearCalendario } from "../lib/planes/mutaciones";
import { construirInputCalendario } from "../lib/planes/alta";
import { resumenFrecuencia, fechaCorta } from "../lib/planes/componentes";
import { urlPlan } from "../lib/planes/deep-links";
import type { PlanRow } from "../lib/planes/tipos";

export default function PlanesCalendarioPage() {
  return (
    <ShellPlanes activo="/planes/calendario">
      <Calendario />
    </ShellPlanes>
  );
}

interface OcurrenciaVista {
  fecha: string;
  plan: PlanRow;
}

function Calendario() {
  const { datos, cargando, error, recargar } = usePlanes({ estado: "VIGENTE", limit: 300 });
  const { enLinea } = useOffline();
  const [modal, setModal] = useState(false);

  const ocurrencias = useMemo<OcurrenciaVista[]>(() => {
    const vigentes = datos ?? [];
    return vigentes
      .filter((p) => p.proximaOcurrencia)
      .map((p) => ({ fecha: p.proximaOcurrencia as string, plan: p }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [datos]);

  const porMes = useMemo(() => {
    const grupos = new Map<string, OcurrenciaVista[]>();
    for (const o of ocurrencias) {
      const d = new Date(o.fecha);
      const clave = Number.isNaN(d.getTime()) ? o.fecha : d.toLocaleDateString("es", { year: "numeric", month: "long" });
      const arr = grupos.get(clave) ?? [];
      arr.push(o);
      grupos.set(clave, arr);
    }
    return [...grupos.entries()];
  }, [ocurrencias]);

  return (
    <>
      <PageHeader
        titulo="Calendario operacional"
        descripcion="Ocurrencias planificadas de los planes vigentes; festivos, ventanas y paradas por calendario."
        acciones={<Button variant="primario" onClick={() => setModal(true)}>Nuevo calendario</Button>}
      />

      <Section titulo="Próximas ocurrencias planificadas">
        {cargando ? (
          <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
        ) : error ? (
          <ErrorState
            titulo={enLinea ? "No se pudo cargar el calendario" : "Sin conexión"}
            descripcion={enLinea ? error.message : "Estás sin conexión. Se mostrará el calendario al recuperar la red."}
            onReintentar={recargar}
          />
        ) : ocurrencias.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin ocurrencias" descripcion="No hay planes vigentes con próxima ocurrencia proyectada." /></CardContent></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
            {porMes.map(([mes, items]) => (
              <Card key={mes}>
                <CardHeader><strong style={{ textTransform: "capitalize" }}>{mes}</strong></CardHeader>
                <CardContent>
                  <ul aria-label={`Ocurrencias de ${mes}`} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
                    {items.map((o, i) => (
                      <li key={`${o.plan.id}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)", flexWrap: "wrap", borderTop: i === 0 ? "none" : "1px solid var(--do-borde)", paddingTop: i === 0 ? 0 : "var(--do-sp-2)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
                          <span><Badge variant="info">{fechaCorta(o.fecha)}</Badge> {o.plan.nombre}</span>
                          <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{resumenFrecuencia(o.plan.programa?.frecuencia)}</span>
                        </div>
                        <Link href={urlPlan(o.plan.id)}><Button size="sm" variant="secundario">Abrir plan</Button></Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {modal && <ModalCalendario onCerrar={() => setModal(false)} onOk={() => { setModal(false); recargar(); }} />}
    </>
  );
}

function ModalCalendario({ onCerrar, onOk }: { onCerrar: () => void; onOk: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaCalendario(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Completa nombre, tipo y ámbito."); return; }
    setGuardando(true); setErr(null);
    const r = await crearCalendario(cola, construirInputCalendario(form.valores));
    setGuardando(false);
    if (r.encolada) { onOk(); return; }
    if (r.error) setErr(r.error.message);
    else onOk();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Nuevo calendario operacional"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Crear calendario</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <Alert variant="info" titulo="Días laborales, turnos, ventanas, festivos y paradas se declaran aquí y aplican a la programación de los planes que referencien este calendario." />
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}
