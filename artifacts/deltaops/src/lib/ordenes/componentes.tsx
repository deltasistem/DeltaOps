/**
 * DGP-009.3 · Componentes compartidos de la experiencia de Órdenes.
 * Piezas de presentación construidas 100% sobre el Design System y tokens
 * `--do-*`. No contienen lógica de negocio.
 */
import React from "react";
import { Link } from "wouter";
import { Badge, Card, CardContent, Button } from "@workspace/design-system";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "./constantes";
import type { OrdenRow } from "./tipos";

/** Badge de estado con tono canónico. */
export function BadgeEstado({ estado }: { estado: string }) {
  return <Badge variant={TONO_ESTADO[estado] ?? "neutro"}>{ETIQUETA_ESTADO[estado] ?? estado}</Badge>;
}

const PRIORIDAD_TONO: Record<string, "neutro" | "advertencia" | "error"> = {
  baja: "neutro",
  media: "neutro",
  alta: "advertencia",
  critica: "error",
  urgente: "error",
};

export function BadgePrioridad({ prioridad }: { prioridad: string | null }) {
  if (!prioridad) return null;
  const tono = PRIORIDAD_TONO[prioridad.toLowerCase()] ?? "neutro";
  return <Badge variant={tono}>{prioridad}</Badge>;
}

/** Predicado: ¿la orden es crítica? (prioridad/severidad alta). */
export function esCritica(o: OrdenRow): boolean {
  const p = (o.prioridad ?? "").toLowerCase();
  const s = (o.severidad ?? "").toLowerCase();
  const altas = ["alta", "critica", "crítica", "urgente"];
  return altas.includes(p) || altas.includes(s);
}

/** Lee el vencimiento SLA del read model (ISO) si existe. */
export function vencimientoSla(o: OrdenRow): string | null {
  const sla = o.datos?.sla as Record<string, unknown> | null | undefined;
  const v = sla?.["vencimiento"] ?? sla?.["limite"] ?? sla?.["fechaLimite"];
  return typeof v === "string" ? v : null;
}

/** Predicado: ¿próxima a vencer? (SLA en las próximas `horas`). */
export function proximaAVencer(o: OrdenRow, ahoraMs: number, horas = 48): boolean {
  const v = vencimientoSla(o);
  if (!v) return false;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return false;
  const delta = t - ahoraMs;
  return delta >= 0 && delta <= horas * 3600_000;
}

/** Tarjeta compacta de una orden (usada en bandejas responsive). */
export function TarjetaOrden({ orden }: { orden: OrdenRow }) {
  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{orden.codigo}</div>
              <strong>{orden.titulo}</strong>
            </div>
            <BadgeEstado estado={orden.estado} />
          </div>
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", alignItems: "center" }}>
            {orden.tipo && <Badge variant="info">{orden.tipo}</Badge>}
            <BadgePrioridad prioridad={orden.prioridad} />
            {orden.responsable && (
              <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
                Responsable: {orden.responsable}
              </span>
            )}
          </div>
          <div>
            <Link href={`/ordenes/${orden.id}`}>
              <Button variant="secundario" size="sm">Abrir</Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
