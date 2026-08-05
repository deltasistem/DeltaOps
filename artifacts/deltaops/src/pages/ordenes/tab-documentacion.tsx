/**
 * DGP-009.3 · Gestión documental de la orden (Attachment Service REFERENCIA-ONLY).
 *
 * La plataforma custodia REFERENCIAS verificables (metadatos + hash + firma HMAC
 * con caducidad), nunca binarios remotos. La UX muestra fichas de metadatos
 * verificables; sólo un archivo recién seleccionado en la sesión (aún no
 * registrado) puede previsualizarse desde el `File` local.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Alert,
  EmptyState,
  Spinner,
  ErrorState,
  Modal,
} from "@workspace/design-system";
import { useDocumentacion } from "../../lib/ordenes/hooks";
import { ordenesFetch, esFuncionNoDisponible } from "../../lib/ordenes/api";
import { useOffline } from "../../lib/offline/contexto";
import { agregarEvidencia } from "../../lib/ordenes/mutaciones";
import { hashArchivo } from "../../lib/activos/hash";
import type { DocumentoOrden, OrdenRow } from "../../lib/ordenes/tipos";
import { FormularioDinamico, useFormularioDinamico } from "../../lib/forms/FormularioDinamico";
import { plantillaEvidencia, CATEGORIAS_EVIDENCIA } from "../../lib/forms/plantillas-ordenes";

function etiquetaCat(c: string): string {
  return CATEGORIAS_EVIDENCIA.find((x) => x.valor === c)?.etiqueta ?? c;
}

/**
 * Normaliza una fila de documentación (read model). Las evidencias guardan sus
 * metadatos en `datos` y el `attachmentId` en `referenciaClave`; la categoría
 * viaja como prefijo `[categoria]` del nombre lógico (patrón Attachment Service).
 */
interface EvidenciaVista {
  attachmentId: string;
  categoria: string;
  nombreArchivo: string;
  mimeType: string;
  tamanoBytes: number;
  hashSha256?: string;
  clase?: string;
}

function normalizar(doc: DocumentoOrden & Record<string, unknown>): EvidenciaVista {
  const datos = (doc.datos as Record<string, unknown> | undefined) ?? {};
  const attachmentId = String(doc.attachmentId ?? doc.referenciaClave ?? datos.attachmentId ?? doc.id ?? "");
  const nombreLogico = String(datos.nombreArchivo ?? doc.nombreArchivo ?? doc.titulo ?? attachmentId);
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(nombreLogico);
  const categoria = String(datos.descripcion ?? doc.categoria ?? (m ? m[1] : doc.clase ?? "otros"));
  const nombreArchivo = m ? m[2]! : nombreLogico;
  return {
    attachmentId,
    categoria,
    nombreArchivo,
    mimeType: String(datos.mimeType ?? doc.mimeType ?? "application/octet-stream"),
    tamanoBytes: Number(datos.tamanoBytes ?? doc.tamanoBytes ?? 0),
    hashSha256: (datos.hashSha256 as string) ?? doc.hashSha256,
    clase: doc.clase,
  };
}

function formatoTamano(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TabDocumentacionOrden({ orden, onCambio }: { orden: OrdenRow; onCambio?: () => void }) {
  const id = orden.id;
  const { datos, cargando, error, recargar } = useDocumentacion(id);
  const [registrar, setRegistrar] = useState(false);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, EvidenciaVista[]>();
    for (const a of datos ?? []) {
      const ev = normalizar(a as DocumentoOrden & Record<string, unknown>);
      const c = ev.categoria || "otros";
      if (!mapa.has(c)) mapa.set(c, []);
      mapa.get(c)!.push(ev);
    }
    return mapa;
  }, [datos]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <Alert variant="info" titulo="Custodia por referencia">
        La plataforma custodia <strong>referencias verificables</strong> a los documentos (metadatos + hash + firma
        HMAC con caducidad), no los binarios. La previsualización muestra la verificación de la referencia, no el
        contenido remoto.
      </Alert>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primario" size="sm" onClick={() => setRegistrar(true)}>Agregar evidencia</Button>
      </div>
      {cargando ? (
        <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
      ) : error ? (
        <Card><CardContent><ErrorState titulo="No se pudo cargar la documentación" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>
      ) : (datos ?? []).length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin documentación" descripcion="Esta orden no tiene evidencias registradas." /></CardContent></Card>
      ) : (
        [...porCategoria.entries()].map(([cat, items]) => (
          <Card key={cat}>
            <CardHeader><strong>{etiquetaCat(cat)}</strong> <Badge variant="neutro">{items.length}</Badge></CardHeader>
            <CardContent>
              <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {items.map((it, i) => <TarjetaAdjunto key={it.attachmentId || i} id={id} doc={it} />)}
              </div>
            </CardContent>
          </Card>
        ))
      )}
      {registrar && (
        <RegistrarModal
          orden={orden}
          onCerrar={() => setRegistrar(false)}
          onGuardado={() => { setRegistrar(false); recargar(); onCambio?.(); }}
        />
      )}
    </div>
  );
}

type EstadoVerificacion =
  | { estado: "inicial" }
  | { estado: "verificando" }
  | { estado: "verificado"; url: string; expiraAt?: number }
  | { estado: "no-disponible"; motivo: string }
  | { estado: "error"; motivo: string };

