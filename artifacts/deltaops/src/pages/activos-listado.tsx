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
  Select,
  Field,
  Pagination,
  EmptyState,
  ErrorState,
  Spinner,
  KpiCard,
  Alert,
} from "@workspace/design-system";
import { SlidersHorizontal } from "lucide-react";
import { ShellActivos } from "../lib/activos/Shell";
import { useListado, useCatalogo, buscar, filtrarLocal } from "../lib/activos/hooks";
import { etiquetaEstado, variantEstado, ESTADOS_ACTIVO, type ActivoRow } from "../lib/activos/tipos";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaFiltrosAvanzados } from "../lib/forms/plantillas";
import { useCentroCostos, CENTRO_TODOS, centroDeRegistro } from "../lib/centro/contexto";
import type { ValoresFormulario } from "../lib/forms/tipos";
import { useSesion } from "../lib/identidad/sesion";
import { moduloHabilitado } from "../lib/identidad/rbac";
import { ShieldQuestion } from "lucide-react";

/** Etiqueta legible del centro de costos de una fila (o "—"). */
function centroDeActivo(a: ActivoRow, etiquetas: Map<string, string>): string {
  const clave = centroDeRegistro(a.datos);
  if (!clave) return "—";
  return etiquetas.get(clave) ?? clave;
}

