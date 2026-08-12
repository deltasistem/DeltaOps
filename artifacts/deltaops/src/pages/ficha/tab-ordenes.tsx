/**
 * DGP-010 · Vista 360° del Activo — pestaña «Órdenes».
 *
 * Convierte la ficha del activo (DGP-008) en el punto único desde el que se ve
 * TODA su actividad de mantenimiento: órdenes abiertas y cerradas, próximos
 * mantenimientos (OT planificadas) y el SLA operativo de cada una, con
 * navegación contextual profunda (abrir OT, crear nueva OT anclada al activo).
 * Compone el read model de Órdenes vía `useOrdenesDeActivo`; no abre API nueva.
 */
import React, { useMemo } from "react";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  Alert,
} from "@workspace/design-system";
import { useOrdenesDeActivo } from "../../lib/ecosistema/hooks";
import { estadoSla, tonoRiesgo } from "../../lib/ecosistema/sla";
import { BadgeEstado, BadgePrioridad } from "../../lib/ordenes/componentes";
import { urlOrden, urlNuevaOrden } from "../../lib/ecosistema/deep-links";
import { useSesion } from "../../lib/identidad/sesion";
import { capacidadesOrdenes } from "../../lib/ordenes/capacidades";
import type { OrdenRow } from "../../lib/ordenes/tipos";

const ABIERTAS_EXCLUIDAS = new Set(["CERRADA", "CANCELADA"]);
const PLANIFICADAS = new Set(["PLANIFICADA", "PROGRAMADA", "ABIERTA"]);

export function TabOrdenes({ activoId, activoNombre }: { activoId: string; activoNombre: string }) {
  const { datos, cargando, error, recargar } = useOrdenesDeActivo(activoId);
  const { sesion } = useSesion();
  const puedeCrear = capacidadesOrdenes(sesion ?? { rol: "CONSULTA" }).crear;
  const ahora = Date.now();

  const grupos = useMemo(() => {
    const todas = datos ?? [];
    const abiertas = todas.filter((o) => !ABIERTAS_EXCLUIDAS.has(o.estado));
    const cerradas = todas.filter((o) => ABIERTAS_EXCLUIDAS.has(o.estado));
    const proximas = abiertas.filter((o) => PLANIFICADAS.has(o.estado));
    return { todas, abiertas, cerradas, proximas };
  }, [datos]);

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudieron cargar las órdenes del activo" descripcion={error.message} onReintentar={recargar} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Badge variant="info">{grupos.abiertas.length} abierta(s)</Badge>
          <Badge variant="neutro">{grupos.cerradas.length} cerrada(s)</Badge>
        </div>
        {puedeCrear && (
          <Link href={urlNuevaOrden({ activo: activoId, activoEtiqueta: activoNombre })}>
            <Button variant="primario" size="sm">Nueva orden para este activo</Button>
          </Link>
        )}
      </div>

      {grupos.todas.length === 0 && (
        <Card><CardContent>
          <EmptyState titulo="Sin órdenes" descripcion="Este activo no tiene órdenes de trabajo registradas." />
        </CardContent></Card>
      )}

      {grupos.proximas.length > 0 && (
        <GrupoOrdenes titulo="Próximos mantenimientos" ordenes={grupos.proximas} ahora={ahora} tono="info" />
      )}
      {grupos.abiertas.length > 0 && (
        <GrupoOrdenes titulo="Órdenes abiertas" ordenes={grupos.abiertas} ahora={ahora} />
      )}
      {grupos.cerradas.length > 0 && (
        <GrupoOrdenes titulo="Historial de órdenes cerradas" ordenes={grupos.cerradas} ahora={ahora} />
      )}
    </div>
  );
}

function GrupoOrdenes({ titulo, ordenes, ahora, tono }: {
  titulo: string; ordenes: OrdenRow[]; ahora: number; tono?: "info";
}) {
  return (
    <Card>
      <CardHeader><strong>{titulo}</strong></CardHeader>
      <CardContent>
        {tono === "info" && (
          <Alert variant="info" titulo="Trabajo planificado o pendiente de ejecución para este activo." />
        )}
        <ul aria-label={titulo} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          {ordenes.map((o) => {
            const sla = estadoSla(o, ahora);
            return (
              <li key={o.id} style={{ borderTop: "1px solid var(--do-borde)", paddingTop: "var(--do-sp-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
                    <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{o.codigo}</span>
                    <span>{o.titulo}</span>
                    <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", alignItems: "center" }}>
                      <BadgeEstado estado={o.estado} />
                      <BadgePrioridad prioridad={o.prioridad} />
                      {sla.riesgo !== "sin-sla" && <Badge variant={tonoRiesgo(sla.riesgo)}>SLA: {sla.etiqueta}</Badge>}
                    </div>
                  </div>
                  <Link href={urlOrden(o.id)}><Button variant="secundario" size="sm">Abrir orden</Button></Link>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
