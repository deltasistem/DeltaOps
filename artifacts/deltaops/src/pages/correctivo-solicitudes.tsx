/**
 * DGP-015 · Listado de solicitudes correctivas (superficie principal).
 *
 * Vista tabla + tarjetas, búsqueda, filtros (Dynamic Forms: estado/origen/
 * activo), ordenamiento, paginación y estados vacío/error/offline. Lee el
 * contexto de la URL para filtros iniciales (ruta→filtro, DGP-010). Sólo Design
 * System.
 */
import React, { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState,
  ErrorState, SearchInput, Table, Pagination,
} from "@workspace/design-system";
import { ShellCorrectivo } from "../lib/correctivo/Shell";
import { useSolicitudes, useCatalogo } from "../lib/correctivo/hooks";
import { useOffline } from "../lib/offline/contexto";
import { TarjetaSolicitud, BadgeEstadoSolicitud, BadgePrioridad } from "../lib/correctivo/componentes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosSolicitudes } from "../lib/forms/plantillas-correctivo";
import { urlSolicitud, urlNuevaSolicitud, leerParam } from "../lib/correctivo/deep-links";
import {
  TAMANO_PAGINA, ETIQUETA_ESTADO_SOLICITUD, ORIGENES_SOLICITUD, CATALOGO_ORIGEN,
} from "../lib/correctivo/constantes";
import type { SolicitudRow } from "../lib/correctivo/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function CorrectivoSolicitudesPage() {
  return (
    <ShellCorrectivo activo="/correctivo/solicitudes">
      <Listado />
    </ShellCorrectivo>
  );
}

type Orden = "titulo" | "origen" | "estado";

const ESTADOS_OPC: OpcionSeleccion[] = Object.entries(ETIQUETA_ESTADO_SOLICITUD).map(([valor, etiqueta]) => ({ valor, etiqueta }));

export function Listado() {
  const search = useSearch();
  const estadoUrl = leerParam(search, "estado");
  const origenUrl = leerParam(search, "origen");
  const activoUrl = leerParam(search, "activoId");
  const origenesCat = useCatalogo(CATALOGO_ORIGEN);

  const origenesOpc: OpcionSeleccion[] = (origenesCat.datos ?? []).length
    ? (origenesCat.datos ?? []).map((o) => ({ valor: o.clave, etiqueta: o.etiqueta }))
    : ORIGENES_SOLICITUD.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));

  const defFiltros = useMemo(() => plantillaFiltrosSolicitudes(ESTADOS_OPC, origenesOpc), [origenesCat.datos]);
  const form = useFormularioDinamico(defFiltros, {}, {
    ...(estadoUrl ? { estado: estadoUrl } : {}),
    ...(origenUrl ? { origen: origenUrl } : {}),
    ...(activoUrl ? { activoId: activoUrl } : {}),
  });

  const filtroServidor = {
    estado: String(form.valores.estado ?? "") || undefined,
    origen: String(form.valores.origen ?? "") || undefined,
    activoId: String(form.valores.activoId ?? "") || undefined,
    limit: 300,
  };
  const { datos, cargando, error, recargar } = useSolicitudes(filtroServidor);
  const { enLinea } = useOffline();

  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"tabla" | "tarjetas">("tabla");
  const [orden, setOrden] = useState<Orden>("titulo");
  const [asc, setAsc] = useState(true);
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    let lista = datos ?? [];
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (s) => s.titulo.toLowerCase().includes(q) || s.origen.toLowerCase().includes(q) || String(s.objeto?.activoId ?? s.activoId ?? "").toLowerCase().includes(q),
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
        titulo="Solicitudes correctivas"
        descripcion="Mantenimiento correctivo empresarial: capta fallas, diagnostica, valida, genera órdenes de trabajo y gestiona intervenciones y repuestos."
        acciones={<Link href={urlNuevaSolicitud()}><Button variant="primario">Nueva solicitud</Button></Link>}
      />

      <Section titulo="Filtros">
        <Card>
          <CardContent>
            <FormularioDinamico definicion={defFiltros} valores={form.valores} onCambio={(v) => { form.setValores(v); setPagina(1); }} />
          </CardContent>
        </Card>
      </Section>

      <Section
        titulo="Solicitudes"
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <SearchInput
                aria-label="Buscar solicitudes"
                placeholder="Buscar por título, origen o activo"
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
            titulo={enLinea ? "No se pudieron cargar las solicitudes" : "Sin conexión"}
            descripcion={enLinea ? error.message : "Estás sin conexión. Se mostrarán las solicitudes al recuperar la red."}
            onReintentar={recargar}
          />
        ) : filtradas.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin solicitudes" descripcion="No hay solicitudes que coincidan con los filtros." /></CardContent></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{filtradas.length} solicitud(es)</span>
            {vista === "tabla" ? (
              <TablaSolicitudes solicitudes={visibles} orden={orden} asc={asc} onOrden={cambiarOrden} />
            ) : (
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {visibles.map((s) => <TarjetaSolicitud key={s.id} solicitud={s} />)}
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

function TablaSolicitudes({ solicitudes, orden, asc, onOrden }: { solicitudes: SolicitudRow[]; orden: Orden; asc: boolean; onOrden: (c: Orden) => void }) {
  return (
    <Table caption="Listado de solicitudes correctivas" captionOculto>
      <thead>
        <tr>
          <EncabezadoOrden etiqueta="Título" col="titulo" orden={orden} asc={asc} onOrden={onOrden} />
          <EncabezadoOrden etiqueta="Origen" col="origen" orden={orden} asc={asc} onOrden={onOrden} />
          <th scope="col">Activo</th>
          <th scope="col">Prioridad</th>
          <EncabezadoOrden etiqueta="Estado" col="estado" orden={orden} asc={asc} onOrden={onOrden} />
          <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {solicitudes.map((s) => (
          <tr key={s.id}>
            <td>{s.titulo}</td>
            <td>{s.origen}</td>
            <td>{s.objeto?.activoId ?? s.activoId ?? "—"}</td>
            <td><BadgePrioridad valor={s.prioridad} /></td>
            <td><BadgeEstadoSolicitud estado={s.estado} /></td>
            <td><Link href={urlSolicitud(s.id)}><Button size="sm" variant="secundario">Abrir</Button></Link></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
