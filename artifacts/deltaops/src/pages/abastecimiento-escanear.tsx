/**
 * DGP-013.1 · Escaneo QR de Abastecimiento con navegación contextual (Platform QR).
 *
 * El QR de plataforma codifica el código de la RECEPCIÓN (`abr:rec:<id>`) o de la
 * OC (`abr:oc:<id>`). Al resolverlo (resolvedor del servidor de plataforma;
 * degradación local secundaria) se navega al destino: la recepción se abre en la
 * ficha de SU orden de compra (pestaña recepciones); la OC en su ficha. Misma UX
 * que Activos/Órdenes/Inventario. No se crea un QR propio: se ancla a
 * `platform.qr`.
 */
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Button, Alert, Badge, Spinner,
} from "@workspace/design-system";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { abastecimientoFetch, esFuncionNoDisponible } from "../lib/abastecimiento/api";
import {
  resolverCodigoAbastecimiento, destinoResolucion, type RespuestaResolucionServidor,
} from "../lib/abastecimiento/EtiquetaAbastecimiento";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaEscaneoAbastecimiento } from "../lib/forms/plantillas-abastecimiento";

export default function AbastecimientoEscanearPage() {
  return (
    <ShellAbastecimiento activo="/abastecimiento/escanear">
      <Escanear />
    </ShellAbastecimiento>
  );
}

interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
interface BarcodeDetectorCtor { new (opts?: { formats?: string[] }): BarcodeDetectorLike }
function obtenerDetector(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

export function Escanear() {
  const [, navegar] = useLocation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [soporta] = useState<boolean>(() => obtenerDetector() !== null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState(false);

  const defManual = useMemo(() => plantillaEscaneoAbastecimiento(), []);
  const form = useFormularioDinamico(defManual);
  const manual = String(form.valores.codigo ?? "");

  useEffect(() => () => detener(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Consulta el resolvedor de plataforma; null si la función no está montada. */
  async function consultar(c: string): Promise<RespuestaResolucionServidor | null> {
    try {
      return await abastecimientoFetch<RespuestaResolucionServidor>(`/qr/resolver?codigo=${encodeURIComponent(c)}`, { toleraNoEncontrado: true });
    } catch (e) {
      if (esFuncionNoDisponible(e)) return null;
      throw e;
    }
  }

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
    setResolviendo(true); setAviso(null); setError(null);
    try {
      const res = await resolverCodigoAbastecimiento(codigo, consultar);
      if (res.origen === "no-resuelto") { setError(`No se pudo interpretar el código: ${codigo}`); return; }
      if (res.origen === "local") setAviso("Resolvedor del servidor no disponible; código interpretado localmente (degradación).");
      const destino = destinoResolucion(res, () => null);
      if (!destino) {
        setError("Recepción resuelta pero no se conoce su orden de compra sin el resolvedor del servidor. Abre la OC y su pestaña de recepciones.");
        return;
      }
      navegar(destino);
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
        descripcion="Un solo escaneo: abre la recepción o la orden de compra y su pestaña de recepciones."
        acciones={<div style={{ display: "flex", gap: "var(--do-sp-1)" }}><Badge variant="neutro">NFC preparado</Badge><Badge variant="neutro">Lector físico preparado</Badge></div>}
      />
      {error && <Alert variant="error" titulo={error} />}
      {aviso && <Alert variant="advertencia" titulo={aviso} />}

      <Section titulo="Cámara">
        <Card><CardContent>
          {!soporta && <Alert variant="info" titulo="Detección por cámara no disponible">Este navegador no soporta <code>BarcodeDetector</code>. Utiliza la entrada manual.</Alert>}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)", alignItems: "flex-start" }}>
            <video ref={videoRef} muted playsInline aria-label="Vista previa de la cámara"
              style={{ width: "100%", maxWidth: 420, borderRadius: "var(--do-radius-md)", background: "var(--do-surface-2)", display: escaneando ? "block" : "none" }} />
            <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
              {!escaneando ? <Button variant="primario" disabled={!soporta} onClick={() => void iniciar()}>Iniciar cámara</Button>
                : <Button variant="secundario" onClick={detener}>Detener</Button>}
              {resolviendo && <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-1)" }}><Spinner /> Resolviendo…</span>}
            </div>
          </div>
        </CardContent></Card>
      </Section>
      <Section titulo="Entrada manual">
        <Card><CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); if (form.validarAhora().some((h) => h.severidad !== "advertencia")) return; if (manual.trim()) void resolver(manual.trim()); }}
            style={{ display: "flex", gap: "var(--do-sp-3)", alignItems: "flex-end", flexWrap: "wrap" }}
          >
            <div style={{ flex: 1, minWidth: 240 }}><FormularioDinamico definicion={defManual} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} /></div>
            <Button type="submit" variant="primario" disabled={!manual.trim() || resolviendo}>Resolver</Button>
          </form>
        </CardContent></Card>
      </Section>
    </>
  );
}
