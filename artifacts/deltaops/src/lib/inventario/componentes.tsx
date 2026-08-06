/**
 * DGP-011.3 · Componentes de presentación reutilizables de Inventario.
 * Sólo Design System + tokens `--do-*`. Sin estilos ad-hoc de color.
 */
import React from "react";
import { Link } from "wouter";
import { Badge, Card, CardContent } from "@workspace/design-system";
import {
  ETIQUETA_ESTADO_ITEM,
  TONO_ESTADO_ITEM,
  ETIQUETA_ESTADO_TRANSFERENCIA,
  TONO_ESTADO_TRANSFERENCIA,
  ETIQUETA_ESTADO_CONTEO,
  TONO_ESTADO_CONTEO,
  type Tono,
} from "./constantes";
import { urlItem } from "./deep-links";
import type { ItemRow } from "./tipos";

export function BadgeEstadoItem({ estado }: { estado?: string }) {
  const e = estado ?? "";
  return <Badge variant={(TONO_ESTADO_ITEM[e] ?? "neutro") as Tono}>{ETIQUETA_ESTADO_ITEM[e] ?? e ?? "—"}</Badge>;
}

export function BadgeEstadoTransferencia({ estado }: { estado?: string }) {
  const e = estado ?? "";
  return <Badge variant={(TONO_ESTADO_TRANSFERENCIA[e] ?? "neutro") as Tono}>{ETIQUETA_ESTADO_TRANSFERENCIA[e] ?? e ?? "—"}</Badge>;
}

export function BadgeEstadoConteo({ estado }: { estado?: string }) {
  const e = estado ?? "";
  return <Badge variant={(TONO_ESTADO_CONTEO[e] ?? "neutro") as Tono}>{ETIQUETA_ESTADO_CONTEO[e] ?? e ?? "—"}</Badge>;
}

/** Indica si un item está por debajo de su punto de reorden (si hay datos). */
export function bajoReorden(item: ItemRow): boolean {
  const disp = typeof item.disponible === "number" ? item.disponible : undefined;
  const pr = item.reposicion?.puntoReorden;
  return disp != null && pr != null && disp <= pr;
}

/** Tarjeta compacta de un item (vista tarjetas del listado). */
export function TarjetaItem({ item }: { item: ItemRow }) {
  return (
    <Link href={urlItem(item.id)} aria-label={`Abrir item ${item.nombre}`}>
      <Card interactiva>
        <CardContent>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)", alignItems: "flex-start" }}>
              <div>
                <strong>{item.nombre}</strong>
                <div style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{item.sku}</div>
              </div>
              <BadgeEstadoItem estado={item.estado} />
            </div>
            <div style={{ display: "flex", gap: "var(--do-sp-1)", flexWrap: "wrap" }}>
              {item.tipoItem && <Badge variant="neutro">{item.tipoItem}</Badge>}
              {item.categoria && <Badge variant="info">{item.categoria}</Badge>}
              {bajoReorden(item) && <Badge variant="advertencia">Bajo reorden</Badge>}
            </div>
            {typeof item.disponible === "number" && (
              <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
                Disponible: {item.disponible}{item.unidadBase?.clave ? ` ${item.unidadBase.clave}` : ""}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Formatea una fecha ISO a locale corto (tolerante a valores vacíos). */
export function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("es");
}
