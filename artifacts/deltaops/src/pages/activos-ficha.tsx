/**
 * DGP-008.3 · Ficha completa de un activo.
 * Datos, especificaciones, medidores, garantía, ubicación/responsable actuales,
 * pestañas (Timeline, Documentación, Relaciones, Históricos, Comentarios),
 * acciones de transición de estado (con confirmación), edición y etiqueta QR.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
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
import { MapPin, User, Wrench, ClipboardPlus, History, Building2, ShieldQuestion, FilePlus2 } from "lucide-react";
import { ShellActivos } from "../lib/activos/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useDetalle, useCatalogo } from "../lib/activos/hooks";
import {
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
import { ManoDeObraActivo } from "../lib/manodeobra/ManoDeObraActivo";
import { CostosActivo } from "../lib/costos/CostosActivo";
import { TabHistoricos } from "./ficha/tab-historicos";
import { TabComentarios } from "./ficha/tab-comentarios";
import { TabOrdenes } from "./ficha/tab-ordenes";
import { TabPlanes } from "./ficha/tab-planes";
import { TabPreventivo } from "./ficha/tab-preventivo";
import { TabCorrectivo } from "./ficha/tab-correctivo";
import { TabPreoperacional } from "./ficha/tab-preoperacional";
import { leerParam } from "../lib/ecosistema/deep-links";
import { PanelOperacional } from "../lib/utilizacion/PanelOperacional";
import { ResumenCabecera } from "../lib/utilizacion/ResumenCabecera";
import { utilizacionVisible } from "../lib/utilizacion/capacidades";
import { estadoVisual } from "../lib/utilizacion/ficha-operacional";
import { capacidadesActivos } from "../lib/activos/capacidades";
import { useSesion } from "../lib/identidad/sesion";
import { moduloHabilitado } from "../lib/identidad/rbac";
import { centroDeRegistro } from "../lib/centro/contexto";
import { urlNuevaOrden, urlOrdenesDeActivo } from "../lib/ecosistema/deep-links";

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
  const { sesion } = useSesion();
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
  // Capacidades canónicas del módulo Activos (réplica aRolLegacy→principalActivos).
  // Gatean las ESCRITURAS de la cabecera (ocultar sin permiso, no deshabilitar).
  const capActivos = capacidadesActivos(sesion);
  // Sin permiso de transición, no se ofrecen acciones de estado (escritura `operar`).
  const transiciones = capActivos.transicionar ? transicionesDesde(a.estado) : [];

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

  // LITE-03 §5 · Acciones operacionales del equipo. "Crear OT" requiere el
  // módulo Órdenes habilitado y un rol con escritura (no CONSULTA); el backend
  // sigue siendo la autoridad. "Registrar novedad" y "Preoperacional" NO existen
  // como flujo en esta app (fuera de alcance): se muestran deshabilitados con
  // texto honesto, nunca ocultos silenciosamente ni simulados.
  const puedeCrearOrden = !!sesion && moduloHabilitado(sesion, "ordenes") && sesion.rol !== "CONSULTA";
  // DGP-LITE-04 · El preoperacional se ancla a activos (mismo entitlement). Sólo
  // habilitado para roles con escritura (CONSULTA nunca ejecuta).
  const puedePreoperacional = !!sesion && moduloHabilitado(sesion, "activos") && sesion.rol !== "CONSULTA";

  return (
    <>
      <PageHeader
        titulo={a.nombre}
        descripcion={`${a.codigoEmpresarial} · ${a.tipo}`}
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {puedeCrearOrden && (
              <Link href={urlNuevaOrden({ activo: a.id, activoEtiqueta: a.nombre })}>
                <Button variant="primario" size="sm">
                  <ClipboardPlus size={16} aria-hidden="true" /> Crear OT
                </Button>
              </Link>
            )}
            <Link href={urlOrdenesDeActivo(a.id)}>
              <Button variant="secundario" size="sm">
                <History size={16} aria-hidden="true" /> Ver historial
              </Button>
            </Link>
            {capActivos.editar && (
              <Button variant="secundario" size="sm" onClick={() => setEditando(true)}>Editar</Button>
            )}
            {transiciones.map((t) => (
              <Button key={t.accion} variant="fantasma" size="sm" onClick={() => setAccionConfirm({ accion: t.accion, etiqueta: t.etiqueta })}>
                {t.etiqueta}
              </Button>
            ))}
          </div>
        }
      />

      <CabeceraOperacional a={a} />

      {/* DGP-LITE-04 · Preoperacional (habilitado). "Registrar novedad" sigue
          honestamente deshabilitado (fuera del alcance de LITE-04). §5 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-2)" }}>
        {puedePreoperacional ? (
          <Link href={`/activos/${encodeURIComponent(a.id)}/preoperacional`}>
            <Button variant="secundario" size="sm">
              <ShieldQuestion size={16} aria-hidden="true" /> Iniciar preoperacional
            </Button>
          </Link>
        ) : (
          <Button variant="fantasma" size="sm" disabled title="Tu rol no permite ejecutar el preoperacional.">
            <ShieldQuestion size={16} aria-hidden="true" /> Preoperacional
          </Button>
        )}
        <Button variant="fantasma" size="sm" disabled title="El registro de novedades no está disponible en esta versión.">
          <FilePlus2 size={16} aria-hidden="true" /> Registrar novedad (no disponible)
        </Button>
      </div>

      {mensaje && (
        <Alert variant={mensaje.tono === "exito" ? "exito" : mensaje.tono === "error" ? "error" : "info"} titulo={mensaje.texto} />
      )}

      {/* DGP-019.2 · Ficha Operacional 360°: panel operacional integrado
          (estado → indicadores → mantenimiento → combustible → órdenes →
          historial). Sólo si el tenant tiene el módulo Utilización habilitado y
          la sesión puede leerlo; la ficha base de Activos se mantiene intacta. */}
      {sesion && utilizacionVisible(sesion) && <PanelOperacional activo={a} />}

      <DatosGenerales a={a} />

      <Tabs
        porDefecto={leerParam(typeof window !== "undefined" ? window.location.search : "", "tab")}
        montarInactivas={false}
        items={[
          { id: "ordenes", etiqueta: "Órdenes", contenido: <TabOrdenes activoId={id} activoNombre={a.nombre} /> },
          { id: "planes", etiqueta: "Planes", contenido: <TabPlanes activoId={id} activoNombre={a.nombre} /> },
          { id: "preventivo", etiqueta: "Preventivo", contenido: <TabPreventivo activoId={id} activoNombre={a.nombre} /> },
          { id: "correctivo", etiqueta: "Correctivo", contenido: <TabCorrectivo activoId={id} activoNombre={a.nombre} /> },
          { id: "preoperacional", etiqueta: "Preoperacional", contenido: <TabPreoperacional activoId={id} activoNombre={a.nombre} /> },
          { id: "manodeobra", etiqueta: "Mano de obra", contenido: <ManoDeObraActivo activoId={id} /> },
          { id: "costos", etiqueta: "Costos", contenido: <CostosActivo activoId={id} /> },
          { id: "timeline", etiqueta: "Timeline", contenido: <TabTimeline id={id} activo={a} /> },
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

/**
 * LITE-03 §5 · CABECERA OPERACIONAL del equipo: jerarquía "estado del equipo"
 * primero (semáforo + badge), luego contexto operacional (centro de costos,
 * ubicación, responsable, equipo de mantenimiento). Sólo datos REALES del read
 * model (`datos`); cada dato ausente muestra "—" (nunca cero simulado). No
 * inventa estados ni campos: reutiliza `estadoVisual` (mapeo canónico) y
 * `centroDeRegistro`.
 */
function CabeceraOperacional({ a }: { a: ActivoRow }) {
  const ev = estadoVisual(a.estado);
  const d = a.datos ?? {};
  const txt = (k: string): string => {
    const v = d[k];
    return typeof v === "string" && v !== "" ? v : "—";
  };
  // §8/§25 · Honestidad de datos: si el activo no tiene centro de costos
  // configurado, se dice explícitamente (nunca "—" ambiguo ni cero simulado).
  const centro = centroDeRegistro(d) ?? "Sin centro de costos configurado";
  const ubicacion = a.ubicacionId && a.ubicacionId !== "" ? a.ubicacionId : txt("ubicacion");
  const responsable = txt("responsable");
  const equipoMtto = ((): string => {
    const v = d["equipoMantenimiento"] ?? d["cuadrilla"] ?? d["equipoMtto"];
    return typeof v === "string" && v !== "" ? v : "—";
  })();
  const item = (icono: React.ReactNode, etiqueta: string, valor: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", minWidth: 0 }}>
      <span aria-hidden="true" style={{ color: "var(--do-texto-suave)", display: "inline-flex" }}>{icono}</span>
      <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", textTransform: "uppercase", letterSpacing: "var(--do-tracking-etiquetas)" }}>{etiqueta}</span>
      <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{valor}</span>
    </div>
  );
  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--do-sp-3) var(--do-sp-5)" }}>
          {/* Estado del equipo · primer nivel de la jerarquía */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
            <span className={`do-semaforo do-semaforo--${ev.semaforo}`} title={ev.etiqueta} aria-hidden="true" />
            <Badge variant={ev.variante}>{ev.etiqueta}</Badge>
          </div>
          {item(<Building2 size={16} />, "Centro", centro)}
          {item(<MapPin size={16} />, "Ubicación", ubicacion)}
          {item(<User size={16} />, "Responsable", responsable)}
          {item(<Wrench size={16} />, "Equipo mantenimiento", equipoMtto)}
        </div>
        {/* LITE-10 §11/§12 · Resumen operacional compuesto: horómetro actual,
            próxima rutina (Faltan N h / Vencido por X h) y último preoperacional.
            Sólo datos reales; estados vacíos honestos. */}
        <div
          style={{
            marginTop: "var(--do-sp-4)",
            paddingTop: "var(--do-sp-4)",
            borderTop: "var(--do-border-fino) solid var(--do-borde)",
          }}
        >
          <ResumenCabecera activoId={a.id} />
        </div>
      </CardContent>
    </Card>
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
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
        <Card>
          <CardHeader><strong>General</strong></CardHeader>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))" }}>
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
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))" }}>
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
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))" }}>
              <Dato etiqueta="Horómetro">{g("horometro")}</Dato>
              <Dato etiqueta="Odómetro">{g("odometro")}</Dato>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><strong>Ubicación y responsable</strong></CardHeader>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))" }}>
              <Dato etiqueta="Ubicación">{a.ubicacionId ?? g("ubicacion")}</Dato>
              <Dato etiqueta="Responsable">{g("responsable")}</Dato>
              <Dato etiqueta="Supervisor">{g("supervisor")}</Dato>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid var(--do-borde)", margin: "var(--do-sp-3) 0" }} />
            <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))" }}>
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
  const centrosCosto = useCatalogo("centros-costo");
  const def = useMemo(
    () =>
      plantillaEdicion({
        criticidades: (criticidades.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
        prioridades: (prioridades.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
        "centros-costo": (centrosCosto.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
      }),
    [criticidades.datos, prioridades.datos, centrosCosto.datos],
  );
  const form = useFormularioDinamico(def, {}, {
    nombre: a.nombre,
    descripcion: String(d.descripcion ?? ""),
    criticidad: a.criticidad ?? "",
    prioridad: String(d.prioridad ?? ""),
    // §16 · Precarga el centro de costos actual del activo (fuente de verdad).
    centroCosto: String(d.centroCosto ?? ""),
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
      // §16 · Centro de costos editable SÓLO desde el activo.
      centroCosto: s("centroCosto"),
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
