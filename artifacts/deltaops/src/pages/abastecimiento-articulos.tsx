/**
 * DGP-013 · Catálogo de artículos — listado (superficie principal).
 *
 * Vista tabla + tarjetas, búsqueda, filtros (Dynamic Forms: tipo/familia),
 * ordenamiento, paginación y estados vacío/error/offline. Lee el contexto de la
 * URL para filtros iniciales (ruta→filtro, DGP-010). Sólo Design System.
 */
import React, { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState, ErrorState, SearchInput, Table, Pagination,
} from "@workspace/design-system";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useArticulos, useCatalogo } from "../lib/abastecimiento/hooks";
import { useOffline } from "../lib/offline/contexto";
import { TarjetaArticulo, montoMoneda } from "../lib/abastecimiento/componentes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosArticulos } from "../lib/forms/plantillas-abastecimiento";
import { urlArticulo, urlNuevoArticulo, leerParam } from "../lib/abastecimiento/deep-links";
import { TAMANO_PAGINA, CATALOGO_TIPO_ARTICULO, CATALOGO_FAMILIA } from "../lib/abastecimiento/constantes";
import type { ArticuloRow } from "../lib/abastecimiento/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function AbastecimientoArticulosPage() {
  return (
    <ShellAbastecimiento activo="/abastecimiento/articulos">
      <Listado />
    </ShellAbastecimiento>
  );
}

type Orden = "nombre" | "tipo" | "familia";

function opciones(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

export function Listado() {
  const search = useSearch();
  const tipoUrl = leerParam(search, "tipo");
  const familiaUrl = leerParam(search, "familia");

  const tipos = useCatalogo(CATALOGO_TIPO_ARTICULO);
  const familias = useCatalogo(CATALOGO_FAMILIA);

  const defFiltros = useMemo(
    () => plantillaFiltrosArticulos(opciones(tipos.datos ?? []), opciones(familias.datos ?? [])),
    [tipos.datos, familias.datos],
  );
  const form = useFormularioDinamico(defFiltros, {}, {
    ...(tipoUrl ? { tipo: tipoUrl } : {}),
    ...(familiaUrl ? { familia: familiaUrl } : {}),
  });

  const filtroServidor = {
    tipo: String(form.valores.tipo ?? "") || undefined,
    familia: String(form.valores.familia ?? "") || undefined,
    limit: 300,
  };
  const { datos, cargando, error, recargar } = useArticulos(filtroServidor);
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
        (a) =>
          a.nombre.toLowerCase().includes(q) ||
          a.tipo.toLowerCase().includes(q) ||
          (a.familia ?? "").toLowerCase().includes(q),
      );
    }
    const dir = asc ? 1 : -1;
    lista = [...lista].sort((a, b) => String(a[orden] ?? "").toLowerCase().localeCompare(String(b[orden] ?? "").toLowerCase()) * dir);
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
        titulo="Catálogo de artículos"
        descripcion="Maestro de artículos, servicios y consumibles: tipos, unidades, valoración y costos."
        acciones={<Link href={urlNuevoArticulo()}><Button variant="primario">Nuevo artículo</Button></Link>}
      />

      <Section titulo="Filtros">
        <Card>
          <CardContent>
            <FormularioDinamico definicion={defFiltros} valores={form.valores} onCambio={(v) => { form.setValores(v); setPagina(1); }} />
          </CardContent>
        </Card>
      </Section>

      <Section
        titulo="Artículos"
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <SearchInput
                aria-label="Buscar artículos"
                placeholder="Buscar por nombre, tipo o familia"
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
            titulo={enLinea ? "No se pudieron cargar los artículos" : "Sin conexión"}
            descripcion={enLinea ? error.message : "Estás sin conexión. Se mostrarán los artículos al recuperar la red."}
            onReintentar={recargar}
          />
        ) : filtradas.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin artículos" descripcion="No hay artículos que coincidan con los filtros." /></CardContent></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{filtradas.length} artículo(s)</span>
            {vista === "tabla" ? (
              <TablaArticulos articulos={visibles} orden={orden} asc={asc} onOrden={cambiarOrden} />
            ) : (
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))" }}>
                {visibles.map((a) => <TarjetaArticulo key={a.id} articulo={a} />)}
              </div>
            )}
            {totalPaginas > 1 && <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} />}
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

function TablaArticulos({ articulos, orden, asc, onOrden }: { articulos: ArticuloRow[]; orden: Orden; asc: boolean; onOrden: (c: Orden) => void }) {
  return (
    <Table caption="Listado de artículos" captionOculto>
      <thead>
        <tr>
          <EncabezadoOrden etiqueta="Nombre" col="nombre" orden={orden} asc={asc} onOrden={onOrden} />
          <EncabezadoOrden etiqueta="Tipo" col="tipo" orden={orden} asc={asc} onOrden={onOrden} />
          <EncabezadoOrden etiqueta="Familia" col="familia" orden={orden} asc={asc} onOrden={onOrden} />
          <th scope="col">Unidad</th>
          <th scope="col">Valoración</th>
          <th scope="col">Costo estándar</th>
          <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {articulos.map((a) => (
          <tr key={a.id}>
            <td>{a.nombre}</td>
            <td>{a.tipo}</td>
            <td>{a.familia ?? "—"}</td>
            <td>{a.unidad}</td>
            <td style={{ fontSize: "var(--do-text-sm)" }}>{a.metodoValoracion}</td>
            <td>{montoMoneda(a.costoEstandar, a.moneda)}</td>
            <td><Link href={urlArticulo(a.id)}><Button size="sm" variant="secundario">Abrir</Button></Link></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
