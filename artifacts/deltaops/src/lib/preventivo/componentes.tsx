/**
 * DGP-014 · Componentes de presentación reutilizables del módulo preventivo.
 * Sólo Design System + tokens `--do-*`. Sin lógica de negocio.
 */
import React from "react";
import { Link } from "wouter";
import { Badge, Card, CardContent, CardHeader } from "@workspace/design-system";
import {
  ETIQUETA_ESTADO_PROGRAMA,
  TONO_ESTADO_PROGRAMA,
  ETIQUETA_ESTADO_AGENDA,
  TONO_ESTADO_AGENDA,
} from "./constantes";
import { urlPrograma } from "./deep-links";
import type { ProgramaRow } from "./tipos";

/* -------------------------------- Badges -------------------------------- */

export function BadgeEstadoPrograma({ estado }: { estado?: string }) {
  const e = estado ?? "BORRADOR";
  return <Badge variant={TONO_ESTADO_PROGRAMA[e] ?? "neutro"}>{ETIQUETA_ESTADO_PROGRAMA[e] ?? e}</Badge>;
}

export function BadgeEstadoAgenda({ estado }: { estado?: string }) {
  const e = estado ?? "planificado";
  return <Badge variant={TONO_ESTADO_AGENDA[e] ?? "neutro"}>{ETIQUETA_ESTADO_AGENDA[e] ?? e}</Badge>;
}

/* ------------------------------- Formateo ------------------------------- */

export function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" });
}

export function montoMoneda(monto?: number, moneda?: string): string {
  if (monto == null) return "—";
  return `${moneda ?? ""} ${monto.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

export function tiempoTexto(t?: { valor: number; unidad: string } | null): string {
  if (!t) return "—";
  return `${t.valor} ${t.unidad}`;
}

/* ------------------------------- Tarjetas ------------------------------- */

export function TarjetaPrograma({ programa }: { programa: ProgramaRow }) {
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)" }}>
          <div>
            <Link href={urlPrograma(programa.id)}>
              <strong style={{ fontSize: "var(--do-text-md)" }}>{programa.nombre}</strong>
            </Link>
            <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
              {programa.tipo}{programa.codigo ? ` · ${programa.codigo}` : ""}
            </div>
          </div>
          <BadgeEstadoPrograma estado={programa.estado} />
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", gap: "var(--do-sp-3)", flexWrap: "wrap", fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
          <span>{(programa.activos ?? []).length} activo(s)</span>
          <span>{(programa.planes ?? []).length} plan(es)</span>
          {programa.vigencia?.desde && <span>Desde {fechaCorta(programa.vigencia.desde)}</span>}
          {programa.padreId && <span>Sub-programa</span>}
        </div>
      </CardContent>
    </Card>
  );
}