function TarjetaAdjunto({ id, doc }: { id: string; doc: EvidenciaVista }) {
  const [v, setV] = useState<EstadoVerificacion>({ estado: "inicial" });
  const attId = doc.attachmentId;

  async function verificar() {
    setV({ estado: "verificando" });
    try {
      const r = await ordenesFetch<{ url?: string; expiresAt?: number }>(
        `/${id}/documentacion/${attId}/url`,
        { toleraNoEncontrado: true },
      );
      if (r && r.url) setV({ estado: "verificado", url: r.url, expiraAt: r.expiresAt });
      else setV({ estado: "no-disponible", motivo: "El servicio de firma de plataforma no está desplegado." });
    } catch (e) {
      if (esFuncionNoDisponible(e)) setV({ estado: "no-disponible", motivo: "El servicio de firma de plataforma no está desplegado." });
      else setV({ estado: "error", motivo: (e as Error).message });
    }
  }

  const caducidad = v.estado === "verificado" && v.expiraAt ? new Date(v.expiraAt).toLocaleString("es") : null;

  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
            <strong style={{ fontSize: "var(--do-text-sm)", wordBreak: "break-word" }}>{doc.nombreArchivo}</strong>
            <Badge variant="neutro">{etiquetaCat(doc.categoria || doc.clase || "otros")}</Badge>
          </div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-1) var(--do-sp-2)", fontSize: "var(--do-text-xs)" }}>
            <dt style={{ color: "var(--do-texto-suave)" }}>Tipo</dt>
            <dd style={{ margin: 0 }}>{doc.mimeType}</dd>
            <dt style={{ color: "var(--do-texto-suave)" }}>Tamaño</dt>
            <dd style={{ margin: 0 }}>{formatoTamano(doc.tamanoBytes)}</dd>
            <dt style={{ color: "var(--do-texto-suave)" }}>SHA-256</dt>
            <dd style={{ margin: 0 }}><code style={{ wordBreak: "break-all" }}>{doc.hashSha256 ?? "—"}</code></dd>
          </dl>
          {v.estado === "verificado" ? (
            <Alert variant="exito" titulo="Referencia verificada">
              Firma HMAC válida{caducidad ? ` · caduca ${caducidad}` : ""}. La plataforma confirma la referencia sin exponer el binario.
            </Alert>
          ) : v.estado === "no-disponible" ? (
            <Alert variant="advertencia" titulo="Verificación no disponible">{v.motivo}</Alert>
          ) : v.estado === "error" ? (
            <Alert variant="error" titulo="No se pudo verificar">{v.motivo}</Alert>
          ) : null}
          <Button variant="secundario" size="sm" loading={v.estado === "verificando"} onClick={() => void verificar()}>
            {v.estado === "verificado" ? "Re-verificar firma" : "Verificar referencia"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RegistrarModal({ orden, onCerrar, onGuardado }: { orden: OrdenRow; onCerrar: () => void; onGuardado: () => void }) {
  const id = orden.id;
  const { cola } = useOffline();
  const def = useMemo(() => plantillaEvidencia(), []);
  const form = useFormularioDinamico(def, {}, { categoria: "fotografia" });
  const [hash, setHash] = useState<string>("");
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const file = form.valores.archivo instanceof File ? (form.valores.archivo as File) : null;

  useEffect(() => {
    let cancelado = false;
    setHash("");
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    if (!file) return;
    setCalculando(true);
    void hashArchivo(file).then((h) => { if (!cancelado) setHash(h); }).finally(() => { if (!cancelado) setCalculando(false); });
    if (/^image\/|^video\/|^application\/pdf$/.test(file.type)) {
      const u = URL.createObjectURL(file);
      setPreviewUrl(u);
      return () => { cancelado = true; URL.revokeObjectURL(u); };
    }
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  async function guardar() {
    if (form.validarAhora().some((h) => h.severidad !== "advertencia")) { setErr("Selecciona categoría y archivo."); return; }
    if (!file || !hash) { setErr("Selecciona un archivo (se calculará su hash)."); return; }
    setGuardando(true);
    setErr(null);
    const r = await agregarEvidencia(cola, id, orden.version, {
      categoria: String(form.valores.categoria ?? "fotografia"),
      nombreArchivo: file.name,
      mimeType: file.type || "application/octet-stream",
      tamanoBytes: file.size,
      hashSha256: hash,
    });
    setGuardando(false);
    if (r.error) setErr(r.error.message);
    else onGuardado();
  }

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo="Agregar evidencia"
      pie={
        <>
          <Button variant="fantasma" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primario" loading={guardando} disabled={calculando} onClick={() => void guardar()}>Registrar</Button>
        </>
      }
    >
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
      {calculando && <p style={{ fontSize: "var(--do-text-sm)", display: "flex", gap: "var(--do-sp-1)", alignItems: "center" }}><Spinner /> Calculando hash…</p>}
      {hash && <code style={{ fontSize: "10px", wordBreak: "break-all" }}>sha256:{hash}</code>}
      {file && previewUrl && (
        <div style={{ marginTop: "var(--do-sp-3)" }}>
          <p style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>Previsualización local (archivo aún no registrado):</p>
          <div style={{ borderRadius: "var(--do-radius-sm)", overflow: "hidden", background: "var(--do-surface-2)" }}>
            {/^image\//.test(file.type) && <img src={previewUrl} alt={file.name} style={{ width: "100%", display: "block" }} />}
            {file.type === "application/pdf" && <iframe title={file.name} src={previewUrl} style={{ width: "100%", height: 240, border: "none" }} />}
            {/^video\//.test(file.type) && <video src={previewUrl} controls style={{ width: "100%" }} />}
          </div>
        </div>
      )}
    </Modal>
  );
}
