/**
 * DGP-015 · Componentes de presentación reutilizables del módulo correctivo.
 * Sólo Design System + tokens `--do-*`. Sin lógica de negocio.
 */
import React from "react";
import { Link } from "wouter";
import { Badge, Card, CardContent, CardHeader } from "@workspace/design-system";
import {
  ETIQUETA_ESTADO_SOLICITUD,
  TONO_ESTADO_SOLICITUD,
  ETIQUETA_ESTADO_INTERVENCION,
  TONO_ESTADO_INTERVENCION,
} from "./constantes";
import { urlSolicitud } from "./deep-links";
import type { SolicitudRow } from "./tipos";

/* -------------------------------- Badges -------------------------------- */

export function BadgeEstadoSolicitud({ estado }: { estado?: string }) {
  const e = estado ?? "REGISTRADA";
  return <Badge variant={TONO_ESTADO_SOLICITUD[e] ?? "neutro"}>{ETIQUETA_ESTADO_SOLICITUD[e] ?? e}</Badge>;
}

export function BadgeEstadoIntervencion({ estado }: { estado?: string }) {
  const e = estado ?? "PREPARACION";
  return <Badge variant={TONO_ESTADO_INTERVENCION[e] ?? "neutro"}>{ETIQUETA_ESTADO_INTERVENCION[e] ?? e}</Badge>;
}

/** Badge de prioridad/criticidad (texto libre de catálogo → tono heurístico). */
export function BadgePrioridad({ valor }: { valor?: string | null }) {
  if (!valor) return <>—</>;
  const t = valor.toLowerCase();
  const tono = /crit|urg|alta|alto/.test(t) ? "error" : /media|medio/.test(t) ? "advertencia" : /baja|bajo/.test(t) ? "neutro" : "info";
  return <Badge variant={tono}>{valor}</Badge>;
}

/* ------------------------------- Formateo ------------------------------- */

export function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" });
}

export function fechaHora(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("es", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------- Tarjetas ------------------------------- */

export function TarjetaSolicitud({ solicitud }: { solicitud: SolicitudRow }) {
  const activoId = solicitud.objeto?.activoId ?? solicitud.activoId;
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)" }}>
          <div>
            <Link href={urlSolicitud(solicitud.id)}>
              <strong style={{ fontSize: "var(--do-text-md)" }}>{solicitud.titulo}</strong>
            </Link>
            <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
              Origen: {solicitud.origen}{activoId ? ` · Activo ${activoId}` : ""}
            </div>
          </div>
          <BadgeEstadoSolicitud estado={solicitud.estado} />
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", gap: "var(--do-sp-3)", flexWrap: "wrap", alignItems: "center", fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
          {solicitud.prioridad && <span>Prioridad: <BadgePrioridad valor={solicitud.prioridad} /></span>}
          {(solicitud.evidencias ?? []).length > 0 && <span>{(solicitud.evidencias ?? []).length} evidencia(s)</span>}
          {solicitud.ordenTrabajoId && <span>OT vinculada</span>}
        </div>
      </CardContent>
    </Card>
  );
}
