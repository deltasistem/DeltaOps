/**
 * DGP-008.3 · Pestaña Documentación de la ficha.
 *
 * El Attachment Service de plataforma es REFERENCIA-ONLY: la URL firmada
 * devuelve METADATOS verificables (HMAC + TTL), NUNCA el binario. Por eso la UX
 * es una ficha de metadatos verificables por documento (categoría, nombre,
 * mimeType, tamaño, hash sha256, estado de verificación de firma), no un visor
 * de binarios. Excepción: un archivo recién seleccionado en esta sesión (aún no
 * registrado) SÍ se puede previsualizar desde el `File` local.
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
import { useDocumentacion } from "../../lib/activos/hooks";
import { activosFetch, esFuncionNoDisponible } from "../../lib/activos/api";
import { useOffline } from "../../lib/offline/contexto";
import { adjuntar } from "../../lib/activos/mutaciones";
import { hashArchivo } from "../../lib/activos/hash";
import type { Adjunto } from "../../lib/activos/tipos";
import { FormularioDinamico, useFormularioDinamico } from "../../lib/forms/FormularioDinamico";
import { plantillaAdjunto } from "../../lib/forms/plantillas";

const ETIQUETA_CAT: Record<string, string> = {
  manual: "Manual", certificado: "Certificado", garantia: "Garantía",
  diagrama: "Diagrama", plano: "Plano", procedimiento: "Procedimiento",
  fotografia: "Fotografía", video: "Video",
};

function formatoTamano(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TabDocumentacion({ id }: { id: string }) {
  const { datos, cargando, error, recargar } = useDocumentacion(id);
  const [registrar, setRegistrar] = useState(false);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, Adjunto[]>();
    for (const a of datos ?? []) {
      const c = a.categoria ?? "otros";
      if (!mapa.has(c)) mapa.set(c, []);
      mapa.get(c)!.push(a);
    }
    return mapa;
  }, [datos]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <Alert variant="info" titulo="Custodia por referencia">
        La plataforma custodia <strong>referencias verificables</strong> a los documentos (metadatos + hash + firma
        HMAC con caducidad), no los binarios. La previsualización muestra la verificación de la referencia, no el
        contenido. Ver <code>lib/module-activos/docs/colaboracion.md</code>.
      </Alert>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primario" size="sm" onClick={() => setRegistrar(true)}>Registrar documentación</Button>
      </div>
      {cargando ? (
        <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
      ) : error ? (
        <Card><CardContent><ErrorState titulo="No se pudo cargar la documentación" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>
      ) : (datos ?? []).length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin documentación" descripcion="Este activo no tiene adjuntos registrados." /></CardContent></Card>
      ) : (
        [...porCategoria.entries()].map(([cat, items]) => (
          <Card key={cat}>
            <CardHeader><strong>{ETIQUETA_CAT[cat] ?? cat}</strong> <Badge variant="neutro">{items.length}</Badge></CardHeader>
            <CardContent>
              <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {items.map((it, i) => <TarjetaAdjunto key={it.id ?? it.attachmentId ?? i} id={id} adjunto={it} />)}
              </div>
            </CardContent>
          </Card>
        ))
      )}
      {registrar && (
        <RegistrarModal id={id} onCerrar={() => setRegistrar(false)} onGuardado={() => { setRegistrar(false); recargar(); }} />
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

/** Ficha de metadatos verificables de un adjunto (referencia-only). */
function TarjetaAdjunto({ id, adjunto }: { id: string; adjunto: Adjunto }) {
  const [v, setV] = useState<EstadoVerificacion>({ estado: "inicial" });
  const attId = adjunto.attachmentId ?? adjunto.id ?? "";

  async function verificar() {
    setV({ estado: "verificando" });
    try {
      const r = await activosFetch<{ url?: string; expiresAt?: number; almacenamiento?: string }>(
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

  const caducidad = v.estado === "verificado" && v.expiraAt
    ? new Date(v.expiraAt).toLocaleString("es")
    : null;

  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
            <strong style={{ fontSize: "var(--do-text-sm)", wordBreak: "break-word" }}>{adjunto.nombreArchivo}</strong>
            <Badge variant="neutro">{ETIQUETA_CAT[adjunto.categoria] ?? adjunto.categoria}</Badge>
          </div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-1) var(--do-sp-2)", fontSize: "var(--do-text-xs)" }}>
            <dt style={{ color: "var(--do-texto-suave)" }}>Tipo</dt>
            <dd style={{ margin: 0 }}>{adjunto.mimeType}</dd>
            <dt style={{ color: "var(--do-texto-suave)" }}>Tamaño</dt>
            <dd style={{ margin: 0 }}>{formatoTamano(adjunto.tamanoBytes)}</dd>
            <dt style={{ color: "var(--do-texto-suave)" }}>SHA-256</dt>
            <dd style={{ margin: 0 }}><code style={{ wordBreak: "break-all" }}>{adjunto.hashSha256 ?? "—"}</code></dd>
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

          <Button
            variant="secundario"
            size="sm"
            loading={v.estado === "verificando"}
            onClick={() => void verificar()}
          >
            {v.estado === "verificado" ? "Re-verificar firma" : "Verificar referencia"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RegistrarModal({ id, onCerrar, onGuardado }: { id: string; onCerrar: () => void; onGuardado: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaAdjunto(), []);
  const form = useFormularioDinamico(def, {}, { categoria: "manual" });
  const [hash, setHash] = useState<string>("");
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const file = form.valores.archivo instanceof File ? (form.valores.archivo as File) : null;

  // Calcula el hash y una previsualización LOCAL del archivo recién elegido
  // (excepción permitida: binario en cliente, aún no registrado).
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
    const r = await adjuntar(cola, id, {
      categoria: String(form.valores.categoria ?? "manual"),
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
      titulo="Registrar documentación"
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
