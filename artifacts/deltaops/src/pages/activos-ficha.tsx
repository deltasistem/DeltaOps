/**
 * DGP-008.3 · Ficha completa de un activo.
 * Datos, especificaciones, medidores, garantía, ubicación/responsable actuales,
 * pestañas (Timeline, Documentación, Relaciones, Históricos, Comentarios),
 * acciones de transición de estado (con confirmación), edición y etiqueta QR.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Tabs,
  Modal,
  Alert,
  Spinner,
  ErrorState,
} from "@workspace/design-system";
import { ShellActivos } from "../lib/activos/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useDetalle, useCatalogo } from "../lib/activos/hooks";
import {
  etiquetaEstado,
  variantEstado,
  transicionesDesde,
  type ActivoRow,
  type EtiquetaQr,
} from "../lib/activos/tipos";
import { transicion, editarActivo } from "../lib/activos/mutaciones";
import { activosFetch } from "../lib/activos/api";
import { QrCode, imprimirEtiqueta } from "../lib/qr/QrCode";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaEdicion, plantillaTipoEtiqueta } from "../lib/forms/plantillas";
import { TabTimeline } from "./ficha/tab-timeline";
import { TabDocumentacion } from "./ficha/tab-documentacion";
import { TabRelaciones } from "./ficha/tab-relaciones";
import { TabHistoricos } from "./ficha/tab-historicos";
import { TabComentarios } from "./ficha/tab-comentarios";
import { TabOrdenes } from "./ficha/tab-ordenes";
import { TabPlanes } from "./ficha/tab-planes";
import { leerParam } from "../lib/ecosistema/deep-links";

export default function ActivosFichaPage() {
  const [, params] = useRoute("/activos/:id");
  const id = params?.id ?? "";
  return (
    <ShellActivos activo="/activos">
      <Ficha id={id} />
    </ShellActivos>
  );
}

function Ficha({ id }: { id: string }) {
  const [, navegar] = useLocation();
  const { cola } = useOffline();
  const { datos, cargando, error, recargar } = useDetalle(id);
  const [accionConfirm, setAccionConfirm] = useState<{ accion: string; etiqueta: string } | null>(null);
  const [editando, setEditando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  if (cargando) {
    return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  }
  if (error || !datos) {
    return (
      <Card><CardContent>
        <ErrorState titulo="No se encontró el activo" descripcion={error?.message ?? "Recurso no disponible."} onReintentar={recargar} />
        <div style={{ marginTop: "var(--do-sp-3)" }}><Button variant="secundario" onClick={() => navegar("/activos")}>Volver al listado</Button></div>
      </CardContent></Card>
    );
  }

  const a = datos;
  const transiciones = transicionesDesde(a.estado);

  async function ejecutarTransicion(accion: string) {
    const r = await transicion(cola, id, accion, a.version);
    setAccionConfirm(null);
    if (r.encolada) {
      setMensaje({ tono: "info", texto: "Sin conexión: la transición se sincronizará automáticamente." });
    } else if (r.error) {
      setMensaje({ tono: "error", texto: r.error.message });
    } else {
      setMensaje({ tono: "exito", texto: "Transición aplicada." });
      recargar();
    }
  }

  return (
    <>
      <PageHeader
        titulo={a.nombre}
        descripcion={`${a.codigoEmpresarial} · ${a.tipo}`}
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <Badge variant={variantEstado(a.estado)}>{etiquetaEstado(a.estado)}</Badge>
            <Button variant="secundario" size="sm" onClick={() => setEditando(true)}>Editar</Button>
            {transiciones.map((t) => (
              <Button key={t.accion} variant="primario" size="sm" onClick={() => setAccionConfirm({ accion: t.accion, etiqueta: t.etiqueta })}>
                {t.etiqueta}
              </Button>
            ))}
          </div>
        }
      />

      {mensaje && (
        <Alert variant={mensaje.tono === "exito" ? "exito" : mensaje.tono === "error" ? "error" : "info"} titulo={mensaje.texto} />
      )}

      <DatosGenerales a={a} />

      <Tabs
        porDefecto={leerParam(typeof window !== "undefined" ? window.location.search : "", "tab")}
        items={[
          { id: "ordenes", etiqueta: "Órdenes", contenido: <TabOrdenes activoId={id} activoNombre={a.nombre} /> },
          { id: "planes", etiqueta: "Planes", contenido: <TabPlanes activoId={id} activoNombre={a.nombre} /> },
          { id: "timeline", etiqueta: "Timeline", contenido: <TabTimeline id={id} /> },
          { id: "documentacion", etiqueta: "Documentación", contenido: <TabDocumentacion id={id} /> },
          { id: "relaciones", etiqueta: "Relaciones", contenido: <TabRelaciones id={id} nombre={a.nombre} onNavegar={(x) => navegar(`/activos/${x}`)} /> },
          { id: "historicos", etiqueta: "Históricos", contenido: <TabHistoricos id={id} /> },
          { id: "comentarios", etiqueta: "Comentarios", contenido: <TabComentarios id={id} /> },
          { id: "etiqueta", etiqueta: "Etiqueta", contenido: <SeccionEtiqueta id={id} codigo={a.codigoEmpresarial} nombre={a.nombre} etiquetaVigente={a.etiqueta ?? null} /> },
        ]}
      />

      {accionConfirm && (
        <Modal
          abierto
          onClose={() => setAccionConfirm(null)}
          titulo={`Confirmar: ${accionConfirm.etiqueta}`}
          pie={
            <>
              <Button variant="fantasma" onClick={() => setAccionConfirm(null)}>Cancelar</Button>
              <Button variant="primario" onClick={() => void ejecutarTransicion(accionConfirm.accion)}>Confirmar</Button>
            </>
          }
        >
          <p>¿Confirmas la transición «{accionConfirm.etiqueta}» del activo <strong>{a.nombre}</strong>?</p>
        </Modal>
      )}

      {editando && (
        <EdicionModal a={a} onCerrar={() => setEditando(false)} onGuardado={() => { setEditando(false); recargar(); }} />
      )}
    </>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
      <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", textTransform: "uppercase", letterSpacing: "var(--do-tracking-etiquetas)" }}>{etiqueta}</span>
      <span>{children ?? "—"}</span>
    </div>
  );
}

function DatosGenerales({ a }: { a: ActivoRow }) {
  const d = a.datos ?? {};
  const g = (k: string): React.ReactNode => {
    const v = d[k];
    if (v == null || v === "") return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  return (
    <Section titulo="Datos del activo">
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Card>
          <CardHeader><strong>General</strong></CardHeader>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <Dato etiqueta="Código">{a.codigoEmpresarial}</Dato>
              <Dato etiqueta="Tipo">{a.tipo}</Dato>
              <Dato etiqueta="Categoría">{g("categoria")}</Dato>
              <Dato etiqueta="Familia">{g("familia")}</Dato>
              <Dato etiqueta="Criticidad">{a.criticidad ?? "—"}</Dato>
              <Dato etiqueta="Versión">{a.version}</Dato>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><strong>Especificaciones</strong></CardHeader>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <Dato etiqueta="Fabricante">{g("fabricante")}</Dato>
              <Dato etiqueta="Modelo">{g("modelo")}</Dato>
              <Dato etiqueta="Serie">{g("serie")}</Dato>
              <Dato etiqueta="Año">{g("anio")}</Dato>
              <Dato etiqueta="Vida útil">{g("vidaUtil")}</Dato>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><strong>Medidores</strong></CardHeader>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <Dato etiqueta="Horómetro">{g("horometro")}</Dato>
              <Dato etiqueta="Odómetro">{g("odometro")}</Dato>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><strong>Ubicación y responsable</strong></CardHeader>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <Dato etiqueta="Ubicación">{a.ubicacionId ?? g("ubicacion")}</Dato>
              <Dato etiqueta="Responsable">{g("responsable")}</Dato>
              <Dato etiqueta="Supervisor">{g("supervisor")}</Dato>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid var(--do-borde)", margin: "var(--do-sp-3) 0" }} />
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <Dato etiqueta="Fecha compra">{g("fechaCompra")}</Dato>
              <Dato etiqueta="Puesta servicio">{g("fechaPuestaServicio")}</Dato>
              <Dato etiqueta="Proveedor">{g("proveedor")}</Dato>
            </div>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function SeccionEtiqueta({
  id,
  codigo,
  nombre,
  etiquetaVigente,
}: {
  id: string;
  codigo: string;
  nombre: string;
  etiquetaVigente: EtiquetaQr | null;
}) {
  const defTipo = useMemo(() => plantillaTipoEtiqueta(), []);
  const form = useFormularioDinamico(defTipo, {}, { tipo: "qr" });
  const tipo = String(form.valores.tipo ?? "qr");
  const [etiqueta, setEtiqueta] = useState<EtiquetaQr | null>(etiquetaVigente);
  const [emitiendo, setEmitiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Emite/reutiliza la etiqueta de plataforma al abrir la pestaña (o reusa la
  // etiqueta vigente que llegó en el detalle). Sólo para el tipo QR (activo).
  useEffect(() => {
    let cancelado = false;
    if (etiqueta || tipo !== "qr") return;
    setEmitiendo(true);
    setAviso(null);
    void activosFetch<EtiquetaQr & { activoId?: string }>(`/${id}/qr`, {
      method: "POST",
      body: { tipo: "qr" },
      toleraNoEncontrado: true,
    })
      .then((r) => {
        if (cancelado) return;
        if (r && r.codigo) setEtiqueta({ id: r.id, codigo: r.codigo, tipo: r.tipo ?? "qr", reutilizada: r.reutilizada });
        else setAviso("El servicio de etiquetas QR de plataforma no está disponible.");
      })
      .catch((e) => { if (!cancelado) setAviso((e as Error).message); })
      .finally(() => { if (!cancelado) setEmitiendo(false); });
    return () => { cancelado = true; };
  }, [id, tipo, etiqueta]);

  const valorQr = etiqueta?.codigo ?? "";

  return (
    <Section titulo="Etiqueta del activo">
      <Card>
        <CardContent>
          <div style={{ display: "flex", gap: "var(--do-sp-5)", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ minWidth: 240 }}>
              <FormularioDinamico definicion={defTipo} valores={form.valores} onCambio={form.setValores} />
              <p style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", maxWidth: 260 }}>
                El código lo emite la plataforma (platform.qr). Los tipos código de barras y NFC están preparados para una integración futura.
              </p>
              {etiqueta && (
                <p style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
                  Código de plataforma: <code>{etiqueta.codigo}</code>{etiqueta.reutilizada ? " (reutilizado)" : ""}
                </p>
              )}
              <Button
                variant="secundario"
                disabled={!valorQr}
                onClick={() => imprimirEtiqueta({ valor: valorQr, codigo: etiqueta?.codigo ?? codigo, nombre })}
              >
                Imprimir etiqueta
              </Button>
            </div>
            <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-4)", background: "var(--do-surface-2)", borderRadius: "var(--do-radius-md)", minWidth: 200, minHeight: 200 }}>
              {tipo !== "qr" ? (
                <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>Tipo preparado (sin generación).</span>
              ) : emitiendo ? (
                <Spinner />
              ) : valorQr ? (
                <QrCode valor={valorQr} titulo={etiqueta?.codigo} />
              ) : (
                <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>Etiqueta no disponible.</span>
              )}
            </div>
          </div>
          {aviso && <Alert variant="advertencia" titulo="Etiqueta de plataforma no disponible">{aviso}</Alert>}
        </CardContent>
      </Card>
    </Section>
  );
}

function EdicionModal({ a, onCerrar, onGuardado }: { a: ActivoRow; onCerrar: () => void; onGuardado: () => void }) {
  const { cola } = useOffline();
  const d = a.datos ?? {};
  const criticidades = useCatalogo("criticidades");
  const prioridades = useCatalogo("prioridades");
  const def = useMemo(
    () =>
      plantillaEdicion({
        criticidades: (criticidades.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
        prioridades: (prioridades.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
      }),
    [criticidades.datos, prioridades.datos],
  );
  const form = useFormularioDinamico(def, {}, {
    nombre: a.nombre,
    descripcion: String(d.descripcion ?? ""),
    criticidad: a.criticidad ?? "",
    prioridad: String(d.prioridad ?? ""),
    observaciones: String(d.observaciones ?? ""),
  });
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (form.validarAhora().some((h) => h.severidad !== "advertencia")) { setErr("Revisa los campos obligatorios."); return; }
    setGuardando(true);
    setErr(null);
    const v = form.valores;
    const s = (k: string): string | undefined => {
      const x = v[k];
      return x == null || x === "" ? undefined : String(x);
    };
    const r = await editarActivo(cola, a.id, a.version, {
      nombre: s("nombre"),
      descripcion: s("descripcion"),
      criticidad: s("criticidad"),
      prioridad: s("prioridad"),
      observaciones: s("observaciones"),
    });
    setGuardando(false);
    if (r.error) setErr(r.error.message);
    else onGuardado();
  }

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo="Editar activo"
      pie={
        <>
          <Button variant="fantasma" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primario" loading={guardando} onClick={() => void guardar()}>Guardar</Button>
        </>
      }
    >
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}
