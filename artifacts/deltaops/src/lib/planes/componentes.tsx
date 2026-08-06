/**
 * DGP-012 · Componentes de presentación reutilizables del módulo de Planes.
 * Sólo Design System + tokens `--do-*`. Sin lógica de negocio.
 */
import React from "react";
import { Link } from "wouter";
import { Badge, Card, CardContent, CardHeader, Button } from "@workspace/design-system";
import {
  ETIQUETA_ESTADO_PLAN,
  TONO_ESTADO_PLAN,
  TIPOS_FRECUENCIA,
} from "./constantes";
import { urlPlan } from "./deep-links";
import type { PlanRow, Frecuencia } from "./tipos";

/** Badge del estado del plan (Workflow). */
export function BadgeEstadoPlan({ estado }: { estado?: string }) {
  const e = estado ?? "BORRADOR";
  return <Badge variant={TONO_ESTADO_PLAN[e] ?? "neutro"}>{ETIQUETA_ESTADO_PLAN[e] ?? e}</Badge>;
}

/** Fecha corta legible (o «—»). */
export function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" });
}

/** Resume una frecuencia declarativa en una frase legible. */
export function resumenFrecuencia(f?: Frecuencia): string {
  if (!f || !f.reglas?.length) return "Sin frecuencia";
  const partes = f.reglas.map((r) => {
    const meta = TIPOS_FRECUENCIA.find((t) => t.valor === r.tipo);
    if (r.tipo === "eventos" || meta?.usaEvento) return `evento ${r.evento ?? ""}`.trim();
    const unidad = r.unidad ? ` ${r.unidad}` : "";
    return `cada ${r.cada ?? "?"}${unidad} (${meta?.etiqueta ?? r.tipo})`;
  });
  const sep = f.modo === "lo-que-ocurra-primero" ? " o " : f.modo === "todas" ? " y " : ", ";
  return partes.join(sep) + (f.modo === "lo-que-ocurra-primero" ? " (lo que ocurra primero)" : "");
}

/** Tarjeta compacta de un plan para la vista de tarjetas. */
export function TarjetaPlan({ plan }: { plan: PlanRow }) {
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)" }}>
          <strong>{plan.nombre}</strong>
          <BadgeEstadoPlan estado={plan.estado} />
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", fontSize: "var(--do-text-sm)" }}>
          <span style={{ color: "var(--do-texto-suave)" }}>{plan.tipoPlan} · {plan.estrategia} · {plan.prioridad}</span>
          <span>{resumenFrecuencia(plan.programa?.frecuencia)}</span>
          {plan.proximaOcurrencia && (
            <span style={{ color: "var(--do-texto-suave)" }}>Próxima: {fechaCorta(plan.proximaOcurrencia)}</span>
          )}
        </div>
        <div style={{ marginTop: "var(--do-sp-3)" }}>
          <Link href={urlPlan(plan.id)}><Button size="sm" variant="secundario">Abrir plan</Button></Link>
        </div>
      </CardContent>
    </Card>
  );
}
