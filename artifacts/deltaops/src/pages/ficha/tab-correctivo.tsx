/**
 * DGP-015 · Vista 360° del Activo — pestaña «Correctivo».
 *
 * Integra el mantenimiento correctivo en la ficha del activo (y, por tanto, en
 * el flujo QR del activo: el correctivo NO crea un QR propio; escanear un activo
 * alcanza su historial correctivo aquí). Muestra el HISTORIAL de eventos del
 * activo (fallas / reparaciones / puestas en servicio) marcando los REINCIDENTES
 * (misma falla repetida) para gobernar planes correctivos, las solicitudes
 * correctivas asociadas y permite registrar un evento manual. Compone el read
 * model (`useEventosActivo`, `useSolicitudesDeActivo`); no abre API nueva.
 */
import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Card, CardContent, CardHeader, Badge, Button, Spinner, EmptyState, ErrorState,
  Table, Alert,
} from "@workspace/design-system";
import { useEventosActivo, useSolicitudesDeActivo } from "../../lib/correctivo/hooks";
import { OfflineProvider, useOffline } from "../../lib/offline/contexto";
import { TENANT, SYNC_URL, MODULO_OFFLINE } from "../../lib/correctivo/constantes";
import { BadgeEstadoSolicitud, fechaHora } from "../../lib/correctivo/componentes";
import { urlSolicitud, urlNuevaSolicitud } from "../../lib/correctivo/deep-links";
import { ETIQUETA_TIPO_EVENTO_ACTIVO } from "../../lib/correctivo/constantes";
import { FormularioDinamico, useFormularioDinamico } from "../../lib/forms/FormularioDinamico";
import { plantillaEventoActivo } from "../../lib/forms/plantillas-correctivo";
import { registrarEventoActivo } from "../../lib/correctivo/mutaciones";
import { construirInputEventoActivo } from "../../lib/correctivo/alta";
import type { EventoActivo } from "../../lib/correctivo/tipos";
import { useSesion } from "../../lib/identidad/sesion";
import { puedeEscribirModulo } from "../../lib/identidad/capacidades-modulo";

/**
 * Calcula, de forma tolerante, si un evento es reincidente: si el read model no
 * expone el flag `reincidente`, lo deriva localmente detectando fallas repetidas
 * (mismo `modoFalla` no vacío en fallas anteriores del activo).
 */
export function marcarReincidencias(eventos: EventoActivo[]): (EventoActivo & { esReincidente: boolean })[] {
  const vistosModo = new Set<string>();
  return eventos.map((e) => {
    const esFalla = (e.tipo ?? "").startsWith("falla");
    const modo = (e.modoFalla ?? "").trim().toLowerCase();
    const derivado = esFalla && modo !== "" && vistosModo.has(modo);
    if (esFalla && modo !== "") vistosModo.add(modo);
    return { ...e, esReincidente: e.reincidente ?? derivado };
  });
}

/**
 * Envoltura con su propio OfflineProvider: la ficha del activo no monta el
 * framework offline del correctivo, así que este tab lo aporta (namespace
 * "correctivo") para poder registrar eventos con degradación offline.
 */
export function TabCorrectivo(props: { activoId: string; activoNombre?: string }) {
  return (
    <OfflineProvider tenant={TENANT} modulo={MODULO_OFFLINE} syncUrl={SYNC_URL}>
      <TabCorrectivoInterno {...props} />
    </OfflineProvider>
  );
}

