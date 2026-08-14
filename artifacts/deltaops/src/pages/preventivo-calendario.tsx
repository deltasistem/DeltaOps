/**
 * DGP-014 · Calendario preventivo (ANUAL / MENSUAL / SEMANAL / DIARIA + GANTT).
 *
 * Toda la lógica de agrupación y del Gantt es PURA (`lib/preventivo/calendario`)
 * y por tanto testeable. La vista sólo pinta con Design System + tokens `--do-*`
 * (sin librerías pesadas nuevas). Navegación entre niveles (año→mes→semana→día),
 * densidad por grupo, filtros por programa/activo/estado y estados de agenda
 * (vencido/próximo/generado/excluido/suspendido). Consume el contexto de la URL
 * (`?vista=&programa=&activo=`, ruta→filtro DGP-010). El Gantt ordena las
 * actividades por dependencias.
 */
import React, { useMemo, useState } from "react";
import { useSearch } from "wouter";
import {
  PageHeader, Section, Card, CardContent, CardHeader, Button, Spinner,
  EmptyState, ErrorState, Badge, Progress, Table, Select,
} from "@workspace/design-system";
import { ShellPreventivo } from "../lib/preventivo/Shell";
import { useProgramacionesGlobales, useProgramas, useActividades } from "../lib/preventivo/hooks";
import { BadgeEstadoAgenda, fechaCorta, tiempoTexto } from "../lib/preventivo/componentes";
import {
  agruparPorVista, construirGantt, filtrarProgramaciones,
  type Vista, type FiltroCalendario,
} from "../lib/preventivo/calendario";
import { VISTAS_CALENDARIO, type VistaCalendario } from "../lib/preventivo/constantes";
import { leerParam } from "../lib/preventivo/deep-links";
import type { Programacion } from "../lib/preventivo/tipos";

export default function PreventivoCalendarioPage() {
  return (
    <ShellPreventivo activo="/preventivo/calendario">
      <Calendario />
    </ShellPreventivo>
  );
}

export function Calendario() {
  const search = useSearch();
  const vistaUrl = (leerParam(search, "vista") as VistaCalendario | undefined);
  const programaUrl = leerParam(search, "programa");
  const activoUrl = leerParam(search, "activo");

  const { datos, cargando, error, recargar } = useProgramacionesGlobales();
  const programas = useProgramas({ limit: 300 });

  const [vista, setVista] = useState<VistaCalendario>(vistaUrl ?? "mensual");
  const [programaId, setProgramaId] = useState<string>(programaUrl ?? "");
  const [activoId, setActivoId] = useState<string>(activoUrl ?? "");
  const [estado, setEstado] = useState<string>("");

  const ocurrencias = useMemo(() => datos ?? [], [datos]);
  const filtro: FiltroCalendario = {
    programaId: programaId || undefined,
    activoId: activoId || undefined,
    estado: estado || undefined,
  };

  const activosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const o of ocurrencias) if (o.activoId) set.add(o.activoId);
    return [...set].sort();
  }, [ocurrencias]);
  const estadosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const o of ocurrencias) if (o.estado) set.add(o.estado);
    return [...set].sort();
  }, [ocurrencias]);

  return (
    <>
      <PageHeader
        titulo="Calendario preventivo"
        descripcion="Ocurrencias planificadas por año, mes, semana o día, y diagrama de Gantt por dependencias."
      />

      <Section titulo="Vista y filtros">
        <Card><CardContent>
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div role="group" aria-label="Vista del calendario" style={{ display: "flex", gap: "var(--do-sp-1)" }}>
              {VISTAS_CALENDARIO.map((v) => (
                <Button key={v.valor} size="sm" variant={vista === v.valor ? "primario" : "fantasma"} aria-pressed={vista === v.valor} onClick={() => setVista(v.valor)}>{v.etiqueta}</Button>
              ))}
            </div>
            <Selector etiqueta="Programa" valor={programaId} onChange={setProgramaId} opciones={[{ valor: "", etiqueta: "Todos" }, ...(programas.datos ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre }))]} />
            <Selector etiqueta="Activo" valor={activoId} onChange={setActivoId} opciones={[{ valor: "", etiqueta: "Todos" }, ...activosDisponibles.map((a) => ({ valor: a, etiqueta: a }))]} />
            <Selector etiqueta="Estado" valor={estado} onChange={setEstado} opciones={[{ valor: "", etiqueta: "Todos" }, ...estadosDisponibles.map((e) => ({ valor: e, etiqueta: e }))]} />
          </div>
        </CardContent></Card>
      </Section>

      {cargando ? (
        <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
      ) : error ? (
        <ErrorState titulo="No se pudo cargar el calendario" descripcion={error.message} onReintentar={recargar} />
      ) : vista === "gantt" ? (
        <VistaGantt programaId={programaId} programas={programas.datos ?? []} onSeleccionar={setProgramaId} />
      ) : (
        <VistaAgenda ocurrencias={ocurrencias} vista={vista} filtro={filtro} />
      )}
    </>
  );
}

