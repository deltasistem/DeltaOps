/**
 * DGP-012 · Ficha 360° de un plan de mantenimiento.
 *
 * Pestañas: General, Frecuencias, Rutina/Actividades, Programación (próximas
 * ocurrencias), Generaciones (órdenes generadas con DEEP LINK a la OT — el
 * destino de Órdenes ya consume su :id, DGP-010), Versiones (activa/históricas/
 * publicar/rollback), Historial y Timeline. Las acciones de Workflow envían SU
 * transición real (motivo obligatorio) al endpoint correcto (DGP-011.3). La
 * generación manual es idempotente (generadas vs deduplicadas). Consume `?tab=`.
 */
import React, { useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Tabs,
  Table,
  Badge,
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  Modal,
  Alert,
  Timeline,
} from "@workspace/design-system";
import type { TimelineTono } from "@workspace/design-system";
import { ShellPlanes } from "../lib/planes/Shell";
import {
  usePlan,
  useVersiones,
  useHistorial,
  useGeneraciones,
  useEventos,
} from "../lib/planes/hooks";
import { useOffline } from "../lib/offline/contexto";
import {
  publicarPlan,
  transicionarPlan,
  archivarPlan,
  rollbackPlan,
  evaluarGeneracion,
  generarOrdenesPreventivas,
} from "../lib/planes/mutaciones";
import { construirInputEvaluar } from "../lib/planes/alta";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaTransicion, plantillaEvaluar, plantillaGenerar } from "../lib/forms/plantillas-planes";
import { BadgeEstadoPlan, resumenFrecuencia, fechaCorta } from "../lib/planes/componentes";
import { leerParam, urlOrdenGenerada } from "../lib/planes/deep-links";
import { ACCIONES_PLAN, ACCIONES_POR_ESTADO, type AccionPlan, type DefinicionAccion } from "../lib/planes/constantes";
import type { PlanRow, Generacion, VersionPlan, EntradaHistorial, EventoPlan, ResultadoGeneracion } from "../lib/planes/tipos";

export default function PlanesFichaPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellPlanes>
      <Ficha id={id} />
    </ShellPlanes>
  );
}

function Ficha({ id }: { id: string }) {
  const { datos: plan, cargando, error, recargar } = usePlan(id);
  const [, navegar] = useLocation();
  const tabInicial = leerParam(typeof window !== "undefined" ? window.location.search : "", "tab");

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el plan" descripcion={error.message} onReintentar={recargar} />;
  if (!plan) return <EmptyState titulo="Plan no encontrado" descripcion="El plan solicitado no existe o no está disponible." />;

  return (
    <>
      <PageHeader
        titulo={plan.nombre}
        descripcion={`${plan.tipoPlan} · ${plan.estrategia} · prioridad ${plan.prioridad}`}
        acciones={<BadgeEstadoPlan estado={plan.estado} />}
      />
      <AccionesWorkflow plan={plan} onCambio={recargar} />
      <Tabs
        porDefecto={tabInicial}
        items={[
          { id: "general", etiqueta: "General", contenido: <TabGeneral plan={plan} /> },
          { id: "frecuencias", etiqueta: "Frecuencias", contenido: <TabFrecuencias plan={plan} /> },
          { id: "rutina", etiqueta: "Rutina", contenido: <TabRutina plan={plan} /> },
          { id: "programacion", etiqueta: "Programación", contenido: <TabProgramacion plan={plan} /> },
          { id: "generaciones", etiqueta: "Generaciones", contenido: <TabGeneraciones plan={plan} onNavegar={navegar} onCambio={recargar} /> },
          { id: "versiones", etiqueta: "Versiones", contenido: <TabVersiones plan={plan} onCambio={recargar} /> },
          { id: "historial", etiqueta: "Historial", contenido: <TabHistorial id={id} /> },
          { id: "timeline", etiqueta: "Timeline", contenido: <TabTimeline planId={id} /> },
        ]}
      />
    </>
  );
}

/* --------------------------- Acciones de Workflow ----------------------- */

