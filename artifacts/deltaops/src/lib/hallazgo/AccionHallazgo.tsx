/**
 * DELTAOPS LITE-05 · Acciones del bucle Hallazgo→OT en la ficha del resultado
 * preoperacional (§6/§7, mobile-first, tokens `--do-*`, claro/oscuro, sin rehacer
 * la estética). Por hallazgo, según el ESTADO que resuelve el backend:
 *
 *   - pendiente  ⇒ [GENERAR MANTENIMIENTO] + [No requiere mantenimiento]
 *   - convertido ⇒ «Mantenimiento ya generado» + [VER ORDEN] (deep link que el
 *                  destino —ficha de Órdenes— CONSUME; lección DGP-010)
 *   - descartado ⇒ estado con motivo/usuario/fecha + [Reabrir] (según RBAC)
 *
 * Antes de generar, un modal de CONFIRMACIÓN muestra los datos que viajarán
 * (equipo, ubicación, hallazgo, criticidad, evidencia, fecha, preoperacional de
 * origen) resueltos SERVER-SIDE. Las mutaciones pasan por la ÚNICA cola offline.
 */
import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button, Badge, Alert, Modal, Spinner } from "@workspace/design-system";
import { Wrench, Ban, ExternalLink, RotateCcw } from "lucide-react";
import { useSesion } from "../identidad/sesion";
import { OfflineProvider, useOffline } from "../offline/contexto";
import { urlOrdenTrabajo } from "../correctivo/deep-links";
import { HALLAZGO_MODULO_OFFLINE, HALLAZGO_SYNC_URL } from "./api";
import {
  obtenerEstadoHallazgo,
  generarMantenimiento,
  descartarHallazgo,
  reabrirHallazgo,
} from "./mutaciones";
import type { EstadoHallazgoResuelto } from "./tipos";

/** ¿El rol de la sesión puede ESCRIBIR (generar/descartar/reabrir)? CONSULTA no. */
function puedeEscribir(rol: string | undefined): boolean {
  return rol !== undefined && rol !== "CONSULTA";
}

function fila(label: string, valor: string) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-3)", padding: "var(--do-sp-1) 0" }}>
      <span style={{ color: "var(--do-texto-suave)" }}>{label}</span>
      <span style={{ textAlign: "right" }}>{valor}</span>
    </div>
  );
}

