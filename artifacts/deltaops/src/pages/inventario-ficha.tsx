/**
 * DGP-011.3 · Ficha completa de un item de inventario.
 *
 * Componen todas las superficies mandadas por pestañas (DS `Tabs`, deep-link
 * `?tab=`): información general, existencias, lotes, series, movimientos,
 * reservas, transferencias, conteos, ajustes, comentarios, adjuntos, timeline,
 * historial y QR (etiqueta imprimible). Sólo Design System + tokens.
 */
import React, { useMemo } from "react";
import { useRoute } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  Spinner,
  ErrorState,
  Tabs,
  Badge,
} from "@workspace/design-system";
import { ShellInventario } from "../lib/inventario/Shell";
import { useItem } from "../lib/inventario/hooks";
import { BadgeEstadoItem, fechaCorta } from "../lib/inventario/componentes";
import { EtiquetaItem } from "../lib/inventario/EtiquetaItem";
import { leerParam } from "../lib/inventario/deep-links";
import {
  TabExistencias,
  TabLotes,
  TabSeries,
  TabMovimientos,
  TabReservas,
  TabTransferencias,
  TabConteos,
  TabAjustes,
  TabComentarios,
  TabAdjuntos,
  TabTimeline,
  TabHistorial,
} from "./inventario/tabs-item";
import type { ItemRow } from "../lib/inventario/tipos";

export default function InventarioFichaPage() {
  return (
    <ShellInventario>
      <Ficha />
    </ShellInventario>
  );
}

function Ficha() {
  const [, params] = useRoute("/inventario/:id");
  const id = params?.id ?? "";
  const { datos: item, cargando, error, recargar } = useItem(id);

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-8)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el item" descripcion={error.message} onReintentar={recargar} />;
  if (!item) return <ErrorState titulo="Item no encontrado" descripcion={`No existe el item ${id}.`} />;

  return <Contenido item={item} onCambio={recargar} />;
}

function Contenido({ item, onCambio }: { item: ItemRow; onCambio: () => void }) {
  const tabInicial = leerParam(typeof window !== "undefined" ? window.location.search : "", "tab");
  const items = useMemo(
    () => [
      { id: "general", etiqueta: "General", contenido: <TabGeneral item={item} /> },
      { id: "existencias", etiqueta: "Existencias", contenido: <TabExistencias itemId={item.id} /> },
      { id: "lotes", etiqueta: "Lotes", contenido: <TabLotes item={item} onCambio={onCambio} /> },
      { id: "series", etiqueta: "Series", contenido: <TabSeries item={item} onCambio={onCambio} /> },
      { id: "movimientos", etiqueta: "Movimientos", contenido: <TabMovimientos item={item} onCambio={onCambio} /> },
      { id: "reservas", etiqueta: "Reservas", contenido: <TabReservas item={item} onCambio={onCambio} /> },
      { id: "transferencias", etiqueta: "Transferencias", contenido: <TabTransferencias itemId={item.id} /> },
      { id: "conteos", etiqueta: "Conteos", contenido: <TabConteos /> },
      { id: "ajustes", etiqueta: "Ajustes", contenido: <TabAjustes item={item} onCambio={onCambio} /> },
      { id: "comentarios", etiqueta: "Comentarios", contenido: <TabComentarios itemId={item.id} /> },
      { id: "adjuntos", etiqueta: "Adjuntos", contenido: <TabAdjuntos itemId={item.id} /> },
      { id: "timeline", etiqueta: "Timeline", contenido: <TabTimeline itemId={item.id} /> },
      { id: "historial", etiqueta: "Historial", contenido: <TabHistorial itemId={item.id} /> },
      { id: "qr", etiqueta: "QR", contenido: <TabQr item={item} /> },
    ],
    [item, onCambio],
  );

  return (
    <>
      <PageHeader
        titulo={item.nombre}
        descripcion={<span style={{ fontFamily: "var(--do-font-mono)" }}>{item.sku}</span>}
        acciones={<BadgeEstadoItem estado={item.estado} />}
      />
      <Tabs etiquetaLista="Secciones del item" porDefecto={tabInicial} items={items} />
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
      <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{etiqueta}</span>
      <span>{valor ?? "—"}</span>
    </div>
  );
}

function TabGeneral({ item }: { item: ItemRow }) {
  return (
    <Section titulo="Información general">
      <Card>
        <CardContent>
          <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <Dato etiqueta="SKU" valor={<code>{item.sku}</code>} />
            <Dato etiqueta="Nombre" valor={item.nombre} />
            <Dato etiqueta="Estado" valor={<BadgeEstadoItem estado={item.estado} />} />
            <Dato etiqueta="Tipo" valor={item.tipoItem} />
            <Dato etiqueta="Categoría" valor={item.categoria} />
            <Dato etiqueta="Familia" valor={item.familia} />
            <Dato etiqueta="Subcategoría" valor={item.subcategoria} />
            <Dato etiqueta="Marca" valor={item.marca} />
            <Dato etiqueta="Unidad base" valor={item.unidadBase?.clave} />
            <Dato etiqueta="Trazabilidad" valor={item.modoTrazabilidad} />
            <Dato etiqueta="Controla vencimiento" valor={item.controlaVencimiento ? "Sí" : "No"} />
            <Dato etiqueta="Punto de reorden" valor={item.reposicion?.puntoReorden} />
            <Dato etiqueta="Mín / Máx" valor={`${item.reposicion?.minimo ?? "—"} / ${item.reposicion?.maximo ?? "—"}`} />
            <Dato etiqueta="Lead time (días)" valor={item.leadTimeDias} />
            <Dato etiqueta="Actualizado" valor={fechaCorta(item.actualizadoAt)} />
          </div>
          {item.descripcion && <p style={{ marginTop: "var(--do-sp-4)", color: "var(--do-texto-suave)" }}>{item.descripcion}</p>}
        </CardContent>
      </Card>
    </Section>
  );
}

function TabQr({ item }: { item: ItemRow }) {
  return (
    <Section titulo="Etiqueta QR">
      <EtiquetaItem itemId={item.id} sku={item.sku} nombre={item.nombre} />
      <div style={{ marginTop: "var(--do-sp-2)" }}><Badge variant="info">El binario del QR se genera en cliente (sin servicios externos).</Badge></div>
    </Section>
  );
}