export function AccionesWorkflow({ plan, onCambio }: { plan: PlanRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const [confirmar, setConfirmar] = useState<DefinicionAccion | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const version = plan.version ?? 1;
  const disponibles = ACCIONES_POR_ESTADO[plan.estado] ?? [];
  const acciones = ACCIONES_PLAN.filter((a) => disponibles.includes(a.clave));
  const puedePublicar = plan.estado === "BORRADOR";
  const puedeArchivar = plan.estado === "FINALIZADO" || plan.estado === "SUSPENDIDO" || plan.estado === "BORRADOR";

  async function publicar() {
    setOcupado("publicar"); setMsg(null);
    const r = await publicarPlan(cola, plan.id, version);
    setOcupado(null);
    finalizar(r, "Plan publicado (Vigente).");
  }
  async function archivar() {
    setOcupado("archivar"); setMsg(null);
    const r = await archivarPlan(cola, plan.id, version);
    setOcupado(null);
    finalizar(r, "Plan archivado.");
  }
  async function ejecutarTransicion(a: AccionPlan, motivo: string, hasta?: string) {
    setOcupado(a); setMsg(null);
    const r = await transicionarPlan(cola, plan.id, a, version, motivo, hasta ? { hasta } : {});
    setOcupado(null);
    setConfirmar(null);
    finalizar(r, `Transición «${a}» aplicada.`);
  }
  function finalizar(r: { encolada: boolean; error?: Error }, ok: string) {
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la operación se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: ok }); onCambio(); }
  }

  return (
    <Section titulo="Acciones">
      <Card>
        <CardContent>
          {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", alignItems: "center" }}>
            {puedePublicar && <Button variant="primario" size="sm" loading={ocupado === "publicar"} onClick={() => void publicar()}>Publicar (Vigente)</Button>}
            {acciones.map((a) => (
              <Button key={a.clave} size="sm" variant={a.peligro ? "peligro" : "secundario"} loading={ocupado === a.clave} onClick={() => setConfirmar(a)}>{a.etiqueta}</Button>
            ))}
            {puedeArchivar && <Button variant="fantasma" size="sm" loading={ocupado === "archivar"} onClick={() => void archivar()}>Archivar</Button>}
            {acciones.length === 0 && !puedePublicar && !puedeArchivar && (
              <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>No hay transiciones disponibles en el estado actual.</span>
            )}
          </div>
        </CardContent>
      </Card>
      {confirmar && (
        <ModalTransicion
          accion={confirmar}
          onCerrar={() => setConfirmar(null)}
          onConfirmar={(motivo, hasta) => void ejecutarTransicion(confirmar.clave, motivo, hasta)}
          ocupado={ocupado === confirmar.clave}
        />
      )}
    </Section>
  );
}

function ModalTransicion({ accion, onCerrar, onConfirmar, ocupado }: {
  accion: DefinicionAccion;
  onCerrar: () => void;
  onConfirmar: (motivo: string, hasta?: string) => void;
  ocupado: boolean;
}) {
  const def = useMemo(() => plantillaTransicion(!!accion.pideHasta), [accion.pideHasta]);
  const form = useFormularioDinamico(def, {}, {});
  const [err, setErr] = useState<string | null>(null);

  function confirmar() {
    if (!form.esValido()) { form.validarAhora(); setErr("El motivo es obligatorio."); return; }
    const motivo = String(form.valores.motivo ?? "").trim();
    if (!motivo) { setErr("El motivo es obligatorio."); return; }
    const hasta = accion.pideHasta ? String(form.valores.hasta ?? "").trim() : undefined;
    if (accion.pideHasta && !hasta) { setErr("Indica la fecha «hasta»."); return; }
    onConfirmar(motivo, hasta);
  }

  return (
    <Modal abierto onClose={onCerrar} titulo={`Transición: ${accion.etiqueta}`}
      pie={<><Button variant="fantasma" onClick={onCerrar}>Volver</Button><Button variant={accion.peligro ? "peligro" : "primario"} loading={ocupado} onClick={confirmar}>{`Confirmar ${accion.etiqueta.toLowerCase()}`}</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}

/* -------------------------------- Tabs ---------------------------------- */

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>{etiqueta}</dt>
      <dd style={{ margin: 0 }}>{valor ?? "—"}</dd>
    </>
  );
}

