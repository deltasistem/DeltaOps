/**
 * DGP-009.3 · Ficha de la orden — Experiencia de Ejecución integrada.
 *
 * Una sola pantalla reúne (pestañas del DS): Resumen, Ejecución (checklist +
 * formulario + materiales/recursos + horas + bitácora + comentarios + adjuntos),
 * Documentación (referencia-only), Cronología (Shared Timeline) y Relaciones.
 * Todas las acciones degradan a la cola offline. Es el Centro del Técnico.
 */
import React, { useMemo, useState } from "react";
import { useRoute } from "wouter";
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
  Timeline,
  Breadcrumb,
  useToast,
} from "@workspace/design-system";
import { ShellOrdenes } from "../lib/ordenes/Shell";
import {
  useDetalle,
  useHistorial,
  useBitacora,
} from "../lib/ordenes/hooks";
import { useOffline } from "../lib/offline/contexto";
import { transicionar, resolverCierre } from "../lib/ordenes/mutaciones";
import { fusionarEcosistema } from "../lib/ecosistema/timeline";
import { useTimelineActivo } from "../lib/ecosistema/hooks";
import { TRANSICIONES, ETIQUETA_ESTADO, TONO_ESTADO } from "../lib/ordenes/constantes";
import { BadgeEstado, BadgePrioridad, vencimientoSla } from "../lib/ordenes/componentes";
import { PanelSesion } from "../lib/ordenes/PanelSesion";
import { SeccionManoDeObra } from "../lib/manodeobra/SeccionManoDeObra";
import { SeccionCostosOt } from "../lib/costos/SeccionCostosOt";
import type { OrdenRow } from "../lib/ordenes/tipos";
import { TabEjecucion } from "./ordenes/tab-ejecucion";
import { TabDocumentacionOrden } from "./ordenes/tab-documentacion";
import { TabActivoOrden } from "./ordenes/tab-activo";
import { TabDependencias } from "./ordenes/tab-dependencias";
import { leerParam } from "../lib/ecosistema/deep-links";

export default function OrdenesFichaPage() {
  const [, params] = useRoute("/ordenes/:id");
  const id = params?.id ?? "";
  return (
    <ShellOrdenes>
      <Ficha id={id} />
    </ShellOrdenes>
  );
}

function Ficha({ id }: { id: string }) {
  const { datos, cargando, error, recargar } = useDetalle(id);

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-8)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar la orden" descripcion={error.message} onReintentar={recargar} />;
  if (!datos) return <EmptyState titulo="Orden no encontrada" />;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Operaciones", href: "/ordenes" },
          { label: datos.codigo },
        ]}
      />
      <PageHeader
        titulo={datos.titulo}
        descripcion={`${datos.codigo} · ${ETIQUETA_ESTADO[datos.estado] ?? datos.estado}`}
        acciones={<AccionesCiclo orden={datos} onCambio={recargar} />}
      />
      <Tabs
        etiquetaLista="Secciones de la orden"
        porDefecto={leerParam(typeof window !== "undefined" ? window.location.search : "", "tab")}
        items={[
          { id: "resumen", etiqueta: "Resumen", contenido: <TabResumen orden={datos} /> },
          { id: "ejecucion", etiqueta: "Ejecución", contenido: <TabEjecucion orden={datos} onCambio={recargar} /> },
          { id: "activo", etiqueta: "Activo", contenido: <TabActivoOrden orden={datos} /> },
          { id: "dependencias", etiqueta: "Dependencias", contenido: <TabDependencias orden={datos} onCambio={recargar} /> },
          { id: "documentacion", etiqueta: "Documentación", contenido: <TabDocumentacionOrden orden={datos} onCambio={recargar} /> },
          { id: "cronologia", etiqueta: "Cronología", contenido: <TabCronologia orden={datos} id={id} /> },
        ]}
      />
    </>
  );
}

