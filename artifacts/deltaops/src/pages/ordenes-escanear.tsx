/**
 * DGP-009.3 · Escaneo QR con navegación contextual (Platform QR).
 *
 * El QR de plataforma codifica el `codigo` del activo. Al resolverlo (resolvedor
 * del servidor de plataforma; degradación local secundaria) se ofrece navegación
 * contextual: abrir el activo, ver sus órdenes, crear una OT para el activo y ver
 * el historial de órdenes del activo. `platform.qr.resolve` es el comando; aquí
 * consumimos su lectura vía el resolvedor compartido de la plataforma.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Alert,
  Badge,
  Spinner,
  EmptyState,
} from "@workspace/design-system";
import { ShellOrdenes } from "../lib/ordenes/Shell";
import { activosFetch, esFuncionNoDisponible } from "../lib/activos/api";
import { resolverCodigoActivo, type RespuestaResolver } from "../lib/qr/etiqueta";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaEscaneoOrden } from "../lib/forms/plantillas-ordenes";
import { useListado } from "../lib/ordenes/hooks";
import { TarjetaOrden } from "../lib/ordenes/componentes";

export default function OrdenesEscanearPage() {
  return (
    <ShellOrdenes activo="/ordenes/escanear">
      <Escanear />
    </ShellOrdenes>
  );
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
}
function obtenerDetector(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

function Escanear() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [soporta] = useState<boolean>(() => obtenerDetector() !== null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [activoId, setActivoId] = useState<string | null>(null);
  const defManual = useMemo(() => plantillaEscaneoOrden(), []);
  const form = useFormularioDinamico(defManual);
  const manual = String(form.valores.codigo ?? "");

  useEffect(() => () => detener(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function iniciar() {
    setError(null);
    const Ctor = obtenerDetector();
    if (!Ctor) { setError("Este navegador no soporta detección de códigos. Usa la entrada manual."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setEscaneando(true);
      const detector = new Ctor({ formats: ["qr_code"] });
      const bucle = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codigos = await detector.detect(videoRef.current);
          if (codigos.length > 0 && codigos[0]) { detener(); await resolver(codigos[0].rawValue); return; }
        } catch { /* frame no analizable */ }
        rafRef.current = requestAnimationFrame(() => void bucle());
      };
      rafRef.current = requestAnimationFrame(() => void bucle());
    } catch (e) {
      setError(`No se pudo acceder a la cámara: ${(e as Error).message}`);
    }
  }

  function detener() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setEscaneando(false);
  }

  async function resolver(codigo: string) {
    setResolviendo(true);
    setAviso(null);
    setError(null);
    const consultar = async (c: string): Promise<RespuestaResolver | null> => {
      try {
        return await activosFetch<RespuestaResolver>(`/qr/resolver?codigo=${encodeURIComponent(c)}`, { toleraNoEncontrado: true });
      } catch (e) {
        if (esFuncionNoDisponible(e)) return null;
        throw e;
      }
    };
    try {
      const res = await resolverCodigoActivo(codigo, consultar);
      if (res.origen === "no-resuelto") setError(`No se pudo interpretar el código: ${codigo}`);
      else {
        if (res.origen === "local") setAviso("Resolvedor del servidor no disponible; código interpretado localmente (degradación).");
        setActivoId(res.activoId);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResolviendo(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Escanear"
        descripcion="Escanea el QR de un activo para operar sus órdenes de trabajo."
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-1)" }}>
            <Badge variant="neutro">NFC preparado</Badge>
            <Badge variant="neutro">Lector físico preparado</Badge>
          </div>
        }
      />
      {error && <Alert variant="error" titulo={error} />}
      {aviso && <Alert variant="advertencia" titulo={aviso} />}

      {activoId ? (
        <NavegacionContextual activoId={activoId} onReiniciar={() => { setActivoId(null); form.setValores({}); }} />
      ) : (
        <>
          <Section titulo="Cámara">
            <Card>
              <CardContent>
                {!soporta && (
                  <Alert variant="info" titulo="Detección por cámara no disponible">
                    Este navegador no soporta <code>BarcodeDetector</code>. Utiliza la entrada manual.
                  </Alert>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)", alignItems: "flex-start" }}>
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    aria-label="Vista previa de la cámara"
                    style={{ width: "100%", maxWidth: 420, borderRadius: "var(--do-radius-md)", background: "var(--do-surface-2)", display: escaneando ? "block" : "none" }}
                  />
                  <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
                    {!escaneando ? (
                      <Button variant="primario" disabled={!soporta} onClick={() => void iniciar()}>Iniciar cámara</Button>
                    ) : (
                      <Button variant="secundario" onClick={detener}>Detener</Button>
                    )}
                    {resolviendo && <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-1)" }}><Spinner /> Resolviendo…</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Section>

          <Section titulo="Entrada manual">
            <Card>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (form.validarAhora().some((h) => h.severidad !== "advertencia")) return;
                    if (manual.trim()) void resolver(manual.trim());
                  }}
                  style={{ display: "flex", gap: "var(--do-sp-3)", alignItems: "flex-end", flexWrap: "wrap" }}
                >
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <FormularioDinamico definicion={defManual} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
                  </div>
                  <Button type="submit" variant="primario" disabled={!manual.trim() || resolviendo}>Resolver</Button>
                </form>
              </CardContent>
            </Card>
          </Section>
        </>
      )}
    </>
  );
}

/** Menú de navegación contextual tras resolver un activo. */
function NavegacionContextual({ activoId, onReiniciar }: { activoId: string; onReiniciar: () => void }) {
  const [, navegar] = useLocation();
  const { datos, cargando } = useListado({ activoPrincipalId: activoId, limit: 100 });
  const ordenes = datos ?? [];
  const abiertas = ordenes.filter((o) => o.estado !== "CERRADA" && o.estado !== "CANCELADA");

  return (
    <Section
      titulo="Activo resuelto"
      acciones={<Button variant="fantasma" size="sm" onClick={onReiniciar}>Escanear otro</Button>}
    >
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>Activo</div>
              <code>{activoId}</code>
            </div>
            <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
              <Button variant="secundario" size="sm" onClick={() => navegar(`/activos/${activoId}`)}>Abrir activo</Button>
              <Button variant="primario" size="sm" onClick={() => navegar("/ordenes/nueva")}>Crear orden</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <strong>Órdenes del activo</strong>
          {cargando ? (
            <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-4)" }}><Spinner /></div>
          ) : ordenes.length === 0 ? (
            <EmptyState titulo="Sin órdenes" descripcion="Este activo no tiene órdenes registradas." />
          ) : (
            <>
              <p style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
                {abiertas.length} abiertas · {ordenes.length} en total (historial)
              </p>
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", marginTop: "var(--do-sp-2)" }}>
                {ordenes.map((o) => <TarjetaOrden key={o.id} orden={o} />)}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}
