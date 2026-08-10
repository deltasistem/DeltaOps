/**
 * DGP-016 · Ficha de un indicador (/analytics/indicadores/:clave).
 *
 * Muestra la definición declarativa legible, permite una evaluación ad-hoc con
 * filtros globales (persistidos en URL), ofrece el botón de snapshot a roles con
 * export (encolable offline vía /sync) y el historial de snapshots. Sólo Design
 * System; estados honestos y accesibles.
 */
import React, { useState } from "react";
import { useLocation, useSearch, useParams } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Table,
  Spinner,
  ErrorState,
  EmptyState,
  Alert,
} from "@workspace/design-system";
import { ShellAnalytics, useSesionAnalytics } from "../lib/analytics/Shell";
import { useIndicador, useSnapshots, useEvaluacion, cacheGlobal } from "../lib/analytics/hooks";
import { FiltrosGlobalesPanel } from "../lib/analytics/FiltrosGlobales";
import { leerFiltrosDeUrl, aFiltrosContrato, type FiltrosGlobales } from "../lib/analytics/filtros";
import { urlIndicador } from "../lib/analytics/deep-links";
import { materializarSnapshot } from "../lib/analytics/mutaciones";
import { useOffline } from "../lib/offline/contexto";
import { formatearValor, formatearFecha } from "../lib/analytics/formato";
import { TONO_SEMAFORO, ETIQUETA_SEMAFORO, type SemaforoNivel } from "../lib/analytics/constantes";
import type { Indicador } from "../lib/analytics/tipos";

export default function AnalyticsIndicadorPage() {
  return (
    <ShellAnalytics activo="/analytics/indicadores">
      <Ficha />
    </ShellAnalytics>
  );
}

