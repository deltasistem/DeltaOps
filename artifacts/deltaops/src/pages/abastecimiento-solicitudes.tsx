/**
 * DGP-013 · Solicitudes de compra — listado.
 * Vista tabla + tarjetas, búsqueda, filtros (estado/prioridad), paginación.
 */
import React, { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState, ErrorState, SearchInput, Table, Pagination,
} from "@workspace/design-system";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useSolicitudes } from "../lib/abastecimiento/hooks";
import { useOffline } from "../lib/offline/contexto";
import { TarjetaSolicitud, BadgeEstadoSolicitud, fechaCorta } from "../lib/abastecimiento/componentes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosSolicitudes } from "../lib/forms/plantillas-abastecimiento";
import { urlSolicitud, urlNuevaSolicitud, leerParam } from "../lib/abastecimiento/deep-links";
import { TAMANO_PAGINA, ETIQUETA_ESTADO_SOLICITUD } from "../lib/abastecimiento/constantes";
import type { SolicitudRow } from "../lib/abastecimiento/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function AbastecimientoSolicitudesPage() {
  return (
    <ShellAbastecimiento activo="/abastecimiento/solicitudes">
      <Listado />
    </ShellAbastecimiento>
  );
}

function opciones(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}
const ESTADOS_OPC = Object.entries(ETIQUETA_ESTADO_SOLICITUD).map(([valor, etiqueta]) => ({ valor, etiqueta }));

export function Listado() {
  const search = useSearch();
  const estadoUrl = leerParam(search, "estado");
  const prioridadUrl = leerParam(search, "prioridad");

  const defFiltros = useMemo(() => plantillaFiltrosSolicitudes(opciones(ESTADOS_OPC)), []);
  const form = useFormularioDinamico(defFiltros, {}, {
    ...(estadoUrl ? { estado: estadoUrl } : {}),
    ...(prioridadUrl ? { prioridad: prioridadUrl } : {}),
  });

  const filtroServidor = {
    estado: String(form.valores.estado ?? "") || undefined,
    prioridad: String(form.valores.prioridad ?? "") || undefined,
    limit: 300,
  };
  const { datos, cargando, error, recargar } = useSolicitudes(filtroServidor);
  const { enLinea } = useOffline();

  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"tabla" | "tarjetas">("tabla");
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    let lista = datos ?? [];
    const q = busqueda.trim().toLowerCase();
    if (q) lista = lista.filter((s) => s.titulo.toLowerCase().includes(q) || s.prioridad.toLowerCase().includes(q));
    return [...lista].sort((a, b) => a.titulo.toLowerCase().localeCompare(b.titulo.toLowerCase()));
  }, [datos, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const pagina0 = (paginaActual - 1) * TAMANO_PAGINA;
  const visibles = filtradas.slice(pagina0, pagina0 + TAMANO_PAGINA);

  return (
    <>
      <PageHeader
        titulo="Solicitudes de compra"
        descripcion="Requerimientos de compra con origen declarativo, workflow de aprobación y cotizaciones."
        acciones={<Link href={urlNuevaSolicitud()}><Button variant="primario">Nueva solicitud</Button></Link>}
      />

      <Section titulo="Filtros">
        <Card><CardContent>
          <FormularioDinamico definicion={defFiltros} valores={form.valores} onCambio={(v) => { form.setValores(v); setPagina(1); }} />
        </CardContent></Card>
      </Section>

      <Section
        titulo="Solicitudes"
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <SearchInput
                aria-label="Buscar solicitudes"
                placeholder="Buscar por título o prioridad"
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
              <TablaSolicitudes solicitudes={visibles} />
            ) : (
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))" }}>
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

function TablaSolicitudes({ solicitudes }: { solicitudes: SolicitudRow[] }) {
  return (
    <Table caption="Listado de solicitudes de compra" captionOculto>
      <thead>
        <tr>
          <th scope="col">Título</th>
          <th scope="col">Prioridad</th>
          <th scope="col">Origen</th>
          <th scope="col">Líneas</th>
          <th scope="col">Actualizada</th>
          <th scope="col">Estado</th>
          <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {solicitudes.map((s) => (
          <tr key={s.id}>
            <td>{s.titulo}</td>
            <td>{s.prioridad}</td>
            <td>{s.origen?.tipo ?? "—"}</td>
            <td>{(s.lineas ?? []).length}</td>
            <td>{fechaCorta(s.actualizadoEn)}</td>
            <td><BadgeEstadoSolicitud estado={s.estado} /></td>
            <td><Link href={urlSolicitud(s.id)}><Button size="sm" variant="secundario">Abrir</Button></Link></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
