/**
 * DGP-008.3 · Pestaña Timeline visual de la ficha.
 * Muestra eventos + cambios de estado con filtros (actor/estado/entidad/rango).
 */
import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  Timeline,
  Button,
  EmptyState,
  Spinner,
  ErrorState,
} from "@workspace/design-system";
import type { TimelineTono } from "@workspace/design-system";
import { useTimelinePaginado } from "../../lib/activos/hooks";
import { ESTADOS_ACTIVO, etiquetaEstado, type EventoTimeline } from "../../lib/activos/tipos";
import { FormularioDinamico } from "../../lib/forms/FormularioDinamico";
import { plantillaFiltrosTimeline } from "../../lib/forms/plantillas";
import type { ValoresFormulario } from "../../lib/forms/tipos";

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

export function TabTimeline({ id }: { id: string }) {
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
