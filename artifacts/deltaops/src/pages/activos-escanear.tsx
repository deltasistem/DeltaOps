/**
 * DGP-008.3 · Escaneo de códigos QR.
 * Usa BarcodeDetector si el navegador lo soporta (cámara), con reserva de
 * entrada manual. Al detectar un código, resuelve vía GET /qr/resolver?codigo=
 * (con degradación si no existe: intenta interpretar el código como URL/id de
 * la ficha). NFC y lector físico marcados como «preparado».
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  Button,
  Alert,
  Badge,
  Spinner,
} from "@workspace/design-system";
import { ShellActivos } from "../lib/activos/Shell";
import { activosFetch, esFuncionNoDisponible } from "../lib/activos/api";
import { resolverCodigoActivo, type RespuestaResolver } from "../lib/qr/etiqueta";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaEscaneoManual } from "../lib/forms/plantillas";

export default function ActivosEscanearPage() {
  return (
    <ShellActivos activo="/activos/escanear">
      <Escanear />
    </ShellActivos>
  );
}

// BarcodeDetector no está tipado en lib.dom; declaración mínima local.
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function obtenerDetector(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

function Escanear() {
  const [, navegar] = useLocation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [soporta] = useState<boolean>(() => obtenerDetector() !== null);
  const [error, setError] = useState<string | null>(null);
  const defManual = useMemo(() => plantillaEscaneoManual(), []);
  const form = useFormularioDinamico(defManual);
  const [resolviendo, setResolviendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const manual = String(form.valores.codigo ?? "");

  useEffect(() => {
    return () => detener();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciar() {
    setError(null);
    const Ctor = obtenerDetector();
    if (!Ctor) { setError("Este navegador no soporta detección de códigos. Usa la entrada manual."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setEscaneando(true);
      const detector = new Ctor({ formats: ["qr_code"] });
      const bucle = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codigos = await detector.detect(videoRef.current);
          if (codigos.length > 0 && codigos[0]) {
            detener();
            await resolver(codigos[0].rawValue);
            return;
          }
        } catch {
          /* frame no analizable; continúa */
        }
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
    // Resolución con el resolvedor del servidor (fuente primaria) y, sólo como
    // degradación secundaria, interpretación local del contenido.
    const consultar = async (c: string): Promise<RespuestaResolver | null> => {
      try {
        return await activosFetch<RespuestaResolver>(
          `/qr/resolver?codigo=${encodeURIComponent(c)}`,
          { toleraNoEncontrado: true },
        );
      } catch (e) {
        if (esFuncionNoDisponible(e)) return null;
        throw e;
      }
    };
    try {
      const res = await resolverCodigoActivo(codigo, consultar);
      if (res.origen === "servidor") {
        navegar(`/activos/${res.activoId}`);
      } else if (res.origen === "local") {
        setAviso("Resolvedor del servidor no disponible; código interpretado localmente (degradación).");
        navegar(`/activos/${res.activoId}`);
      } else {
        setError(`No se pudo interpretar el código: ${codigo}`);
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
        descripcion="Escanea un código QR de activo con la cámara o introdúcelo manualmente."
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-1)" }}>
            <Badge variant="neutro">NFC preparado</Badge>
            <Badge variant="neutro">Lector físico preparado</Badge>
          </div>
        }
      />

      {error && <Alert variant="error" titulo={error} />}
      {aviso && <Alert variant="advertencia" titulo={aviso} />}

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
  );
}
