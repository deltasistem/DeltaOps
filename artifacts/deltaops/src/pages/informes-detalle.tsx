/**
 * FINAL-02 · Detalle genérico de un informe operacional.
 *
 * Componente dirigido por configuración del backend (columnas y filtros
 * declarados en el catálogo). La consulta visual y la exportación (Excel/CSV)
 * usan los MISMOS filtros y el MISMO builder del backend: lo exportado es lo
 * visto. Desktop: tabla; móvil: tarjetas (patrón LITE-10 de composición móvil).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState,
  ErrorState, Table, Pagination, Field, Input, Select,
} from "@workspace/design-system";
import { ShellInformes } from "../lib/informes/Shell";
import {
  listarInformes, consultarInforme, exportarInforme,
  type CatalogoInforme, type DatasetInforme, type FiltrosInforme,
} from "../lib/informes/api";

const TAMANO_PAGINA = 50;

export default function InformeDetallePage() {
  const [, params] = useRoute("/informes/:clave");
  const clave = params?.clave ?? "";
  return (
    <ShellInformes activo={`/informes/${clave}`}>
      <Detalle clave={clave} />
    </ShellInformes>
  );
}

interface OpcionActivo { id: string; etiqueta: string }

function useActivosOpciones(): OpcionActivo[] {
  const [opciones, setOpciones] = useState<OpcionActivo[]>([]);
  useEffect(() => {
    const ctl = new AbortController();
    // El contrato congelado de modulo.activos.listar acota limit≤200.
    fetch("/api/deltaops/activos?limit=200", { credentials: "include", signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Error ${r.status}`))))
      .then((d: unknown) => {
        const lista = (Array.isArray(d) ? d : ((d as { activos?: unknown[] })?.activos ?? [])) as Record<string, unknown>[];
        setOpciones(
          lista.map((a) => {
            const datos = (a["datos"] ?? a) as Record<string, unknown>;
            const cod = typeof datos["codigoEmpresarial"] === "string" ? datos["codigoEmpresarial"] : "";
            const nom = typeof datos["nombre"] === "string" ? datos["nombre"] : "";
            return { id: String(a["id"] ?? ""), etiqueta: [cod, nom].filter(Boolean).join(" · ") || String(a["id"] ?? "") };
          }).filter((o) => o.id),
        );
      })
      .catch(() => {
        /* selector vacío: el filtro por equipo simplemente no ofrece opciones */
      });
    return () => ctl.abort();
  }, []);
  return opciones;
}

