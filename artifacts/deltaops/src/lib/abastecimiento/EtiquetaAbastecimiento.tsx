/**
 * DGP-013.1 · Etiquetas QR de Abastecimiento (ancladas a `platform.qr`).
 *
 * Mandato: «Etiquetas para recepción. Etiquetas para almacenamiento.» Reutiliza
 * el MISMO componente QR (SVG) y la utilidad de impresión de plataforma
 * (`imprimirEtiqueta`, DGP-008.3) que Inventario — no se crea ningún QR propio.
 *
 *  - RECEPCIÓN: el QR codifica el código de plataforma de la recepción
 *    (`abr:rec:<id>`), que el flujo de escaneo unificado resuelve para navegar a
 *    la recepción (ficha de la OC).
 *  - ALMACENAMIENTO: para etiquetar la ubicación de guardado se REUTILIZA la
 *    etiqueta del item de inventario ya existente (`EtiquetaItem`, `inv:<sku>`),
 *    anclada al QR de plataforma del item. Nunca se fabrican datos.
 *
 * El resolvedor es PURO y testeable (patrón `resolverCodigoItem`): prioriza el
 * resolvedor del servidor de plataforma y degrada a interpretación local.
 */
import React from "react";
import { Card, CardContent, Button, Badge } from "@workspace/design-system";
import { QrCode, imprimirEtiqueta } from "../qr/QrCode";

/* Reexporta la etiqueta de ALMACENAMIENTO de plataforma (item/bodega de
 * inventario). Es la superficie canónica para etiquetar dónde se guarda. */
export { EtiquetaItem, valorQrItem, resolverCodigoItem } from "../inventario/EtiquetaItem";
export type { EtiquetaItemProps, ResultadoResolucionItem } from "../inventario/EtiquetaItem";

/* --------------------------- Valores de QR ------------------------------ */

/** Valor codificado en el QR de una recepción (código de plataforma). */
export function valorQrRecepcion(recepcionId: string): string {
  return `abr:rec:${recepcionId}`;
}
/** Valor codificado en el QR de una orden de compra (código de plataforma). */
export function valorQrOrdenCompra(ocId: string): string {
  return `abr:oc:${ocId}`;
}

/* --------------------------- Resolvedor puro ---------------------------- */

export type ResultadoResolucionAbastecimiento =
  | { origen: "servidor"; tipo: "recepcion"; recepcionId: string; ordenCompraId?: string }
  | { origen: "servidor"; tipo: "orden-compra"; ordenCompraId: string }
  | { origen: "local"; tipo: "recepcion"; recepcionId: string; ordenCompraId?: string }
  | { origen: "local"; tipo: "orden-compra"; ordenCompraId: string }
  | { origen: "no-resuelto"; codigo: string };

/** Respuesta tolerante del resolvedor de plataforma. */
export interface RespuestaResolucionServidor {
  tipo?: string;
  recepcionId?: string;
  ordenCompraId?: string;
  ordenId?: string;
  id?: string;
}

/**
 * Resuelve el contenido de un QR de Abastecimiento a un destino navegable.
 * Prioriza el resolvedor del servidor de plataforma; si no está disponible,
 * degrada a la interpretación local del prefijo `abr:rec:<id>` / `abr:oc:<id>`,
 * de una URL de ficha de OC, o de un UUID directo (tratado como recepción, que
 * es el caso de uso del mandato). Puro y testeable.
 */
export async function resolverCodigoAbastecimiento(
  codigo: string,
  consultarServidor: (codigo: string) => Promise<RespuestaResolucionServidor | null>,
): Promise<ResultadoResolucionAbastecimiento> {
  const r = await consultarServidor(codigo);
  if (r) {
    if (r.tipo === "recepcion" || r.recepcionId) {
      const recepcionId = r.recepcionId ?? r.id;
      if (recepcionId) return { origen: "servidor", tipo: "recepcion", recepcionId, ordenCompraId: r.ordenCompraId };
    }
    const ocId = r.tipo === "orden-compra" ? (r.ordenCompraId ?? r.ordenId ?? r.id) : (r.ordenCompraId ?? r.ordenId);
    if (ocId) return { origen: "servidor", tipo: "orden-compra", ordenCompraId: ocId };
  }

  const rec = codigo.match(/^abr:rec:(.+)$/);
  if (rec && rec[1]) return { origen: "local", tipo: "recepcion", recepcionId: rec[1].trim() };
  const oc = codigo.match(/^abr:oc:(.+)$/);
  if (oc && oc[1]) return { origen: "local", tipo: "orden-compra", ordenCompraId: oc[1].trim() };
  const url = codigo.match(/ordenes-compra\/([^/?#]+)/);
  if (url && url[1]) return { origen: "local", tipo: "orden-compra", ordenCompraId: url[1] };
  const uuid = codigo.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (uuid) return { origen: "local", tipo: "recepcion", recepcionId: codigo.trim() };
  return { origen: "no-resuelto", codigo };
}

/**
 * Destino de navegación de una resolución de Abastecimiento. Una recepción se
 * abre en la ficha de SU orden de compra (pestaña recepciones); una OC en su
 * ficha. Devuelve `null` si no se resolvió.
 */
export function destinoResolucion(
  res: ResultadoResolucionAbastecimiento,
  buscarOcDeRecepcion: (recepcionId: string) => string | null,
): string | null {
  if (res.origen === "no-resuelto") return null;
  if (res.tipo === "orden-compra") return `/abastecimiento/ordenes-compra/${encodeURIComponent(res.ordenCompraId)}?tab=recepciones`;
  const ocId = res.ordenCompraId ?? buscarOcDeRecepcion(res.recepcionId) ?? undefined;
  return ocId ? `/abastecimiento/ordenes-compra/${encodeURIComponent(ocId)}?tab=recepciones` : null;
}

/* ------------------------- Etiqueta de recepción ------------------------ */

export interface EtiquetaRecepcionProps {
  recepcionId: string;
  ordenCompraId: string;
  ordenCodigo?: string;
  materializada?: boolean;
}

/**
 * Etiqueta QR imprimible de una RECEPCIÓN. El QR codifica el código de
 * plataforma de la recepción, que el flujo de escaneo unificado resuelve para
 * navegar a la recepción. Misma UX que `EtiquetaItem`.
 */
export function EtiquetaRecepcion({ recepcionId, ordenCompraId, ordenCodigo, materializada }: EtiquetaRecepcionProps) {
  const valor = valorQrRecepcion(recepcionId);
  const nombre = `Recepción ${recepcionId}`;
  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", gap: "var(--do-sp-4)", alignItems: "center", flexWrap: "wrap" }}>
          <QrCode valor={valor} tamano={180} titulo={recepcionId} />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
            <div>
              <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>Recepción</div>
              <strong>{nombre}</strong>
              <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>OC: {ordenCodigo ?? ordenCompraId}</div>
              {materializada && <Badge variant="exito">Materializada</Badge>}
            </div>
            <Button
              variant="primario"
              size="sm"
              data-testid={`imprimir-etiqueta-recepcion-${recepcionId}`}
              onClick={() => imprimirEtiqueta({ valor, codigo: recepcionId, nombre })}
            >
              Imprimir etiqueta
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
