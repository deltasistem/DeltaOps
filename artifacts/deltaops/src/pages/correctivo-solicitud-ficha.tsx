/**
 * DGP-015 · Ficha 360° de una solicitud correctiva.
 *
 * Pestañas: General, Diagnóstico (ciclo anclado a plantilla+versión), Evidencias
 * (referencia-only), Comentarios, Historial y Timeline. Las acciones de Workflow
 * (enviarTriage|iniciarDiagnostico|enviarValidacion|aprobar|rechazar) envían SU
 * transición REAL al endpoint gobernado (nunca bypass; rechazar exige motivo).
 * Al aprobar se ofrece GENERAR la OT correctiva (deep link al destino de Órdenes
 * que consume su :id) y CREAR la intervención. Consume `?tab=`.
 */
import React, { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  PageHeader, Section, Card, CardContent, CardHeader, Tabs, Table, Badge,
  Button, Spinner, EmptyState, ErrorState, Modal, Alert, Timeline,
} from "@workspace/design-system";
import type { TimelineTono } from "@workspace/design-system";
import { ShellCorrectivo } from "../lib/correctivo/Shell";
import { useSolicitud, useEventos, useCatalogo } from "../lib/correctivo/hooks";
import { useOffline } from "../lib/offline/contexto";
import {
  transicionarSolicitud, comentarSolicitud, adjuntarEvidencia,
  generarOrden, crearIntervencion,
} from "../lib/correctivo/mutaciones";
import { BadgeEstadoSolicitud, BadgePrioridad, fechaHora } from "../lib/correctivo/componentes";
import { PanelDiagnostico } from "./correctivo-diagnostico";
import {
  leerParam, urlOrdenTrabajo, urlActivo, urlIntervencion,
} from "../lib/correctivo/deep-links";
import {
  ACCIONES_SOLICITUD, ACCIONES_SOLICITUD_POR_ESTADO, CATALOGO_MOTIVO_RECHAZO,
  type AccionSolicitud, type DefinicionAccion,
} from "../lib/correctivo/constantes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaComentario, plantillaEvidencia } from "../lib/forms/plantillas-correctivo";
import type { SolicitudRow, EventoCorrectivo } from "../lib/correctivo/tipos";

export default function CorrectivoSolicitudFichaPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellCorrectivo>
      <Ficha id={id} />
    </ShellCorrectivo>
  );
}

function Ficha({ id }: { id: string }) {
  const { datos: solicitud, cargando, error, recargar } = useSolicitud(id);
  const [, navegar] = useLocation();
  const tabInicial = leerParam(typeof window !== "undefined" ? window.location.search : "", "tab");

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar la solicitud" descripcion={error.message} onReintentar={recargar} />;
  if (!solicitud) return <EmptyState titulo="Solicitud no encontrada" descripcion="La solicitud solicitada no existe o no está disponible." />;

  return (
    <>
      <PageHeader
        titulo={solicitud.titulo}
        descripcion={`Origen: ${solicitud.origen}${solicitud.objeto?.activoId ? ` · Activo ${solicitud.objeto.activoId}` : ""}`}
        acciones={<BadgeEstadoSolicitud estado={solicitud.estado} />}
      />
      <AccionesWorkflow solicitud={solicitud} onCambio={recargar} />
      <GenerarYIntervenir solicitud={solicitud} onCambio={recargar} onNavegar={navegar} />
      <Tabs
        porDefecto={tabInicial}
        items={[
          { id: "general", etiqueta: "General", contenido: <TabGeneral solicitud={solicitud} onNavegar={navegar} /> },
          { id: "diagnostico", etiqueta: "Diagnóstico", contenido: <PanelDiagnostico solicitud={solicitud} onCambio={recargar} /> },
          { id: "evidencias", etiqueta: "Evidencias", contenido: <TabEvidencias solicitud={solicitud} onCambio={recargar} /> },
          { id: "comentarios", etiqueta: "Comentarios", contenido: <TabComentarios solicitud={solicitud} onCambio={recargar} /> },
          { id: "historial", etiqueta: "Historial", contenido: <TabHistorial /> },
        ]}
      />
    </>
  );
}

