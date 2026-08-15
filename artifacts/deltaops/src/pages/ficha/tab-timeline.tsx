/**
 * DGP-008.3 · Pestaña Timeline visual de la ficha (Hoja de vida del equipo).
 * Muestra eventos + cambios de estado con filtros (actor/estado/entidad/rango).
 *
 * DELTAOPS LITE-10 §19 · Sobre la cronología, un bloque «Información actual»
 * compone (sin datos nuevos) el estado presente del equipo: horómetro, centro de
 * costos, ubicación, responsable y próximo mantenimiento. Toda ausencia se dice
 * de forma honesta.
 */
import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Timeline,
  Button,
  EmptyState,
  Spinner,
  ErrorState,
} from "@workspace/design-system";
import type { TimelineTono } from "@workspace/design-system";
import { MapPin, User, Building2 } from "lucide-react";
import { useTimelinePaginado } from "../../lib/activos/hooks";
import { ESTADOS_ACTIVO, etiquetaEstado, type EventoTimeline, type ActivoRow } from "../../lib/activos/tipos";
import { FormularioDinamico } from "../../lib/forms/FormularioDinamico";
import { plantillaFiltrosTimeline } from "../../lib/forms/plantillas";
import type { ValoresFormulario } from "../../lib/forms/tipos";
import { centroDeRegistro } from "../../lib/centro/contexto";

function tono(ev: EventoTimeline): TimelineTono {
  const t = (ev.tipo ?? "").toLowerCase();
  if (t.includes("retir") || t.includes("fuera")) return "error";
  if (t.includes("mantenimiento")) return "advertencia";
  if (t.includes("operativo")) return "exito";
  if (t.includes("registr")) return "info";
  return "neutro";
}

function fecha(ev: EventoTimeline): string {
  const iso = ev.ocurridoAt ?? ev.occurredAt ?? ev.fecha;
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("es");
}

/**
 * §19 · «Información actual»: estado presente del equipo por composición pura.
 * El resumen operacional (horómetro + próximo mantenimiento + último preop) vive
 * en la cabecera de la ficha (visible sobre las tabs); aquí sólo se muestran los
 * datos propios del bloque —centro de costos, ubicación y responsable— del read
 * model del activo. Estados vacíos honestos. (LITE-10 MENOR-1: sin doble montaje.)
 */
function InformacionActual({ activo }: { activo: ActivoRow }) {
  const d = activo.datos ?? {};
  const txt = (k: string): string => {
    const v = d[k];
    return typeof v === "string" && v !== "" ? v : "—";
  };
  const centro = centroDeRegistro(d) ?? "Sin centro de costos configurado";
  const ubicacion = activo.ubicacionId && activo.ubicacionId !== "" ? activo.ubicacionId : txt("ubicacion");
  const responsable = txt("responsable");
  const item = (icono: React.ReactNode, etiqueta: string, valor: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", minWidth: "min(180px, 100%)", flex: "1 1 160px" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--do-sp-1)",
          fontSize: "var(--do-text-xs)",
          color: "var(--do-texto-suave)",
          textTransform: "uppercase",
          letterSpacing: "var(--do-tracking-etiquetas)",
        }}
      >
        <span aria-hidden="true" style={{ display: "inline-flex" }}>{icono}</span>
        {etiqueta}
      </span>
      <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{valor}</span>
    </div>
  );
  return (
    <Card>
      <CardHeader><strong>Información actual</strong></CardHeader>
      <CardContent>
        {/* LITE-10 MENOR-1 (code-review) · El resumen operacional (horómetro +
            próxima rutina + último preoperacional) YA vive en la cabecera de la
            ficha (`DatosGenerales` → `ResumenCabecera`), visible sobre las tabs.
            Aquí se evita montarlo por segunda vez (queries duplicadas) y se dejan
            sólo los datos propios del bloque: centro de costos, ubicación y
            responsable, que no aparecen en la cabecera. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-3) var(--do-sp-5)", alignItems: "flex-start" }}>
          {item(<Building2 size={14} />, "Centro de costos", centro)}
          {item(<MapPin size={14} />, "Ubicación", ubicacion)}
          {item(<User size={14} />, "Responsable", responsable)}
        </div>
      </CardContent>
    </Card>
  );
}

export function TabTimeline({ id, activo }: { id: string; activo?: ActivoRow }) {
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const { eventos: datos, cargando, cargandoMas, error, hayMas, cargarMas, recargar } = useTimelinePaginado(id, filtros);
  const defFiltros = useMemo(
    () => plantillaFiltrosTimeline(ESTADOS_ACTIVO.map((e) => ({ valor: e, etiqueta: etiquetaEstado(e) }))),
    [],
  );

  function alCambiar(v: ValoresFormulario) {
    const limpio: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) if (val != null && val !== "") limpio[k] = String(val);
    setFiltros(limpio);
  }

  const eventos = (datos ?? []).map((ev) => ({
    titulo: ev.descripcion ?? ev.resumen ?? ev.tipo ?? "Evento",
    hora: fecha(ev),
    descripcion: [ev.actor && `Actor: ${ev.actor}`, ev.estado && `Estado: ${ev.estado}`].filter(Boolean).join(" · ") || undefined,
    tono: tono(ev),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      {activo && <InformacionActual activo={activo} />}

      <Card>
        <CardContent>
          <FormularioDinamico definicion={defFiltros} valores={filtros as ValoresFormulario} onCambio={alCambiar} />
          <div style={{ marginTop: "var(--do-sp-3)" }}><Button variant="secundario" size="sm" onClick={recargar}>Aplicar filtros</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {cargando ? (
            <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
          ) : error ? (
            <ErrorState titulo="No se pudo cargar la cronología" descripcion={error.message} onReintentar={recargar} />
          ) : eventos.length === 0 ? (
            <EmptyState titulo="Sin eventos" descripcion="No hay eventos que coincidan con los filtros." />
          ) : (
            <>
              <Timeline eventos={eventos} label={`Cronología del activo ${id}`} />
              {hayMas ? (
                <div style={{ display: "grid", placeItems: "center", marginTop: "var(--do-sp-4)" }}>
                  <Button variant="secundario" size="sm" onClick={cargarMas} disabled={cargandoMas}>
                    {cargandoMas ? "Cargando…" : "Cargar más"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
