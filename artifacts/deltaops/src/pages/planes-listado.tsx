/**
 * DGP-012 · Listado de planes de mantenimiento (superficie principal).
 *
 * Vista tabla + tarjetas, búsqueda, filtros (Dynamic Forms: tipo/estrategia/
 * estado), ordenamiento, paginación y estados vacío/error/offline. Lee el
 * contexto de la URL para filtros iniciales (ruta→filtro, DGP-010). Sólo Design
 * System + tokens `--do-*`.
 */
import React, { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  SearchInput,
  Table,
  Pagination,
} from "@workspace/design-system";
import { ShellPlanes } from "../lib/planes/Shell";
import { usePlanes, useCatalogo } from "../lib/planes/hooks";
import { useOffline } from "../lib/offline/contexto";
import { TarjetaPlan, BadgeEstadoPlan, resumenFrecuencia, fechaCorta } from "../lib/planes/componentes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosPlanes } from "../lib/forms/plantillas-planes";
import { urlPlan, urlNuevoPlan, leerParam } from "../lib/planes/deep-links";
import {
  TAMANO_PAGINA,
  ETIQUETA_ESTADO_PLAN,
  CATALOGO_TIPO_PLAN,
  CATALOGO_ESTRATEGIA,
} from "../lib/planes/constantes";
import type { PlanRow } from "../lib/planes/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function PlanesListadoPage() {
  return (
    <ShellPlanes activo="/planes">
      <Listado />
    </ShellPlanes>
  );
}

type Orden = "nombre" | "tipoPlan" | "estado";

function opciones(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

const ESTADOS_OPC = Object.entries(ETIQUETA_ESTADO_PLAN).map(([valor, etiqueta]) => ({ valor, etiqueta }));

export function Listado() {
  const search = useSearch();
  const estadoUrl = leerParam(search, "estado");
  const tipoUrl = leerParam(search, "tipoPlan");
  const estrategiaUrl = leerParam(search, "estrategia");

  const tipos = useCatalogo(CATALOGO_TIPO_PLAN);
  const estrategias = useCatalogo(CATALOGO_ESTRATEGIA);

  const defFiltros = useMemo(
    () => plantillaFiltrosPlanes(opciones(ESTADOS_OPC), opciones(tipos.datos ?? []), opciones(estrategias.datos ?? [])),
    [tipos.datos, estrategias.datos],
  );
  const form = useFormularioDinamico(defFiltros, {}, {
    ...(estadoUrl ? { estado: estadoUrl } : {}),
    ...(tipoUrl ? { tipoPlan: tipoUrl } : {}),
    ...(estrategiaUrl ? { estrategia: estrategiaUrl } : {}),
  });

  const filtroServidor = {
    estado: String(form.valores.estado ?? "") || undefined,
    tipoPlan: String(form.valores.tipoPlan ?? "") || undefined,
    limit: 300,
  };
  const { datos, cargando, error, recargar } = usePlanes(filtroServidor);
  const { enLinea } = useOffline();

  const estrategiaFiltro = String(form.valores.estrategia ?? "");
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"tabla" | "tarjetas">("tabla");
  const [orden, setOrden] = useState<Orden>("nombre");
  const [asc, setAsc] = useState(true);
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    let lista = datos ?? [];
    if (estrategiaFiltro) lista = lista.filter((p) => p.estrategia === estrategiaFiltro);
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.tipoPlan.toLowerCase().includes(q) ||
          p.estrategia.toLowerCase().includes(q),
      );
    }
    const dir = asc ? 1 : -1;
    lista = [...lista].sort((a, b) => String(a[orden] ?? "").toLowerCase().localeCompare(String(b[orden] ?? "").toLowerCase()) * dir);
    return lista;
  }, [datos, estrategiaFiltro, busqueda, orden, asc]);

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
        titulo="Planes de mantenimiento"
        descripcion="Motor preventivo: define, programa, controla y ejecuta cualquier estrategia de mantenimiento."
        acciones={<Link href={urlNuevoPlan()}><Button variant="primario">Nuevo plan</Button></Link>}
      />

      <Section titulo="Filtros">
        <Card>
          <CardContent>
            <FormularioDinamico definicion={defFiltros} valores={form.valores} onCambio={(v) => { form.setValores(v); setPagina(1); }} />
          </CardContent>
        </Card>
      </Section>

      <Section
        titulo="Planes"
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <SearchInput
                aria-label="Buscar planes"
                placeholder="Buscar por nombre, tipo o estrategia"
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
            titulo={enLinea ? "No se pudieron cargar los planes" : "Sin conexión"}
            descripcion={enLinea ? error.message : "Estás sin conexión. Se mostrarán los planes al recuperar la red."}
            onReintentar={recargar}
          />
        ) : filtradas.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin planes" descripcion="No hay planes que coincidan con los filtros." /></CardContent></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{filtradas.length} plan(es)</span>
            {vista === "tabla" ? (
              <TablaPlanes planes={visibles} orden={orden} asc={asc} onOrden={cambiarOrden} />
            ) : (
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))" }}>
                {visibles.map((p) => <TarjetaPlan key={p.id} plan={p} />)}
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

function TablaPlanes({ planes, orden, asc, onOrden }: { planes: PlanRow[]; orden: Orden; asc: boolean; onOrden: (c: Orden) => void }) {
  return (
    <Table caption="Listado de planes de mantenimiento" captionOculto>
      <thead>
        <tr>
          <EncabezadoOrden etiqueta="Nombre" col="nombre" orden={orden} asc={asc} onOrden={onOrden} />
          <EncabezadoOrden etiqueta="Tipo" col="tipoPlan" orden={orden} asc={asc} onOrden={onOrden} />
          <th scope="col">Estrategia</th>
          <th scope="col">Frecuencia</th>
          <th scope="col">Próxima</th>
          <EncabezadoOrden etiqueta="Estado" col="estado" orden={orden} asc={asc} onOrden={onOrden} />
          <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {planes.map((p) => (
          <tr key={p.id}>
            <td>{p.nombre}</td>
            <td>{p.tipoPlan}</td>
            <td>{p.estrategia}</td>
            <td style={{ fontSize: "var(--do-text-sm)" }}>{resumenFrecuencia(p.programa?.frecuencia)}</td>
            <td>{fechaCorta(p.proximaOcurrencia)}</td>
            <td><BadgeEstadoPlan estado={p.estado} /></td>
            <td><Link href={urlPlan(p.id)}><Button size="sm" variant="secundario">Abrir</Button></Link></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