function TabCorrectivoInterno({ activoId }: { activoId: string; activoNombre?: string }) {
  const eventos = useEventosActivo(activoId);
  const solicitudes = useSolicitudesDeActivo(activoId);
  const { cola } = useOffline();
  const { sesion } = useSesion();
  const puedeEscribir = puedeEscribirModulo(sesion, "modulo.correctivo", "solicitudes");

  const def = useMemo(() => plantillaEventoActivo(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const eventosMarcados = useMemo(() => marcarReincidencias(eventos.datos ?? []), [eventos.datos]);
  const reincidentes = eventosMarcados.filter((e) => e.esReincidente).length;

  async function registrar() {
    const input = construirInputEventoActivo(form.valores, activoId);
    if (!input.tipo) { setMsg({ tono: "error", texto: "El tipo de evento es obligatorio." }); return; }
    setOcupado(true); setMsg(null);
    const r = await registrarEventoActivo(cola, input);
    setOcupado(false);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: el evento se encoló y se sincronizará." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Evento registrado." }); form.setValores({}); eventos.recargar(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Badge variant="neutro">{eventosMarcados.length} evento(s)</Badge>
          {reincidentes > 0 && <Badge variant="error">{reincidentes} reincidente(s)</Badge>}
          <Badge variant="info">{(solicitudes.datos ?? []).length} solicitud(es)</Badge>
        </div>
        {puedeEscribir && (
          <Link href={urlNuevaSolicitud({ activo: activoId })}><Button variant="primario" size="sm">Nueva solicitud para este activo</Button></Link>
        )}
      </div>

      {reincidentes > 0 && (
        <Alert variant="advertencia" titulo="Falla reincidente detectada">
          Este activo presenta fallas repetidas. Evalúa un plan correctivo o un análisis de causa raíz.
        </Alert>
      )}

      {/* Solicitudes correctivas del activo */}
      <Card>
        <CardHeader><strong>Solicitudes correctivas</strong></CardHeader>
        <CardContent>
          {solicitudes.cargando ? <Spinner /> : solicitudes.error ? (
            <ErrorState titulo="No se pudieron cargar las solicitudes" descripcion={solicitudes.error.message} onReintentar={solicitudes.recargar} />
          ) : (solicitudes.datos ?? []).length === 0 ? (
            <EmptyState titulo="Sin solicitudes" descripcion="Este activo no tiene solicitudes correctivas registradas." />
          ) : (
            <ul aria-label="Solicitudes correctivas del activo" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
              {(solicitudes.datos ?? []).map((s) => (
                <li key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                  <span><Link href={urlSolicitud(s.id)}>{s.titulo}</Link> — {s.origen}</span>
                  <BadgeEstadoSolicitud estado={s.estado} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Historial de eventos del activo */}
      <Card>
        <CardHeader><strong>Historial de eventos</strong></CardHeader>
        <CardContent>
          {eventos.cargando ? <Spinner /> : eventos.error ? (
            <ErrorState titulo="No se pudo cargar el historial de eventos" descripcion={eventos.error.message} onReintentar={eventos.recargar} />
          ) : eventosMarcados.length === 0 ? (
            <EmptyState titulo="Sin eventos" descripcion="Este activo no tiene eventos correctivos registrados." />
          ) : (
            <Table caption="Historial de eventos del activo" captionOculto>
              <thead><tr><th scope="col">Evento</th><th scope="col">Modo de falla</th><th scope="col">Ocurrió</th><th scope="col">Reincidente</th></tr></thead>
              <tbody>
                {eventosMarcados.map((e, i) => (
                  <tr key={e.id ?? i}>
                    <td>{ETIQUETA_TIPO_EVENTO_ACTIVO[e.tipo] ?? e.tipo}</td>
                    <td>{e.modoFalla ?? "—"}</td>
                    <td>{fechaHora(e.ocurridoEn)}</td>
                    <td>{e.esReincidente ? <Badge variant="error">Reincidente</Badge> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Registro manual de un evento (ESCRITURA: oculto sin permiso). */}
      {puedeEscribir && (
        <Card>
          <CardHeader><strong>Registrar evento manual</strong></CardHeader>
          <CardContent>
            {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
            <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} />
            <div style={{ marginTop: "var(--do-sp-2)" }}>
              <Button variant="primario" disabled={ocupado} onClick={() => void registrar()}>{ocupado ? "Registrando…" : "Registrar evento"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
