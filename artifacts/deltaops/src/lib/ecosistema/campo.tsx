/**
 * DGP-010 · Experiencia móvil de campo (punto 9).
 *
 * Piezas reutilizables para la ejecución del técnico en terreno, con objetivos
 * táctiles amplios (≥48px, tokens `--do-sp-*`), acciones a una mano (barra
 * inferior fija en móvil) y captura de foto, firma y geolocalización. Construido
 * 100% sobre el Design System y tokens `--do-*`. Sin lógica de negocio: entrega
 * metadatos al llamador (que decide encolar/registrar según el módulo).
 */
import React, { useCallback, useRef, useState } from "react";
import { Button, Card, CardContent, CardHeader, Alert } from "@workspace/design-system";

/** Metadatos de un archivo capturado (foto/firma). Referencia, no binario remoto. */
export interface ArchivoCampo {
  readonly nombreArchivo: string;
  readonly mimeType: string;
  readonly tamanoBytes: number;
  /** URL local (objeto) sólo para previsualización en el propio dispositivo. */
  readonly previewUrl: string;
  readonly blob: Blob;
}

/** Barra de acciones inferior fija (móvil) con objetivos táctiles grandes. */
export function BarraAccionesCampo({ children, etiqueta = "Acciones rápidas" }: { children: React.ReactNode; etiqueta?: string }) {
  return (
    <div
      role="toolbar"
      aria-label={etiqueta}
      data-campo-barra
      style={{
        position: "sticky",
        bottom: 0,
        display: "flex",
        gap: "var(--do-sp-2)",
        padding: "var(--do-sp-3)",
        background: "var(--do-surface)",
        borderTop: "1px solid var(--do-borde)",
        boxShadow: "var(--do-shadow-sm)",
        flexWrap: "wrap",
        justifyContent: "center",
        zIndex: 5,
      }}
    >
      {children}
    </div>
  );
}

/** Botón de acción rápida grande (una mano) — envoltura semántica del DS. */
export function AccionRapida({ children, onClick, variant = "secundario", disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primario" | "secundario" | "fantasma" | "peligro";
  disabled?: boolean;
}) {
  return (
    <Button
      variant={variant}
      size="lg"
      onClick={onClick}
      disabled={disabled}
      style={{ minHeight: "var(--do-sp-12)", minWidth: "var(--do-sp-16)", flex: "1 1 auto" }}
    >
      {children}
    </Button>
  );
}

/** Captura de foto desde la cámara (o galería) con previsualización local. */
export function CapturaFoto({ onCapturar, etiqueta = "Tomar foto" }: { onCapturar: (a: ArchivoCampo) => void; etiqueta?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function alSeleccionar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    onCapturar({ nombreArchivo: file.name, mimeType: file.type, tamanoBytes: file.size, previewUrl, blob: file });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={alSeleccionar}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      />
      <Button variant="secundario" size="lg" onClick={() => inputRef.current?.click()} style={{ minHeight: "var(--do-sp-12)" }}>
        📷 {etiqueta}
      </Button>
      {preview && (
        <img src={preview} alt="Previsualización de la foto capturada" style={{ maxWidth: 240, borderRadius: "var(--do-radius-md)", border: "1px solid var(--do-borde)" }} />
      )}
    </div>
  );
}

/** Panel de firma sobre canvas (dedo/lápiz). Exporta la firma como PNG. */
export function CapturaFirma({ onFirmar, etiqueta = "Firma del técnico" }: { onFirmar: (a: ArchivoCampo) => void; etiqueta?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  const puntoDesdeEvento = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  function iniciar(e: React.PointerEvent<HTMLCanvasElement>) {
    dibujando.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = puntoDesdeEvento(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = puntoDesdeEvento(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setTieneTrazo(true);
  }
  function terminar() { dibujando.current = false; }

  function limpiar() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setTieneTrazo(false);
  }

  function guardar() {
    const c = canvasRef.current!;
    c.toBlob((blob) => {
      if (!blob) return;
      const nombreArchivo = `firma-${Date.now()}.png`;
      onFirmar({ nombreArchivo, mimeType: "image/png", tamanoBytes: blob.size, previewUrl: URL.createObjectURL(blob), blob });
    }, "image/png");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
      <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>{etiqueta}</span>
      <canvas
        ref={canvasRef}
        width={320}
        height={140}
        role="img"
        aria-label="Área de firma"
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
        style={{ border: "1px dashed var(--do-borde-fuerte)", borderRadius: "var(--do-radius-md)", touchAction: "none", background: "var(--do-surface)", maxWidth: "100%" }}
      />
      <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
        <Button variant="fantasma" size="sm" onClick={limpiar}>Limpiar</Button>
        <Button variant="secundario" size="sm" onClick={guardar} disabled={!tieneTrazo}>Guardar firma</Button>
      </div>
    </div>
  );
}

export interface Geoposicion {
  readonly latitud: number;
  readonly longitud: number;
  readonly precision: number;
  readonly capturadaAt: string;
}

/** Estado del capturador de geolocalización. */
export interface EstadoGeo {
  readonly posicion: Geoposicion | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly capturar: () => void;
}

/**
 * Hook de geolocalización sobre `navigator.geolocation`. `ahoraIso` inyectable
 * para pruebas deterministas (evita `new Date()` no permitido en el runtime).
 */
export function useGeolocalizacion(ahoraIso?: () => string): EstadoGeo {
  const [posicion, setPosicion] = useState<Geoposicion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capturar = useCallback(() => {
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geo) { setError("Geolocalización no disponible en este dispositivo."); return; }
    setCargando(true);
    setError(null);
    geo.getCurrentPosition(
      (pos) => {
        setPosicion({
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          precision: pos.coords.accuracy,
          capturadaAt: ahoraIso ? ahoraIso() : new Date(pos.timestamp).toISOString(),
        });
        setCargando(false);
      },
      (err) => { setError(err.message || "No se pudo obtener la ubicación."); setCargando(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [ahoraIso]);

  return { posicion, cargando, error, capturar };
}

/** Tarjeta compacta de captura de geolocalización para el flujo de campo. */
export function CapturaGeolocalizacion({ geo }: { geo: EstadoGeo }) {
  return (
    <Card>
      <CardHeader><strong>Ubicación</strong></CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          <Button variant="secundario" size="lg" onClick={geo.capturar} loading={geo.cargando} style={{ minHeight: "var(--do-sp-12)" }}>
            📍 Capturar ubicación
          </Button>
          {geo.error && <Alert variant="advertencia" titulo={geo.error} />}
          {geo.posicion && (
            <p style={{ fontSize: "var(--do-text-sm)", margin: 0 }}>
              {geo.posicion.latitud.toFixed(5)}, {geo.posicion.longitud.toFixed(5)} (±{Math.round(geo.posicion.precision)} m)
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
