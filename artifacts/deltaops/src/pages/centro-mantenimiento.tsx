/**
 * DGP-010 · Centro Global de Mantenimiento — consola operacional única.
 *
 * NO es un dashboard ni analítica: es una consola operativa donde convergen
 * Órdenes, Activos, Técnicos (responsables), SLA, Prioridades, Estados y Alertas
 * operativas, componiendo EXCLUSIVAMENTE el read model YA existente de Órdenes
 * (DGP-009) y la navegación contextual del ecosistema (deep links). Toda pieza
 * visual sale del Design System y tokens `--do-*`; no se crea nada nuevo.
 */
import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  Tabs,
  Badge,
  Button,
  Spinner,
  ErrorState,
  EmptyState,
  Alert,
} from "@workspace/design-system";
import { ShellOrdenes } from "../lib/ordenes/Shell";
import { useOrdenesGlobal } from "../lib/ecosistema/hooks";
import { estadoSla, tonoRiesgo, type RiesgoSla } from "../lib/ecosistema/sla";
import { BadgeEstado, BadgePrioridad, esCritica } from "../lib/ordenes/componentes";
import { urlActivo, urlOrden, urlOrdenesDeActivo } from "../lib/ecosistema/deep-links";
import { useDependencias } from "../lib/ordenes/hooks";
import { analizarDependencias } from "../lib/ecosistema/dependencias";
import type { OrdenRow } from "../lib/ordenes/tipos";

export default function CentroMantenimientoPage() {
  return (
    <ShellOrdenes activo="/centro">
      <Centro />
    </ShellOrdenes>
  );
}

const AHORA = () => Date.now();

export function Centro() {
  const { datos, cargando, error, recargar } = useOrdenesGlobal({ limit: 200 });
  const ordenes = datos ?? [];
  const ahora = AHORA();

  const resumen = useMemo(() => {
    const abiertas = ordenes.filter((o) => !["CERRADA", "CANCELADA"].includes(o.estado));
    const criticas = abiertas.filter(esCritica);
    const conSla = abiertas.map((o) => ({ o, sla: estadoSla(o, ahora) }));
    const vencidas = conSla.filter((x) => x.sla.riesgo === "vencido");
    const enRiesgo = conSla.filter((x) => x.sla.riesgo === "critico" || x.sla.riesgo === "riesgo");
    const porTecnico = new Map<string, OrdenRow[]>();
    for (const o of abiertas) {
      const t = o.responsable ?? "Sin asignar";
      const arr = porTecnico.get(t) ?? [];
      arr.push(o);
      porTecnico.set(t, arr);
    }
    return { abiertas, criticas, vencidas, enRiesgo, porTecnico };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes, ahora]);

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-8)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el centro de mantenimiento" descripcion={error.message} onReintentar={recargar} />;

  return (
    <>
      <PageHeader
        titulo="Centro Global de Mantenimiento"
        descripcion="Consola operacional: órdenes, activos, técnicos, SLA, prioridades, estados y alertas en una sola superficie."
        acciones={
          <Link href="/ordenes/nueva"><Button variant="primario" size="sm">Nueva orden</Button></Link>
        }
      />

      <Indicadores
        abiertas={resumen.abiertas.length}
        criticas={resumen.criticas.length}
        vencidas={resumen.vencidas.length}
        enRiesgo={resumen.enRiesgo.length}
        tecnicos={resumen.porTecnico.size}
      />

      <AlertasOperativas vencidas={resumen.vencidas} enRiesgo={resumen.enRiesgo} ahora={ahora} />

      <Tabs
        etiquetaLista="Vistas de la consola operacional"
        items={[
          { id: "cola", etiqueta: `Cola operativa (${resumen.abiertas.length})`, contenido: <ColaOperativa ordenes={resumen.abiertas} ahora={ahora} /> },
          { id: "sla", etiqueta: `SLA (${resumen.vencidas.length + resumen.enRiesgo.length})`, contenido: <VistaSla ordenes={resumen.abiertas} ahora={ahora} /> },
          { id: "tecnicos", etiqueta: `Técnicos (${resumen.porTecnico.size})`, contenido: <VistaTecnicos porTecnico={resumen.porTecnico} /> },
          { id: "activos", etiqueta: "Activos", contenido: <VistaActivos ordenes={resumen.abiertas} /> },
        ]}
      />
    </>
  );
}

