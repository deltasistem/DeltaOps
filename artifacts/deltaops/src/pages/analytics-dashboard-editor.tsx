/**
 * DGP-016 · Editor de dashboards personalizables
 * (/analytics/dashboards/nuevo y /analytics/dashboards/:id/editar).
 *
 * Permite crear/editar sin código: añadir/quitar/reordenar widgets y configurar
 * cada uno (indicador + tipo + filtros básicos + presentación). Guarda vía POST
 * crear-dashboard / PUT actualizar-dashboard (OCC). Sólo roles con capacidad
 * dashboard; el lector es redirigido. Sólo Design System.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  Textarea,
  Select,
  Badge,
  Alert,
  Spinner,
  EmptyState,
} from "@workspace/design-system";
import { ShellAnalytics, useSesionAnalytics } from "../lib/analytics/Shell";
import { useDashboard, useIndicadores } from "../lib/analytics/hooks";
import { crearDashboard, actualizarDashboard, type EntradaWidget } from "../lib/analytics/mutaciones";
import { urlDashboard, urlHome } from "../lib/analytics/deep-links";
import { TIPOS_WIDGET, ETIQUETA_TIPO_WIDGET, type TipoWidget } from "../lib/analytics/constantes";
import { nuevoOpId } from "../lib/offline/cola";
import type { Indicador } from "../lib/analytics/tipos";

export default function AnalyticsDashboardEditorPage() {
  return (
    <ShellAnalytics>
      <Editor />
    </ShellAnalytics>
  );
}

interface BorradorWidget {
  id: string;
  tipo: TipoWidget;
  titulo: string;
  indicadorClave: string;
  n?: number;
  modo?: "topN" | "bottomN";
}

function Editor() {
  const params = useParams<{ id?: string }>();
  const id = params.id;
  const editando = Boolean(id);
  const [, navegar] = useLocation();
  const { capacidades } = useSesionAnalytics();
  const { datos: indicadores } = useIndicadores();
  const existente = useDashboard(id ?? "");

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [widgets, setWidgets] = useState<BorradorWidget[]>([]);
  const [msg, setMsg] = useState<{ tono: "error" | "exito" | "info"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cargado, setCargado] = useState(false);

  // Cargar el dashboard existente al editar.
  useEffect(() => {
    if (editando && existente.datos && !cargado) {
      setNombre(existente.datos.nombre);
      setDescripcion(existente.datos.descripcion ?? "");
      setWidgets(
        [...existente.datos.widgets]
          .sort((a, b) => a.posicion - b.posicion)
          .map((w) => ({
            id: w.id,
            tipo: w.tipo,
            titulo: w.titulo,
            indicadorClave: w.indicadorClave,
            n: w.ranking?.n,
            modo: w.ranking?.modo,
          })),
      );
      setCargado(true);
    }
  }, [editando, existente.datos, cargado]);

  const opcionesIndicador: Indicador[] = indicadores ?? [];

  if (!capacidades.dashboard) {
    return (
      <EmptyState
        titulo="Sin permiso"
        descripcion="Tu rol (lector) no permite crear ni editar dashboards."
        accion={{ label: "Volver", onClick: () => navegar(urlHome()) }}
      />
    );
  }

  if (editando && existente.cargando && !existente.datos) {
    return <div style={{ display: "grid", placeItems: "center", minHeight: 160 }}><Spinner /></div>;
  }

  function agregarWidget() {
    const claveDefecto = opcionesIndicador[0]?.clave ?? "";
    setWidgets((prev) => [...prev, { id: nuevoOpId(), tipo: "card", titulo: "Nuevo widget", indicadorClave: claveDefecto }]);
  }
  function quitarWidget(wid: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== wid));
  }
  function mover(wid: string, delta: number) {
    setWidgets((prev) => {
      const i = prev.findIndex((w) => w.id === wid);
      if (i < 0) return prev;
      const j = i + delta;
      if (j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      const [x] = copia.splice(i, 1);
      copia.splice(j, 0, x!);
      return copia;
    });
  }
  function editar(wid: string, cambios: Partial<BorradorWidget>) {
    setWidgets((prev) => prev.map((w) => (w.id === wid ? { ...w, ...cambios } : w)));
  }

  function aEntrada(): EntradaWidget[] {
    return widgets.map((w, i) => ({
      id: w.id,
      tipo: w.tipo,
      titulo: w.titulo,
      indicadorClave: w.indicadorClave,
      posicion: i,
      ranking: w.tipo === "ranking" ? { modo: w.modo ?? "topN", n: w.n ?? 5 } : null,
    }));
  }

  async function guardar() {
    setMsg(null);
    if (nombre.trim() === "") {
      setMsg({ tono: "error", texto: "El nombre es obligatorio." });
      return;
    }
    if (widgets.some((w) => w.indicadorClave === "")) {
      setMsg({ tono: "error", texto: "Todos los widgets deben referenciar un indicador." });
      return;
    }
    setOcupado(true);
    if (editando && existente.datos) {
      const r = await actualizarDashboard(existente.datos.id, existente.datos.version ?? 1, {
        nombre,
        descripcion: descripcion || null,
        widgets: aEntrada(),
      });
      setOcupado(false);
      if (r.error) return setMsg({ tono: "error", texto: r.error.message });
      navegar(urlDashboard(existente.datos.id));
    } else {
      const nuevoId = nuevoOpId();
      const r = await crearDashboard(
        { clave: `personal-${nuevoId.slice(0, 8)}`, nombre, descripcion: descripcion || null, widgets: aEntrada() },
        { id: nuevoId },
      );
      setOcupado(false);
      if (r.error) return setMsg({ tono: "error", texto: r.error.message });
      const creadoId = ((r.resultado as { id?: string })?.id) ?? nuevoId;
      navegar(urlDashboard(creadoId));
    }
  }

  return (
    <>
      <PageHeader
        titulo={editando ? "Editar dashboard" : "Nuevo dashboard"}
        descripcion="Configura widgets sin código: indicador + tipo + presentación."
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
            <Button variant="fantasma" size="sm" onClick={() => navegar(urlHome())}>Cancelar</Button>
            <Button variant="primario" size="sm" onClick={guardar} disabled={ocupado}>
              {ocupado ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        }
      />

      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}

      <Section titulo="Datos generales">
        <Card>
          <CardContent>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
              <label style={campo}>
                <span style={etiqueta}>Nombre</span>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mi dashboard" />
              </label>
              <label style={campo}>
                <span style={etiqueta}>Descripción</span>
                <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
              </label>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section
        titulo="Widgets"
        acciones={<Button variant="secundario" size="sm" onClick={agregarWidget} disabled={opcionesIndicador.length === 0}>Añadir widget</Button>}
      >
        {widgets.length === 0 ? (
          <EmptyState titulo="Sin widgets" descripcion="Añade widgets para componer el dashboard." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            {widgets.map((w, i) => (
              <Card key={w.id} role="group" aria-label={`Widget ${i + 1}`}>
                <CardHeader>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
                    <Badge variant="neutro">#{i + 1}</Badge>
                    <div style={{ display: "flex", gap: "var(--do-sp-1)" }}>
                      <Button variant="fantasma" size="sm" aria-label="Subir" onClick={() => mover(w.id, -1)} disabled={i === 0}>↑</Button>
                      <Button variant="fantasma" size="sm" aria-label="Bajar" onClick={() => mover(w.id, 1)} disabled={i === widgets.length - 1}>↓</Button>
                      <Button variant="peligro" size="sm" onClick={() => quitarWidget(w.id)}>Quitar</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(180px, 100%), 1fr))", gap: "var(--do-sp-3)" }}>
                    <label style={campo}>
                      <span style={etiqueta}>Título</span>
                      <Input value={w.titulo} onChange={(e) => editar(w.id, { titulo: e.target.value })} />
                    </label>
                    <label style={campo}>
                      <span style={etiqueta}>Indicador</span>
                      <Select value={w.indicadorClave} onChange={(e) => editar(w.id, { indicadorClave: e.target.value })}>
                        <option value="">— elige —</option>
                        {opcionesIndicador.map((ind) => (
                          <option key={ind.clave} value={ind.clave}>{ind.nombre}</option>
                        ))}
                      </Select>
                    </label>
                    <label style={campo}>
                      <span style={etiqueta}>Tipo</span>
                      <Select value={w.tipo} onChange={(e) => editar(w.id, { tipo: e.target.value as TipoWidget })}>
                        {TIPOS_WIDGET.map((t) => (
                          <option key={t} value={t}>{ETIQUETA_TIPO_WIDGET[t]}</option>
                        ))}
                      </Select>
                    </label>
                    {w.tipo === "ranking" && (
                      <>
                        <label style={campo}>
                          <span style={etiqueta}>Modo</span>
                          <Select value={w.modo ?? "topN"} onChange={(e) => editar(w.id, { modo: e.target.value as "topN" | "bottomN" })}>
                            <option value="topN">Top N (mayores)</option>
                            <option value="bottomN">Bottom N (menores)</option>
                          </Select>
                        </label>
                        <label style={campo}>
                          <span style={etiqueta}>N</span>
                          <Input type="number" min={1} value={String(w.n ?? 5)} onChange={(e) => editar(w.id, { n: Number(e.target.value) || 1 })} />
                        </label>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

const campo: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" };
const etiqueta: React.CSSProperties = { fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", fontWeight: 600 };
