/**
 * DGP-LITE-04 §21 · Vista 360° del Activo — pestaña «Preoperacional».
 *
 * HISTORIAL de ejecuciones SELLADAS del preoperacional del equipo: fecha,
 * usuario canónico y resultado (veredicto con color/icono/texto), con detalle
 * de una ejecución (versión de plantilla anclada, hallazgos/observaciones,
 * tiempos de servidor). Composición read-only sobre la superficie
 * `/api/deltaops/activos/preoperacional/ejecuciones`; el veredicto y la
 * criticidad ya fueron sellados por el backend (no se recalculan). Estados
 * vacíos honestos; nunca datos falsos.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Card, CardContent, CardHeader, Badge, Button, Spinner, EmptyState, ErrorState, Table, Modal,
} from "@workspace/design-system";
import { Check, X, AlertTriangle, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { listarEjecuciones, obtenerEjecucion } from "../../lib/preoperacional/mutaciones";
import { PreoperacionalApiError, esFuncionNoDisponible } from "../../lib/preoperacional/api";
import { PRESENTACION_VEREDICTO, type Veredicto } from "../../lib/preoperacional/constantes";
import type { EjecucionSellada } from "../../lib/preoperacional/tipos";
import { useSesion } from "../../lib/identidad/sesion";
import { moduloHabilitado } from "../../lib/identidad/rbac";

function fechaHora(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function BadgeVeredicto({ veredicto }: { veredicto: Veredicto }) {
  const p = PRESENTACION_VEREDICTO[veredicto];
  const variant = p.tono === "exito" ? "exito" : p.tono === "advertencia" ? "advertencia" : "error";
  return <Badge variant={variant}>{p.etiqueta}</Badge>;
}

function IconoVeredicto({ veredicto, size = 24 }: { veredicto: Veredicto; size?: number }) {
  const p = PRESENTACION_VEREDICTO[veredicto];
  const C = p.icono === "check" ? ShieldCheck : p.icono === "warning" ? ShieldAlert : ShieldX;
  return <C size={size} aria-hidden="true" />;
}

export function TabPreoperacional({ activoId, activoNombre }: { activoId: string; activoNombre?: string }) {
  const { sesion } = useSesion();
  const [ejecuciones, setEjecuciones] = useState<EjecucionSellada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noDisponible, setNoDisponible] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const puedeEjecutar = !!sesion && moduloHabilitado(sesion, "activos") && sesion.rol !== "CONSULTA";

  const cargar = useCallback((signal?: AbortSignal) => {
    setCargando(true);
    setError(null);
    listarEjecuciones(activoId, signal)
      .then((r) => setEjecuciones(r))
      .catch((e) => {
        if (esFuncionNoDisponible(e)) { setNoDisponible(true); return; }
        setError(e instanceof PreoperacionalApiError ? e.message : "No se pudo cargar el historial.");
      })
      .finally(() => setCargando(false));
  }, [activoId]);

  useEffect(() => {
    const ctrl = new AbortController();
    cargar(ctrl.signal);
    return () => ctrl.abort();
  }, [cargar]);

  const ordenadas = useMemo(
    () => [...ejecuciones].sort((a, b) => (b.data.selladoAt ?? "").localeCompare(a.data.selladoAt ?? "")),
    [ejecuciones],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <Badge variant="neutro">{ordenadas.length} ejecución(es)</Badge>
        {puedeEjecutar && (
          <Link href={`/activos/${encodeURIComponent(activoId)}/preoperacional`}>
            <Button variant="primario" size="sm">Iniciar preoperacional</Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader><strong>Historial de preoperacionales</strong></CardHeader>
        <CardContent>
          {cargando ? (
            <Spinner />
          ) : noDisponible ? (
            <EmptyState titulo="No disponible" descripcion="La consulta de preoperacionales no está desplegada." />
          ) : error ? (
            <ErrorState titulo="No se pudo cargar el historial" descripcion={error} onReintentar={() => cargar()} />
          ) : ordenadas.length === 0 ? (
            <EmptyState
              titulo="Sin preoperacionales"
              descripcion={`${activoNombre ?? "Este equipo"} aún no tiene preoperacionales registrados.`}
            />
          ) : (
            <Table caption="Historial de preoperacionales del activo" captionOculto>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Usuario</th>
                  <th scope="col">Plantilla</th>
                  <th scope="col">Resultado</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((e) => (
                  <tr key={e.id}>
                    <td>{fechaHora(e.data.selladoAt)}</td>
                    <td>{e.data.selladoPor}</td>
                    <td><code style={{ fontSize: "var(--do-text-xs)" }}>{e.data.plantillaClave} v{e.data.plantillaVersion}</code></td>
                    <td><BadgeVeredicto veredicto={e.data.veredicto} /></td>
                    <td><Button variant="secundario" size="sm" onClick={() => setDetalleId(e.id)}>Detalle</Button></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {detalleId && <ModalDetalle id={detalleId} onCerrar={() => setDetalleId(null)} />}
    </div>
  );
}

function ModalDetalle({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const [ejec, setEjec] = useState<EjecucionSellada | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    obtenerEjecucion(id, ctrl.signal)
      .then((r) => setEjec(r))
      .catch((e) => setError(e instanceof PreoperacionalApiError ? e.message : "No se pudo cargar el detalle."))
      .finally(() => setCargando(false));
    return () => ctrl.abort();
  }, [id]);

  const d = ejec?.data;
  const p = d ? PRESENTACION_VEREDICTO[d.veredicto] : null;

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo="Detalle del preoperacional"
      pie={<Button variant="primario" onClick={onCerrar}>Cerrar</Button>}
    >
      {cargando ? (
        <Spinner />
      ) : error || !d || !p ? (
        <ErrorState titulo="No disponible" descripcion={error ?? "No se encontró la ejecución."} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)" }}>
            <IconoVeredicto veredicto={d.veredicto} />
            <div>
              <BadgeVeredicto veredicto={d.veredicto} />
              <p style={{ margin: "var(--do-sp-1) 0 0", color: "var(--do-texto-suave)" }}>{p.descripcion}</p>
            </div>
          </div>

          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px var(--do-sp-3)", fontSize: "var(--do-text-sm)" }}>
            <dt style={{ color: "var(--do-texto-suave)" }}>Plantilla</dt>
            <dd style={{ margin: 0 }}><code>{d.plantillaClave} v{d.plantillaVersion}</code></dd>
            <dt style={{ color: "var(--do-texto-suave)" }}>Respuesta</dt>
            <dd style={{ margin: 0 }}><code style={{ fontSize: "var(--do-text-xs)" }}>{d.respuestaId}</code></dd>
            <dt style={{ color: "var(--do-texto-suave)" }}>Registrado por</dt>
            <dd style={{ margin: 0 }}>{d.selladoPor}</dd>
            <dt style={{ color: "var(--do-texto-suave)" }}>Fecha (servidor)</dt>
            <dd style={{ margin: 0 }}>{fechaHora(d.selladoAt)}</dd>
          </dl>

          {(d.incumplimientos.length > 0 || d.observaciones.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
              <strong>Hallazgos</strong>
              {d.incumplimientos.map((h) => (
                <div key={`i-${h.clave}`} style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                  <X size={14} aria-hidden="true" />
                  <span>{h.etiqueta}</span>
                  {h.critico && <Badge variant="error">Crítico</Badge>}
                  {h.comentario && <span style={{ color: "var(--do-texto-suave)" }}>— {h.comentario}</span>}
                </div>
              ))}
              {d.observaciones.map((h) => (
                <div key={`o-${h.clave}`} style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>{h.etiqueta}</span>
                  {h.comentario && <span style={{ color: "var(--do-texto-suave)" }}>— {h.comentario}</span>}
                </div>
              ))}
            </div>
          )}
          {d.incumplimientos.length === 0 && d.observaciones.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", color: "var(--do-texto-suave)" }}>
              <Check size={14} aria-hidden="true" /> Sin hallazgos: todos los puntos cumplen.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
