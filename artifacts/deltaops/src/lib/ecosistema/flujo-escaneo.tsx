/**
 * DGP-010 · Flujo QR unificado (punto 13).
 *
 * Desde un ÚNICO escaneo (el QR de plataforma codifica el `codigo` del activo,
 * resuelto por `platform.qr.resolve`), esta superficie ofrece TODAS las
 * capacidades contextuales sin cambiar de flujo:
 *  - Abrir la Vista 360° del activo, su historial y sus órdenes.
 *  - Crear una OT prellenada para el activo (deep link).
 *  - Registrar una LECTURA DE MEDIDOR (horómetro/odómetro) — capacidad de Activos.
 *  - Registrar una EVIDENCIA (foto) — capacidad de Activos (Attachment Service).
 *
 * Todo por composición de mutaciones existentes; sin API nueva. Las capturas
 * encolan la ENTRADA COMPLETA del comando (Offline First) salvo la evidencia,
 * que requiere el registro online del adjunto de plataforma.
 */
import React, { useState } from "react";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Modal,
  Alert,
  Badge,
  Spinner,
  useToast,
} from "@workspace/design-system";
import { useActivoResumen } from "./hooks";
import { urlActivo, urlActivoTab, urlOrdenesDeActivo, urlNuevaOrden } from "./deep-links";
import { useOffline } from "../offline/contexto";
import { registrarMedidor, adjuntar } from "../activos/mutaciones";
import { CapturaFoto, CapturaGeolocalizacion, useGeolocalizacion, type ArchivoCampo } from "./campo";
import { sha256Hex } from "../activos/hash";

export function MenuAccionesEscaneo({ activoId }: { activoId: string }) {
  const { datos: activo, cargando } = useActivoResumen(activoId);
  const [modal, setModal] = useState<null | "medidor" | "evidencia">(null);
  const etiqueta = activo?.nombre ?? activoId;

  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>Activo</div>
            <strong>{etiqueta}</strong> {activo?.codigoEmpresarial && <code style={{ fontSize: "var(--do-text-xs)" }}>{activo.codigoEmpresarial}</code>}
          </div>
          {cargando && <Spinner size="sm" />}
        </div>
      </CardHeader>
      <CardContent>
        <div role="group" aria-label="Acciones del activo escaneado" style={{ display: "grid", gap: "var(--do-sp-2)", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <Link href={urlActivo(activoId)}><Button variant="secundario" size="lg" style={{ width: "100%", minHeight: "var(--do-sp-12)" }}>Abrir activo</Button></Link>
          <Link href={urlActivoTab(activoId, "historial")}><Button variant="secundario" size="lg" style={{ width: "100%", minHeight: "var(--do-sp-12)" }}>Ver historial</Button></Link>
          <Link href={urlOrdenesDeActivo(activoId)}><Button variant="secundario" size="lg" style={{ width: "100%", minHeight: "var(--do-sp-12)" }}>Ver órdenes</Button></Link>
          <Link href={urlNuevaOrden({ activo: activoId, activoEtiqueta: etiqueta })}><Button variant="primario" size="lg" style={{ width: "100%", minHeight: "var(--do-sp-12)" }}>Crear orden</Button></Link>
          <Button variant="secundario" size="lg" style={{ minHeight: "var(--do-sp-12)" }} onClick={() => setModal("medidor")}>Registrar lectura</Button>
          <Button variant="secundario" size="lg" style={{ minHeight: "var(--do-sp-12)" }} onClick={() => setModal("evidencia")}>Registrar evidencia</Button>
        </div>
      </CardContent>

      {modal === "medidor" && (
        <ModalMedidor activoId={activoId} version={activo?.version ?? 0} onCerrar={() => setModal(null)} />
      )}
      {modal === "evidencia" && (
        <ModalEvidencia activoId={activoId} onCerrar={() => setModal(null)} />
      )}
    </Card>
  );
}

function ModalMedidor({ activoId, version, onCerrar }: { activoId: string; version: number; onCerrar: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const [clase, setClase] = useState<"horometro" | "odometro">("horometro");
  const [valor, setValor] = useState("");
  const [unidad, setUnidad] = useState("h");
  const [fecha, setFecha] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) { setErr("Indica un valor de lectura válido."); return; }
    if (!fecha.trim()) { setErr("Indica la fecha de la lectura."); return; }
    if (!unidad.trim()) { setErr("Indica la unidad."); return; }
    setGuardando(true);
    setErr(null);
    const r = await registrarMedidor(cola, activoId, version, clase, { valor: n, unidad: unidad.trim(), fecha: fecha.trim() });
    setGuardando(false);
    if (r.error) { setErr(r.error.message); return; }
    toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "Lectura en cola" : "Lectura registrada" });
    onCerrar();
  }

  const campo = { padding: "var(--do-sp-2)", borderRadius: "var(--do-radius-sm)", border: "1px solid var(--do-borde)", minHeight: "var(--do-sp-10)" } as const;

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo="Registrar lectura de medidor"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Registrar</Button></>}
    >
      {err && <Alert variant="error" titulo={err} />}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
        <div role="group" aria-label="Tipo de medidor" style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          <Button size="sm" variant={clase === "horometro" ? "primario" : "fantasma"} aria-pressed={clase === "horometro"} onClick={() => { setClase("horometro"); setUnidad("h"); }}>Horómetro</Button>
          <Button size="sm" variant={clase === "odometro" ? "primario" : "fantasma"} aria-pressed={clase === "odometro"} onClick={() => { setClase("odometro"); setUnidad("km"); }}>Odómetro</Button>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
          <span style={{ fontSize: "var(--do-text-sm)" }}>Valor</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} style={campo} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
          <span style={{ fontSize: "var(--do-text-sm)" }}>Unidad</span>
          <input value={unidad} onChange={(e) => setUnidad(e.target.value)} style={campo} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
          <span style={{ fontSize: "var(--do-text-sm)" }}>Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={campo} />
        </label>
      </div>
    </Modal>
  );
}

function ModalEvidencia({ activoId, onCerrar }: { activoId: string; onCerrar: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const geo = useGeolocalizacion();
  const [archivo, setArchivo] = useState<ArchivoCampo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!archivo) { setErr("Captura una foto primero."); return; }
    setGuardando(true);
    setErr(null);
    try {
      const buffer = await archivo.blob.arrayBuffer();
      const hashSha256 = await sha256Hex(buffer);
      const r = await adjuntar(cola, activoId, {
        categoria: "fotografia",
        nombreArchivo: archivo.nombreArchivo,
        mimeType: archivo.mimeType,
        tamanoBytes: archivo.tamanoBytes,
        hashSha256,
      });
      if (r.error) { setErr(r.error.message); return; }
      toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "Evidencia en cola" : "Evidencia registrada" });
      onCerrar();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo="Registrar evidencia"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} disabled={!archivo} onClick={() => void guardar()}>Registrar</Button></>}
    >
      {err && <Alert variant="error" titulo={err} />}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
        <CapturaFoto onCapturar={setArchivo} />
        {archivo && <Badge variant="exito">{archivo.nombreArchivo} · {(archivo.tamanoBytes / 1024).toFixed(0)} KB</Badge>}
        <CapturaGeolocalizacion geo={geo} />
      </div>
    </Modal>
  );
}
