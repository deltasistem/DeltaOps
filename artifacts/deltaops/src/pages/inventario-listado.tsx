/**
 * DGP-011.3 · Listado de inventario (superficie principal).
 *
 * Vista tabla + tarjetas, búsqueda, filtros (Dynamic Forms), ordenamiento,
 * paginación y estados vacío/error/offline. Lee el contexto de la URL para
 * filtros iniciales (ruta→filtro). Sólo Design System + tokens `--do-*`.
 */
import React, { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Link } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  Badge,
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  SearchInput,
  Table,
  Pagination,
} from "@workspace/design-system";
import { ShellInventario } from "../lib/inventario/Shell";
import { useItems, useCatalogo } from "../lib/inventario/hooks";
import { useOffline } from "../lib/offline/contexto";
import { TarjetaItem, BadgeEstadoItem, bajoReorden } from "../lib/inventario/componentes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosItems } from "../lib/forms/plantillas-inventario";
import { urlItem, urlNuevoItem, leerParam } from "../lib/inventario/deep-links";
import { TAMANO_PAGINA } from "../lib/inventario/constantes";
import type { ItemRow } from "../lib/inventario/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function InventarioListadoPage() {
  return (
    <ShellInventario activo="/inventario">
      <Listado />
    </ShellInventario>
  );
}

type Orden = "nombre" | "sku" | "disponible";

function opciones(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

export function Listado() {
  const search = useSearch();
  const estadoUrl = leerParam(search, "estado");
  const tipoUrl = leerParam(search, "tipoItem");
  const categoriaUrl = leerParam(search, "categoria");

  const estados = useCatalogo("estados");
  const tipos = useCatalogo("tipos");
  const categorias = useCatalogo("categorias");

  const defFiltros = useMemo(
    () => plantillaFiltrosItems(opciones(estados.datos ?? []), opciones(tipos.datos ?? []), opciones(categorias.datos ?? [])),
    [estados.datos, tipos.datos, categorias.datos],
  );
  const form = useFormularioDinamico(defFiltros, {}, {
    ...(estadoUrl ? { estado: estadoUrl } : {}),
    ...(tipoUrl ? { tipoItem: tipoUrl } : {}),
    ...(categoriaUrl ? { categoria: categoriaUrl } : {}),
  });

  const filtroServidor = {
    estado: String(form.valores.estado ?? "") || undefined,
    tipoItem: String(form.valores.tipoItem ?? "") || undefined,
    categoria: String(form.valores.categoria ?? "") || undefined,
    limit: 300,
  };
  const { datos, cargando, error, recargar } = useItems(filtroServidor);
  const { enLinea } = useOffline();

  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"tabla" | "tarjetas">("tabla");
  const [orden, setOrden] = useState<Orden>("nombre");
  const [asc, setAsc] = useState(true);
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    let lista = datos ?? [];
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (i) =>
          i.nombre.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          (i.categoria ?? "").toLowerCase().includes(q) ||
          (i.marca ?? "").toLowerCase().includes(q),
      );
    }
    const dir = asc ? 1 : -1;
    lista = [...lista].sort((a, b) => {
      if (orden === "disponible") return ((a.disponible ?? 0) - (b.disponible ?? 0)) * dir;
      const va = String(a[orden] ?? "").toLowerCase();
      const vb = String(b[orden] ?? "").toLowerCase();
      return va.localeCompare(vb) * dir;
    });
    return lista;
  }, [datos, busqueda, orden, asc]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const pagina0 = (paginaActual - 1) * TAMANO_PAGINA;
  const visibles = filtradas.slice(pagina0, pagina0 + TAMANO_PAGINA);

  function cambiarOrden(col: Orden) {
    if (orden === col) setAsc((s) => !s);
    else { setOrden(col); setAsc(true); }
    setPagina(1);
  }

  return (
    <>
      <PageHeader
        titulo="Inventario"
        descripcion="Catálogo completo de items con existencias, trazabilidad y movimientos."
        acciones={<Link href={urlNuevoItem()}><Button variant="primario">Nuevo item</Button></Link>}
      />

      <Section titulo="Filtros">
        <Card>
          <CardContent>
            <FormularioDinamico definicion={defFiltros} valores={form.valores} onCambio={(v) => { form.setValores(v); setPagina(1); }} />
          </CardContent>
        </Card>
      </Section>

      <Section
        titulo="Items"
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <SearchInput
                aria-label="Buscar items"
                placeholder="Buscar por nombre, SKU, categoría o marca"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                onClear={() => setBusqueda("")}
              />
            </div>
            <div role="group" aria-label="Vista" style={{ display: "flex", gap: "var(--do-sp-1)" }}>
              <Button size="sm" variant={vista === "tabla" ? "primario" : "fantasma"} aria-pressed={vista === "tabla"} onClick={() => setVista("tabla")}>Tabla</Button>
              <Button size="sm" variant={vista === "tarjetas" ? "primario" : "fantasma"} aria-pressed={vista === "tarjetas"} onClick={() => setVista("tarjetas")}>Tarjetas</Button>
            </div>
          </div>
        }
      >
        {cargando ? (
          <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
        ) : error ? (
          <ErrorState
            titulo={enLinea ? "No se pudo cargar el inventario" : "Sin conexión"}
            descripcion={enLinea ? error.message : "Estás sin conexión. Se mostrará el inventario al recuperar la red."}
            onReintentar={recargar}
          />
        ) : filtradas.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin items" descripcion="No hay items que coincidan con los filtros." /></CardContent></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{filtradas.length} item(s)</span>
            {vista === "tabla" ? (
              <TablaItems items={visibles} orden={orden} asc={asc} onOrden={cambiarOrden} />
            ) : (
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {visibles.map((i) => <TarjetaItem key={i.id} item={i} />)}
              </div>
            )}
            {totalPaginas > 1 && (
              <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} />
            )}
          </div>
        )}
      </Section>
    </>
  );
}

