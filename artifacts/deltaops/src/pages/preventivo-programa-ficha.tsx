/**
 * DGP-014 · Ficha 360° de un programa preventivo.
 *
 * Pestañas: General, Actividades (dependencias, checklist, recursos, repuestos,
 * herramientas, personal, tiempos, costos, SLA), Versiones (comparar/revertir),
 * Generaciones (OT con DEEP LINK — el destino de Órdenes consume su :id,
 * DGP-010), Programación (ocurrencias + acciones reprogramar/suspender/excluir/
 * generar), Historial y Timeline. Las acciones de Workflow envían SU transición
 * REAL al endpoint gobernado (nunca bypass). Jerarquía padre↔hijos navegable.
 * Consume `?tab=`.
 */
import React, { useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  PageHeader, Section, Card, CardContent, CardHeader, Tabs, Table, Badge,
  Button, Spinner, EmptyState, ErrorState, Modal, Alert, Timeline,
} from "@workspace/design-system";
import type { TimelineTono } from "@workspace/design-system";
import { ShellPreventivo } from "../lib/preventivo/Shell";
import {
  usePrograma, useActividades, useVersiones, useGeneraciones,
  useProgramaciones, useEventos, useProgramas,
} from "../lib/preventivo/hooks";
import { useOffline } from "../lib/offline/contexto";
import { transicionarPrograma, revertirPrograma } from "../lib/preventivo/mutaciones";
import { BadgeEstadoPrograma, BadgeEstadoAgenda, fechaCorta, montoMoneda, tiempoTexto } from "../lib/preventivo/componentes";
import {
  leerParam, urlOrdenTrabajo, urlPrograma, urlProgramaTab, urlActivo, urlPlan, urlNuevoPrograma,
} from "../lib/preventivo/deep-links";
import { ACCIONES_PROGRAMA, ACCIONES_PROGRAMA_POR_ESTADO, type AccionPrograma, type DefinicionAccion } from "../lib/preventivo/constantes";
import { PanelReprogramar, PanelSuspender, PanelExcluir, PanelGenerar } from "./preventivo-acciones";
import type { ProgramaRow, ActividadRow, Generacion, VersionPrograma, Programacion, EventoPreventivo, RecursosActividad } from "../lib/preventivo/tipos";

export default function PreventivoProgramaFichaPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellPreventivo>
      <Ficha id={id} />
    </ShellPreventivo>
  );
}

function Ficha({ id }: { id: string }) {
  const { datos: programa, cargando, error, recargar } = usePrograma(id);
  const [, navegar] = useLocation();
  const tabInicial = leerParam(typeof window !== "undefined" ? window.location.search : "", "tab");

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el programa" descripcion={error.message} onReintentar={recargar} />;
  if (!programa) return <EmptyState titulo="Programa no encontrado" descripcion="El programa solicitado no existe o no está disponible." />;

  return (
    <>
      <PageHeader
        titulo={programa.nombre}
        descripcion={`${programa.tipo}${programa.clasificacion ? ` · ${programa.clasificacion}` : ""}${programa.codigo ? ` · ${programa.codigo}` : ""}`}
        acciones={<BadgeEstadoPrograma estado={programa.estado} />}
      />
      <AccionesWorkflow programa={programa} onCambio={recargar} />
      <Tabs
        porDefecto={tabInicial}
        items={[
          { id: "general", etiqueta: "General", contenido: <TabGeneral programa={programa} onNavegar={navegar} /> },
          { id: "actividades", etiqueta: "Actividades", contenido: <TabActividades programa={programa} onNavegar={navegar} /> },
          { id: "programacion", etiqueta: "Programación", contenido: <TabProgramacion programa={programa} onCambio={recargar} onNavegar={navegar} /> },
          { id: "generaciones", etiqueta: "Generaciones", contenido: <TabGeneraciones programa={programa} onNavegar={navegar} /> },
          { id: "versiones", etiqueta: "Versiones", contenido: <TabVersiones programa={programa} onCambio={recargar} /> },
          { id: "historial", etiqueta: "Historial", contenido: <TabHistorial /> },
        ]}
      />
    </>
  );
}

