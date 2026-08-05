/**
 * DGP-010 · Centro del Supervisor SIN cambio de contexto (punto 11).
 *
 * Panel lateral (Drawer del Design System) que abre IN-PLACE el detalle de una
 * OT y de su activo, y permite gestionar prioridad y esperas (bitácora) desde la
 * misma superficie, sin navegar a otra pantalla. Compone `useDetalle`,
 * `useActivoResumen`, `editarOrden` y `registrarBitacora`; sin API nueva.
 */
import React, { useState } from "react";
import { Link } from "wouter";
import {
  Drawer,
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Spinner,
  Alert,
  useToast,
} from "@workspace/design-system";
import { useDetalle } from "../../lib/ordenes/hooks";
import { useActivoResumen } from "../../lib/ecosistema/hooks";
import { editarOrden, registrarBitacora } from "../../lib/ordenes/mutaciones";
import { useOffline } from "../../lib/offline/contexto";
import { BadgeEstado, BadgePrioridad, vencimientoSla } from "../../lib/ordenes/componentes";
import { urlActivo, urlOrden } from "../../lib/ecosistema/deep-links";

const PRIORIDADES = ["baja", "media", "alta", "critica"];

export function PanelSupervisor({ ordenId, onCerrar, onCambio }: {
  ordenId: string; onCerrar: () => void; onCambio: () => void;
}) {
  const { datos: orden, cargando, recargar } = useDetalle(ordenId);
  const { datos: activo } = useActivoResumen(orden?.activoPrincipalId ?? null);
  const { cola } = useOffline();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);

  async function cambiarPrioridad(prioridad: string) {
    if (!orden) return;
    setOcupado(true);
    const r = await editarOrden(cola, orden.id, orden.version, { prioridad });
    setOcupado(false);
    if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
    else { toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "Prioridad en cola" : "Prioridad actualizada" }); recargar(); onCambio(); }
  }

  async function gestionarEspera(accion: "espera" | "reanudacion") {
    if (!orden) return;
    setOcupado(true);
    const r = await registrarBitacora(cola, orden.id, accion, { origen: "supervisor" });
    setOcupado(false);
    if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
    else { toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: accion === "espera" ? "Puesta en espera" : "Reanudada" }); recargar(); onCambio(); }
  }

  return (
    <Drawer abierto onClose={onCerrar} lado="derecha" size="md" titulo={orden ? `${orden.codigo} · ${orden.titulo}` : "Cargando…"}>
      {cargando || !orden ? (
        <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", alignItems: "center" }}>
            <BadgeEstado estado={orden.estado} />
            <BadgePrioridad prioridad={orden.prioridad} />
            {vencimientoSla(orden) && <Badge variant="advertencia">SLA</Badge>}
          </div>

          <Card>
            <CardHeader><strong>Prioridad</strong></CardHeader>
            <CardContent>
              <div role="group" aria-label="Cambiar prioridad" style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                {PRIORIDADES.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={orden.prioridad === p ? "primario" : "fantasma"}
                    disabled={ocupado}
                    aria-pressed={orden.prioridad === p}
                    onClick={() => void cambiarPrioridad(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><strong>Esperas</strong></CardHeader>
            <CardContent>
              <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                <Button size="sm" variant="secundario" disabled={ocupado} onClick={() => void gestionarEspera("espera")}>Poner en espera</Button>
                <Button size="sm" variant="secundario" disabled={ocupado} onClick={() => void gestionarEspera("reanudacion")}>Reanudar</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><strong>Activo</strong></CardHeader>
            <CardContent>
              {orden.activoPrincipalId ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                  <span>{activo?.nombre ?? orden.activoPrincipalId}</span>
                  <Link href={urlActivo(orden.activoPrincipalId)}><Button variant="fantasma" size="sm">Vista 360°</Button></Link>
                </div>
              ) : (
                <Alert variant="info" titulo="Orden sin activo asociado" />
              )}
            </CardContent>
          </Card>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Link href={urlOrden(orden.id)}><Button variant="secundario" size="sm">Abrir ficha completa</Button></Link>
          </div>
        </div>
      )}
    </Drawer>
  );
}