function EncabezadoOrden({ etiqueta, col, orden, asc, onOrden }: { etiqueta: string; col: Orden; orden: Orden; asc: boolean; onOrden: (c: Orden) => void }) {
  const activo = orden === col;
  return (
    <th scope="col" aria-sort={activo ? (asc ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onOrden(col)}
        style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit", display: "inline-flex", gap: "var(--do-sp-1)", alignItems: "center" }}
      >
        {etiqueta}{activo ? (asc ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
}

function TablaItems({ items, orden, asc, onOrden }: { items: ItemRow[]; orden: Orden; asc: boolean; onOrden: (c: Orden) => void }) {
  return (
    <Table caption="Listado de items de inventario" captionOculto>
      <thead>
        <tr>
          <EncabezadoOrden etiqueta="Nombre" col="nombre" orden={orden} asc={asc} onOrden={onOrden} />
          <EncabezadoOrden etiqueta="SKU" col="sku" orden={orden} asc={asc} onOrden={onOrden} />
          <th scope="col">Tipo</th>
          <th scope="col">Categoría</th>
          <EncabezadoOrden etiqueta="Disponible" col="disponible" orden={orden} asc={asc} onOrden={onOrden} />
          <th scope="col">Estado</th>
          <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.id}>
            <td>{i.nombre}{bajoReorden(i) && <> <Badge variant="advertencia">Bajo reorden</Badge></>}</td>
            <td style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-sm)" }}>{i.sku}</td>
            <td>{i.tipoItem ?? "—"}</td>
            <td>{i.categoria ?? "—"}</td>
            <td>{typeof i.disponible === "number" ? `${i.disponible}${i.unidadBase?.clave ? ` ${i.unidadBase.clave}` : ""}` : "—"}</td>
            <td><BadgeEstadoItem estado={i.estado} /></td>
            <td><Link href={urlItem(i.id)}><Button size="sm" variant="secundario">Abrir</Button></Link></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