function Selector({ etiqueta, valor, onChange, opciones }: { etiqueta: string; valor: string; onChange: (v: string) => void; opciones: { valor: string; etiqueta: string }[] }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", fontSize: "var(--do-text-sm)" }}>
      <span style={{ color: "var(--do-texto-suave)" }}>{etiqueta}</span>
      <span style={{ minWidth: 160, display: "inline-block" }}>
        <Select size="sm" value={valor} onChange={(e) => onChange(e.target.value)} aria-label={etiqueta}>
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </Select>
      </span>
    </label>
  );
}

/* ------------------------------- Agenda --------------------------------- */

function VistaAgenda({ ocurrencias, vista, filtro }: { ocurrencias: Programacion[]; vista: Exclude<VistaCalendario, "gantt">; filtro: FiltroCalendario }) {
  const grupos = useMemo(() => agruparPorVista(ocurrencias, vista as Vista, filtro), [ocurrencias, vista, filtro]);
  const totalFiltradas = useMemo(() => filtrarProgramaciones(ocurrencias, filtro).length, [ocurrencias, filtro]);
  const maxDensidad = useMemo(() => grupos.reduce((m, g) => Math.max(m, g.densidad), 0), [grupos]);

  if (grupos.length === 0) {
    return <Card><CardContent><EmptyState titulo="Sin ocurrencias" descripcion="No hay programaciones que coincidan con los filtros." /></CardContent></Card>;
  }

  return (
    <Section titulo={`Ocurrencias (${totalFiltradas})`}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
        {grupos.map((g) => (
          <Card key={g.clave}>
            <CardHeader>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-3)" }}>
                <strong>{g.clave}</strong>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", minWidth: 180 }}>
                  <Badge variant="info">{g.densidad}</Badge>
                  <div style={{ flex: 1 }}><Progress value={maxDensidad ? Math.round((g.densidad / maxDensidad) * 100) : 0} etiqueta={`Densidad ${g.clave}`} /></div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table caption={`Ocurrencias de ${g.clave}`} captionOculto>
                <thead><tr><th scope="col">Fecha</th><th scope="col">Programa</th><th scope="col">Activo</th><th scope="col">Actividad</th><th scope="col">Estado</th></tr></thead>
                <tbody>
                  {g.ocurrencias.map((o, i) => (
                    <tr key={o.id ?? `${g.clave}-${i}`}>
                      <td>{fechaCorta(o.fecha)}</td>
                      <td>{o.programaNombre ?? o.programaId ?? "—"}</td>
                      <td>{o.activoNombre ?? o.activoId ?? "—"}</td>
                      <td>{o.actividadNombre ?? o.actividadId ?? "—"}</td>
                      <td><BadgeEstadoAgenda estado={o.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------- Gantt --------------------------------- */

function VistaGantt({ programaId, programas, onSeleccionar }: { programaId: string; programas: { id: string; nombre: string }[]; onSeleccionar: (id: string) => void }) {
  const idEfectivo = programaId || programas[0]?.id || "";
  const { datos, cargando, error, recargar } = useActividades(idEfectivo);
  const barras = useMemo(() => construirGantt(datos ?? []), [datos]);
  const total = useMemo(() => barras.reduce((m, b) => Math.max(m, b.inicio + b.duracion), 0) || 1, [barras]);

  if (!idEfectivo) return <Card><CardContent><EmptyState titulo="Selecciona un programa" descripcion="El Gantt muestra las actividades de un programa ordenadas por dependencias." /></CardContent></Card>;
  if (cargando) return <Spinner />;
  if (error) return <ErrorState titulo="No se pudo cargar el Gantt" descripcion={error.message} onReintentar={recargar} />;

  return (
    <Section titulo="Gantt por dependencias">
      <Card><CardContent>
        <div style={{ marginBottom: "var(--do-sp-3)" }}>
          <Selector etiqueta="Programa" valor={idEfectivo} onChange={onSeleccionar} opciones={programas.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} />
        </div>
        {barras.length === 0 ? (
          <EmptyState titulo="Sin actividades" descripcion="Este programa no tiene actividades para diagramar." />
        ) : (
          <div role="table" aria-label="Diagrama de Gantt" style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
            {barras.map((b) => (
              <div key={b.actividadId} role="row" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "var(--do-sp-2)", alignItems: "center" }}>
                <div role="cell" style={{ fontSize: "var(--do-text-sm)" }}>
                  <strong>#{b.orden} {b.nombre}</strong>
                  <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>{tiempoTexto(b.tiempoEstimado)}{b.dependencias.length ? ` · ${b.dependencias.length} dep.` : ""}</div>
                </div>
                <div role="cell" style={{ position: "relative", height: 22, background: "var(--do-surface-2)", borderRadius: "var(--do-radio)" }}>
                  <div
                    title={`Inicio ${b.inicio} · duración ${b.duracion}`}
                    style={{
                      position: "absolute",
                      left: `${(b.inicio / total) * 100}%`,
                      width: `${(b.duracion / total) * 100}%`,
                      top: 3, bottom: 3,
                      background: "var(--do-primario)",
                      borderRadius: "var(--do-radio)",
                      minWidth: 6,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </Section>
  );
}
