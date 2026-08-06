/**
 * DGP-011.3 · Escaneo QR de inventario con navegación contextual (Platform QR).
 *
 * El QR de plataforma codifica el `codigo` del item (SKU). Al resolverlo
 * (resolvedor del servidor de plataforma; degradación local secundaria vía
 * `inv:<sku>` / UUID / URL) se ofrece navegación contextual al item: abrir la
 * ficha, ver existencias/movimientos, registrar movimiento o crear reserva.
 * Integra el ecosistema de escaneo unificado (misma UX que Activos/Órdenes).
 */
import React, { useMemo, useRef, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
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
import { ShellInventario } from "../lib/inventario/Shell";
import { inventarioFetch, esFuncionNoDisponible } from "../lib/inventario/api";
import { useItems, useItem } from "../lib/inventario/hooks";
import { BadgeEstadoItem } from "../lib/inventario/componentes";
import { resolverCodigoItem } from "../lib/inventario/EtiquetaItem";
import { urlItem, urlItemTab, urlMovimientos } from "../lib/inventario/deep-links";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaEscaneoInventario } from "../lib/forms/plantillas-inventario";

export default function InventarioEscanearPage() {
  return (
    <ShellInventario activo="/inventario/escanear">
      <Escanear />
    </ShellInventario>
  );
}

interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
interface BarcodeDetectorCtor { new (opts?: { formats?: string[] }): BarcodeDetectorLike }
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
  const [itemId, setItemId] = useState<string | null>(null);

  const items = useItems({ limit: 500 });
  const defManual = useMemo(() => plantillaEscaneoInventario(), []);
  const form = useFormularioDinamico(defManual);
  const manual = String(form.valores.codigo ?? "");

  useEffect(() => () => detener(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function buscarPorSku(sku: string): string | null {
    const hit = (items.datos ?? []).find((i) => i.sku?.toLowerCase() === sku.toLowerCase());
    return hit?.id ?? null;
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
    const consultar = async (c: string): Promise<{ id?: string; itemId?: string } | null> => {
      try {
        return await inventarioFetch<{ id?: string; itemId?: string }>(`/qr/resolver?codigo=${encodeURIComponent(c)}`, { toleraNoEncontrado: true });
      } catch (e) {
        if (esFuncionNoDisponible(e)) return null;
        throw e;
      }
    };
    try {
      const res = await resolverCodigoItem(codigo, consultar, buscarPorSku);
      if (res.origen === "no-resuelto") setError(`No se pudo interpretar el código: ${codigo}`);
      else {
        if (res.origen === "local") setAviso("Resolvedor del servidor no disponible; código interpretado localmente (degradación).");
        setItemId(res.itemId);
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
        descripcion="Un solo escaneo: abre el item, sus existencias y movimientos, registra movimientos o crea reservas."
        acciones={<div style={{ display: "flex", gap: "var(--do-sp-1)" }}><Badge variant="neutro">NFC preparado</Badge><Badge variant="neutro">Lector físico preparado</Badge></div>}
      />
      {error && <Alert variant="error" titulo={error} />}
      {aviso && <Alert variant="advertencia" titulo={aviso} />}

      {itemId ? (
        <NavegacionContextual itemId={itemId} onReiniciar={() => { setItemId(null); form.setValores({}); }} />
      ) : (
        <>
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
      )}
    </>
  );
}

/** Menú de navegación contextual tras resolver un item (flujo QR unificado). */
function NavegacionContextual({ itemId, onReiniciar }: { itemId: string; onReiniciar: () => void }) {
  const { datos: item, cargando } = useItem(itemId);
  return (
    <Section titulo="Item resuelto" acciones={<Button variant="fantasma" size="sm" onClick={onReiniciar}>Escanear otro</Button>}>
      <Card>
        <CardHeader>
          {cargando ? <Spinner /> : item ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)", alignItems: "center" }}>
              <div><strong>{item.nombre}</strong> <span style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{item.sku}</span></div>
              <BadgeEstadoItem estado={item.estado} />
            </div>
          ) : <EmptyState titulo="Item no encontrado" descripcion={`No existe el item ${itemId}.`} />}
        </CardHeader>
        <CardContent>
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <Link href={urlItem(itemId)}><Button variant="primario" size="sm">Abrir ficha</Button></Link>
            <Link href={urlItemTab(itemId, "existencias")}><Button variant="secundario" size="sm">Existencias</Button></Link>
            <Link href={urlItemTab(itemId, "movimientos")}><Button variant="secundario" size="sm">Registrar movimiento</Button></Link>
            <Link href={urlItemTab(itemId, "reservas")}><Button variant="secundario" size="sm">Crear reserva</Button></Link>
            <Link href={urlMovimientos(itemId)}><Button variant="fantasma" size="sm">Ver ledger</Button></Link>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}