/* --------------------------- Acciones de Workflow ----------------------- */

export function AccionesWorkflow({ programa, onCambio }: { programa: ProgramaRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const [confirmar, setConfirmar] = useState<DefinicionAccion | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const version = programa.version ?? 1;
  const disponibles = ACCIONES_PROGRAMA_POR_ESTADO[programa.estado] ?? [];
  const acciones = ACCIONES_PROGRAMA.filter((a) => disponibles.includes(a.clave));

  async function ejecutar(accion: AccionPrograma) {
    setOcupado(accion); setMsg(null);
    const r = await transicionarPrograma(cola, programa.id, accion, version);
    setOcupado(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la acción se encoló y se sincronizará." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Acción aplicada." }); onCambio(); }
  }

  if (acciones.length === 0 && !msg) return null;

  return (
    <Section titulo="Acciones">
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        {acciones.map((a) => (
          <Button
            key={a.clave}
            variant={a.peligro ? "peligro" : "secundario"}
            disabled={ocupado != null}
            onClick={() => (a.peligro ? setConfirmar(a) : void ejecutar(a.clave))}
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
              <Button variant="peligro" onClick={() => { const c = confirmar.clave; setConfirmar(null); void ejecutar(c); }}>{confirmar.etiqueta}</Button>
            </div>
          }
        >
          <p>Esta acción es sensible. ¿Deseas continuar con «{confirmar.etiqueta}» sobre el programa <strong>{programa.nombre}</strong>?</p>
        </Modal>
      )}
    </Section>
  );
}

/* -------------------------------- General ------------------------------- */