/* --------------------------- Acciones de Workflow ----------------------- */

export function AccionesWorkflow({ solicitud, onCambio }: { solicitud: SolicitudRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const motivos = useCatalogo(CATALOGO_MOTIVO_RECHAZO);
  const [confirmar, setConfirmar] = useState<DefinicionAccion<AccionSolicitud> | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const disponibles = ACCIONES_SOLICITUD_POR_ESTADO[solicitud.estado ?? ""] ?? [];
  const acciones = ACCIONES_SOLICITUD.filter((a) => disponibles.includes(a.clave));

  async function ejecutar(accion: AccionSolicitud, motivoTexto?: string) {
    setOcupado(accion); setMsg(null);
    const r = await transicionarSolicitud(cola, solicitud.id, accion, motivoTexto ? { motivo: motivoTexto } : {});
    setOcupado(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la acción se encoló y se sincronizará." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Acción aplicada." }); onCambio(); }
  }

  if (acciones.length === 0 && !msg) return null;

  const opcionesMotivo = (motivos.datos ?? []).map((m) => ({ clave: m.clave, etiqueta: m.etiqueta }));

  return (
    <Section titulo="Acciones de workflow">
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        {acciones.map((a) => (
          <Button
            key={a.clave}
            variant={a.peligro ? "peligro" : "secundario"}
            disabled={ocupado != null}
            onClick={() => (a.peligro || a.exigeMotivo ? (setMotivo(""), setConfirmar(a)) : void ejecutar(a.clave))}
          >
            {ocupado === a.clave ? "…" : a.etiqueta}
          </Button>
        ))}
      </div>
      {confirmar && (
        <Modal
          abierto
          onClose={() => setConfirmar(null)}
          titulo={`Confirmar: ${confirmar.etiqueta}`}
          pie={
            <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
              <Button variant="fantasma" onClick={() => setConfirmar(null)}>Cancelar</Button>
              <Button
                variant={confirmar.peligro ? "peligro" : "primario"}
                disabled={!!confirmar.exigeMotivo && motivo.trim() === ""}
                onClick={() => { const c = confirmar.clave; const m = motivo.trim(); setConfirmar(null); void ejecutar(c, m || undefined); }}
              >
                {confirmar.etiqueta}
              </Button>
            </div>
          }
        >
          <p>¿Deseas continuar con «{confirmar.etiqueta}» sobre la solicitud <strong>{solicitud.titulo}</strong>?</p>
          {confirmar.exigeMotivo && (
            <label style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
              <span>Motivo (obligatorio)</span>
              {opcionesMotivo.length > 0 && (
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ padding: "var(--do-sp-2)" }}>
                  <option value="">— Selecciona un motivo —</option>
                  {opcionesMotivo.map((m) => <option key={m.clave} value={m.etiqueta}>{m.etiqueta}</option>)}
                </select>
              )}
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Describe el motivo" style={{ padding: "var(--do-sp-2)" }} />
            </label>
          )}
        </Modal>
      )}
    </Section>
  );
}

/* ---------------------- Generar OT / crear intervención ----------------- */

