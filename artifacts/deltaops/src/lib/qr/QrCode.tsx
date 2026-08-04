/**
 * DGP-008.3 · Componente QR (SVG) estilizado con tokens del DS.
 */
import React, { useMemo } from "react";
import { codificarQr, qrASvg } from "./encoder";

export interface QrCodeProps {
  valor: string;
  tamano?: number;
  titulo?: string;
}

export function QrCode({ valor, tamano = 200, titulo }: QrCodeProps) {
  const svg = useMemo(() => {
    try {
      const matriz = codificarQr(valor);
      return qrASvg(matriz, {
        tamano,
        colorFondo: "var(--do-surface)",
        colorModulo: "var(--do-texto)",
      });
    } catch (e) {
      return null;
    }
  }, [valor, tamano]);

  if (!svg) {
    return (
      <div role="img" aria-label="Código QR no disponible" style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
        Contenido demasiado largo para generar el QR.
      </div>
    );
  }
  return (
    <figure style={{ margin: 0, display: "inline-flex", flexDirection: "column", gap: "var(--do-sp-2)", alignItems: "center" }}>
      <div aria-label={titulo ?? "Código QR"} dangerouslySetInnerHTML={{ __html: svg }} />
      {titulo && <figcaption style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{titulo}</figcaption>}
    </figure>
  );
}

/** Abre una ventana de impresión con la etiqueta (QR + código + nombre). */
export function imprimirEtiqueta(args: { valor: string; codigo: string; nombre: string }): void {
  let svg = "";
  try {
    svg = qrASvg(codificarQr(args.valor), { tamano: 240, colorFondo: "#ffffff", colorModulo: "#000000" });
  } catch {
    svg = "<p>QR no disponible</p>";
  }
  const ventana = window.open("", "_blank", "width=420,height=560");
  if (!ventana) return;
  ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiqueta ${args.codigo}</title>
  <style>
    @media print { @page { margin: 8mm; } }
    body { font-family: sans-serif; text-align: center; padding: 16px; }
    .codigo { font-family: monospace; font-size: 14px; margin-top: 8px; }
    .nombre { font-weight: bold; font-size: 16px; margin-top: 4px; }
    button { margin-top: 16px; }
  </style></head><body>
  <div>${svg}</div>
  <div class="codigo">${args.codigo}</div>
  <div class="nombre">${args.nombre}</div>
  <button onclick="window.print()">Imprimir</button>
  </body></html>`);
  ventana.document.close();
}
