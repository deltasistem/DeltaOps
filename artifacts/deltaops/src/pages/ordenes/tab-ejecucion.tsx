/**
 * DGP-009.3 · Experiencia de Ejecución integrada (Centro del Técnico).
 *
 * En una sola vista: acciones de bitácora (inicio/pausa/reanudación/espera/
 * llegada/salida/finalización), registro de horas, materiales y herramientas,
 * observaciones/comentarios, y el checklist/formulario asociado a la orden.
 * Todas las escrituras usan las mutaciones con degradación offline.
 */
import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Alert,
  Modal,
  useToast,
} from "@workspace/design-system";
import { useOffline } from "../../lib/offline/contexto";
import {
  registrarBitacora,
  registrarRecurso,
  registrarEjecucion,
  asociarFormulario,
  asociarChecklist,
  capturarRespuestaPlantilla,
  agregarEvidencia,
  type RefPlantilla,
} from "../../lib/ordenes/mutaciones";
import { useFormularios, useChecklists, usePlantillaDefinicion } from "../../lib/ordenes/hooks";
import { sha256Hex } from "../../lib/activos/hash";
import {
  BarraAccionesCampo,
  AccionRapida,
  CapturaFoto,
  CapturaFirma,
  CapturaGeolocalizacion,
  useGeolocalizacion,
  type ArchivoCampo,
} from "../../lib/ecosistema/campo";
import { FormularioDinamico, useFormularioDinamico } from "../../lib/forms/FormularioDinamico";
import { validarDefinicion, type DefinicionFormulario } from "@workspace/dynamic-forms/definicion";
import {
  plantillaBitacora,
  plantillaHoras,
  plantillaRecurso,
  plantillaComentarioOrden,
  plantillaAsociarPlantilla,
} from "../../lib/forms/plantillas-ordenes";
import { ACCIONES_BITACORA, ETIQUETA_BITACORA } from "../../lib/ordenes/constantes";
import { PanelSesion } from "../../lib/ordenes/PanelSesion";
import type { OrdenRow, DocumentoOrden } from "../../lib/ordenes/tipos";

const OPCIONES_BITACORA = ACCIONES_BITACORA.map((a) => ({ valor: a, etiqueta: ETIQUETA_BITACORA[a] }));

