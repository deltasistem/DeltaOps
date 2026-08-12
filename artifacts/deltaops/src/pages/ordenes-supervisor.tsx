/**
 * DGP-009.3 · Centro del Supervisor.
 *
 * Gestión de asignaciones/reasignaciones, validación de cierre (aprobar/devolver),
 * carga de trabajo por técnico, vencidas y SLA. Todas las escrituras degradan a
 * la cola offline.
 */
import React, { useMemo, useState } from "react";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  KpiCard,
  Spinner,
  ErrorState,
  EmptyState,
  Table as DoTable,
  Modal,
  Alert,
  useToast,
} from "@workspace/design-system";
import { ShellOrdenes } from "../lib/ordenes/Shell";
import { useListado, useIdentidadesElegibles } from "../lib/ordenes/hooks";
import { useOffline } from "../lib/offline/contexto";
import { asignar, asignarRecursoHumano, aprobarCierre } from "../lib/ordenes/mutaciones";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaAsignacion } from "../lib/forms/plantillas-ordenes";
import { BadgeEstado, esCritica, proximaAVencer } from "../lib/ordenes/componentes";
import { PanelSupervisor } from "./ordenes/panel-supervisor";
import type { OrdenRow } from "../lib/ordenes/tipos";

export default function OrdenesSupervisorPage() {
  return (
    <ShellOrdenes activo="/ordenes/supervisor">
      <Supervisor />
    </ShellOrdenes>
  );
}

function Supervisor() {
  const { datos, cargando, error, recargar } = useListado({ limit: 300 });
  const ahoraMs = useMemo(() => Date.parse(new Date().toISOString()), []);
  const [panelId, setPanelId] = useState<string | null>(null);

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-8)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar" descripcion={error.message} onReintentar={recargar} />;

  const ordenes = datos ?? [];
  const activas = ordenes.filter((o) => o.estado !== "CERRADA" && o.estado !== "CANCELADA");
  const enValidacion = ordenes.filter((o) => o.estado === "EN_VALIDACION");
  const sinAsignar = ordenes.filter((o) => !o.responsable && o.estado !== "CERRADA" && o.estado !== "CANCELADA");
  const criticas = activas.filter(esCritica);
  const vencer = activas.filter((o) => proximaAVencer(o, ahoraMs));

  // Carga por técnico.
  const carga = new Map<string, number>();
  for (const o of activas) {
    if (o.responsable) carga.set(o.responsable, (carga.get(o.responsable) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader titulo="Centro del Supervisor" descripcion="Asignación, validación, carga de trabajo y SLA — gestión in-place sin cambiar de contexto." />

      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))" }}>
        <KpiCard titulo="Activas" valor={String(activas.length)} />
        <KpiCard titulo="En validación" valor={String(enValidacion.length)} />
        <KpiCard titulo="Sin asignar" valor={String(sinAsignar.length)} />
        <KpiCard titulo="Críticas" valor={String(criticas.length)} />
        <KpiCard titulo="Por vencer" valor={String(vencer.length)} />
      </div>

      <Section titulo="Pendientes de validación">
        {enValidacion.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Nada por validar" /></CardContent></Card>
        ) : (
          <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))" }}>
            {enValidacion.map((o) => <TarjetaValidacion key={o.id} orden={o} onCambio={recargar} onAbrir={setPanelId} />)}
          </div>
        )}
      </Section>

      <Section titulo="Órdenes activas" acciones={<Badge variant="info">{activas.length}</Badge>}>
        {activas.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin órdenes activas" /></CardContent></Card>
        ) : (
          <Card>
            <CardContent>
              <DoTable caption="Órdenes activas (gestión in-place)">
                <thead><tr><th>Orden</th><th>Estado</th><th>Responsable</th><th></th></tr></thead>
                <tbody>
                  {activas.slice(0, 50).map((o) => (
                    <tr key={o.id}>
                      <td><code style={{ fontSize: "var(--do-text-xs)" }}>{o.codigo}</code> {o.titulo}</td>
                      <td><BadgeEstado estado={o.estado} /></td>
                      <td>{o.responsable ?? "—"}</td>
                      <td><Button variant="secundario" size="sm" onClick={() => setPanelId(o.id)}>Gestionar</Button></td>
                    </tr>
                  ))}
                </tbody>
              </DoTable>
            </CardContent>
          </Card>
        )}
      </Section>

      <Section titulo="Asignación de trabajo">
        {sinAsignar.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Todo asignado" descripcion="No hay órdenes activas sin responsable." /></CardContent></Card>
        ) : (
          <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))" }}>
            {sinAsignar.map((o) => <TarjetaAsignacion key={o.id} orden={o} onCambio={recargar} onAbrir={setPanelId} />)}
          </div>
        )}
      </Section>

      <Section titulo="Carga por técnico">
        {carga.size === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin carga registrada" /></CardContent></Card>
        ) : (
          <Card>
            <CardContent>
              <DoTable caption="Carga de trabajo por técnico">
                <thead><tr><th>Técnico</th><th>Órdenes activas</th></tr></thead>
                <tbody>
                  {[...carga.entries()].sort((a, b) => b[1] - a[1]).map(([tec, n]) => (
                    <tr key={tec}><td>{tec}</td><td><Badge variant={n > 5 ? "advertencia" : "neutro"}>{n}</Badge></td></tr>
                  ))}
                </tbody>
              </DoTable>
            </CardContent>
          </Card>
        )}
      </Section>

      {panelId && (
        <PanelSupervisor ordenId={panelId} onCerrar={() => setPanelId(null)} onCambio={recargar} />
      )}
    </>
  );
}