function TabGeneral({ plan }: { plan: PlanRow }) {
  const a = plan.alcance ?? {};
  const alcanceTexto = [
    a.activos?.length && `${a.activos.length} activo(s)`,
    a.categorias?.length && `${a.categorias.length} categoría(s)`,
    a.familias?.length && `${a.familias.length} familia(s)`,
    a.empresas?.length && `${a.empresas.length} empresa(s)`,
    a.proyectos?.length && `${a.proyectos.length} proyecto(s)`,
    a.ubicaciones?.length && `${a.ubicaciones.length} ubicación(es)`,
    a.clases?.length && `${a.clases.length} clase(s)`,
  ].filter(Boolean).join(" · ") || "Sin alcance declarado";
  return (
    <Card><CardContent>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
        <Fila etiqueta="Nombre" valor={plan.nombre} />
        <Fila etiqueta="Descripción" valor={plan.descripcion ?? "—"} />
        <Fila etiqueta="Tipo" valor={plan.tipoPlan} />
        <Fila etiqueta="Estrategia" valor={plan.estrategia} />
        <Fila etiqueta="Prioridad" valor={plan.prioridad} />
        <Fila etiqueta="Estado" valor={<BadgeEstadoPlan estado={plan.estado} />} />
        <Fila etiqueta="Versión" valor={String(plan.version ?? 1)} />
        <Fila etiqueta="Alcance" valor={alcanceTexto} />
      </dl>
    </CardContent></Card>
  );
}