function GenerarYIntervenir({ solicitud, onCambio, onNavegar }: { solicitud: SolicitudRow; onCambio: () => void; onNavegar: (u: string) => void }) {
  const { cola } = useOffline();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const puedeGenerar = solicitud.estado === "APROBADA" || solicitud.estado === "GENERADA";
  if (!puedeGenerar && !msg) return null;

  async function generar() {
    setOcupado("generar"); setMsg(null);
    const r = await generarOrden(cola, solicitud.id, {});
    setOcupado(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la generación de la OT se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else {
      const ot = (r.resultado as { ordenTrabajoId?: string } | undefined)?.ordenTrabajoId;
      setMsg({ tono: "exito", texto: ot ? `OT correctiva generada (${ot}).` : "Generación de OT solicitada." });
      onCambio();
    }
  }

  async function intervenir() {
    setOcupado("intervenir"); setMsg(null);
    const r = await crearIntervencion(cola, solicitud.id, {});
    setOcupado(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la intervención se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else {
      const iid = (r.resultado as { id?: string } | undefined)?.id;
      setMsg({ tono: "exito", texto: "Intervención creada." });
      onCambio();
      if (iid) onNavegar(urlIntervencion(iid));
    }
  }

  return (
    <Section titulo="Orden de trabajo e intervención">
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="primario" disabled={ocupado != null} onClick={() => void generar()}>{ocupado === "generar" ? "Generando…" : "Generar OT correctiva"}</Button>
        {solicitud.ordenTrabajoId && <Button variant="fantasma" onClick={() => onNavegar(urlOrdenTrabajo(solicitud.ordenTrabajoId!))}>Ver OT →</Button>}
        <Button variant="secundario" disabled={ocupado != null} onClick={() => void intervenir()}>{ocupado === "intervenir" ? "Creando…" : "Crear intervención"}</Button>
        {solicitud.intervencionId && <Button variant="fantasma" onClick={() => onNavegar(urlIntervencion(solicitud.intervencionId!))}>Ver intervención →</Button>}
      </div>
    </Section>
  );
}

/* -------------------------------- General ------------------------------- */

function Dato({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (<><dt style={{ color: "var(--do-texto-suave)" }}>{termino}</dt><dd style={{ margin: 0 }}>{children}</dd></>);
}

function TabGeneral({ solicitud, onNavegar }: { solicitud: SolicitudRow; onNavegar: (u: string) => void }) {
  const c = solicitud.clasificacion ?? {};
  const activoId = solicitud.objeto?.activoId ?? solicitud.activoId;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <Card><CardContent>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
          <Dato termino="Título">{solicitud.titulo}</Dato>
          <Dato termino="Origen">{solicitud.origen}</Dato>
          <Dato termino="Estado"><BadgeEstadoSolicitud estado={solicitud.estado} /></Dato>
          <Dato termino="Prioridad"><BadgePrioridad valor={solicitud.prioridad} /></Dato>
          <Dato termino="Descripción">{solicitud.descripcion ?? "—"}</Dato>
          <Dato termino="Síntoma">{solicitud.sintoma?.texto ?? solicitud.sintoma?.clave ?? "—"}</Dato>
        </dl>
      </CardContent></Card>

      <Card>
        <CardHeader><strong>Objeto afectado</strong></CardHeader>
        <CardContent>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
            <Dato termino="Activo">{activoId ? <Button size="sm" variant="fantasma" onClick={() => onNavegar(urlActivo(activoId))}>{activoId} →</Button> : "—"}</Dato>
            <Dato termino="Componente">{solicitud.objeto?.componenteId ?? "—"}</Dato>
            <Dato termino="Ubicación">{solicitud.objeto?.ubicacionId ?? "—"}</Dato>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><strong>Clasificación de la falla</strong></CardHeader>
        <CardContent>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
            <Dato termino="Tipo de falla">{c.tipoFalla ?? "—"}</Dato>
            <Dato termino="Modo de falla">{c.modoFalla ?? "—"}</Dato>
            <Dato termino="Causa">{c.causa ?? "—"}</Dato>
            <Dato termino="Efecto">{c.efecto ?? "—"}</Dato>
            <Dato termino="Severidad">{c.severidad ?? "—"}</Dato>
            <Dato termino="Impacto">{c.impacto ?? "—"}</Dato>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ Evidencias ------------------------------ */

function TabEvidencias({ solicitud, onCambio }: { solicitud: SolicitudRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const def = plantillaEvidencia();
  const form = useFormularioDinamico(def, {}, {});
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);
  const evidencias = solicitud.evidencias ?? [];

  async function adjuntar() {
    const attachmentId = String(form.valores.attachmentId ?? "").trim();
    const tipo = String(form.valores.tipo ?? "").trim() || "documento";
    if (!attachmentId) { setMsg({ tono: "error", texto: "El identificador de adjunto es obligatorio." }); return; }
    setOcupado(true); setMsg(null);
    const etiqueta = String(form.valores.etiqueta ?? "").trim();
    const r = await adjuntarEvidencia(cola, solicitud.id, { attachmentId, tipo, ...(etiqueta ? { etiqueta } : {}) });
    setOcupado(false);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la evidencia se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Evidencia adjuntada." }); form.setValores({}); onCambio(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <Card>
        <CardHeader><strong>Adjuntar evidencia (referencia-only)</strong></CardHeader>
        <CardContent>
          <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} />
          <div style={{ marginTop: "var(--do-sp-2)" }}>
            <Button variant="primario" disabled={ocupado} onClick={() => void adjuntar()}>{ocupado ? "Adjuntando…" : "Adjuntar"}</Button>
          </div>
        </CardContent>
      </Card>
      {evidencias.length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin evidencias" descripcion="Aún no hay evidencias adjuntas." /></CardContent></Card>
      ) : (
        <Table caption="Evidencias adjuntas" captionOculto>
          <thead><tr><th scope="col">Adjunto</th><th scope="col">Tipo</th><th scope="col">Etiqueta</th></tr></thead>
          <tbody>
            {evidencias.map((e, i) => (
              <tr key={e.attachmentId ?? i}>
                <td><code>{e.attachmentId}</code></td>
                <td><Badge variant="info">{e.tipo}</Badge></td>
                <td>{e.etiqueta ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/* ------------------------------ Comentarios ----------------------------- */

function TabComentarios({ solicitud, onCambio }: { solicitud: SolicitudRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const def = plantillaComentario();
  const form = useFormularioDinamico(def, {}, {});
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);
  const comentarios = solicitud.comentarios ?? [];

  async function comentar() {
    const texto = String(form.valores.texto ?? "").trim();
    if (!texto) { setMsg({ tono: "error", texto: "El comentario no puede estar vacío." }); return; }
    setOcupado(true); setMsg(null);
    const r = await comentarSolicitud(cola, solicitud.id, texto);
    setOcupado(false);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: el comentario se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Comentario añadido." }); form.setValores({}); onCambio(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <Card>
        <CardContent>
          <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} />
          <div style={{ marginTop: "var(--do-sp-2)" }}>
            <Button variant="primario" disabled={ocupado} onClick={() => void comentar()}>{ocupado ? "Enviando…" : "Comentar"}</Button>
          </div>
        </CardContent>
      </Card>
      {comentarios.length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin comentarios" descripcion="Aún no hay comentarios." /></CardContent></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          {comentarios.map((c, i) => (
            <Card key={c.id ?? i}><CardContent>
              <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{c.actorId ?? "—"} · {fechaHora(c.fecha)}</div>
              <div>{c.texto}</div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Historial ----------------------------- */

function TabHistorial() {
  const { datos, cargando, error, recargar } = useEventos();
  if (cargando) return <Spinner />;
  if (error) return <ErrorState titulo="No se pudo cargar el historial" descripcion={error.message} onReintentar={recargar} />;
  const eventos = (datos ?? []) as EventoCorrectivo[];
  if (eventos.length === 0) return <Card><CardContent><EmptyState titulo="Sin eventos" descripcion="El registro de eventos aparecerá aquí." /></CardContent></Card>;
  const items = eventos.map((e) => ({
    titulo: e.tipo ?? "Evento",
    hora: fechaHora(e.ocurridoEn),
    descripcion: "",
    tono: "neutro" as TimelineTono,
  }));
  return <Timeline eventos={items} />;
}