function TarjetaValidacion({ orden, onCambio, onAbrir }: { orden: OrdenRow; onCambio: () => void; onAbrir: (id: string) => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);

  async function resolver(aprobado: boolean) {
    setOcupado(true);
    const r = await aprobarCierre(cola, orden.id, aprobado);
    setOcupado(false);
    if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
    else { toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: aprobado ? "Cierre aprobado" : "Orden devuelta" }); onCambio(); }
  }

  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)", alignItems: "center" }}>
          <span><code style={{ fontSize: "var(--do-text-xs)" }}>{orden.codigo}</code> {orden.titulo}</span>
          <BadgeEstado estado={orden.estado} />
        </div>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>Responsable: {orden.responsable ?? "—"}</p>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Button variant="primario" size="sm" disabled={ocupado} onClick={() => void resolver(true)}>Aprobar cierre</Button>
          <Button variant="peligro" size="sm" disabled={ocupado} onClick={() => void resolver(false)}>Devolver</Button>
          <Button variant="fantasma" size="sm" onClick={() => onAbrir(orden.id)}>Gestionar in-place</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TarjetaAsignacion({ orden, onCambio, onAbrir }: { orden: OrdenRow; onCambio: () => void; onAbrir: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)", alignItems: "center" }}>
          <span><code style={{ fontSize: "var(--do-text-xs)" }}>{orden.codigo}</code> {orden.titulo}</span>
          <BadgeEstado estado={orden.estado} />
        </div>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>Sin responsable asignado.</p>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Button variant="primario" size="sm" onClick={() => setAbierto(true)}>Asignar</Button>
          <Button variant="fantasma" size="sm" onClick={() => onAbrir(orden.id)}>Gestionar in-place</Button>
        </div>
      </CardContent>
      {abierto && <ModalAsignacion orden={orden} onCerrar={() => setAbierto(false)} onGuardado={() => { setAbierto(false); onCambio(); }} />}
    </Card>
  );
}

function ModalAsignacion({ orden, onCerrar, onGuardado }: { orden: OrdenRow; onCerrar: () => void; onGuardado: () => void }) {
  const { cola } = useOffline();
  // DGP-020.1 · Identidades canónicas del tenant (fuente de verdad). El selector
  // muestra nombre+rol y ENVÍA únicamente el identityId; nunca texto libre.
  const elegibles = useIdentidadesElegibles();
  const opciones = useMemo(
    () => (elegibles.datos ?? []).map((i) => ({ valor: i.identityId, etiqueta: `${i.nombre} · ${i.rol}` })),
    [elegibles.datos],
  );
  // Responsable como select de identidades; supervisor sigue el flujo de agregado.
  const def = useMemo(() => plantillaAsignacion(opciones, []), [opciones]);
  const form = useFormularioDinamico(def, {}, { responsable: "", supervisor: orden.supervisor ?? "" });
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setErr(null);
    const responsableId = form.valores.responsable ? String(form.valores.responsable) : null;
    // Asignación FUERTE por identidad canónica (resuelve G-1): el backend valida
    // existencia/actividad/membresía y persiste la referencia a idn_identities.
    if (responsableId) {
      const r = await asignarRecursoHumano(cola, orden.id, {
        tipo: "persona", asignadoId: responsableId, rol: "responsable", reemplazaVigentes: true,
      });
      if (r.error) { setGuardando(false); setErr(r.error.message); return; }
    }
    // Supervisor: campo de agregado (texto), sin cambio de contrato en esta fase.
    const supervisor = form.valores.supervisor ? String(form.valores.supervisor) : null;
    if (supervisor !== (orden.supervisor ?? null)) {
      const r = await asignar(cola, orden.id, orden.version, { supervisor });
      if (r.error) { setGuardando(false); setErr(r.error.message); return; }
    }
    setGuardando(false);
    onGuardado();
  }

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo={`Asignar ${orden.codigo}`}
      pie={
        <>
          <Button variant="fantasma" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primario" loading={guardando} onClick={() => void guardar()}>Asignar</Button>
        </>
      }
    >
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}