function TabFrecuencias({ plan }: { plan: PlanRow }) {
  const f = plan.programa?.frecuencia;
  if (!f?.reglas?.length) return <Card><CardContent><EmptyState titulo="Sin frecuencias" descripcion="El plan no tiene reglas de frecuencia." /></CardContent></Card>;
  return (
    <Card>
      <CardHeader><strong>{resumenFrecuencia(f)}</strong></CardHeader>
      <CardContent>
        <Table caption="Reglas de frecuencia del plan">
          <thead><tr><th scope="col">Tipo</th><th scope="col">Cada</th><th scope="col">Unidad</th><th scope="col">Evento</th></tr></thead>
          <tbody>
            {f.reglas.map((r, i) => (
              <tr key={i}><td>{r.tipo}</td><td>{r.cada ?? "—"}</td><td>{r.unidad ?? "—"}</td><td>{r.evento ?? "—"}</td></tr>
            ))}
          </tbody>
        </Table>
        <p style={{ marginTop: "var(--do-sp-2)", fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
          Modo: {f.modo ?? "simple"} · tolerancia antes {f.toleranciaAntes ?? 0} · después {f.toleranciaDespues ?? 0}
        </p>
      </CardContent>
    </Card>
  );
}

function TabRutina({ plan }: { plan: PlanRow }) {
  const r = plan.rutina;
  if (!r?.actividades?.length) return <Card><CardContent><EmptyState titulo="Sin rutina" descripcion="El plan no tiene actividades planificadas." /></CardContent></Card>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      <Card><CardHeader><strong>{r.nombre}</strong></CardHeader><CardContent>
        <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
          {r.actividades.length} actividad(es){r.duracionTotal ? ` · duración total ${r.duracionTotal.minutos} min` : ""}
        </span>
      </CardContent></Card>
      {r.actividades.map((act) => (
        <Card key={act.id}>
          <CardHeader><strong>{act.orden + 1}. {act.titulo}</strong> <Badge variant="neutro">{act.tipo}</Badge></CardHeader>
          <CardContent>
            {act.descripcion && <p>{act.descripcion}</p>}
            <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", fontSize: "var(--do-text-sm)" }}>
              {act.duracion && <Badge variant="info">{act.duracion.minutos} min</Badge>}
              {act.disciplina && <Badge variant="neutro">{act.disciplina}</Badge>}
              {conteo("Herramientas", act.herramientas)}
              {conteo("EPP", act.epp)}
              {conteo("Materiales", act.materiales)}
              {conteo("Repuestos", act.repuestos)}
              {conteo("Checklists", act.checklists)}
              {conteo("Documentación", act.documentacion)}
              {act.riesgos?.length ? <Badge variant="advertencia">{act.riesgos.length} riesgo(s)</Badge> : null}
            </div>
            {act.observaciones && <p style={{ marginTop: "var(--do-sp-2)", fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>{act.observaciones}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function conteo(etiqueta: string, arr?: unknown[]): React.ReactNode {
  if (!arr?.length) return null;
  return <Badge variant="neutro">{etiqueta}: {arr.length}</Badge>;
}

function TabProgramacion({ plan }: { plan: PlanRow }) {
  const p = plan.programa;
  return (
    <Card><CardContent>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
        <Fila etiqueta="Vigente desde" valor={fechaCorta(p?.vigenteDesde)} />
        <Fila etiqueta="Vigente hasta" valor={fechaCorta(p?.vigenteHasta)} />
        <Fila etiqueta="Calendario" valor={p?.calendarioId ?? "—"} />
        <Fila etiqueta="Próxima ocurrencia" valor={fechaCorta(plan.proximaOcurrencia)} />
      </dl>
    </CardContent></Card>
  );
}

function TabGeneraciones({ plan, onNavegar, onCambio }: { plan: PlanRow; onNavegar: (u: string) => void; onCambio: () => void }) {
  const { datos, cargando, error, recargar } = useGeneraciones(plan.id);
  const [modal, setModal] = useState<"evaluar" | "generar" | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <Button variant="secundario" size="sm" onClick={() => setModal("evaluar")}>Evaluar generación</Button>
        <Button variant="primario" size="sm" onClick={() => setModal("generar")}>Generar órdenes preventivas</Button>
      </div>
      {cargando ? (
        <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
      ) : error ? (
        <ErrorState titulo="No se pudieron cargar las generaciones" descripcion={error.message} onReintentar={recargar} />
      ) : (datos ?? []).length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin generaciones" descripcion="Este plan aún no ha generado órdenes de trabajo." /></CardContent></Card>
      ) : (
        <Card><CardContent>
          <Table caption="Órdenes generadas por el plan">
            <thead><tr><th scope="col">Ocurrencia</th><th scope="col">Activo</th><th scope="col">Origen</th><th scope="col">Clave dedup</th><th scope="col">Estado</th><th scope="col">Orden</th></tr></thead>
            <tbody>
              {(datos ?? []).map((g: Generacion) => {
                const materializada = g.estado === "materializada" || Boolean(g.ordenTrabajoId);
                return (
                  <tr key={g.id}>
                    <td>{fechaCorta(g.ocurrencia ?? g.fechaObjetivo)}</td>
                    <td>{g.activoId ?? "—"}</td>
                    <td>{g.origen ?? "—"}</td>
                    <td style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{g.claveDedup ?? "—"}</td>
                    <td>
                      <Badge variant={materializada ? "exito" : "advertencia"}>
                        {g.estado === "materializada" ? "Materializada" : g.estado === "pendiente" ? "Pendiente" : materializada ? "Materializada" : "Pendiente"}
                      </Badge>
                    </td>
                    <td>
                      {materializada && g.ordenTrabajoId
                        ? <Link href={urlOrdenGenerada(g.ordenTrabajoId)}><Button size="sm" variant="secundario">Abrir OT</Button></Link>
                        : <Badge variant="neutro">Sin OT</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </CardContent></Card>
      )}
      {modal === "evaluar" && <ModalEvaluar plan={plan} onCerrar={() => setModal(null)} />}
      {modal === "generar" && <ModalGenerar plan={plan} onCerrar={() => setModal(null)} onOk={() => { setModal(null); recargar(); onCambio(); }} onNavegar={onNavegar} />}
    </div>
  );
}

function ModalEvaluar({ plan, onCerrar }: { plan: PlanRow; onCerrar: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaEvaluar(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function evaluar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Indica activo, origen y anclaje."); return; }
    setOcupado(true); setErr(null); setResultado(null);
    const ahora = new Date().toISOString();
    const r = await evaluarGeneracion(cola, plan.id, construirInputEvaluar(form.valores, ahora));
    setOcupado(false);
    if (r.encolada) { setErr("Sin conexión: la evaluación se encoló."); return; }
    if (r.error) { setErr(r.error.message); return; }
    setResultado((r.resultado ?? {}) as Record<string, unknown>);
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Evaluar generación"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cerrar</Button><Button variant="primario" loading={ocupado} onClick={() => void evaluar()}>Evaluar</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
      {resultado && (
        <Alert variant={resultado.debeGenerar ? "exito" : "info"} titulo={resultado.debeGenerar ? "El plan DEBE generar una orden" : "El plan no debe generar aún"}>
          <span style={{ fontSize: "var(--do-text-sm)" }}>
            {resultado.ocurrencia ? `Ocurrencia: ${fechaCorta(String(resultado.ocurrencia))}. ` : ""}
            {resultado.claveDedup ? `Clave dedup: ${String(resultado.claveDedup)}.` : ""}
            {resultado.proxima ? ` Próxima: ${fechaCorta(String(resultado.proxima))}.` : ""}
          </span>
        </Alert>
      )}
    </Modal>
  );
}

function ModalGenerar({ plan, onCerrar, onOk, onNavegar }: { plan: PlanRow; onCerrar: () => void; onOk: () => void; onNavegar: (u: string) => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaGenerar(), []);
  const form = useFormularioDinamico(def, {}, { limite: 10 });
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoGeneracion | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function generar() {
    setOcupado(true); setErr(null); setResultado(null);
    const limite = Number(form.valores.limite ?? 0) || undefined;
    const tipoOrden = String(form.valores.tipoOrden ?? "").trim() || undefined;
    const r = await generarOrdenesPreventivas(cola, plan.id, { limite, tipoOrden });
    setOcupado(false);
    if (r.encolada) { setErr("Sin conexión: la generación se encoló y se aplicará al sincronizar."); return; }
    if (r.error) { setErr(r.error.message); return; }
    setResultado((r.resultado ?? {}) as ResultadoGeneracion);
    onOk();
  }

  const ordenes = resultado?.ordenesCreadas ?? [];
  const errores = resultado?.errores ?? [];
  const creadas = ordenes.filter((o) => !o.idempotente);
  const idempotentes = ordenes.filter((o) => o.idempotente);

  return (
    <Modal abierto onClose={onCerrar} titulo="Generar órdenes preventivas"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cerrar</Button><Button variant="primario" loading={ocupado} onClick={() => void generar()}>Generar</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <Alert variant="info" titulo="Orquestación idempotente: nunca duplica. Las OT ya materializadas se reportan como idempotentes." />
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
      {resultado && (
        <div style={{ marginTop: "var(--do-sp-3)", display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            {typeof resultado.evaluadas === "number" && <Badge variant="info">{resultado.evaluadas} evaluada(s)</Badge>}
            <Badge variant="exito">{creadas.length} creada(s)</Badge>
            <Badge variant="neutro">{idempotentes.length} idempotente(s)</Badge>
            {errores.length > 0 && <Badge variant="error">{errores.length} error(es)</Badge>}
          </div>
          {ordenes.map((o) => (
            <div key={o.generacionId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
              <span style={{ fontSize: "var(--do-text-sm)" }}>
                <Badge variant={o.idempotente ? "neutro" : "exito"}>{o.idempotente ? "Idempotente" : "Creada"}</Badge>{" "}
                <span style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{o.claveDedup}</span>
              </span>
              {o.ordenTrabajoId && <Button size="sm" variant="secundario" onClick={() => onNavegar(urlOrdenGenerada(o.ordenTrabajoId))}>Abrir OT</Button>}
            </div>
          ))}
          {errores.map((e, i) => (
            <div key={`${e.claveDedup}-${i}`} style={{ fontSize: "var(--do-text-sm)", color: "var(--do-peligro, var(--do-error))" }}>
              <span style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{e.claveDedup}</span>
              {" · "}{e.code ? `${e.code}: ` : ""}{e.error}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function TabVersiones({ plan, onCambio }: { plan: PlanRow; onCambio: () => void }) {
  const { datos, cargando, error, recargar } = useVersiones(plan.id);
  const { cola } = useOffline();
  const [ocupado, setOcupado] = useState<number | "publicar" | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);
  const version = plan.version ?? 1;

  async function publicar() {
    setOcupado("publicar"); setMsg(null);
    const r = await publicarPlan(cola, plan.id, version);
    setOcupado(null);
    aplicar(r, "Versión de trabajo publicada.");
  }
  async function rollback(destino: number) {
    setOcupado(destino); setMsg(null);
    const r = await rollbackPlan(cola, plan.id, version, destino);
    setOcupado(null);
    aplicar(r, `Rollback a la versión ${destino} solicitado.`);
  }
  function aplicar(r: { encolada: boolean; error?: Error }, ok: string) {
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la operación se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: ok }); recargar(); onCambio(); }
  }

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudieron cargar las versiones" descripcion={error.message} onReintentar={recargar} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      {plan.estado === "BORRADOR" && (
        <Card><CardContent>
          <p style={{ fontSize: "var(--do-text-sm)" }}>La versión de trabajo actual está en borrador. Publicarla la vuelve VIGENTE (decisión explícita, gobernada por Workflow).</p>
          <Button variant="primario" size="sm" loading={ocupado === "publicar"} onClick={() => void publicar()}>Publicar versión de trabajo</Button>
        </CardContent></Card>
      )}
      {(datos ?? []).length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin versiones históricas" descripcion="Todavía no hay versiones publicadas anteriores." /></CardContent></Card>
      ) : (
        <Card><CardContent>
          <Table caption="Versiones del plan">
            <thead><tr><th scope="col">Versión</th><th scope="col">Estado</th><th scope="col">Publicada</th><th scope="col"><span className="do-visualmente-oculto">Acciones</span></th></tr></thead>
            <tbody>
              {(datos ?? []).map((v: VersionPlan) => (
                <tr key={v.version}>
                  <td>v{v.version}{v.activa && <> <Badge variant="exito">Activa</Badge></>}</td>
                  <td>{v.estado ?? "—"}</td>
                  <td>{fechaCorta(v.publicadaEn)}</td>
                  <td>{!v.activa && <Button size="sm" variant="secundario" loading={ocupado === v.version} onClick={() => void rollback(v.version)}>Rollback a v{v.version}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}

function TabHistorial({ id }: { id: string }) {
  const { datos, cargando, error, recargar } = useHistorial(id);
  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el historial" descripcion={error.message} onReintentar={recargar} />;
  const entradas = datos ?? [];
  if (entradas.length === 0) return <Card><CardContent><EmptyState titulo="Sin historial" descripcion="No hay entradas de bitácora para este plan." /></CardContent></Card>;
  return (
    <Card><CardContent>
      <Table caption="Historial del plan">
        <thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Descripción</th><th scope="col">Actor</th><th scope="col">Motivo</th></tr></thead>
        <tbody>
          {entradas.map((h: EntradaHistorial, i) => (
            <tr key={h.id ?? i}>
              <td>{fechaCorta(h.fecha)}</td>
              <td>{h.tipo}</td>
              <td>{h.descripcion ?? "—"}</td>
              <td>{h.actor ?? "—"}</td>
              <td>{h.motivo ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </CardContent></Card>
  );
}

function TabTimeline({ planId }: { planId: string }) {
  const { datos, cargando, error, recargar } = useEventos();
  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el timeline" descripcion={error.message} onReintentar={recargar} />;
  const eventos = (datos ?? []).filter((e: EventoPlan) => !e.planId || e.planId === planId);
  if (eventos.length === 0) return <Card><CardContent><EmptyState titulo="Sin eventos" descripcion="El timeline del plan aún no tiene eventos." /></CardContent></Card>;
  const items = eventos.map((e) => ({
    titulo: e.descripcion ?? e.tipo,
    hora: e.fecha ? new Date(e.fecha).toLocaleString("es") : "",
    descripcion: e.tipo,
    tono: tonoEvento(e.tipo),
  }));
  return <Card><CardContent><Timeline eventos={items} /></CardContent></Card>;
}

function tonoEvento(tipo: string): TimelineTono {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("suspend") || t.includes("vencid") || t.includes("cancel")) return "error";
  if (t.includes("pospon") || t.includes("extend")) return "advertencia";
  if (t.includes("public") || t.includes("gener") || t.includes("ejecut") || t.includes("complet")) return "exito";
  if (t.includes("cread") || t.includes("actualiz")) return "info";
  return "neutro";
}
