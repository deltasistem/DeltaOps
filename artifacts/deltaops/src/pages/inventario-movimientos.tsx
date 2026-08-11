/**
 * DGP-011.3 · Movimientos de inventario (vista global).
 *
 * El ledger de movimientos se consulta por existencia (`/existencias/:id/
 * movimientos`); esta vista permite enfocar un item (por `?itemId=`) y ver sus
 * movimientos consolidados con filtros por tipo, además de acceder a la ficha.
 */
import React, { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  Button,
  Badge,
  Spinner,
  EmptyState,
  ErrorState,
  Table,
  Select,
  Field,
} from "@workspace/design-system";
import { ShellInventario } from "../lib/inventario/Shell";
import { useItems, useExistenciasItem } from "../lib/inventario/hooks";
import { useConsulta } from "../lib/ordenes/hooks";
import { inventarioFetch } from "../lib/inventario/api";
import { fechaCorta } from "../lib/inventario/componentes";
import { ETIQUETA_TIPO_MOVIMIENTO, TONO_TIPO_MOVIMIENTO, TIPOS_MOVIMIENTO, type Tono } from "../lib/inventario/constantes";
import { leerParam, urlItemTab } from "../lib/inventario/deep-links";
import type { MovimientoRow } from "../lib/inventario/tipos";

export default function InventarioMovimientosPage() {
  return (
    <ShellInventario activo="/inventario/movimientos">
      <Contenido />
    </ShellInventario>
  );
}

function Contenido() {
  const itemUrl = leerParam(useSearch(), "itemId");
  const [itemId, setItemId] = useState(itemUrl || "");
  const [tipo, setTipo] = useState("");
  const items = useItems({ limit: 300 });

  const existencias = useExistenciasItem(itemId);
  const ids = (existencias.datos ?? []).map((e) => e.id);
  const clave = ids.join(",");
  const movimientos = useConsulta<MovimientoRow[]>(
    async (signal) => {
      if (!itemId || ids.length === 0) return [];
      const lotes = await Promise.all(
        ids.map((id) =>
          inventarioFetch<MovimientoRow[] | { movimientos?: MovimientoRow[] }>(
            `/existencias/${encodeURIComponent(id)}/movimientos`, { signal, toleraNoEncontrado: true },
          ).then((r) => (Array.isArray(r) ? r : (r?.movimientos ?? []))).catch(() => []),
        ),
      );
      return lotes.flat().sort((a, b) => String(b.ocurridoAt ?? b.fecha ?? "").localeCompare(String(a.ocurridoAt ?? a.fecha ?? "")));
    },
    [itemId, clave],
  );

  const filtrados = useMemo(
    () => (movimientos.datos ?? []).filter((m) => !tipo || m.tipo === tipo),
    [movimientos.datos, tipo],
  );

  const cargando = existencias.cargando || movimientos.cargando;

  return (
    <>
      <PageHeader titulo="Movimientos" descripcion="Ledger de movimientos de stock por item." />
      <Section titulo="Filtro">
        <Card><CardContent>
          <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
            <Field label="Item">
              <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">Selecciona un item…</option>
                {(items.datos ?? []).map((i) => <option key={i.id} value={i.id}>{i.nombre} · {i.sku}</option>)}
              </Select>
            </Field>
            <Field label="Tipo de movimiento">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">Todos</option>
                {TIPOS_MOVIMIENTO.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </Select>
            </Field>
          </div>
        </CardContent></Card>
      </Section>
      <Section titulo="Movimientos" acciones={itemId ? <Link href={urlItemTab(itemId, "movimientos")}><Button size="sm" variant="secundario">Abrir en ficha</Button></Link> : undefined}>
        {!itemId ? <Card><CardContent><EmptyState titulo="Selecciona un item" descripcion="Elige un item para ver su ledger de movimientos." /></CardContent></Card>
          : cargando ? <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
          : movimientos.error ? <Card><CardContent><ErrorState titulo="No se pudieron cargar los movimientos" descripcion={movimientos.error.message} onReintentar={movimientos.recargar} /></CardContent></Card>
          : filtrados.length === 0 ? <Card><CardContent><EmptyState titulo="Sin movimientos" descripcion="No hay movimientos que coincidan." /></CardContent></Card>
          : (
            <Card><CardContent>
              <Table caption="Movimientos del item seleccionado">
                <thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Cantidad</th><th scope="col">Bodega/Ubicación</th><th scope="col">Referencia</th></tr></thead>
                <tbody>
                  {filtrados.map((m) => (
                    <tr key={m.id}>
                      <td>{fechaCorta(m.ocurridoAt ?? m.fecha)}</td>
                      <td><Badge variant={(TONO_TIPO_MOVIMIENTO[m.tipo ?? ""] ?? "neutro") as Tono}>{ETIQUETA_TIPO_MOVIMIENTO[m.tipo ?? ""] ?? m.tipo ?? "—"}</Badge></td>
                      <td>{m.cantidad ?? "—"}</td>
                      <td>{m.bodegaId ?? "—"}{m.ubicacionId ? ` / ${m.ubicacionId}` : ""}</td>
                      <td>{m.referencia ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent></Card>
          )}
      </Section>
    </>
  );
}