/** Ubicación legible de una fila (`ubicacionId` o `datos.ubicacion`). */
function ubicacionDeActivo(a: ActivoRow): string {
  if (a.ubicacionId && a.ubicacionId !== "") return a.ubicacionId;
  const u = a.datos?.["ubicacion"];
  return typeof u === "string" && u !== "" ? u : "—";
}

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
  const centroCtx = useCentroCostos();
  const [vista, setVista] = useState<"tabla" | "tarjetas">("tabla");
  const [pagina, setPagina] = useState(1);
  const [q, setQ] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<ActivoRow[] | null>(null);
  const [busquedaServidor, setBusquedaServidor] = useState<boolean | null>(null);
  const [masFiltros, setMasFiltros] = useState(false);

  const [filtros, setFiltros] = useState<Record<string, string | undefined>>({});
  const { datos, cargando, error, recargar } = useListado(filtros);

  // DGP-LITE-04 §3 · Acción contextual «Preoperacional» por equipo. Anclada a
  // activos (mismo entitlement); sólo con módulo activos y rol con escritura.
  const { sesion } = useSesion();
  const puedePreoperacional = !!sesion && moduloHabilitado(sesion, "activos") && sesion.rol !== "CONSULTA";

  const tipos = useCatalogo("tipos");
  const categorias = useCatalogo("categorias");
  const familias = useCatalogo("familias");
  const criticidades = useCatalogo("criticidades");
  const ubicaciones = useCatalogo("ubicaciones");
  const centros = useCatalogo("centros-costo");

  // LITE-03 §3 · Contexto de CENTRO DE COSTOS: el filtro local por centro se
  // siembra con el contexto de navegación activo (barra superior). El backend
  // NO garantiza filtrar por centro (vive en `datos`), así que se aplica en
  // CLIENTE (GAP documentado): coherente y sin cambiar el contrato.
  const [filtroCentro, setFiltroCentro] = useState<string>(CENTRO_TODOS);
  useEffect(() => {
    setFiltroCentro(centroCtx.centro);
    setPagina(1);
  }, [centroCtx.centro]);

  // Mapa clave→etiqueta de centros (para mostrar nombres legibles en la tabla).
  const etiquetasCentro = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of centros.datos ?? []) m.set(o.valor, o.etiqueta);
    return m;
  }, [centros.datos]);

  // Filtros AVANZADOS (colapsables) como Dynamic Form: sólo campos secundarios.
  const defFiltros = useMemo(
    () =>
      plantillaFiltrosAvanzados({
        categorias: (categorias.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
        familias: (familias.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
        criticidades: (criticidades.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
      }),
    [categorias.datos, familias.datos, criticidades.datos],
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

  // Base filtrada por CENTRO DE COSTOS en cliente (GAP: el read model no filtra
  // por centro). Cambiar de centro re-filtra la experiencia: nunca duplica datos.
  const base = useMemo(() => {
    const todo = datos ?? [];
    if (filtroCentro === CENTRO_TODOS) return todo;
    return todo.filter((a) => centroDeRegistro(a.datos) === filtroCentro);
  }, [datos, filtroCentro]);
  // Aplicar búsqueda: servidor (si existe) o filtro cliente.
  const filtradoBusqueda = useMemo(() => {
    if (q.trim().length < 2) return base;
    if (resultadosBusqueda !== null) {
      // Los resultados de servidor también se acotan al centro activo (cliente).
      return filtroCentro === CENTRO_TODOS
        ? resultadosBusqueda
        : resultadosBusqueda.filter((a) => centroDeRegistro(a.datos) === filtroCentro);
    }
    return filtrarLocal(base, q);
  }, [base, q, resultadosBusqueda, filtroCentro]);

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

  // DGP-LITE-04 §3 · Cuando se llega desde «Iniciar preoperacional» de la Home,
  // se guía a seleccionar el equipo (la acción por fila abre el flujo).
  const modoPreop = puedePreoperacional &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("accion") === "preoperacional";

  return (
    <>
      {cabecera}

      {modoPreop && (
        <Alert variant="info" titulo="Selecciona un equipo para iniciar su preoperacional." />
      )}

      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}>
        <KpiCard titulo="Total de activos" valor={String(resumen.total)} />
        <KpiCard titulo="Operativos" valor={String(resumen.porEstado["OPERATIVO"] ?? 0)} />
        <KpiCard titulo="En mantenimiento" valor={String(resumen.porEstado["MANTENIMIENTO"] ?? 0)} />
        <KpiCard titulo="Fuera de servicio" valor={String(resumen.porEstado["FUERA_SERVICIO"] ?? 0)} />
      </div>

      <Section titulo="Buscar equipos">
        <Card>
          <CardContent>
            {/* Búsqueda PROMINENTE (LITE-03 §4): primer control, ancho generoso. */}
            <div style={{ marginBottom: "var(--do-sp-4)" }}>
              <Field label="Buscar equipo" htmlFor="q">
                <SearchInput
                  id="q"
                  value={q}
                  placeholder="Nombre, código o tipo del equipo…"
                  onChange={(e) => { setQ(e.target.value); setPagina(1); }}
                  onClear={() => setQ("")}
                />
              </Field>
            </div>

            {/* Filtros PRIORITARIOS: Centro de costos · Estado · Tipo · Ubicación.
                El filtro de CENTRO sólo se ofrece si el catálogo `centros-costo`
                del tenant tiene entradas: con catálogo vacío una opción única
                "Todos los centros" sería un control engañoso (no filtra nada), así
                que se OMITE por completo y se conservan los otros filtros. */}
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
              {(centros.datos ?? []).length > 0 && (
                <Field label="Centro de costos" htmlFor="f-centro">
                  <Select
                    id="f-centro"
                    value={filtroCentro}
                    onChange={(e) => { setFiltroCentro(e.target.value); setPagina(1); }}
                  >
                    <option value={CENTRO_TODOS}>Todos los centros</option>
                    {(centros.datos ?? []).map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Estado" htmlFor="f-estado">
                <Select
                  id="f-estado"
                  value={filtros.estado ?? ""}
                  onChange={(e) => alCambiarFiltros({ ...filtros, estado: e.target.value } as ValoresFormulario)}
                >
                  <option value="">Todos</option>
                  {ESTADOS_ACTIVO.map((e) => (
                    <option key={e} value={e}>{etiquetaEstado(e)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tipo" htmlFor="f-tipo">
                <Select
                  id="f-tipo"
                  value={filtros.tipo ?? ""}
                  onChange={(e) => alCambiarFiltros({ ...filtros, tipo: e.target.value } as ValoresFormulario)}
                >
                  <option value="">Todos</option>
                  {(tipos.datos ?? []).map((o) => (
                    <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Ubicación" htmlFor="f-ubicacion">
                <Select
                  id="f-ubicacion"
                  value={filtros.ubicacionId ?? ""}
                  onChange={(e) => alCambiarFiltros({ ...filtros, ubicacionId: e.target.value } as ValoresFormulario)}
                >
                  <option value="">Todas</option>
                  {(ubicaciones.datos ?? []).map((o) => (
                    <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Más filtros: colapsable con los campos secundarios. */}
            <div style={{ marginTop: "var(--do-sp-3)" }}>
              <Button
                variant="fantasma"
                size="sm"
                onClick={() => setMasFiltros((v) => !v)}
                aria-expanded={masFiltros}
              >
                <SlidersHorizontal size={16} aria-hidden="true" /> {masFiltros ? "Menos filtros" : "Más filtros"}
              </Button>
              {masFiltros && (
                <div style={{ marginTop: "var(--do-sp-3)" }}>
                  <FormularioDinamico
                    definicion={defFiltros}
                    valores={filtros as ValoresFormulario}
                    onCambio={alCambiarFiltros}
                  />
                </div>
              )}
            </div>

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
              {vista === "tabla" ? (
                <TablaActivos filas={visibles} etiquetasCentro={etiquetasCentro} onAbrir={(id) => navegar(`/activos/${id}`)} onPreop={puedePreoperacional ? (id) => navegar(`/activos/${id}/preoperacional`) : undefined} />
              ) : (
                <TarjetasActivos filas={visibles} etiquetasCentro={etiquetasCentro} onAbrir={(id) => navegar(`/activos/${id}`)} onPreop={puedePreoperacional ? (id) => navegar(`/activos/${id}/preoperacional`) : undefined} />
              )}
            </div>
            {/* En móvil siempre tarjetas */}
            <div className="do-solo-movil">
              <TarjetasActivos filas={visibles} etiquetasCentro={etiquetasCentro} onAbrir={(id) => navegar(`/activos/${id}`)} onPreop={puedePreoperacional ? (id) => navegar(`/activos/${id}/preoperacional`) : undefined} />
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

function TablaActivos({ filas, etiquetasCentro, onAbrir, onPreop }: { filas: ActivoRow[]; etiquetasCentro: Map<string, string>; onAbrir: (id: string) => void; onPreop?: (id: string) => void }) {
  return (
    <Card>
      <CardContent>
        <DoTable caption="Listado de equipos" hover>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Centro de costos</th>
              <th>Ubicación</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((a) => (
              <tr key={a.id}>
                <td><code style={{ fontSize: "var(--do-text-xs)" }}>{a.codigoEmpresarial}</code></td>
                <td>{a.nombre}</td>
                <td>{a.tipo}</td>
                <td>{centroDeActivo(a, etiquetasCentro)}</td>
                <td>{ubicacionDeActivo(a)}</td>
                <td><Badge variant={variantEstado(a.estado)}>{etiquetaEstado(a.estado)}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: "var(--do-sp-1)", justifyContent: "flex-end" }}>
                    {onPreop && (
                      <Button variant="fantasma" size="sm" onClick={() => onPreop(a.id)} title="Iniciar preoperacional">
                        <ShieldQuestion size={14} aria-hidden="true" /> Preoperacional
                      </Button>
                    )}
                    <Button variant="secundario" size="sm" onClick={() => onAbrir(a.id)}>Ver equipo</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DoTable>
      </CardContent>
    </Card>
  );
}

function TarjetasActivos({ filas, etiquetasCentro, onAbrir, onPreop }: { filas: ActivoRow[]; etiquetasCentro: Map<string, string>; onAbrir: (id: string) => void; onPreop?: (id: string) => void }) {
  return (
    <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))" }}>
      {filas.map((a) => (
        <Card key={a.id}>
          <CardContent>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <code style={{ fontSize: "var(--do-text-xs)" }}>{a.codigoEmpresarial}</code>
                <Badge variant={variantEstado(a.estado)}>{etiquetaEstado(a.estado)}</Badge>
              </div>
              <strong>{a.nombre}</strong>
              <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>{a.tipo}</span>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px var(--do-sp-2)", fontSize: "var(--do-text-sm)" }}>
                <dt style={{ color: "var(--do-texto-suave)" }}>Centro</dt>
                <dd style={{ margin: 0 }}>{centroDeActivo(a, etiquetasCentro)}</dd>
                <dt style={{ color: "var(--do-texto-suave)" }}>Ubicación</dt>
                <dd style={{ margin: 0 }}>{ubicacionDeActivo(a)}</dd>
              </dl>
              <div style={{ display: "flex", gap: "var(--do-sp-1)", flexWrap: "wrap" }}>
                <Button variant="secundario" size="sm" onClick={() => onAbrir(a.id)}>Ver equipo</Button>
                {onPreop && (
                  <Button variant="fantasma" size="sm" onClick={() => onPreop(a.id)}>
                    <ShieldQuestion size={14} aria-hidden="true" /> Preoperacional
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
