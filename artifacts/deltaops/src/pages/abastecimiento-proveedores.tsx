/**
 * DGP-013 · Directorio de proveedores — listado.
 * Vista tabla + tarjetas, búsqueda, filtro por tipo, paginación y estados.
 */
import React, { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState, ErrorState, SearchInput, Table, Pagination,
} from "@workspace/design-system";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useProveedores, useCatalogo } from "../lib/abastecimiento/hooks";
import { useOffline } from "../lib/offline/contexto";
import { TarjetaProveedor, BadgeEstadoProveedor, Estrellas } from "../lib/abastecimiento/componentes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosProveedores } from "../lib/forms/plantillas-abastecimiento";
import { urlProveedor, urlNuevoProveedor, leerParam } from "../lib/abastecimiento/deep-links";
import { TAMANO_PAGINA, CATALOGO_TIPO_PROVEEDOR } from "../lib/abastecimiento/constantes";
import type { ProveedorRow } from "../lib/abastecimiento/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function AbastecimientoProveedoresPage() {
  return (
    <ShellAbastecimiento activo="/abastecimiento/proveedores">
      <Listado />
    </ShellAbastecimiento>
  );
}

function opciones(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

export function Listado() {
  const search = useSearch();
  const tipoUrl = leerParam(search, "tipo");
  const tipos = useCatalogo(CATALOGO_TIPO_PROVEEDOR);

  const defFiltros = useMemo(() => plantillaFiltrosProveedores(opciones(tipos.datos ?? [])), [tipos.datos]);
  const form = useFormularioDinamico(defFiltros, {}, { ...(tipoUrl ? { tipo: tipoUrl } : {}) });

  const filtroServidor = { tipo: String(form.valores.tipo ?? "") || undefined, limit: 300 };
  const { datos, cargando, error, recargar } = useProveedores(filtroServidor);
  const { enLinea } = useOffline();

  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"tabla" | "tarjetas">("tabla");
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    let lista = datos ?? [];
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (p) =>
          p.razonSocial.toLowerCase().includes(q) ||
          (p.nombreComercial ?? "").toLowerCase().includes(q) ||
          p.tipo.toLowerCase().includes(q),
      );
    }
    return [...lista].sort((a, b) => a.razonSocial.toLowerCase().localeCompare(b.razonSocial.toLowerCase()));
  }, [datos, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const pagina0 = (paginaActual - 1) * TAMANO_PAGINA;
  const visibles = filtradas.slice(pagina0, pagina0 + TAMANO_PAGINA);

  return (
    <>
      <PageHeader
        titulo="Proveedores"
        descripcion="Directorio comercial: contactos, certificaciones, SLA y calificación de desempeño."
        acciones={<Link href={urlNuevoProveedor()}><Button variant="primario">Nuevo proveedor</Button></Link>}
      />

      <Section titulo="Filtros">
        <Card><CardContent>
          <FormularioDinamico definicion={defFiltros} valores={form.valores} onCambio={(v) => { form.setValores(v); setPagina(1); }} />
        </CardContent></Card>
      </Section>

      <Section
        titulo="Proveedores"
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <SearchInput
                aria-label="Buscar proveedores"
                placeholder="Buscar por razón social o tipo"
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
            titulo={enLinea ? "No se pudieron cargar los proveedores" : "Sin conexión"}
            descripcion={enLinea ? error.message : "Estás sin conexión. Se mostrarán los proveedores al recuperar la red."}
            onReintentar={recargar}
          />
        ) : filtradas.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin proveedores" descripcion="No hay proveedores que coincidan con los filtros." /></CardContent></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{filtradas.length} proveedor(es)</span>
            {vista === "tabla" ? (
              <TablaProveedores proveedores={visibles} />
            ) : (
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {visibles.map((p) => <TarjetaProveedor key={p.id} proveedor={p} />)}
              </div>
            )}
            {totalPaginas > 1 && <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} />}
          </div>
        )}
      </Section>
    </>
  );
}

function TablaProveedores({ proveedores }: { proveedores: ProveedorRow[] }) {
  return (
    <Table caption="Directorio de proveedores" captionOculto>
      <thead>
        <tr>
          <th scope="col">Razón social</th>
          <th scope="col">Nombre comercial</th>
          <th scope="col">Tipo</th>
          <th scope="col">Calificación</th>
          <th scope="col">Estado</th>
          <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {proveedores.map((p) => (
          <tr key={p.id}>
            <td>{p.razonSocial}</td>
            <td>{p.nombreComercial ?? "—"}</td>
            <td>{p.tipo}</td>
            <td>{p.calificacion ? <Estrellas valor={p.calificacion.promedio} /> : "—"}</td>
            <td><BadgeEstadoProveedor activo={p.activo} /></td>
            <td><Link href={urlProveedor(p.id)}><Button size="sm" variant="secundario">Abrir</Button></Link></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
