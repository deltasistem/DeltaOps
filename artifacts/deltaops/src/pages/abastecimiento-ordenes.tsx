/**
 * DGP-013 · Órdenes de compra — listado.
 * Vista tabla + tarjetas, búsqueda, filtro por estado, paginación.
 */
import React, { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState, ErrorState, SearchInput, Table, Pagination,
} from "@workspace/design-system";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useOrdenesCompra } from "../lib/abastecimiento/hooks";
import { useOffline } from "../lib/offline/contexto";
import { TarjetaOrdenCompra, BadgeEstadoOC, fechaCorta, montoMoneda } from "../lib/abastecimiento/componentes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosOrdenes } from "../lib/forms/plantillas-abastecimiento";
import { urlOrdenCompra, urlNuevaOrdenCompra, leerParam } from "../lib/abastecimiento/deep-links";
import { TAMANO_PAGINA, ETIQUETA_ESTADO_OC } from "../lib/abastecimiento/constantes";
import type { OrdenCompraRow } from "../lib/abastecimiento/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function AbastecimientoOrdenesPage() {
  return (
    <ShellAbastecimiento activo="/abastecimiento/ordenes-compra">
      <Listado />
    </ShellAbastecimiento>
  );
}

function opciones(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}
const ESTADOS_OPC = Object.entries(ETIQUETA_ESTADO_OC).map(([valor, etiqueta]) => ({ valor, etiqueta }));

export function Listado() {
  const search = useSearch();
  const estadoUrl = leerParam(search, "estado");
  const proveedorUrl = leerParam(search, "proveedorId");

  const defFiltros = useMemo(() => plantillaFiltrosOrdenes(opciones(ESTADOS_OPC)), []);
  const form = useFormularioDinamico(defFiltros, {}, { ...(estadoUrl ? { estado: estadoUrl } : {}) });

  const filtroServidor = {
    estado: String(form.valores.estado ?? "") || undefined,
    proveedorId: proveedorUrl || undefined,
    limit: 300,
  };
  const { datos, cargando, error, recargar } = useOrdenesCompra(filtroServidor);
  const { enLinea } = useOffline();

  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"tabla" | "tarjetas">("tabla");
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    let lista = datos ?? [];
    const q = busqueda.trim().toLowerCase();
    if (q) lista = lista.filter((o) => (o.codigo ?? o.id).toLowerCase().includes(q) || (o.proveedorNombre ?? o.proveedorId).toLowerCase().includes(q));
    return [...lista].sort((a, b) => (b.creadoEn ?? "").localeCompare(a.creadoEn ?? ""));
  }, [datos, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const pagina0 = (paginaActual - 1) * TAMANO_PAGINA;
  const visibles = filtradas.slice(pagina0, pagina0 + TAMANO_PAGINA);

  return (
    <>
      <PageHeader
        titulo="Órdenes de compra"
        descripcion="Compromisos de compra con proveedores: líneas, condiciones, aprobación, envío y recepciones."
        acciones={<Link href={urlNuevaOrdenCompra()}><Button variant="primario">Nueva orden</Button></Link>}
      />

      <Section titulo="Filtros">
        <Card><CardContent>
          <FormularioDinamico definicion={defFiltros} valores={form.valores} onCambio={(v) => { form.setValores(v); setPagina(1); }} />
        </CardContent></Card>
      </Section>

      <Section
        titulo="Órdenes"
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <SearchInput
                aria-label="Buscar órdenes"
                placeholder="Buscar por código o proveedor"
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
            titulo={enLinea ? "No se pudieron cargar las órdenes" : "Sin conexión"}
            descripcion={enLinea ? error.message : "Estás sin conexión. Se mostrarán las órdenes al recuperar la red."}
            onReintentar={recargar}
          />
        ) : filtradas.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin órdenes de compra" descripcion="No hay órdenes que coincidan con los filtros." /></CardContent></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{filtradas.length} orden(es)</span>
            {vista === "tabla" ? (
              <TablaOrdenes ordenes={visibles} />
            ) : (
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {visibles.map((o) => <TarjetaOrdenCompra key={o.id} oc={o} />)}
              </div>
            )}
            {totalPaginas > 1 && <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} />}
          </div>
        )}
      </Section>
    </>
  );
}

function TablaOrdenes({ ordenes }: { ordenes: OrdenCompraRow[] }) {
  return (
    <Table caption="Listado de órdenes de compra" captionOculto>
      <thead>
        <tr>
          <th scope="col">Código</th>
          <th scope="col">Proveedor</th>
          <th scope="col">Líneas</th>
          <th scope="col">Total</th>
          <th scope="col">Creada</th>
          <th scope="col">Estado</th>
          <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {ordenes.map((o) => (
          <tr key={o.id}>
            <td>{o.codigo ?? o.id}</td>
            <td>{o.proveedorNombre ?? o.proveedorId}</td>
            <td>{(o.lineas ?? []).length}</td>
            <td>{montoMoneda(o.total, o.moneda)}</td>
            <td>{fechaCorta(o.creadoEn)}</td>
            <td><BadgeEstadoOC estado={o.estado} /></td>
            <td><Link href={urlOrdenCompra(o.id)}><Button size="sm" variant="secundario">Abrir</Button></Link></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
