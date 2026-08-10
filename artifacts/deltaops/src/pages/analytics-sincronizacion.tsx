/**
 * DGP-016 · Página de sincronización / estado offline
 * (/analytics/sincronizacion).
 *
 * Muestra el estado de conexión, las operaciones en cola (snapshots encolados
 * con su opId/comando), permite forzar el procesamiento y listar/limpiar el
 * caché por tenant. Es la vista de transparencia del framework Offline First.
 * Sólo Design System.
 */
import React, { useState } from "react";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  OfflineBadge,
  EmptyState,
  Alert,
} from "@workspace/design-system";
import { ShellAnalytics } from "../lib/analytics/Shell";
import { useOffline } from "../lib/offline/contexto";
import { cacheGlobal } from "../lib/analytics/hooks";
import { CACHE_NAMESPACE } from "../lib/analytics/constantes";
import { formatearFecha } from "../lib/analytics/formato";

export default function AnalyticsSincronizacionPage() {
  return (
    <ShellAnalytics activo="/analytics/sincronizacion">
      <Sincronizacion />
    </ShellAnalytics>
  );
}

function Sincronizacion() {
  const { enLinea, pendientes, operaciones, procesar } = useOffline();
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [entradas, setEntradas] = useState(() => cacheGlobal.entradas());

  const estado = !enLinea ? "offline" : pendientes > 0 ? "sincronizando" : "sincronizado";

  async function forzar() {
    setOcupado(true);
    setMsg(null);
    try {
      await procesar();
      setMsg("Procesamiento de cola solicitado.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function vaciarCache() {
    cacheGlobal.vaciar();
    setEntradas(cacheGlobal.entradas());
    setMsg("Caché local vaciado.");
  }

  return (
    <>
      <PageHeader titulo="Sincronización" descripcion="Transparencia del funcionamiento sin conexión: cola de operaciones y caché local por tenant." />

      {msg && <Alert variant="info" titulo={msg} onClose={() => setMsg(null)} />}

      <Section titulo="Estado de conexión">
        <Card>
          <CardContent>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
              <OfflineBadge estado={estado} />
              <span>{enLinea ? "En línea" : "Sin conexión"}</span>
              <Badge variant={pendientes > 0 ? "advertencia" : "exito"}>{pendientes} en cola</Badge>
              {enLinea && pendientes > 0 && (
                <Button variant="primario" size="sm" onClick={forzar} disabled={ocupado}>
                  {ocupado ? "Sincronizando…" : "Sincronizar ahora"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section titulo="Operaciones en cola">
        {operaciones.length === 0 ? (
          <EmptyState titulo="Cola vacía" descripcion="No hay operaciones pendientes de sincronizar." />
        ) : (
          <Table caption="Operaciones encoladas" compacta hover>
            <thead>
              <tr>
                <th scope="col">opId</th>
                <th scope="col">Comando</th>
                <th scope="col">Descripción</th>
                <th scope="col">Intentos</th>
              </tr>
            </thead>
            <tbody>
              {operaciones.map((op) => (
                <tr key={op.opId}>
                  <td><code>{op.opId.slice(0, 8)}…</code></td>
                  <td>{op.comando}</td>
                  <td>{op.descripcion ?? "—"}</td>
                  <td>{op.intentos ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section
        titulo="Caché local"
        acciones={entradas.length > 0 ? <Button variant="peligro" size="sm" onClick={vaciarCache}>Vaciar caché</Button> : undefined}
      >
        <p style={{ margin: "0 0 var(--do-sp-2)", fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
          Espacio de nombres: <code>{CACHE_NAMESPACE}</code>
        </p>
        {entradas.length === 0 ? (
          <EmptyState titulo="Caché vacío" descripcion="Aún no se han almacenado respuestas para uso sin conexión." />
        ) : (
          <Table caption="Entradas del caché" compacta hover>
            <thead>
              <tr><th scope="col">Clave</th><th scope="col">Actualizado</th></tr>
            </thead>
            <tbody>
              {entradas.map((e) => (
                <tr key={e.clave}>
                  <td><code>{e.clave}</code></td>
                  <td>{formatearFecha(e.guardadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