function celda(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

function Detalle({ clave }: { clave: string }) {
  const [catalogo, setCatalogo] = useState<CatalogoInforme | null | undefined>(undefined);
  useEffect(() => {
    const ctl = new AbortController();
    listarInformes(ctl.signal)
      .then((r) => setCatalogo(r.informes.find((i) => i.clave === clave) ?? null))
      .catch(() => { if (!ctl.signal.aborted) setCatalogo(null); });
    return () => ctl.abort();
  }, [clave]);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [activoId, setActivoId] = useState("");
  const [estado, setEstado] = useState("");
  const [veredicto, setVeredicto] = useState("");
  const [tipo, setTipo] = useState("");
  const [centroCosto, setCentroCosto] = useState("");
  const [pagina, setPagina] = useState(1);
  const activos = useActivosOpciones();

  const filtrosDecl = catalogo?.filtros ?? [];
  const filtros: FiltrosInforme = useMemo(() => ({
    desde: desde || undefined,
    hasta: hasta || undefined,
    activoId: activoId || undefined,
    estado: estado || undefined,
    veredicto: veredicto || undefined,
    tipo: tipo || undefined,
    centroCosto: centroCosto || undefined,
    offset: (pagina - 1) * TAMANO_PAGINA,
    limit: TAMANO_PAGINA,
  }), [desde, hasta, activoId, estado, veredicto, tipo, centroCosto, pagina]);

  const [datos, setDatos] = useState<DatasetInforme | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!clave || catalogo === undefined) return;
    if (catalogo === null) { setCargando(false); return; }
    const ctl = new AbortController();
    setCargando(true);
    setError(null);
    consultarInforme(clave, filtros, ctl.signal)
      .then((d) => { setDatos(d); setCargando(false); })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setCargando(false);
      });
    return () => ctl.abort();
  }, [clave, catalogo, filtros, intento]);

  const [exportando, setExportando] = useState<"csv" | "xlsx" | null>(null);
  const [errorExport, setErrorExport] = useState<string | null>(null);
  const exportar = async (formato: "csv" | "xlsx") => {
    setExportando(formato);
    setErrorExport(null);
    try {
      await exportarInforme(clave, formato, filtros);
    } catch (e) {
      setErrorExport(e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(null);
    }
  };

  if (catalogo === undefined) {
    return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  }
  if (catalogo === null) {
    return (
      <ErrorState
        titulo="Informe no disponible"
        descripcion="El informe solicitado no existe o no está habilitado para su rol."
      />
    );
  }

  const total = datos?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const nota = typeof datos?.meta?.["nota"] === "string" ? (datos.meta["nota"] as string) : null;
  const advertencias = Array.isArray(datos?.meta?.["advertencias"]) ? (datos!.meta["advertencias"] as unknown[]).map(String) : [];
  const reset = () => setPagina(1);

  return (
    <>
      <PageHeader
        titulo={catalogo.titulo}
        descripcion={catalogo.descripcion}
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <Button variant="secundario" size="sm" disabled={exportando !== null || total === 0} onClick={() => void exportar("xlsx")}>
              {exportando === "xlsx" ? "Exportando…" : "Exportar Excel"}
            </Button>
            <Button variant="secundario" size="sm" disabled={exportando !== null || total === 0} onClick={() => void exportar("csv")}>
              {exportando === "csv" ? "Exportando…" : "Exportar CSV"}
            </Button>
          </div>
        }
      />
      {errorExport && (
        <div role="alert" style={{ color: "var(--do-peligro)", marginBottom: "var(--do-sp-4)", font: "var(--do-font-body-sm)" }}>
          No se pudo exportar: {errorExport}
        </div>
      )}

      <Section titulo="Filtros">
        <Card>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
              {filtrosDecl.includes("activoId") && (
                <Field label="Equipo">
                  <Select value={activoId} onChange={(e) => { setActivoId(e.target.value); reset(); }}>
                    <option value="">Todos</option>
                    {activos.map((a) => <option key={a.id} value={a.id}>{a.etiqueta}</option>)}
                  </Select>
                </Field>
              )}
              {filtrosDecl.includes("desde") && (
                <Field label="Desde">
                  <Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); reset(); }} />
                </Field>
              )}
              {filtrosDecl.includes("hasta") && (
                <Field label="Hasta">
                  <Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); reset(); }} />
                </Field>
              )}
              {filtrosDecl.includes("estado") && (
                <Field label="Estado">
                  <Input value={estado} placeholder="Todos" onChange={(e) => { setEstado(e.target.value); reset(); }} />
                </Field>
              )}
              {filtrosDecl.includes("veredicto") && (
                <Field label="Veredicto">
                  <Select value={veredicto} onChange={(e) => { setVeredicto(e.target.value); reset(); }}>
                    <option value="">Todos</option>
                    <option value="APTO">APTO</option>
                    <option value="NO_APTO">NO APTO</option>
                  </Select>
                </Field>
              )}
              {filtrosDecl.includes("centroCosto") && (
                <Field label="Centro de costos">
                  <Input value={centroCosto} placeholder="Todos" onChange={(e) => { setCentroCosto(e.target.value); reset(); }} />
                </Field>
              )}
              {filtrosDecl.includes("tipo") && (
                <Field label="Tipo">
                  <Input value={tipo} placeholder="Todos" onChange={(e) => { setTipo(e.target.value); reset(); }} />
                </Field>
              )}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section titulo={`Resultados${datos ? ` (${total})` : ""}`}>
        {cargando ? (
          <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
        ) : error ? (
          <ErrorState titulo="No se pudo cargar el informe" descripcion={error.message} onReintentar={() => setIntento((n) => n + 1)} />
        ) : !datos || datos.filas.length === 0 ? (
          <EmptyState titulo="Sin datos suficientes" descripcion="No hay registros para los filtros seleccionados." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
            {advertencias.map((adv) => (
              <p key={adv} role="alert" style={{ margin: 0, color: "var(--do-advertencia, #b45309)", font: "var(--do-font-body-sm)", fontWeight: 600 }}>
                ⚠ {adv}
              </p>
            ))}
            {nota && (
              <p style={{ margin: 0, color: "var(--do-texto-suave)", font: "var(--do-font-body-sm)" }}>{nota}</p>
            )}
            <div className="do-solo-desktop">
              <div style={{ overflowX: "auto" }}>
                <Table caption={`Resultados del informe ${catalogo.titulo}`}>
                  <thead>
                    <tr>
                      {datos.columnas.map((c) => <th key={c.clave}>{c.titulo}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.filas.map((f, i) => (
                      <tr key={i}>
                        {datos.columnas.map((c) => <td key={c.clave}>{celda(f[c.clave])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
            <div className="do-solo-movil" style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
              {datos.filas.map((f, i) => (
                <Card key={i}>
                  <CardContent>
                    <dl style={{ margin: 0, display: "grid", gap: "var(--do-sp-1)" }}>
                      {datos.columnas.map((c) => (
                        <div key={c.clave} style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)", minWidth: 0 }}>
                          <dt style={{ color: "var(--do-texto-suave)", font: "var(--do-font-body-sm)", flexShrink: 0 }}>{c.titulo}</dt>
                          <dd style={{ margin: 0, textAlign: "right", overflowWrap: "anywhere", minWidth: 0 }}>{celda(f[c.clave])}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
              ))}
            </div>
            {totalPaginas > 1 && <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} />}
          </div>
        )}
      </Section>

      <p style={{ marginTop: "var(--do-sp-6)", font: "var(--do-font-body-sm)" }}>
        <Link href="/informes" style={{ color: "var(--do-primario)" }}>← Volver al catálogo de informes</Link>
      </p>
    </>
  );
}