/** Acciones de ciclo de vida (transiciones del Workflow Engine). */
function AccionesCiclo({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const acciones = TRANSICIONES[orden.estado] ?? [];

  async function ejecutar(comando: string, etiqueta: string, requiereValidacion?: boolean) {
    setOcupado(true);
    try {
      // El cierre en validación pasa por la aprobación inline `validacionCierre`,
      // que el contrato de Órdenes exige en DOS pasos (abrir gate `cerrar` +
      // decidir). `resolverCierre` encadena ambos; llamar sólo a `aprobarCierre`
      // fallaba porque el gate nunca se abría.
      const r = requiereValidacion && comando === "cerrar"
        ? await resolverCierre(cola, orden.id, true)
        : requiereValidacion && comando === "devolver"
          ? await resolverCierre(cola, orden.id, false)
          : await transicionar(cola, orden.id, comando);
      if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
      else if (r.encolada) toast.mostrar({ variant: "info", titulo: "Sin conexión", mensaje: `«${etiqueta}» quedó en cola.` });
      else { toast.mostrar({ variant: "exito", titulo: "Listo", mensaje: `${etiqueta} aplicado.` }); onCambio(); }
    } finally {
      setOcupado(false);
    }
  }

  if (acciones.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
      {acciones.map((a) => (
        <Button
          key={a.comando}
          variant={a.comando === "cancelar" || a.comando === "devolver" ? "peligro" : "primario"}
          size="sm"
          disabled={ocupado}
          onClick={() => void ejecutar(a.comando, a.etiqueta, a.requiereValidacion)}
        >
          {a.etiqueta}
        </Button>
      ))}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>{etiqueta}</dt>
      <dd style={{ margin: 0 }}>{valor ?? "—"}</dd>
    </>
  );
}

function TabResumen({ orden }: { orden: OrdenRow }) {
  const sla = vencimientoSla(orden);
  const descripcion = (orden.datos?.descripcion as string | undefined) ?? "";
  const observaciones = (orden.datos?.observaciones as string | undefined) ?? "";
  return (
    <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
      <Card>
        <CardHeader><strong>Datos generales</strong></CardHeader>
        <CardContent>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)", margin: 0 }}>
            <Dato etiqueta="Código" valor={orden.codigo} />
            <Dato etiqueta="Estado" valor={<BadgeEstado estado={orden.estado} />} />
            <Dato etiqueta="Tipo" valor={orden.tipo} />
            <Dato etiqueta="Categoría" valor={orden.categoria} />
            <Dato etiqueta="Prioridad" valor={<BadgePrioridad prioridad={orden.prioridad} />} />
            <Dato etiqueta="Severidad" valor={orden.severidad} />
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><strong>Asignación y SLA</strong></CardHeader>
        <CardContent>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)", margin: 0 }}>
            <Dato etiqueta="Responsable" valor={orden.responsable} />
            <Dato etiqueta="Supervisor" valor={orden.supervisor} />
            <Dato etiqueta="Activo" valor={orden.activoPrincipalId} />
            <Dato etiqueta="Ubicación" valor={orden.ubicacionId} />
            <Dato etiqueta="Vencimiento SLA" valor={sla ? new Date(sla).toLocaleString("es") : "—"} />
            <Dato etiqueta="Versión" valor={orden.version} />
          </dl>
        </CardContent>
      </Card>
      {(descripcion || observaciones) && (
        <Card>
          <CardHeader><strong>Descripción</strong></CardHeader>
          <CardContent>
            {descripcion && <p style={{ margin: 0 }}>{descripcion}</p>}
            {observaciones && <p style={{ marginTop: "var(--do-sp-2)", color: "var(--do-texto-suave)" }}>{observaciones}</p>}
          </CardContent>
        </Card>
      )}
      {/* DGP-020.2 · Contexto de sesión integrado (estado + duraciones + historial). */}
      <PanelSesion orden={orden} conHistorial />
      {/* DGP-020.3 · Mano de obra de la OT (técnico, tiempo, tarifa, costo, estado). */}
      <SeccionManoDeObra ordenId={orden.id} />
      {/* DGP-021.3 · Costos de mantenimiento de la OT (composición por componente y moneda). */}
      <div style={{ gridColumn: "1 / -1" }}>
        <SeccionCostosOt ordenId={orden.id} />
      </div>
    </div>
  );
}

/** Timeline Operacional: cronología de eventos + bitácora vía Shared Timeline. */
/**
 * DGP-010 · Cronología UNIFICADA del ecosistema: fusiona la actividad del activo
 * intervenido (Shared Timeline) con el historial + bitácora de la orden en una
 * sola línea temporal ordenada por `ocurridoAt` (función pura reutilizable).
 */
function TabCronologia({ id, orden }: { id: string; orden: OrdenRow }) {
  const historial = useHistorial(id);
  const bitacora = useBitacora(id);
  const timelineActivo = useTimelineActivo(orden.activoPrincipalId);

  const eventos = useMemo(
    () =>
      fusionarEcosistema(timelineActivo.datos, historial.datos, bitacora.datos, "desc").map((e) => ({
        titulo: `[${e.fuente}] ${e.titulo}`,
        hora: e.hora,
        descripcion: e.descripcion,
        tono: e.tono,
      })),
    [timelineActivo.datos, historial.datos, bitacora.datos],
  );

  if (historial.cargando || bitacora.cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (eventos.length === 0) return <Card><CardContent><EmptyState titulo="Sin cronología" descripcion="Aún no hay eventos registrados." /></CardContent></Card>;

  return (
    <Card>
      <CardContent>
        <Timeline label="Cronología unificada (activo + orden)" eventos={eventos} />
      </CardContent>
    </Card>
  );
}

export { TONO_ESTADO };