function Dato({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (<><dt style={{ color: "var(--do-texto-suave)" }}>{termino}</dt><dd style={{ margin: 0 }}>{children}</dd></>);
}

function TabGeneral({ programa, onNavegar }: { programa: ProgramaRow; onNavegar: (u: string) => void }) {
  const hijos = useProgramas({ limit: 300 });
  const subprogramas = useMemo(
    () => (hijos.datos ?? []).filter((p) => p.padreId === programa.id),
    [hijos.datos, programa.id],
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <Card><CardContent>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
          <Dato termino="Nombre">{programa.nombre}</Dato>
          <Dato termino="Tipo">{programa.tipo}</Dato>
          <Dato termino="Clasificación">{programa.clasificacion ?? "—"}</Dato>
          <Dato termino="Código">{programa.codigo ?? "—"}</Dato>
          <Dato termino="Descripción">{programa.descripcion ?? "—"}</Dato>
          <Dato termino="Estado"><BadgeEstadoPrograma estado={programa.estado} /></Dato>
          <Dato termino="Versión">{programa.version ?? 1}</Dato>
          <Dato termino="Vigencia">{fechaCorta(programa.vigencia?.desde)}{programa.vigencia?.hasta ? ` → ${fechaCorta(programa.vigencia.hasta)}` : " → sin fin"}</Dato>
        </dl>
      </CardContent></Card>

      <Card>
        <CardHeader><strong>Planes referenciados</strong></CardHeader>
        <CardContent>
          {(programa.planes ?? []).length === 0 ? <EmptyState titulo="Sin planes" descripcion="Este programa no compone planes todavía." /> : (
            <Table caption="Planes referenciados" captionOculto>
              <thead><tr><th scope="col">Plan</th><th scope="col">Versión</th><th scope="col"><span className="do-visualmente-oculto">Ir</span></th></tr></thead>
              <tbody>
                {(programa.planes ?? []).map((p) => (
                  <tr key={`${p.planId}-${p.version}`}>
                    <td>{p.nombre ?? p.planId}</td>
                    <td>v{p.version}</td>
                    <td><Button size="sm" variant="fantasma" onClick={() => onNavegar(urlPlan(p.planId))}>Ver plan →</Button></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><strong>Activos cubiertos</strong></CardHeader>
        <CardContent>
          {(programa.activos ?? []).length === 0 ? <EmptyState titulo="Sin activos" descripcion="Alcance vacío." /> : (
            <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
              {(programa.activos ?? []).map((a) => (
                <Button key={a} size="sm" variant="fantasma" onClick={() => onNavegar(urlActivo(a))}>{a} →</Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
            <strong>Jerarquía</strong>
            <Button size="sm" variant="secundario" onClick={() => onNavegar(urlNuevoPrograma({ padreId: programa.id }))}>+ Sub-programa</Button>
          </div>
        </CardHeader>
        <CardContent>
          {programa.padreId && (
            <p style={{ margin: "0 0 var(--do-sp-2)" }}>
              Padre: <Button size="sm" variant="fantasma" onClick={() => onNavegar(urlPrograma(programa.padreId!))}>{programa.padreNombre ?? programa.padreId} →</Button>
            </p>
          )}
          {subprogramas.length === 0 ? <span style={{ color: "var(--do-texto-suave)" }}>Sin sub-programas.</span> : (
            <ul style={{ margin: 0, paddingLeft: "var(--do-sp-4)" }}>
              {subprogramas.map((s) => (
                <li key={s.id}><Link href={urlPrograma(s.id)}>{s.nombre}</Link> <BadgeEstadoPrograma estado={s.estado} /></li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ Actividades ----------------------------- */

function recursosDe(a: ActividadRow): RecursosActividad {
  const r = (a.recursos ?? {}) as RecursosActividad;
  return r;
}

function TabActividades({ programa, onNavegar }: { programa: ProgramaRow; onNavegar: (u: string) => void }) {
  const { datos, cargando, error, recargar } = useActividades(programa.id);
  const actividades = useMemo(() => [...(datos ?? [])].sort((a, b) => a.orden - b.orden), [datos]);
  const nombrePorId = useMemo(() => new Map((datos ?? []).map((a) => [a.id, a.nombre])), [datos]);

  if (cargando) return <Spinner />;
  if (error) return <ErrorState titulo="No se pudieron cargar las actividades" descripcion={error.message} onReintentar={recargar} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primario" onClick={() => onNavegar(`/preventivo/programas/${encodeURIComponent(programa.id)}/actividad`)}>+ Nueva actividad</Button>
      </div>
      {actividades.length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin actividades" descripcion="Define la primera actividad del programa." /></CardContent></Card>
      ) : actividades.map((a) => {
        const rec = recursosDe(a);
        return (
          <Card key={a.id}>
            <CardHeader>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
                <strong>#{a.orden} · {a.nombre}</strong>
                <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>{tiempoTexto(a.tiempoEstimado)} · {montoMoneda(a.costoEstimado ?? rec.costoEstimado, a.moneda ?? rec.moneda)}</span>
              </div>
            </CardHeader>
            <CardContent>
              {a.descripcion && <p style={{ marginTop: 0 }}>{a.descripcion}</p>}
              <div style={{ display: "grid", gap: "var(--do-sp-2)", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                <div><strong>Checklist</strong><div style={{ fontSize: "var(--do-text-sm)" }}>{a.checklist ? `${a.checklist.nombre ?? a.checklist.plantillaId} · v${a.checklist.version}` : "—"}</div></div>
                <div><strong>Dependencias</strong><div style={{ fontSize: "var(--do-text-sm)" }}>{(a.dependencias ?? []).length === 0 ? "—" : (a.dependencias ?? []).map((d) => nombrePorId.get(d) ?? d).join(", ")}</div></div>
                <div><strong>Personal</strong><div style={{ fontSize: "var(--do-text-sm)" }}>{(rec.personal ?? []).length === 0 ? "—" : (rec.personal ?? []).map((p) => `${p.rol}${p.cantidad ? ` ×${p.cantidad}` : ""}`).join(", ")}</div></div>
                <div><strong>Herramientas</strong><div style={{ fontSize: "var(--do-text-sm)" }}>{(rec.herramientas ?? []).length === 0 ? "—" : (rec.herramientas ?? []).map((h) => h.descripcion ?? h.referenciaId).join(", ")}</div></div>
                <div><strong>Repuestos</strong><div style={{ fontSize: "var(--do-text-sm)" }}>{(rec.repuestos ?? []).length === 0 ? "—" : (rec.repuestos ?? []).map((r) => `${r.descripcion ?? r.referenciaId}${r.cantidad ? ` ×${r.cantidad}` : ""}`).join(", ")}</div></div>
                <div><strong>SLA</strong><div style={{ fontSize: "var(--do-text-sm)" }}>{a.sla ? "Definido" : "—"}</div></div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ------------------------------ Programación ---------------------------- */

function TabProgramacion({ programa, onCambio, onNavegar }: { programa: ProgramaRow; onCambio: () => void; onNavegar: (u: string) => void }) {
  const { datos, cargando, error, recargar } = useProgramaciones(programa.id, 200);
  const { datos: actividades } = useActividades(programa.id);
  const [panel, setPanel] = useState<null | "reprogramar" | "suspender" | "excluir" | "generar">(null);

  function cerrar(recarga: boolean) { setPanel(null); if (recarga) { recargar(); onCambio(); } }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <Button variant="secundario" onClick={() => setPanel("reprogramar")}>Reprogramar</Button>
        <Button variant="secundario" onClick={() => setPanel("suspender")}>Suspender</Button>
        <Button variant="secundario" onClick={() => setPanel("excluir")}>Excluir rango</Button>
        <Button variant="primario" onClick={() => setPanel("generar")}>Generar OT</Button>
      </div>
      {cargando ? <Spinner /> : error ? <ErrorState titulo="No se pudo cargar la programación" descripcion={error.message} onReintentar={recargar} /> : (datos ?? []).length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin ocurrencias planificadas" descripcion="Aún no hay programaciones para este programa." /></CardContent></Card>
      ) : (
        <Table caption="Programaciones del programa" captionOculto>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Actividad</th><th scope="col">Activo</th><th scope="col">Estado</th><th scope="col">OT</th></tr></thead>
          <tbody>
            {(datos ?? []).map((o, i) => (
              <tr key={o.id ?? i}>
                <td>{fechaCorta(o.fecha)}</td>
                <td>{o.actividadNombre ?? o.actividadId ?? "—"}</td>
                <td>{o.activoNombre ?? o.activoId ?? "—"}</td>
                <td><BadgeEstadoAgenda estado={o.estado} /></td>
                <td>{o.ordenTrabajoId ? <Button size="sm" variant="fantasma" onClick={() => onNavegar(urlOrdenTrabajo(o.ordenTrabajoId!))}>Ver OT →</Button> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {panel === "reprogramar" && <PanelReprogramar programaId={programa.id} onClose={cerrar} />}
      {panel === "suspender" && <PanelSuspender programaId={programa.id} onClose={cerrar} />}
      {panel === "excluir" && <PanelExcluir programaId={programa.id} onClose={cerrar} />}
      {panel === "generar" && <PanelGenerar programaId={programa.id} actividades={actividades ?? []} activos={programa.activos ?? []} onClose={cerrar} onNavegar={onNavegar} />}
    </div>
  );
}

/* ------------------------------ Generaciones ---------------------------- */

function TabGeneraciones({ programa, onNavegar }: { programa: ProgramaRow; onNavegar: (u: string) => void }) {
  const { datos, cargando, error, recargar } = useGeneraciones(programa.id, 200);
  if (cargando) return <Spinner />;
  if (error) return <ErrorState titulo="No se pudieron cargar las generaciones" descripcion={error.message} onReintentar={recargar} />;
  if ((datos ?? []).length === 0) return <Card><CardContent><EmptyState titulo="Sin generaciones" descripcion="Este programa no ha generado órdenes todavía." /></CardContent></Card>;
  return (
    <Table caption="Órdenes generadas" captionOculto>
      <thead><tr><th scope="col">Fecha objetivo</th><th scope="col">Activo</th><th scope="col">Estado</th><th scope="col">Idempotente</th><th scope="col">OT</th></tr></thead>
      <tbody>
        {(datos ?? []).map((g: Generacion, i) => (
          <tr key={g.id ?? i}>
            <td>{fechaCorta(g.fechaObjetivo)}</td>
            <td>{g.activoId ?? "—"}</td>
            <td><Badge variant={g.estado === "materializada" ? "exito" : "advertencia"}>{g.estado ?? "—"}</Badge></td>
            <td>{g.idempotente ? "Sí" : "No"}</td>
            <td>{g.ordenTrabajoId ? <Button size="sm" variant="fantasma" onClick={() => onNavegar(urlOrdenTrabajo(g.ordenTrabajoId!))}>Ver OT →</Button> : "—"}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/* ------------------------------- Versiones ------------------------------ */

function TabVersiones({ programa, onCambio }: { programa: ProgramaRow; onCambio: () => void }) {
  const { datos, cargando, error, recargar } = useVersiones(programa.id);
  const { cola } = useOffline();
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  async function revertir(hacia: number) {
    setOcupado(hacia); setMsg(null);
    const r = await revertirPrograma(cola, programa.id, programa.version ?? 1, hacia);
    setOcupado(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la reversión se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: `Revertido a v${hacia}.` }); recargar(); onCambio(); }
  }

  if (cargando) return <Spinner />;
  if (error) return <ErrorState titulo="No se pudieron cargar las versiones" descripcion={error.message} onReintentar={recargar} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      {(datos ?? []).length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin versiones" descripcion="El historial de versiones aparecerá aquí." /></CardContent></Card>
      ) : (
        <Table caption="Versiones del programa" captionOculto>
          <thead><tr><th scope="col">Versión</th><th scope="col">Estado</th><th scope="col">Fecha</th><th scope="col">Resumen</th><th scope="col"><span className="do-visualmente-oculto">Acciones</span></th></tr></thead>
          <tbody>
            {(datos ?? []).map((v: VersionPrograma) => (
              <tr key={v.version}>
                <td>v{v.version} {v.activa && <Badge variant="primario">Activa</Badge>}</td>
                <td>{v.estado ?? "—"}</td>
                <td>{fechaCorta(v.creadoEn)}</td>
                <td>{v.resumen ?? v.nota ?? "—"}</td>
                <td>{!v.activa && <Button size="sm" variant="secundario" disabled={ocupado != null} onClick={() => void revertir(v.version)}>{ocupado === v.version ? "…" : "Revertir aquí"}</Button>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/* -------------------------------- Historial ----------------------------- */

function TabHistorial() {
  const { datos, cargando, error, recargar } = useEventos();
  if (cargando) return <Spinner />;
  if (error) return <ErrorState titulo="No se pudo cargar el historial" descripcion={error.message} onReintentar={recargar} />;
  const eventos = (datos ?? []) as EventoPreventivo[];
  if (eventos.length === 0) return <Card><CardContent><EmptyState titulo="Sin eventos" descripcion="El registro de eventos aparecerá aquí." /></CardContent></Card>;
  const items = eventos.map((e) => ({
    titulo: e.tipo ?? "Evento",
    hora: fechaCorta(e.ocurridoEn),
    descripcion: e.descripcion ?? "",
    tono: "neutro" as TimelineTono,
  }));
  return <Timeline eventos={items} />;
}
