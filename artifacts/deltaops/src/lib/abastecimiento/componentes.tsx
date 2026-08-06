/**
 * DGP-013 · Componentes de presentación reutilizables del módulo de
 * Abastecimiento. Sólo Design System + tokens `--do-*`. Sin lógica de negocio.
 */
import React from "react";
import { Link } from "wouter";
import { Badge, Card, CardContent, CardHeader, Button } from "@workspace/design-system";
import {
  ETIQUETA_ESTADO_SOLICITUD,
  TONO_ESTADO_SOLICITUD,
  ETIQUETA_ESTADO_OC,
  TONO_ESTADO_OC,
  ETIQUETA_ESTADO_PROVEEDOR,
  TONO_ESTADO_PROVEEDOR,
} from "./constantes";
import { urlArticulo, urlProveedor, urlSolicitud, urlOrdenCompra } from "./deep-links";
import type { ArticuloRow, ProveedorRow, SolicitudRow, OrdenCompraRow, Precio, Cantidad } from "./tipos";

/* -------------------------------- Badges -------------------------------- */

export function BadgeEstadoSolicitud({ estado }: { estado?: string }) {
  const e = estado ?? "BORRADOR";
  return <Badge variant={TONO_ESTADO_SOLICITUD[e] ?? "neutro"}>{ETIQUETA_ESTADO_SOLICITUD[e] ?? e}</Badge>;
}

export function BadgeEstadoOC({ estado }: { estado?: string }) {
  const e = estado ?? "BORRADOR";
  return <Badge variant={TONO_ESTADO_OC[e] ?? "neutro"}>{ETIQUETA_ESTADO_OC[e] ?? e}</Badge>;
}

export function BadgeEstadoProveedor({ activo }: { activo?: boolean }) {
  const e = activo === false ? "inactivo" : "activo";
  return <Badge variant={TONO_ESTADO_PROVEEDOR[e]}>{ETIQUETA_ESTADO_PROVEEDOR[e]}</Badge>;
}

/* ------------------------------- Formateo ------------------------------- */

export function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" });
}

export function dinero(p?: Precio | null): string {
  if (!p || typeof p.monto !== "number") return "—";
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency: p.moneda || "USD" }).format(p.monto);
  } catch {
    return `${p.monto} ${p.moneda ?? ""}`.trim();
  }
}

export function montoMoneda(monto?: number, moneda?: string): string {
  if (typeof monto !== "number") return "—";
  return dinero({ monto, moneda: moneda ?? "USD" });
}

export function cantidadTexto(c?: Cantidad | null): string {
  if (!c || typeof c.valor !== "number") return "—";
  return `${c.valor} ${c.unidad ?? ""}`.trim();
}

/** Estrellas de calificación (0..5) accesibles. */
export function Estrellas({ valor }: { valor?: number }) {
  const v = Math.max(0, Math.min(5, Math.round(valor ?? 0)));
  return (
    <span aria-label={`${v} de 5`} title={`${(valor ?? 0).toFixed(1)} / 5`} style={{ color: "var(--do-primario)", letterSpacing: 1 }}>
      {"★".repeat(v)}<span style={{ color: "var(--do-borde-fuerte)" }}>{"★".repeat(5 - v)}</span>
    </span>
  );
}

/* -------------------------------- Tarjetas ------------------------------ */

export function TarjetaArticulo({ articulo }: { articulo: ArticuloRow }) {
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)" }}>
          <strong>{articulo.nombre}</strong>
          <Badge variant={articulo.activo === false ? "neutro" : "info"}>{articulo.tipo}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", fontSize: "var(--do-text-sm)" }}>
          <span style={{ color: "var(--do-texto-suave)" }}>{articulo.familia ?? "Sin familia"} · {articulo.unidad}</span>
          <span>Valoración: {articulo.metodoValoracion} · {articulo.moneda}</span>
          {typeof articulo.costoEstandar === "number" && (
            <span style={{ color: "var(--do-texto-suave)" }}>Estándar: {montoMoneda(articulo.costoEstandar, articulo.moneda)}</span>
          )}
        </div>
        <div style={{ marginTop: "var(--do-sp-3)" }}>
          <Link href={urlArticulo(articulo.id)}><Button size="sm" variant="secundario">Abrir artículo</Button></Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function TarjetaProveedor({ proveedor }: { proveedor: ProveedorRow }) {
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)" }}>
          <strong>{proveedor.razonSocial}</strong>
          <BadgeEstadoProveedor activo={proveedor.activo} />
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", fontSize: "var(--do-text-sm)" }}>
          <span style={{ color: "var(--do-texto-suave)" }}>{proveedor.nombreComercial ?? proveedor.tipo}</span>
          {proveedor.calificacion && <Estrellas valor={proveedor.calificacion.promedio} />}
        </div>
        <div style={{ marginTop: "var(--do-sp-3)" }}>
          <Link href={urlProveedor(proveedor.id)}><Button size="sm" variant="secundario">Abrir proveedor</Button></Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function TarjetaSolicitud({ solicitud }: { solicitud: SolicitudRow }) {
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)" }}>
          <strong>{solicitud.titulo}</strong>
          <BadgeEstadoSolicitud estado={solicitud.estado} />
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", fontSize: "var(--do-text-sm)" }}>
          <span style={{ color: "var(--do-texto-suave)" }}>Prioridad: {solicitud.prioridad} · Origen: {solicitud.origen?.tipo ?? "—"}</span>
          <span>{(solicitud.lineas ?? []).length} línea(s)</span>
        </div>
        <div style={{ marginTop: "var(--do-sp-3)" }}>
          <Link href={urlSolicitud(solicitud.id)}><Button size="sm" variant="secundario">Abrir solicitud</Button></Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function TarjetaOrdenCompra({ oc }: { oc: OrdenCompraRow }) {
  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)" }}>
          <strong>{oc.codigo ?? oc.id}</strong>
          <BadgeEstadoOC estado={oc.estado} />
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", fontSize: "var(--do-text-sm)" }}>
          <span style={{ color: "var(--do-texto-suave)" }}>Proveedor: {oc.proveedorNombre ?? oc.proveedorId}</span>
          <span>{(oc.lineas ?? []).length} línea(s) · {montoMoneda(oc.total, oc.moneda)}</span>
        </div>
        <div style={{ marginTop: "var(--do-sp-3)" }}>
          <Link href={urlOrdenCompra(oc.id)}><Button size="sm" variant="secundario">Abrir OC</Button></Link>
        </div>
      </CardContent>
    </Card>
  );
}