function Indicadores({ abiertas, criticas, vencidas, enRiesgo, tecnicos }: {
  abiertas: number; criticas: number; vencidas: number; enRiesgo: number; tecnicos: number;
}) {
  const items = [
    { etiqueta: "Órdenes abiertas", valor: abiertas, tono: "info" as const },
    { etiqueta: "Críticas", valor: criticas, tono: "error" as const },
    { etiqueta: "SLA vencido", valor: vencidas, tono: "error" as const },
    { etiqueta: "SLA en riesgo", valor: enRiesgo, tono: "advertencia" as const },
    { etiqueta: "Técnicos activos", valor: tecnicos, tono: "neutro" as const },
  ];
  return (
    <div role="list" aria-label="Indicadores operativos" style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
      {items.map((i) => (
        <Card key={i.etiqueta}>
          <CardContent>
            <div role="listitem" style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
              <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", textTransform: "uppercase", letterSpacing: "var(--do-tracking-etiquetas)" }}>{i.etiqueta}</span>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <strong style={{ fontSize: "var(--do-text-2xl)" }}>{i.valor}</strong>
                <Badge variant={i.tono}>{i.tono === "error" ? "atención" : i.tono === "advertencia" ? "vigilar" : "ok"}</Badge>
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AlertasOperativas({ vencidas, enRiesgo, ahora }: {
  vencidas: { o: OrdenRow }[]; enRiesgo: { o: OrdenRow }[]; ahora: number;
}) {
  if (vencidas.length === 0 && enRiesgo.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
      {vencidas.length > 0 && (
        <Alert variant="error" titulo={`${vencidas.length} orden(es) con SLA vencido`}>
          Requieren escalamiento inmediato. Revisa la pestaña SLA para reasignar o repriorizar.
        </Alert>
      )}
      {enRiesgo.length > 0 && (
        <Alert variant="advertencia" titulo={`${enRiesgo.length} orden(es) con SLA en riesgo`}>
          Próximas a vencer; prioriza su ejecución.
        </Alert>
      )}
    </div>
  );
}

/** Señal de bloqueo por dependencias (carga acotada por tarjeta visible). */
function SenalBloqueo({ orden }: { orden: OrdenRow }) {
  const { datos } = useDependencias(orden.id);
  const analisis = analizarDependencias(datos, orden);
  if (!analisis.bloqueada) return null;
  return <Badge variant="error">{analisis.listaPeroBloqueada ? "Lista pero bloqueada" : "Bloqueada"}</Badge>;
}

function FilaOrden({ orden, ahora }: { orden: OrdenRow; ahora: number }) {
  const sla = estadoSla(orden, ahora);
  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", minWidth: 200 }}>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{orden.codigo}</span>
            <strong>{orden.titulo}</strong>
            <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", alignItems: "center" }}>
              <BadgeEstado estado={orden.estado} />
              <BadgePrioridad prioridad={orden.prioridad} />
              {sla.riesgo !== "sin-sla" && <Badge variant={tonoRiesgo(sla.riesgo)}>SLA: {sla.etiqueta}</Badge>}
              <SenalBloqueo orden={orden} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", alignItems: "flex-end" }}>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
              {orden.responsable ? `Resp.: ${orden.responsable}` : "Sin asignar"}
            </span>
            <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
              {orden.activoPrincipalId && (
                <Link href={urlActivo(orden.activoPrincipalId)}><Button variant="fantasma" size="sm">Ver activo</Button></Link>
              )}
              <Link href={urlOrden(orden.id)}><Button variant="secundario" size="sm">Abrir</Button></Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ColaOperativa({ ordenes, ahora }: { ordenes: OrdenRow[]; ahora: number }) {
  const [filtroRiesgo, setFiltroRiesgo] = useState<RiesgoSla | "todos">("todos");
  const visibles = useMemo(() => {
    const conSla = ordenes.map((o) => ({ o, sla: estadoSla(o, ahora) }));
    const pref: Record<RiesgoSla, number> = { vencido: 0, critico: 1, riesgo: 2, "en-plazo": 3, "sin-sla": 4 };
    const ordenadas = [...conSla].sort((a, b) => pref[a.sla.riesgo] - pref[b.sla.riesgo]);
    return filtroRiesgo === "todos" ? ordenadas : ordenadas.filter((x) => x.sla.riesgo === filtroRiesgo);
  }, [ordenes, ahora, filtroRiesgo]);

  if (ordenes.length === 0) return <Card><CardContent><EmptyState titulo="Sin órdenes abiertas" descripcion="No hay trabajo operativo en curso." /></CardContent></Card>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      <div role="group" aria-label="Filtrar por riesgo de SLA" style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        {(["todos", "vencido", "critico", "riesgo", "en-plazo"] as const).map((r) => (
          <Button key={r} variant={filtroRiesgo === r ? "primario" : "fantasma"} size="sm" onClick={() => setFiltroRiesgo(r)} aria-pressed={filtroRiesgo === r}>
            {r === "todos" ? "Todos" : r}
          </Button>
        ))}
      </div>
      {visibles.map((x) => <FilaOrden key={x.o.id} orden={x.o} ahora={ahora} />)}
    </div>
  );
}

function VistaSla({ ordenes, ahora }: { ordenes: OrdenRow[]; ahora: number }) {
  const conSla = ordenes
    .map((o) => ({ o, sla: estadoSla(o, ahora) }))
    .filter((x) => x.sla.riesgo === "vencido" || x.sla.riesgo === "critico" || x.sla.riesgo === "riesgo")
    .sort((a, b) => (a.sla.restanteMs ?? 0) - (b.sla.restanteMs ?? 0));
  if (conSla.length === 0) return <Card><CardContent><EmptyState titulo="SLA bajo control" descripcion="Ninguna orden abierta está vencida ni en riesgo." /></CardContent></Card>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      {conSla.map((x) => (
        <div key={x.o.id}>
          <FilaOrden orden={x.o} ahora={ahora} />
          {x.sla.escalar && (
            <p role="alert" style={{ margin: "var(--do-sp-1) 0 0", fontSize: "var(--do-text-xs)", color: "var(--do-error)" }}>
              Escalamiento sugerido.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function VistaTecnicos({ porTecnico }: { porTecnico: Map<string, OrdenRow[]> }) {
  const filas = [...porTecnico.entries()].sort((a, b) => b[1].length - a[1].length);
  if (filas.length === 0) return <Card><CardContent><EmptyState titulo="Sin técnicos con carga" /></CardContent></Card>;
  return (
    <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      {filas.map(([tecnico, ords]) => (
        <Card key={tecnico}>
          <CardHeader>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{tecnico}</strong>
              <Badge variant="info">{ords.length} OT</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ul style={{ margin: 0, paddingLeft: "var(--do-sp-4)", display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
              {ords.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link href={urlOrden(o.id)}><a style={{ color: "var(--do-primario)" }}>{o.codigo} · {o.titulo}</a></Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function VistaActivos({ ordenes }: { ordenes: OrdenRow[] }) {
  const porActivo = new Map<string, OrdenRow[]>();
  for (const o of ordenes) {
    if (!o.activoPrincipalId) continue;
    const arr = porActivo.get(o.activoPrincipalId) ?? [];
    arr.push(o);
    porActivo.set(o.activoPrincipalId, arr);
  }
  const filas = [...porActivo.entries()].sort((a, b) => b[1].length - a[1].length);
  if (filas.length === 0) return <Card><CardContent><EmptyState titulo="Sin activos con órdenes abiertas" /></CardContent></Card>;
  return (
    <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      {filas.map(([activoId, ords]) => (
        <Card key={activoId}>
          <CardHeader>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
              <strong style={{ wordBreak: "break-all" }}>{activoId}</strong>
              <Badge variant="info">{ords.length} OT</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
              <Link href={urlActivo(activoId)}><Button variant="secundario" size="sm">Vista 360°</Button></Link>
              <Link href={urlOrdenesDeActivo(activoId)}><Button variant="fantasma" size="sm">Sus órdenes</Button></Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
