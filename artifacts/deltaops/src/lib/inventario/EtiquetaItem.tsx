/**
 * DGP-011.3 · Etiqueta QR imprimible de un item de inventario.
 *
 * Reutiliza el componente QR (SVG) y la utilidad de impresión de plataforma
 * (`imprimirEtiqueta`) del módulo QR existente (DGP-008.3). El QR codifica el
 * `codigo` de plataforma del item (SKU), que el flujo de escaneo unificado
 * resuelve vía `platform.qr.resolve` para navegar automáticamente a la ficha.
 */
import React from "react";
import { Card, CardContent, Button } from "@workspace/design-system";
import { QrCode, imprimirEtiqueta } from "../qr/QrCode";

export interface EtiquetaItemProps {
  itemId: string;
  sku: string;
  nombre: string;
}

/** Valor codificado en el QR: el código de plataforma del item (SKU). */
export function valorQrItem(sku: string): string {
  return `inv:${sku}`;
}

export type ResultadoResolucionItem =
  | { origen: "servidor"; itemId: string }
  | { origen: "local"; itemId: string }
  | { origen: "no-resuelto"; codigo: string };

/**
 * Resuelve el contenido de un QR de inventario a un `itemId`. Prioriza el
 * resolvedor del servidor de plataforma; si no está disponible, degrada a la
 * interpretación local: UUID directo, URL `…/inventario/:id`, o el prefijo
 * `inv:<sku>` resuelto por el buscador de SKU inyectado. Puro y testeable.
 */
export async function resolverCodigoItem(
  codigo: string,
  consultarServidor: (codigo: string) => Promise<{ id?: string; itemId?: string } | null>,
  buscarPorSku: (sku: string) => string | null,
): Promise<ResultadoResolucionItem> {
  const r = await consultarServidor(codigo);
  const idServidor = r?.itemId ?? r?.id;
  if (idServidor) return { origen: "servidor", itemId: idServidor };
  const uuid = codigo.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return { origen: "local", itemId: uuid[0] };
  const url = codigo.match(/inventario\/([^/?#]+)/);
  if (url && url[1]) return { origen: "local", itemId: url[1] };
  const inv = codigo.match(/^inv:(.+)$/);
  const sku = inv ? inv[1]!.trim() : codigo.trim();
  const porSku = buscarPorSku(sku);
  if (porSku) return { origen: "local", itemId: porSku };
  return { origen: "no-resuelto", codigo };
}

export function EtiquetaItem({ itemId, sku, nombre }: EtiquetaItemProps) {
  const valor = valorQrItem(sku);
  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", gap: "var(--do-sp-4)", alignItems: "center", flexWrap: "wrap" }}>
          <QrCode valor={valor} tamano={180} titulo={sku} />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
            <div>
              <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>Item</div>
              <strong>{nombre}</strong>
              <div style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-sm)" }}>{sku}</div>
              <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>ID: {itemId}</div>
            </div>
            <Button
              variant="primario"
              size="sm"
              onClick={() => imprimirEtiqueta({ valor, codigo: sku, nombre })}
            >
              Imprimir etiqueta
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
