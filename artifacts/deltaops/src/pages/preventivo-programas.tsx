/**
 * DGP-014 · Listado de programas preventivos (superficie principal).
 *
 * Vista tabla + tarjetas, búsqueda, filtros (Dynamic Forms: estado/tipo),
 * ordenamiento, paginación y estados vacío/error/offline. Lee el contexto de la
 * URL para filtros iniciales (ruta→filtro, DGP-010). Sólo Design System.
 */
import React, { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState,
  ErrorState, SearchInput, Table, Pagination,
} from "@workspace/design-system";
import { ShellPreventivo } from "../lib/preventivo/Shell";
import { useProgramas, useCatalogo } from "../lib/preventivo/hooks";
import { useOffline } from "../lib/offline/contexto";
import { TarjetaPrograma, BadgeEstadoPrograma, fechaCorta } from "../lib/preventivo/componentes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosProgramas } from "../lib/forms/plantillas-preventivo";
import { urlPrograma, urlNuevoPrograma, leerParam } from "../lib/preventivo/deep-links";
import { TAMANO_PAGINA, ETIQUETA_ESTADO_PROGRAMA, CATALOGO_TIPO_PROGRAMA } from "../lib/preventivo/constantes";
import type { ProgramaRow } from "../lib/preventivo/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function PreventivoProgramasPage() {
  return (
    <ShellPreventivo activo="/preventivo/programas">
      <Listado />
    </ShellPreventivo>
  );
}

type Orden = "nombre" | "tipo" | "estado";

function opciones(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}
const ESTADOS_OPC = Object.entries(ETIQUETA_ESTADO_PROGRAMA).map(([valor, etiqueta]) => ({ valor, etiqueta }));

export function Listado() {
  const search = useSearch();
  const estadoUrl = leerParam(search, "estado");
  const tipoUrl = leerParam(search, "tipo");
  const tipos = useCatalogo(CATALOGO_TIPO_PROGRAMA);

  const defFiltros = useMemo(
    () => plantillaFiltrosProgramas(opciones(ESTADOS_OPC), (tipos.datos ?? []).map((o) => ({ valor: o.clave, etiqueta: o.etiqueta }))),
    [tipos.datos],
  );
  const form = useFormularioDinamico(defFiltros, {}, {
    ...(estadoUrl ? { estado: estadoUrl } : {}),
    ...(tipoUrl ? { tipo: tipoUrl } : {}),
  });

  const filtroServidor = {
    estado: String(form.valores.estado ?? "") || undefined,
    tipo: String(form.valores.tipo ?? "") || undefined,
    limit: 300,
  };
  const { datos, cargando, error, recargar } = useProgramas(filtroServidor);
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
        (p) => p.nombre.toLowerCase().includes(q) || p.tipo.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q),
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
        titulo="Programas preventivos"
        descripcion="Mantenimiento preventivo empresarial: compone planes, define actividades, programa y genera órdenes de trabajo."
        acciones={<Link href={urlNuevoPrograma()}><Button variant="primario">Nuevo programa</Button></Link>}
      />

      <Section titulo="Filtros">
        <Card>
          <CardContent>
            <FormularioDinamico definicion={defFiltros} valores={form.valores} onCambio={(v) => { form.setValores(v); setPagina(1); }} />
          </CardContent>
        </Card>
      </Section>

      <Section
        titulo="Programas"
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <SearchInput
                aria-label="Buscar programas"
                placeholder="Buscar por nombre, tipo o código"
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
            titulo={enLinea ? "No se pudieron cargar los programas" : "Sin conexión"}
            descripcion={enLinea ? error.message : "Estás sin conexión. Se mostrarán los programas al recuperar la red."}
            onReintentar={recargar}
          />
        ) : filtradas.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin programas" descripcion="No hay programas que coincidan con los filtros." /></CardContent></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{filtradas.length} programa(s)</span>
            {vista === "tabla" ? (
              <TablaProgramas programas={visibles} orden={orden} asc={asc} onOrden={cambiarOrden} />
            ) : (
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {visibles.map((p) => <TarjetaPrograma key={p.id} programa={p} />)}
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

function TablaProgramas({ programas, orden, asc, onOrden }: { programas: ProgramaRow[]; orden: Orden; asc: boolean; onOrden: (c: Orden) => void }) {
  return (
    <Table caption="Listado de programas preventivos" captionOculto>
      <thead>
        <tr>
          <EncabezadoOrden etiqueta="Nombre" col="nombre" orden={orden} asc={asc} onOrden={onOrden} />
          <EncabezadoOrden etiqueta="Tipo" col="tipo" orden={orden} asc={asc} onOrden={onOrden} />
          <th scope="col">Código</th>
          <th scope="col">Activos</th>
          <th scope="col">Vigencia</th>
          <EncabezadoOrden etiqueta="Estado" col="estado" orden={orden} asc={asc} onOrden={onOrden} />
          <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {programas.map((p) => (
          <tr key={p.id}>
            <td>{p.nombre}</td>
            <td>{p.tipo}</td>
            <td>{p.codigo ?? "—"}</td>
            <td>{(p.activos ?? []).length}</td>
            <td>{fechaCorta(p.vigencia?.desde)}</td>
            <td><BadgeEstadoPrograma estado={p.estado} /></td>
            <td><Link href={urlPrograma(p.id)}><Button size="sm" variant="secundario">Abrir</Button></Link></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