function Ficha() {
  const params = useParams<{ clave: string }>();
  const clave = params.clave ?? "";
  const search = useSearch();
  const [, navegar] = useLocation();
  const { datos, cargando, error, recargar } = useIndicador(clave);

  const filtros = leerFiltrosDeUrl(search);

  if (cargando && !datos) return <div style={{ display: "grid", placeItems: "center", minHeight: 200 }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el indicador" descripcion={error.message} onReintentar={recargar} />;
  if (!datos) return <EmptyState titulo="Indicador no encontrado" descripcion="La clave solicitada no existe en este tenant." />;

  return (
    <>
      <PageHeader
        titulo={datos.nombre}
        descripcion={datos.descripcion ?? undefined}
        acciones={<Badge variant={datos.delSistema ? "neutro" : "info"}>{datos.delSistema ? "sistema" : "propio"}</Badge>}
      />
      <Definicion indicador={datos} />
      <FiltrosGlobalesPanel valor={filtros} onCambio={(nuevo) => navegar(urlIndicador(clave, nuevo), { replace: true })} />
      <EvaluacionAdHoc clave={clave} indicador={datos} filtros={filtros} />
      <HistorialSnapshots clave={clave} />
    </>
  );
}

/* ----------------------------- Definición ------------------------------- */

function Definicion({ indicador }: { indicador: Indicador }) {
  return (
    <Section titulo="Definición declarativa">
      <Card>
        <CardContent>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)", margin: 0 }}>
            <dt style={dt}>Clave</dt>
            <dd style={dd}><code>{indicador.clave}</code></dd>
            <dt style={dt}>Categoría</dt>
            <dd style={dd}>{indicador.categoria}</dd>
            <dt style={dt}>Fuente</dt>
            <dd style={dd}>{indicador.fuente.modulo} / {indicador.fuente.dataset}</dd>
            <dt style={dt}>Cálculo</dt>
            <dd style={dd}>
              {indicador.expresion.tipo}
              {indicador.expresion.campo ? ` sobre "${indicador.expresion.campo}"` : ""}
              {indicador.expresion.agrupadores?.length ? ` agrupado por ${indicador.expresion.agrupadores.join(", ")}` : ""}
            </dd>
            <dt style={dt}>Unidad / formato</dt>
            <dd style={dd}>{indicador.unidad} · {indicador.formato}</dd>
            {indicador.umbrales && (
              <>
                <dt style={dt}>Umbrales</dt>
                <dd style={dd}>
                  bueno {indicador.umbrales.bueno} · alerta {indicador.umbrales.alerta} · crítico {indicador.umbrales.critico}
                  {indicador.umbrales.mayorEsMejor ? " (mayor es mejor)" : " (menor es mejor)"}
                </dd>
              </>
            )}
            {indicador.metas && indicador.metas.length > 0 && (
              <>
                <dt style={dt}>Metas</dt>
                <dd style={dd}>{indicador.metas.map((m) => `${m.periodo}: ${m.valor}`).join(" · ")}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
    </Section>
  );
}

/* --------------------------- Evaluación ad-hoc -------------------------- */

function EvaluacionAdHoc({ clave, indicador, filtros }: { clave: string; indicador: Indicador; filtros: FiltrosGlobales }) {
  const { capacidades } = useSesionAnalytics();
  const { cola } = useOffline();
  const filtrosContrato = aFiltrosContrato(filtros);
  const evaluacion = useEvaluacion(clave, filtrosContrato, { cache: cacheGlobal });
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function snapshot() {
    setOcupado(true);
    setMsg(null);
    const r = await materializarSnapshot(cola, clave, { filtros: filtrosContrato });
    setOcupado(false);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: el snapshot se encoló y se sincronizará." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else setMsg({ tono: "exito", texto: "Snapshot materializado." });
  }

  return (
    <Section
      titulo="Evaluación ad-hoc"
      acciones={
        capacidades.export ? (
          <Button variant="primario" size="sm" onClick={snapshot} disabled={ocupado || evaluacion.cargando}>
            {ocupado ? "Guardando…" : "Materializar snapshot"}
          </Button>
        ) : undefined
      }
    >
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <Card>
        <CardContent>
          {evaluacion.cargando && !evaluacion.datos ? (
            <div role="status" aria-live="polite"><Spinner /> <span>Evaluando…</span></div>
          ) : evaluacion.error ? (
            <ErrorState titulo="No se pudo evaluar" descripcion={evaluacion.error.message} onReintentar={evaluacion.recargar} />
          ) : evaluacion.datos ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
              {evaluacion.origenCache && (
                <p role="note" style={{ margin: 0, fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
                  ⚠ Datos de caché (sin conexión) · {formatearFecha(evaluacion.origenCache)}
                </p>
              )}
              <div style={{ display: "flex", gap: "var(--do-sp-4)", alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: "var(--do-text-3xl, 2.4rem)", fontWeight: 700 }}>
                  {formatearValor(evaluacion.datos.valor, evaluacion.datos.formato ?? indicador.formato, evaluacion.datos.unidad ?? indicador.unidad)}
                </span>
                {evaluacion.datos.semaforo && (
                  <Badge variant={TONO_SEMAFORO[evaluacion.datos.semaforo as SemaforoNivel]}>
                    {ETIQUETA_SEMAFORO[evaluacion.datos.semaforo as SemaforoNivel]}
                  </Badge>
                )}
                <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
                  {evaluacion.datos.muestras} muestra(s) · evaluado {formatearFecha(evaluacion.datos.evaluadoEn)}
                </span>
              </div>
              {evaluacion.datos.grupos.length > 0 && (
                <Table caption="Grupos de la evaluación" compacta hover>
                  <thead>
                    <tr><th scope="col">Grupo</th><th scope="col" style={{ textAlign: "right" }}>Valor</th><th scope="col" style={{ textAlign: "right" }}>Muestras</th></tr>
                  </thead>
                  <tbody>
                    {evaluacion.datos.grupos.map((g, i) => (
                      <tr key={i}>
                        <td>{g.clave}</td>
                        <td style={{ textAlign: "right" }}>{formatearValor(g.valor, evaluacion.datos!.formato ?? indicador.formato, evaluacion.datos!.unidad ?? indicador.unidad)}</td>
                        <td style={{ textAlign: "right" }}>{g.muestras}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          ) : (
            <EmptyState titulo="Sin datos" descripcion="La evaluación no arrojó muestras." />
          )}
        </CardContent>
      </Card>
    </Section>
  );
}

/* -------------------------- Historial snapshots ------------------------- */

function HistorialSnapshots({ clave }: { clave: string }) {
  const { datos, cargando, error, recargar } = useSnapshots(clave);
  const snapshots = datos ?? [];
  return (
    <Section titulo="Historial de snapshots">
      {error && <ErrorState titulo="No se pudo cargar el historial" descripcion={error.message} onReintentar={recargar} />}
      {cargando && !datos && <Spinner />}
      {!error && !cargando && snapshots.length === 0 && (
        <EmptyState titulo="Sin snapshots" descripcion="Aún no se ha materializado ningún snapshot de este indicador." />
      )}
      {snapshots.length > 0 && (
        <Table caption={`Snapshots de ${clave}`} compacta hover>
          <thead>
            <tr><th scope="col">Evaluado</th><th scope="col" style={{ textAlign: "right" }}>Valor</th><th scope="col" style={{ textAlign: "right" }}>Muestras</th></tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td>{formatearFecha(s.evaluadoEn)}</td>
                <td style={{ textAlign: "right" }}>{s.resultado?.valor ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{s.resultado?.muestras ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

const dt: React.CSSProperties = { fontWeight: 600, color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" };
const dd: React.CSSProperties = { margin: 0, fontSize: "var(--do-text-sm)" };
