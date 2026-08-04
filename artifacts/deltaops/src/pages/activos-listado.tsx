/**
 * DGP-008.3 · Listado de Activos.
 * Tabla/tarjetas conmutable, filtros avanzados, búsqueda rápida (con degradación
 * si /busqueda no existe), paginación y KPIs de resumen. Responsive: en móvil se
 * fuerza la vista de tarjetas.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  Table as DoTable,
  Badge,
  Button,
  SearchInput,
  Field,
  Pagination,
  EmptyState,
  ErrorState,
  Spinner,
  KpiCard,
} from "@workspace/design-system";
import { ShellActivos } from "../lib/activos/Shell";
import { useListado, useCatalogo, buscar, filtrarLocal } from "../lib/activos/hooks";
import { etiquetaEstado, variantEstado, ESTADOS_ACTIVO, type ActivoRow } from "../lib/activos/tipos";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosListado } from "../lib/forms/plantillas";
import type { ValoresFormulario } from "../lib/forms/tipos";

const POR_PAGINA = 12;

export default function ActivosListadoPage() {
  return (
    <ShellActivos activo="/activos">
      <Listado />
    </ShellActivos>
  );
}

function Listado() {
  const [, navegar] = useLocation();
  const [vista, setVista] = useState<"tabla" | "tarjetas">("tabla");
  const [pagina, setPagina] = useState(1);
  const [q, setQ] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<ActivoRow[] | null>(null);
  const [busquedaServidor, setBusquedaServidor] = useState<boolean | null>(null);

  const [filtros, setFiltros] = useState<Record<string, string | undefined>>({});
  const { datos, cargando, error, recargar } = useListado(filtros);

  const tipos = useCatalogo("tipos");
  const categorias = useCatalogo("categorias");
  const familias = useCatalogo("familias");
  const criticidades = useCatalogo("criticidades");
  const ubicaciones = useCatalogo("ubicaciones");

  // Filtros como Dynamic Form: definición declarativa + renderer genérico.
  const defFiltros = useMemo(
    () =>
      plantillaFiltrosListado(
        ESTADOS_ACTIVO.map((e) => ({ valor: e, etiqueta: etiquetaEstado(e) })),
        {
          tipos: (tipos.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
          categorias: (categorias.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
          familias: (familias.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
          criticidades: (criticidades.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
          ubicaciones: (ubicaciones.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
        },
      ),
    [tipos.datos, categorias.datos, familias.datos, criticidades.datos, ubicaciones.datos],
  );

  // Búsqueda rápida con degradación.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResultadosBusqueda(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      void buscar(q.trim(), ctrl.signal)
        .then((r) => {
          setBusquedaServidor(r !== null);
          setResultadosBusqueda(r);
        })
        .catch(() => setResultadosBusqueda(null));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const base = datos ?? [];
  // Aplicar búsqueda: servidor (si existe) o filtro cliente.
  const filtradoBusqueda = useMemo(() => {
    if (q.trim().length < 2) return base;
    if (resultadosBusqueda !== null) return resultadosBusqueda; // servidor
    return filtrarLocal(base, q);
  }, [base, q, resultadosBusqueda]);

  const total = filtradoBusqueda.length;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pageActual = Math.min(pagina, totalPaginas);
  const visibles = filtradoBusqueda.slice((pageActual - 1) * POR_PAGINA, pageActual * POR_PAGINA);

  const resumen = useMemo(() => {
    const porEstado: Record<string, number> = {};
    for (const a of base) porEstado[a.estado] = (porEstado[a.estado] ?? 0) + 1;
    return { total: base.length, porEstado };
  }, [base]);

  function alCambiarFiltros(valores: ValoresFormulario) {
    setPagina(1);
    const limpio: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(valores)) {
      limpio[k] = v == null || v === "" ? undefined : String(v);
    }
    setFiltros(limpio);
  }

  const cabecera = (
    <PageHeader
      titulo="Activos"
      descripcion="Inventario de activos empresariales del tenant."
      acciones={
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          <Button variant="secundario" onClick={recargar}>Actualizar</Button>
          <Button variant="primario" onClick={() => navegar("/activos/nuevo")}>Nuevo activo</Button>
        </div>
      }
    />
  );

  return (
    <>
      {cabecera}

      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <KpiCard titulo="Total de activos" valor={String(resumen.total)} />
        <KpiCard titulo="Operativos" valor={String(resumen.porEstado["OPERATIVO"] ?? 0)} />
        <KpiCard titulo="En mantenimiento" valor={String(resumen.porEstado["MANTENIMIENTO"] ?? 0)} />
        <KpiCard titulo="Fuera de servicio" valor={String(resumen.porEstado["FUERA_SERVICIO"] ?? 0)} />
      </div>

      <Section titulo="Filtros">
        <Card>
          <CardContent>
            <div style={{ marginBottom: "var(--do-sp-3)", maxWidth: 420 }}>
              <Field label="Búsqueda rápida" htmlFor="q">
                <SearchInput
                  id="q"
                  value={q}
                  placeholder="Nombre, código o tipo…"
                  onChange={(e) => { setQ(e.target.value); setPagina(1); }}
                  onClear={() => setQ("")}
                />
              </Field>
            </div>
            <FormularioDinamico
              definicion={defFiltros}
              valores={filtros as ValoresFormulario}
              onCambio={alCambiarFiltros}
            />
            {q.trim().length >= 2 && busquedaServidor === false && (
              <p style={{ marginTop: "var(--do-sp-2)", fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
                Búsqueda del servidor no disponible; filtrando en cliente sobre el listado.
              </p>
            )}
          </CardContent>
        </Card>
      </Section>

      <Section
        titulo={`Resultados (${total})`}
        acciones={
          <div role="group" aria-label="Vista" style={{ display: "flex", gap: "var(--do-sp-1)" }}>
            <Button variant={vista === "tabla" ? "primario" : "fantasma"} size="sm" onClick={() => setVista("tabla")} aria-pressed={vista === "tabla"}>Tabla</Button>
            <Button variant={vista === "tarjetas" ? "primario" : "fantasma"} size="sm" onClick={() => setVista("tarjetas")} aria-pressed={vista === "tarjetas"}>Tarjetas</Button>
          </div>
        }
      >
        {cargando ? (
          <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
        ) : error ? (
          <Card><CardContent><ErrorState titulo="No se pudo cargar el listado" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>
        ) : total === 0 ? (
          <Card><CardContent><EmptyState titulo="Sin activos" descripcion="No hay activos que coincidan con los filtros." accion={{ label: "Nuevo activo", onClick: () => navegar("/activos/nuevo") }} /></CardContent></Card>
        ) : (
          <>
            <div className="do-solo-desktop">
              {vista === "tabla" ? <TablaActivos filas={visibles} onAbrir={(id) => navegar(`/activos/${id}`)} /> : <TarjetasActivos filas={visibles} onAbrir={(id) => navegar(`/activos/${id}`)} />}
            </div>
            {/* En móvil siempre tarjetas */}
            <div className="do-solo-movil">
              <TarjetasActivos filas={visibles} onAbrir={(id) => navegar(`/activos/${id}`)} />
            </div>
            {totalPaginas > 1 && (
              <div style={{ marginTop: "var(--do-sp-4)" }}>
                <Pagination pagina={pageActual} totalPaginas={totalPaginas} onChange={setPagina} />
              </div>
            )}
          </>
        )}
      </Section>
    </>
  );
}