/** Definición mínima válida usada como marcador mientras se resuelve la real. */
const DEF_VACIA: DefinicionFormulario = validarDefinicion({
  clave: "orden.plantilla.vacia",
  titulo: "Cargando…",
  nodos: [{ clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Cargando…", hijos: [] }],
});

/**
 * Coacciona una definición Dynamic Forms recibida del servidor a
 * `DefinicionFormulario` validada. Devuelve `null` si no es renderizable.
 */
export function coaccionarDefinicion(raw: unknown): DefinicionFormulario | null {
  if (!raw || typeof raw !== "object") return null;
  try {
    return validarDefinicion(raw as DefinicionFormulario);
  } catch {
    return null;
  }
}

export function TabEjecucion({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      {/* DGP-020.2 · Acción primaria del técnico: iniciar/pausar/reanudar/finalizar. */}
      <PanelSesion orden={orden} />
      <ChecklistFormulario orden={orden} onCambio={onCambio} />
      <BitacoraRapida orden={orden} onCambio={onCambio} />
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
        <RegistroHoras orden={orden} onCambio={onCambio} />
        <RegistroRecurso orden={orden} onCambio={onCambio} />
        <Observaciones orden={orden} onCambio={onCambio} />
      </div>
      <CapturaCampo orden={orden} onCambio={onCambio} />
      <BarraCampo orden={orden} onCambio={onCambio} />
    </div>
  );
}

/**
 * Captura de terreno (punto 9): foto, firma y geolocalización con objetivos
 * táctiles amplios. La foto y la firma se registran como EVIDENCIA de la OT
 * (patrón Attachment de plataforma, paso online). Reutiliza `agregarEvidencia`.
 */
function CapturaCampo({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  const toast = useToast();
  const { cola } = useOffline();
  const geo = useGeolocalizacion();
  const [ocupado, setOcupado] = useState(false);

  async function subir(archivo: ArchivoCampo, categoria: string) {
    setOcupado(true);
    try {
      const hashSha256 = await sha256Hex(await archivo.blob.arrayBuffer());
      const r = await agregarEvidencia(cola, orden.id, orden.version, {
        categoria,
        nombreArchivo: archivo.nombreArchivo,
        mimeType: archivo.mimeType,
        tamanoBytes: archivo.tamanoBytes,
        hashSha256,
      });
      if (r.error) toast.mostrar({ variant: "error", titulo: "No se pudo registrar", mensaje: r.error.message });
      else { toast.mostrar({ variant: "exito", titulo: categoria === "firma" ? "Firma registrada" : "Foto registrada" }); onCambio(); }
    } catch (e) {
      toast.mostrar({ variant: "error", titulo: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardHeader><strong>Captura de terreno</strong></CardHeader>
      <CardContent>
        <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }} aria-busy={ocupado}>
          <CapturaFoto onCapturar={(a) => void subir(a, "fotografia")} />
          <CapturaFirma onFirmar={(a) => void subir(a, "firma")} />
          <CapturaGeolocalizacion geo={geo} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Barra de acciones rápidas a una mano (móvil), fija al pie de la ejecución. */
function BarraCampo({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  async function bitacora(accion: string) {
    const r = await registrarBitacora(cola, orden.id, accion, { origen: "campo" });
    if (r.error) toast.mostrar({ variant: "error", titulo: r.error.message });
    else { toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: ETIQUETA_BITACORA[accion as keyof typeof ETIQUETA_BITACORA] ?? accion }); onCambio(); }
  }
  return (
    <BarraAccionesCampo etiqueta="Acciones rápidas de campo">
      <AccionRapida variant="primario" onClick={() => void bitacora("inicio")}>▶ Inicio</AccionRapida>
      <AccionRapida onClick={() => void bitacora("pausa")}>⏸ Pausa</AccionRapida>
      <AccionRapida onClick={() => void bitacora("reanudacion")}>⏵ Reanudar</AccionRapida>
      <AccionRapida onClick={() => void bitacora("llegada")}>📍 Llegada</AccionRapida>
      <AccionRapida onClick={() => void bitacora("salida")}>🚪 Salida</AccionRapida>
    </BarraAccionesCampo>
  );
}

/** Referencia normalizada de una plantilla asociada (read model documentacion). */
export interface AsociacionPlantilla {
  clase: "formulario" | "checklist";
  clave: string;
  version: number;
  titulo: string;
  respuestaId: string | null;
}

/** Normaliza una fila `documentacion` (clase formulario/checklist) a su referencia. */
export function refDeAsociacion(
  doc: DocumentoOrden & Record<string, unknown>,
  claseFallback: "formulario" | "checklist",
): AsociacionPlantilla | null {
  const datos = (doc.datos as Record<string, unknown> | undefined) ?? {};
  const clave = String(doc.referenciaClave ?? datos.clave ?? "");
  if (!clave) return null;
  const version = Number(doc.referenciaVersion ?? datos.version ?? 0) || 0;
  const respuesta = (datos.respuesta as { respuestaId?: string } | undefined)?.respuestaId ?? (doc.respuestaId as string | undefined) ?? null;
  return {
    clase: (doc.clase as "formulario" | "checklist") ?? claseFallback,
    clave,
    version,
    titulo: String(doc.titulo ?? datos.titulo ?? datos.etiqueta ?? clave),
    respuestaId: respuesta,
  };
}

/**
 * Checklist / formulario asociado a la OT (Dynamic Forms). Lista los
 * formularios y checklists REALMENTE asociados (read model), permite asociar
 * nuevos vía los comandos `asociarFormulario`/`asociarChecklist` (el backend
 * verifica la plantilla contra Dynamic Forms) y RENDERIZA cada plantilla
 * asociada resolviendo su definición (clave+versión exacta) desde el runtime de
 * Dynamic Forms, persistiendo la respuesta ANCLADA a esa clave+versión vía el
 * flujo real de Dynamic Forms (`capturarRespuestaPlantilla`).
 */
function ChecklistFormulario({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  const forms = useFormularios(orden.id);
  const checks = useChecklists(orden.id);
  const [asociar, setAsociar] = useState<null | "formulario" | "checklist">(null);

  const asociaciones = useMemo(() => {
    const c = (checks.datos ?? []).map((d) => refDeAsociacion(d as DocumentoOrden & Record<string, unknown>, "checklist")).filter(Boolean) as AsociacionPlantilla[];
    const f = (forms.datos ?? []).map((d) => refDeAsociacion(d as DocumentoOrden & Record<string, unknown>, "formulario")).filter(Boolean) as AsociacionPlantilla[];
    return [...c, ...f];
  }, [checks.datos, forms.datos]);

  const recargarTodo = () => { forms.recargar(); checks.recargar(); onCambio(); };

  return (
    <Card>
      <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <strong>Formularios y checklists</strong>
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          <Button variant="secundario" size="sm" onClick={() => setAsociar("checklist")}>Asociar checklist</Button>
          <Button variant="secundario" size="sm" onClick={() => setAsociar("formulario")}>Asociar formulario</Button>
        </div>
      </CardHeader>
      <CardContent>
        {asociaciones.length === 0 ? (
          <p style={{ margin: 0, fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }} data-testid="ejec-sin-plantillas">
            Sin formularios ni checklists asociados. Asocia uno para capturar su resultado durante la ejecución.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "var(--do-sp-4)" }}>
            {asociaciones.map((a) => (
              <CapturaPlantilla key={`${a.clase}:${a.clave}:${a.version}`} orden={orden} asociacion={a} onCambio={recargarTodo} />
            ))}
          </div>
        )}
      </CardContent>
      {asociar && (
        <ModalAsociar
          clase={asociar}
          orden={orden}
          onCerrar={() => setAsociar(null)}
          onHecho={() => { setAsociar(null); recargarTodo(); }}
        />
      )}
    </Card>
  );
}

function ModalAsociar({
  clase, orden, onCerrar, onHecho,
}: { clase: "formulario" | "checklist"; orden: OrdenRow; onCerrar: () => void; onHecho: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const def = useMemo(() => plantillaAsociarPlantilla(clase), [clase]);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { setErr("Indica clave y versión de la plantilla."); return; }
    const ref: RefPlantilla = {
      clave: String(form.valores.clave),
      version: Number(form.valores.version),
      etiqueta: form.valores.etiqueta ? String(form.valores.etiqueta) : undefined,
    };
    setGuardando(true);
    setErr(null);
    const fn = clase === "formulario" ? asociarFormulario : asociarChecklist;
    const r = await fn(cola, orden.id, orden.version, ref);
    setGuardando(false);
    if (r.error) { setErr(r.error.message); return; }
    toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "En cola" : `${clase === "formulario" ? "Formulario" : "Checklist"} asociado` });
    onHecho();
  }

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo={clase === "formulario" ? "Asociar formulario" : "Asociar checklist"}
      pie={
        <>
          <Button variant="fantasma" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primario" loading={guardando} onClick={() => void guardar()}>Asociar</Button>
        </>
      }
    >
      {err && <Alert variant="error" titulo={err} />}
      <Alert variant="info" titulo="Verificación en el backend">
        La plantilla se valida contra Dynamic Forms (existencia, clase y versión N|N-1). Si no existe, la asociación se rechaza.
      </Alert>
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}

/**
 * Captura del resultado de UNA plantilla asociada. Resuelve la DEFINICIÓN real
 * por clave+versión desde Dynamic Forms y la renderiza con `FormularioDinamico`;
 * al guardar, persiste la respuesta ANCLADA a `{clase, clave, version}` de la
 * asociación (no un diagnóstico genérico sin ancla) vía el flujo real de
 * Dynamic Forms (`capturarRespuestaPlantilla`).
 */
export function CapturaPlantilla({
  orden, asociacion, onCambio,
}: { orden: OrdenRow; asociacion: AsociacionPlantilla; onCambio: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const resuelta = usePlantillaDefinicion(asociacion.clave, asociacion.version);
  const def = useMemo(() => coaccionarDefinicion(resuelta.datos?.definicion), [resuelta.datos]);
  const form = useFormularioDinamico(def ?? DEF_VACIA, {}, {});
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!def) return;
    if (!form.esValido()) { toast.mostrar({ variant: "advertencia", titulo: "Completa el formulario asociado" }); return; }
    setGuardando(true);
    // Respuesta ANCLADA a la plantilla asociada concreta (clase+clave+versión):
    // el servidor compone borrador→enviar→re-asociar con respuestaId.
    const r = await capturarRespuestaPlantilla(
      cola,
      orden.id,
      asociacion.clase,
      { clave: asociacion.clave, version: asociacion.version, etiqueta: asociacion.titulo },
      { ...form.valores },
    );
    setGuardando(false);
    if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
    else { toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "En cola" : `${asociacion.clase === "checklist" ? "Checklist" : "Formulario"} registrado` }); form.setValores({}); onCambio(); }
  }

  const etiquetaClase = asociacion.clase === "checklist" ? "Checklist" : "Formulario";
  return (
    <div data-testid={`captura-${asociacion.clase}-${asociacion.clave}`}>
      <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", marginBottom: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--do-text-sm)", fontWeight: 600 }}>{etiquetaClase}: {asociacion.titulo}</span>
        <Badge variant="neutro">{asociacion.clave} · v{asociacion.version}</Badge>
        {asociacion.respuestaId && <Badge variant="exito">respuesta anclada</Badge>}
      </div>
      {resuelta.cargando && <p style={{ margin: 0, fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>Cargando definición…</p>}
      {resuelta.error && <Alert variant="error" titulo="No se pudo cargar la definición asociada">{resuelta.error.message}</Alert>}
      {!resuelta.cargando && !resuelta.error && !def && (
        <Alert variant="advertencia" titulo="Definición no disponible">
          La plantilla {asociacion.clave} v{asociacion.version} no expone una definición renderizable en Dynamic Forms.
        </Alert>
      )}
      {def && (
        <>
          <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
          <div style={{ marginTop: "var(--do-sp-2)" }}>
            <Button variant="primario" size="sm" loading={guardando} onClick={() => void guardar()}>Guardar {etiquetaClase.toLowerCase()}</Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Botonera de bitácora + modal de detalle. */
function BitacoraRapida({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const def = useMemo(() => plantillaBitacora(OPCIONES_BITACORA), []);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);

  async function registrar(accion: string, nota?: string) {
    setGuardando(true);
    const r = await registrarBitacora(cola, orden.id, accion, nota ? { nota } : {});
    setGuardando(false);
    if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
    else if (r.encolada) toast.mostrar({ variant: "info", titulo: "Sin conexión", mensaje: "Evento en cola." });
    else { toast.mostrar({ variant: "exito", titulo: "Bitácora", mensaje: `${ETIQUETA_BITACORA[accion as keyof typeof ETIQUETA_BITACORA] ?? accion} registrado.` }); onCambio(); }
  }

  return (
    <Card>
      <CardHeader><strong>Bitácora operacional</strong></CardHeader>
      <CardContent>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", marginBottom: "var(--do-sp-3)" }}>
          {ACCIONES_BITACORA.map((a) => (
            <Button key={a} variant="secundario" size="sm" disabled={guardando} onClick={() => void registrar(a)}>
              {ETIQUETA_BITACORA[a]}
            </Button>
          ))}
        </div>
        <details>
          <summary style={{ cursor: "pointer", color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
            Registrar con nota
          </summary>
          <div style={{ marginTop: "var(--do-sp-2)", display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
            <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
            <div>
              <Button
                variant="primario"
                size="sm"
                disabled={guardando || !form.valores.accion}
                onClick={() => void registrar(String(form.valores.accion), form.valores.nota ? String(form.valores.nota) : undefined)}
              >
                Registrar entrada
              </Button>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function RegistroHoras({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const def = useMemo(() => plantillaHoras(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!form.esValido()) { toast.mostrar({ variant: "advertencia", titulo: "Completa las horas" }); return; }
    setGuardando(true);
    const r = await registrarEjecucion(cola, orden.id, orden.version, {
      tipo: "horas",
      horas: Number(form.valores.horas),
      descripcion: form.valores.descripcion ?? null,
    });
    setGuardando(false);
    if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
    else { toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "En cola" : "Horas registradas" }); form.setValores({}); onCambio(); }
  }

  return (
    <Card>
      <CardHeader><strong>Registrar horas</strong></CardHeader>
      <CardContent>
        <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
        <div style={{ marginTop: "var(--do-sp-2)" }}>
          <Button variant="primario" size="sm" loading={guardando} onClick={() => void guardar()}>Guardar horas</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RegistroRecurso({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const def = useMemo(() => plantillaRecurso(), []);
  const form = useFormularioDinamico(def, {}, { clase: "material" });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!form.esValido()) { toast.mostrar({ variant: "advertencia", titulo: "Completa el recurso (clase y referencia)" }); return; }
    setGuardando(true);
    const r = await registrarRecurso(cola, orden.id, {
      clase: String(form.valores.clase),
      referenciaId: String(form.valores.referenciaId),
      descripcion: form.valores.descripcion != null ? String(form.valores.descripcion) : null,
      cantidad: form.valores.cantidad != null && form.valores.cantidad !== "" ? Number(form.valores.cantidad) : null,
      unidad: form.valores.unidad != null && form.valores.unidad !== "" ? String(form.valores.unidad) : null,
    });
    setGuardando(false);
    if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
    else { toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "En cola" : "Recurso registrado", mensaje: "Queda registrado en la cronología de la orden." }); form.setValores({ clase: "material" }); onCambio(); }
  }

  return (
    <Card>
      <CardHeader><strong>Materiales, herramientas y recursos</strong></CardHeader>
      <CardContent>
        <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
        <div style={{ marginTop: "var(--do-sp-2)" }}>
          <Button variant="primario" size="sm" loading={guardando} onClick={() => void guardar()}>Registrar recurso</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Observaciones({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const def = useMemo(() => plantillaComentarioOrden(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!form.esValido()) { toast.mostrar({ variant: "advertencia", titulo: "Escribe una observación" }); return; }
    setGuardando(true);
    const r = await registrarEjecucion(cola, orden.id, orden.version, {
      tipo: "observacion",
      observaciones: String(form.valores.texto),
    });
    setGuardando(false);
    if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
    else { toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "En cola" : "Observación registrada" }); form.setValores({}); onCambio(); }
  }

  return (
    <Card>
      <CardHeader><strong>Observaciones y comentarios</strong></CardHeader>
      <CardContent>
        <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
        <div style={{ marginTop: "var(--do-sp-2)" }}>
          <Button variant="primario" size="sm" loading={guardando} onClick={() => void guardar()}>Guardar observación</Button>
        </div>
      </CardContent>
    </Card>
  );
}

