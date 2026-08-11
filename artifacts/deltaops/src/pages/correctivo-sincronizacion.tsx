/**
 * DGP-015 · Panel de sincronización offline del módulo correctivo.
 * Reutiliza el framework offline (cola por tenant, espacio "correctivo"): cola
 * visible, estado de sync, reintentos, resolución de conflictos y purga.
 */
import React from "react";
import {
  PageHeader, Section, Card, CardContent, Table, Badge, Button,
  OfflineBadge, EmptyState, KpiCard,
} from "@workspace/design-system";
import { ShellCorrectivo } from "../lib/correctivo/Shell";
import { useOffline } from "../lib/offline/contexto";
import type { OperacionCola, EstadoOperacion } from "../lib/offline/tipos";
import type { Tono } from "../lib/correctivo/constantes";

const VARIANTE: Record<EstadoOperacion, Tono> = {
  pendiente: "info", enviando: "primario", aplicada: "exito", idempotente: "exito",
  conflicto: "error", reintentable: "advertencia", rechazada: "error",
};
const ETIQUETA: Record<EstadoOperacion, string> = {
  pendiente: "Pendiente", enviando: "Enviando", aplicada: "Aplicada", idempotente: "Idempotente",
  conflicto: "Conflicto", reintentable: "Reintentable", rechazada: "Rechazada",
};

export default function CorrectivoSincronizacionPage() {
  return (
    <ShellCorrectivo activo="/correctivo/sincronizacion">
      <Panel />
    </ShellCorrectivo>
  );
}

function Panel() {
  const { cola, operaciones, enLinea, pendientes, conflictos, procesar } = useOffline();
  const estado = !enLinea ? "offline" : pendientes > 0 ? "sincronizando" : "sincronizado";
  const exitosas = operaciones.filter((o) => o.estado === "aplicada" || o.estado === "idempotente").length;

  return (
    <>
      <PageHeader
        titulo="Sincronización"
        descripcion="Cola de operaciones offline del correctivo y su estado de sincronización."
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
            <OfflineBadge estado={estado} />
            <Button variant="primario" disabled={!enLinea || pendientes === 0} onClick={() => void procesar()}>Sincronizar ahora</Button>
          </div>
        }
      />
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}>
        <KpiCard titulo="En cola" valor={String(operaciones.length)} />
        <KpiCard titulo="Pendientes" valor={String(pendientes)} />
        <KpiCard titulo="Conflictos" valor={String(conflictos.length)} />
        <KpiCard titulo="Sincronizadas" valor={String(exitosas)} />
      </div>
      <Section
        titulo="Operaciones"
        acciones={<Button variant="secundario" size="sm" disabled={exitosas === 0} onClick={() => cola.purgarExitosas()}>Purgar exitosas</Button>}
      >
        {operaciones.length === 0 ? (
          <Card><CardContent><EmptyState titulo="Cola vacía" descripcion="No hay operaciones pendientes de sincronizar." /></CardContent></Card>
        ) : (
          <Card>
            <CardContent>
              <Table caption="Cola de sincronización del correctivo">
                <thead>
                  <tr><th scope="col">Estado</th><th scope="col">Comando</th><th scope="col">Descripción</th><th scope="col">Intentos</th><th scope="col">Mensaje</th><th scope="col"><span className="do-visualmente-oculto">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {operaciones.map((o) => <Fila key={o.opId} op={o} onReintentar={() => cola.reactivar(o.opId)} onDescartar={() => cola.descartar(o.opId)} />)}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Section>
    </>
  );
}

function Fila({ op, onReintentar, onDescartar }: { op: OperacionCola; onReintentar: () => void; onDescartar: () => void }) {
  const puedeReintentar = op.estado === "reintentable" || op.estado === "conflicto" || op.estado === "rechazada";
  return (
    <tr>
      <td><Badge variant={VARIANTE[op.estado]}>{ETIQUETA[op.estado]}</Badge></td>
      <td><code style={{ fontSize: "var(--do-text-xs)" }}>{op.comando}</code></td>
      <td>{op.descripcion}</td>
      <td>{op.intentos}</td>
      <td style={{ maxWidth: 260, color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>{op.mensaje ?? "—"}</td>
      <td>
        <div style={{ display: "flex", gap: "var(--do-sp-1)" }}>
          {puedeReintentar && <Button variant="secundario" size="sm" onClick={onReintentar}>Reintentar</Button>}
          <Button variant="peligro" size="sm" onClick={onDescartar}>Descartar</Button>
        </div>
      </td>
    </tr>
  );
}