function Cuerpo({ ejecucionId, itemClave }: { ejecucionId: string; itemClave: string }) {
  const { sesion } = useSesion();
  const { cola, enLinea } = useOffline();
  const escribe = puedeEscribir(sesion?.rol);

  const [estado, setEstado] = useState<EstadoHallazgoResuelto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargar = React.useCallback(
    (signal?: AbortSignal) => {
      setCargando(true);
      setError(null);
      obtenerEstadoHallazgo(ejecucionId, itemClave, signal)
        .then((e) => setEstado(e))
        .catch((e: Error) => setError(e.message))
        .finally(() => setCargando(false));
    },
    [ejecucionId, itemClave],
  );

  useEffect(() => {
    const ac = new AbortController();
    recargar(ac.signal);
    return () => ac.abort();
  }, [recargar]);

  async function alGenerar() {
    setOcupado(true);
    setAviso(null);
    const r = await generarMantenimiento(cola, { ejecucionId, itemClave, etiqueta: estado?.procedencia.item.etiqueta ?? itemClave });
    setOcupado(false);
    setConfirmando(false);
    if (r.error) { setAviso(r.error.message); return; }
    if (r.encolada) { setAviso("Sin conexión: se generará el mantenimiento al sincronizar."); return; }
    recargar();
  }

  async function alDescartar() {
    setOcupado(true);
    setAviso(null);
    const r = await descartarHallazgo(cola, { ejecucionId, itemClave, etiqueta: estado?.procedencia.item.etiqueta ?? itemClave, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) });
    setOcupado(false);
    setDescartando(false);
    setMotivo("");
    if (r.error) { setAviso(r.error.message); return; }
    if (r.encolada) { setAviso("Sin conexión: se registrará el descarte al sincronizar."); return; }
    recargar();
  }

  async function alReabrir() {
    setOcupado(true);
    setAviso(null);
    const r = await reabrirHallazgo(cola, { ejecucionId, itemClave, etiqueta: estado?.procedencia.item.etiqueta ?? itemClave });
    setOcupado(false);
    if (r.error) { setAviso(r.error.message); return; }
    if (r.encolada) { setAviso("Sin conexión: se reabrirá al sincronizar."); return; }
    recargar();
  }

  if (cargando) return <div style={{ padding: "var(--do-sp-2)" }}><Spinner /></div>;
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!estado) return null;

  const p = estado.procedencia;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)", marginTop: "var(--do-sp-2)" }}>
      {aviso && <Alert variant="advertencia">{aviso}</Alert>}

      {estado.estado === "convertido" && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Badge variant="exito">Mantenimiento ya generado</Badge>
          {estado.ordenTrabajoId && (
            <Link href={urlOrdenTrabajo(estado.ordenTrabajoId)}>
              <Button variant="secundario" size="sm"><ExternalLink size={14} aria-hidden="true" /> Ver orden</Button>
            </Link>
          )}
        </div>
      )}

      {estado.estado === "descartado" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <Badge variant="neutro">No requiere mantenimiento</Badge>
            {escribe && (
              <Button variant="secundario" size="sm" onClick={alReabrir} disabled={ocupado}>
                <RotateCcw size={14} aria-hidden="true" /> Reabrir
              </Button>
            )}
          </div>
          <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-fs-sm)" }}>
            {estado.descarte?.motivo ? `Motivo: ${estado.descarte.motivo}. ` : ""}
            {estado.descarte?.descartadoPor ? `Por ${estado.descarte.descartadoPor}. ` : ""}
            {estado.descarte?.descartadoAt ? new Date(estado.descarte.descartadoAt).toLocaleString() : ""}
          </span>
        </div>
      )}

      {estado.estado === "pendiente" && escribe && (
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Button variant="primario" size="sm" onClick={() => setConfirmando(true)} disabled={ocupado}>
            <Wrench size={14} aria-hidden="true" /> Generar mantenimiento
          </Button>
          <Button variant="secundario" size="sm" onClick={() => setDescartando(true)} disabled={ocupado}>
            <Ban size={14} aria-hidden="true" /> No requiere mantenimiento
          </Button>
        </div>
      )}

      {estado.estado === "pendiente" && !escribe && (
        <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-fs-sm)" }}>Hallazgo pendiente.</span>
      )}

      {/* Confirmación: datos que VIAJARÁN a la OT (resueltos server-side). */}
      <Modal
        abierto={confirmando}
        onClose={() => setConfirmando(false)}
        titulo="Confirmar generación de mantenimiento"
        pie={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
            <Button variant="secundario" size="sm" onClick={() => setConfirmando(false)} disabled={ocupado}>Cancelar</Button>
            <Button variant="primario" size="sm" onClick={alGenerar} disabled={ocupado}>{ocupado ? "Generando…" : "Generar"}</Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {fila("Equipo", `${p.activo.nombre}${p.activo.codigoEmpresarial ? ` (${p.activo.codigoEmpresarial})` : ""}`)}
          {fila("Ubicación", p.activo.ubicacionId ?? "—")}
          {fila("Centro de costos", p.activo.centroCosto ?? "Sin centro de costos configurado")}
          {fila("Responsable", p.activo.responsable ?? "—")}
          {fila("Hallazgo", p.item.etiqueta)}
          {fila("Criticidad", p.item.critico ? "Crítico" : (p.activo.criticidad ?? "—"))}
          {fila("Evidencia", `${(p.item.evidencias ?? []).length} adjunto(s)`)}
          {fila("Preoperacional", `${p.plantilla.titulo ?? p.plantilla.clave} v${p.plantilla.version}`)}
          {fila("Registrado", p.preoperacional.selladoAt ? new Date(p.preoperacional.selladoAt).toLocaleString() : "—")}
          {!enLinea && <Alert variant="advertencia">Sin conexión: la generación se encolará y se aplicará al sincronizar.</Alert>}
        </div>
      </Modal>

      {/* Descarte: motivo opcional. */}
      <Modal
        abierto={descartando}
        onClose={() => setDescartando(false)}
        titulo="No requiere mantenimiento"
        pie={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
            <Button variant="secundario" size="sm" onClick={() => setDescartando(false)} disabled={ocupado}>Cancelar</Button>
            <Button variant="primario" size="sm" onClick={alDescartar} disabled={ocupado}>{ocupado ? "Registrando…" : "Confirmar descarte"}</Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>
            El hallazgo se conserva en el histórico y esta acción es reversible. Indica el motivo (opcional).
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Motivo del descarte"
            style={{ width: "100%", padding: "var(--do-sp-2)", borderRadius: "var(--do-radio-md)", border: "1px solid var(--do-borde)", background: "var(--do-fondo)", color: "var(--do-texto)" }}
          />
        </div>
      </Modal>
    </div>
  );
}

/**
 * Acción de un hallazgo, con su PROPIO namespace de la cola offline única
 * (`hallazgo`) apuntando al `/sync` del bucle. No introduce una segunda cola: es
 * la MISMA `ColaSync` con otro namespace/endpoint (igual que preoperacional).
 */
export function AccionHallazgo({ ejecucionId, itemClave, tenant }: { ejecucionId: string; itemClave: string; tenant: string }) {
  return (
    <OfflineProvider tenant={tenant} modulo={HALLAZGO_MODULO_OFFLINE} syncUrl={HALLAZGO_SYNC_URL}>
      <Cuerpo ejecucionId={ejecucionId} itemClave={itemClave} />
    </OfflineProvider>
  );
}
