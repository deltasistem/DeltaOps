/**
 * DGP-016 · Página de un dashboard (/analytics/dashboards/:id).
 *
 * Renderiza cualquier dashboard declarativo con el motor genérico + panel de
 * filtros globales reutilizables persistidos en la URL (deep links ruta→filtro).
 * Ofrece clonar (roles con dashboard) y editar/eliminar si es propio. Estados
 * honestos; sin conexión muestra datos de caché con aviso.
 */
import React, { useState } from "react";
import { Link, useLocation, useSearch, useParams } from "wouter";
import {
  PageHeader,
  Section,
  Button,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
  Modal,
  Input,
  Alert,
} from "@workspace/design-system";
import { ShellAnalytics, useSesionAnalytics } from "../lib/analytics/Shell";
import { useDashboard, cacheGlobal } from "../lib/analytics/hooks";
import { DashboardRenderer } from "../lib/analytics/DashboardRenderer";
import { FiltrosGlobalesPanel } from "../lib/analytics/FiltrosGlobales";
import { leerFiltrosDeUrl, type FiltrosGlobales } from "../lib/analytics/filtros";
import { clonarDashboard, eliminarDashboard } from "../lib/analytics/mutaciones";
import { urlDashboard, urlDashboardEditar, urlHome } from "../lib/analytics/deep-links";
import { nuevoOpId } from "../lib/offline/cola";

export default function AnalyticsDashboardPage() {
  return (
    <ShellAnalytics>
      <Vista />
    </ShellAnalytics>
  );
}

function Vista() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const search = useSearch();
  const [, navegar] = useLocation();
  const { capacidades, usuarioId } = useSesionAnalytics();
  const { datos, cargando, error, recargar } = useDashboard(id);

  const filtros = leerFiltrosDeUrl(search);

  function aplicarFiltros(nuevo: FiltrosGlobales) {
    navegar(urlDashboard(id, nuevo), { replace: true });
  }

  if (cargando && !datos) {
    return <div style={{ display: "grid", placeItems: "center", minHeight: 200 }}><Spinner /></div>;
  }
  if (error) {
    return <ErrorState titulo="No se pudo cargar el dashboard" descripcion={error.message} onReintentar={recargar} />;
  }
  if (!datos) {
    return (
      <EmptyState
        titulo="Dashboard no encontrado"
        descripcion="El dashboard solicitado no existe o no está disponible."
        accion={{ label: "Volver a Analytics", onClick: () => navegar(urlHome()) }}
      />
    );
  }

  const esPropio = !datos.delSistema && datos.propietarioId === usuarioId;

  return (
    <>
      <PageHeader
        titulo={datos.nombre}
        descripcion={datos.descripcion ?? undefined}
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
            <Badge variant={datos.delSistema ? "neutro" : "info"}>{datos.delSistema ? "sistema" : "propio"}</Badge>
            {capacidades.dashboard && <BotonClonar dashboardId={datos.id} nombreOrigen={datos.nombre} onClonado={(nuevoId) => navegar(urlDashboard(nuevoId))} />}
            {capacidades.dashboard && esPropio && (
              <>
                <Link href={urlDashboardEditar(datos.id)}>
                  <Button variant="secundario" size="sm">Editar</Button>
                </Link>
                <BotonEliminar dashboardId={datos.id} version={datos.version ?? 1} onEliminado={() => navegar(urlHome())} />
              </>
            )}
          </div>
        }
      />

      <FiltrosGlobalesPanel valor={filtros} onCambio={aplicarFiltros} />

      <Section titulo="Widgets">
        <DashboardRenderer dashboard={datos} filtrosGlobales={filtros} cache={cacheGlobal} />
      </Section>
    </>
  );
}

/* ------------------------------ Clonar ---------------------------------- */

function BotonClonar({ dashboardId, nombreOrigen, onClonado }: { dashboardId: string; nombreOrigen: string; onClonado: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(`${nombreOrigen} (copia)`);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function confirmar() {
    setOcupado(true);
    setMsg(null);
    const nuevoId = nuevoOpId();
    const r = await clonarDashboard(dashboardId, { clave: `personal-${nuevoId.slice(0, 8)}`, nombre, id: nuevoId });
    setOcupado(false);
    if (r.error) {
      setMsg(r.error.message);
      return;
    }
    const id = ((r.resultado as { id?: string })?.id) ?? nuevoId;
    setAbierto(false);
    onClonado(id);
  }

  return (
    <>
      <Button variant="secundario" size="sm" onClick={() => setAbierto(true)}>Clonar</Button>
      <Modal abierto={abierto} onClose={() => setAbierto(false)} titulo="Clonar dashboard">
        {msg && <Alert variant="error" titulo={msg} />}
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
          <span>Nombre del clon</span>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end", marginTop: "var(--do-sp-3)" }}>
          <Button variant="fantasma" size="sm" onClick={() => setAbierto(false)}>Cancelar</Button>
          <Button variant="primario" size="sm" onClick={confirmar} disabled={ocupado || nombre.trim() === ""}>
            {ocupado ? "Clonando…" : "Clonar"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------ Eliminar -------------------------------- */

function BotonEliminar({ dashboardId, version, onEliminado }: { dashboardId: string; version: number; onEliminado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function confirmar() {
    setOcupado(true);
    setMsg(null);
    const r = await eliminarDashboard(dashboardId, version);
    setOcupado(false);
    if (r.error) {
      setMsg(r.error.message);
      return;
    }
    setAbierto(false);
    onEliminado();
  }

  return (
    <>
      <Button variant="peligro" size="sm" onClick={() => setAbierto(true)}>Eliminar</Button>
      <Modal abierto={abierto} onClose={() => setAbierto(false)} titulo="Eliminar dashboard">
        {msg && <Alert variant="error" titulo={msg} />}
        <p>Esta acción elimina permanentemente el dashboard. ¿Continuar?</p>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
          <Button variant="fantasma" size="sm" onClick={() => setAbierto(false)}>Cancelar</Button>
          <Button variant="peligro" size="sm" onClick={confirmar} disabled={ocupado}>
            {ocupado ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