function TablaActivos({ filas, onAbrir }: { filas: ActivoRow[]; onAbrir: (id: string) => void }) {
  return (
    <Card>
      <CardContent>
        <DoTable caption="Listado de activos" hover>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Criticidad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((a) => (
              <tr key={a.id}>
                <td><code style={{ fontSize: "var(--do-text-xs)" }}>{a.codigoEmpresarial}</code></td>
                <td>{a.nombre}</td>
                <td>{a.tipo}</td>
                <td><Badge variant={variantEstado(a.estado)}>{etiquetaEstado(a.estado)}</Badge></td>
                <td>{a.criticidad ?? "—"}</td>
                <td><Button variant="secundario" size="sm" onClick={() => onAbrir(a.id)}>Ver</Button></td>
              </tr>
            ))}
          </tbody>
        </DoTable>
      </CardContent>
    </Card>
  );
}

function TarjetasActivos({ filas, onAbrir }: { filas: ActivoRow[]; onAbrir: (id: string) => void }) {
  return (
    <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
      {filas.map((a) => (
        <Card key={a.id}>
          <CardContent>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <code style={{ fontSize: "var(--do-text-xs)" }}>{a.codigoEmpresarial}</code>
                <Badge variant={variantEstado(a.estado)}>{etiquetaEstado(a.estado)}</Badge>
              </div>
              <strong>{a.nombre}</strong>
              <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>{a.tipo}{a.criticidad ? ` · ${a.criticidad}` : ""}</span>
              <Button variant="secundario" size="sm" onClick={() => onAbrir(a.id)}>Ver ficha</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
