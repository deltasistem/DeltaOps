/**
 * DGP-013 · Ficha 360° de una solicitud de compra.
 *
 * Pestañas: General, Líneas, Cotizaciones (COMPARADOR multi-proveedor:
 * totales/plazo/ranking + selección explícita → `seleccionar-cotizacion`),
 * Historial. Las acciones de Workflow (`AccionesWorkflow`) envían SU transición
 * real (`enviar`/`aprobar`/`rechazar`/`cerrar`) al endpoint gobernado; `rechazar`
 * exige motivo (`motivoRechazo`). NUNCA hay bypass del motor. Consume `?tab=`.
 */
import React, { useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Tabs, Table, Button, Spinner, EmptyState, ErrorState, Modal, Alert, Badge,
} from "@workspace/design-system";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useSolicitud, useCotizaciones, useHistorial } from "../lib/abastecimiento/hooks";
import { useOffline } from "../lib/offline/contexto";
import { transicionarSolicitud, seleccionarCotizacion } from "../lib/abastecimiento/mutaciones";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaSeleccionCotizacion } from "../lib/forms/plantillas-abastecimiento";
import { BadgeEstadoSolicitud, fechaCorta, cantidadTexto, dinero } from "../lib/abastecimiento/componentes";
import { leerParam, urlOrigenSolicitud, urlNuevaOrdenCompra } from "../lib/abastecimiento/deep-links";
import {
  ACCIONES_SOLICITUD, ACCIONES_SOLICITUD_POR_ESTADO, type AccionSolicitud, type DefinicionAccion,
} from "../lib/abastecimiento/constantes";
import { compararCotizaciones, PESOS_POR_DEFECTO, type PesosComparacion, type FilaComparacion } from "../lib/abastecimiento/comparador";
import type { SolicitudRow, CotizacionRow } from "../lib/abastecimiento/tipos";

export default function AbastecimientoSolicitudFichaPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellAbastecimiento>
      <Ficha id={id} />
    </ShellAbastecimiento>
  );
}

function Ficha({ id }: { id: string }) {
  const { datos: solicitud, cargando, error, recargar } = useSolicitud(id);
  const tabInicial = leerParam(typeof window !== "undefined" ? window.location.search : "", "tab");

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar la solicitud" descripcion={error.message} onReintentar={recargar} />;
  if (!solicitud) return <EmptyState titulo="Solicitud no encontrada" descripcion="La solicitud solicitada no existe o no está disponible." />;

  return (
    <>
      <PageHeader
        titulo={solicitud.titulo}
        descripcion={`Prioridad ${solicitud.prioridad} · Origen ${solicitud.origen?.tipo ?? "—"}`}
        acciones={<BadgeEstadoSolicitud estado={solicitud.estado} />}
      />
      <AccionesWorkflow solicitud={solicitud} onCambio={recargar} />
      <Tabs
        porDefecto={tabInicial}
        items={[
          { id: "general", etiqueta: "General", contenido: <TabGeneral solicitud={solicitud} /> },
          { id: "lineas", etiqueta: "Líneas", contenido: <TabLineas solicitud={solicitud} /> },
          { id: "cotizaciones", etiqueta: "Cotizaciones", contenido: <Comparador solicitud={solicitud} onCambio={recargar} /> },
          { id: "historial", etiqueta: "Historial", contenido: <TabHistorial entityRef={`solicitud:${id}`} /> },
        ]}
      />
    </>
  );
}

/* --------------------------- Acciones de Workflow ----------------------- */

export function AccionesWorkflow({ solicitud, onCambio }: { solicitud: SolicitudRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const [confirmar, setConfirmar] = useState<DefinicionAccion<AccionSolicitud> | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const version = solicitud.version ?? 1;
  const disponibles = ACCIONES_SOLICITUD_POR_ESTADO[solicitud.estado] ?? [];
  const acciones = ACCIONES_SOLICITUD.filter((a) => disponibles.includes(a.clave));

  async function ejecutar(a: DefinicionAccion<AccionSolicitud>, motivoRechazo?: string) {
    setOcupado(a.clave); setMsg(null);
    const r = await transicionarSolicitud(cola, solicitud.id, a.clave, version, a.pideMotivo ? { motivoRechazo } : {});
    setOcupado(null);
    setConfirmar(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la operación se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: `Transición «${a.etiqueta}» aplicada.` }); onCambio(); }
  }

  return (
    <Section titulo="Acciones">
      <Card><CardContent>
        {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", alignItems: "center" }}>
          {acciones.map((a) => (
            <Button
              key={a.clave}
              size="sm"
              variant={a.peligro ? "peligro" : "secundario"}
              data-testid={`accion-solicitud-${a.clave}`}
              loading={ocupado === a.clave}
              onClick={() => (a.pideMotivo ? setConfirmar(a) : void ejecutar(a))}
            >
              {a.etiqueta}
            </Button>
          ))}
          {acciones.length === 0 && (
            <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>No hay transiciones disponibles en el estado actual.</span>
          )}
        </div>
      </CardContent></Card>
      {confirmar && (
        <ModalRechazo
          accion={confirmar}
          ocupado={ocupado === confirmar.clave}
          onCerrar={() => setConfirmar(null)}
          onConfirmar={(motivo) => void ejecutar(confirmar, motivo)}
        />
      )}
    </Section>
  );
}

function ModalRechazo({ accion, ocupado, onCerrar, onConfirmar }: {
  accion: DefinicionAccion<AccionSolicitud>;
  ocupado: boolean;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  function confirmar() {
    const m = motivo.trim();
    if (!m) { setErr("El motivo de rechazo es obligatorio."); return; }
    onConfirmar(m);
  }
  return (
    <Modal abierto onClose={onCerrar} titulo={`Transición: ${accion.etiqueta}`}
      pie={<><Button variant="fantasma" onClick={onCerrar}>Volver</Button><Button variant="peligro" loading={ocupado} data-testid="confirmar-rechazo" onClick={confirmar}>{`Confirmar ${accion.etiqueta.toLowerCase()}`}</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <label style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
        <span>Motivo de rechazo <span aria-hidden="true">*</span></span>
        <textarea
          aria-label="Motivo de rechazo"
          data-testid="input-motivo-rechazo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          style={{ font: "inherit", padding: "var(--do-sp-2)", borderRadius: "var(--do-radio)", border: "1px solid var(--do-borde)" }}
        />
      </label>
    </Modal>
  );
}

/* ------------------------------- Tabs base ------------------------------ */

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (<><dt style={{ color: "var(--do-texto-suave)" }}>{etiqueta}</dt><dd style={{ margin: 0 }}>{valor}</dd></>);
}

function TabGeneral({ solicitud }: { solicitud: SolicitudRow }) {
  const origenUrl = urlOrigenSolicitud(solicitud.origen);
  return (
    <Section titulo="Datos generales">
      <Card><CardContent>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
          <Fila etiqueta="Título" valor={solicitud.titulo} />
          <Fila etiqueta="Descripción" valor={solicitud.descripcion ?? "—"} />
          <Fila etiqueta="Prioridad" valor={solicitud.prioridad} />
          <Fila etiqueta="Estado" valor={<BadgeEstadoSolicitud estado={solicitud.estado} />} />
          <Fila etiqueta="Origen" valor={solicitud.origen?.etiqueta ?? solicitud.origen?.tipo ?? "—"} />
          <Fila etiqueta="Referencia de origen" valor={origenUrl ? <Link href={origenUrl}><Button variant="fantasma" size="sm">Ver origen</Button></Link> : (solicitud.origen?.referenciaId ?? "—")} />
          {solicitud.motivoRechazo && <Fila etiqueta="Motivo de rechazo" valor={solicitud.motivoRechazo} />}
          <Fila etiqueta="Versión" valor={solicitud.version ?? 1} />
        </dl>
      </CardContent></Card>
    </Section>
  );
}

function TabLineas({ solicitud }: { solicitud: SolicitudRow }) {
  const lineas = solicitud.lineas ?? [];
  if (lineas.length === 0) return <Section titulo="Líneas"><Card><CardContent><EmptyState titulo="Sin líneas" descripcion="La solicitud no tiene líneas." /></CardContent></Card></Section>;
  return (
    <Section titulo="Líneas">
      <Card><CardContent>
        <Table caption="Líneas de la solicitud" captionOculto>
          <thead><tr><th scope="col">#</th><th scope="col">Descripción</th><th scope="col">Artículo</th><th scope="col">Cantidad</th><th scope="col">Notas</th></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}><td>{l.numero ?? i + 1}</td><td>{l.descripcion}</td><td>{l.articuloId ?? "—"}</td><td>{cantidadTexto(l.cantidad)}</td><td>{l.notas ?? "—"}</td></tr>
            ))}
          </tbody>
        </Table>
      </CardContent></Card>
    </Section>
  );
}

/* --------------------- Comparador de cotizaciones ----------------------- */

export function Comparador({ solicitud, onCambio }: { solicitud: SolicitudRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const [, navegar] = useLocation();
  const { datos: cotizaciones, cargando, error, recargar } = useCotizaciones(solicitud.id);
  const defPesos = useMemo(() => plantillaSeleccionCotizacion(), []);
  const form = useFormularioDinamico(defPesos, {}, {});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const pesos: PesosComparacion = {
    precio: Number(form.valores.precio ?? PESOS_POR_DEFECTO.precio),
    plazoEntrega: Number(form.valores.plazoEntrega ?? PESOS_POR_DEFECTO.plazoEntrega),
    calificacion: Number(form.valores.calificacion ?? PESOS_POR_DEFECTO.calificacion),
  };
  const comparacion: FilaComparacion[] = useMemo(
    () => compararCotizaciones(cotizaciones ?? [], pesos),
    [cotizaciones, pesos.precio, pesos.plazoEntrega, pesos.calificacion],
  );

  async function seleccionar(cot: CotizacionRow) {
    setOcupado(cot.id); setMsg(null);
    const r = await seleccionarCotizacion(cola, solicitud.id, { cotizacionId: cot.id, pesos });
    setOcupado(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la selección se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Cotización seleccionada." }); onCambio(); recargar(); }
  }

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudieron cargar las cotizaciones" descripcion={error.message} onReintentar={recargar} />;
  if ((cotizaciones ?? []).length === 0) return <Section titulo="Cotizaciones"><Card><CardContent><EmptyState titulo="Sin cotizaciones" descripcion="Aún no se han registrado cotizaciones para esta solicitud." /></CardContent></Card></Section>;

  return (
    <Section titulo="Comparador de cotizaciones">
      <Card><CardContent>
        <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>Ajusta los pesos para recalcular el ranking. La selección es explícita y la ejecuta el motor.</p>
        <FormularioDinamico definicion={defPesos} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
      </CardContent></Card>
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <Card><CardContent>
        <Table caption="Comparación de cotizaciones" captionOculto>
          <thead>
            <tr>
              <th scope="col">Ranking</th>
              <th scope="col">Proveedor</th>
              <th scope="col">Total</th>
              <th scope="col">Plazo (días)</th>
              <th scope="col">Puntuación</th>
              <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {comparacion.map((f) => (
              <tr key={f.cotizacion.id} data-testid={`fila-cotizacion-${f.cotizacion.id}`} style={f.ranking === 1 ? { background: "var(--do-surface-2)" } : undefined}>
                <td>
                  {f.ranking === 1 ? <Badge variant="exito">#1 recomendada</Badge> : `#${f.ranking}`}
                </td>
                <td>{f.cotizacion.proveedorNombre ?? f.cotizacion.proveedorId}</td>
                <td data-testid={`total-${f.cotizacion.id}`}>
                  {dinero({ monto: f.total, moneda: f.cotizacion.moneda })}
                  {f.esMejorPrecio && <Badge variant="info">mejor precio</Badge>}
                </td>
                <td>
                  {f.plazoMaxDias}
                  {f.esMejorPlazo && <Badge variant="info">mejor plazo</Badge>}
                </td>
                <td>{(f.puntuacion * 100).toFixed(0)}%</td>
                <td>
                  <div style={{ display: "flex", gap: "var(--do-sp-1)", flexWrap: "wrap" }}>
                    {f.cotizacion.seleccionada ? (
                      <Badge variant="exito">Seleccionada</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="primario"
                        data-testid={`seleccionar-${f.cotizacion.id}`}
                        loading={ocupado === f.cotizacion.id}
                        onClick={() => void seleccionar(f.cotizacion)}
                      >
                        Seleccionar
                      </Button>
                    )}
                    {f.cotizacion.seleccionada && (
                      <Button
                        size="sm"
                        variant="secundario"
                        onClick={() => navegar(urlNuevaOrdenCompra({ solicitudId: solicitud.id, cotizacionId: f.cotizacion.id }))}
                      >
                        Crear OC
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardContent></Card>
    </Section>
  );
}

function TabHistorial({ entityRef }: { entityRef: string }) {
  const { datos, cargando, error } = useHistorial(entityRef);
  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el historial" descripcion={error.message} />;
  if (!datos || datos.length === 0) return <EmptyState titulo="Sin historial" descripcion="Aún no hay eventos registrados." />;
  return (
    <Section titulo="Historial">
      <Card><CardContent>
        <Table caption="Historial de la solicitud" captionOculto>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Descripción</th><th scope="col">Motivo</th></tr></thead>
          <tbody>
            {datos.map((h, i) => (<tr key={h.id ?? i}><td>{fechaCorta(h.fecha)}</td><td>{h.tipo}</td><td>{h.descripcion ?? "—"}</td><td>{h.motivo ?? "—"}</td></tr>))}
          </tbody>
        </Table>
      </CardContent></Card>
    </Section>
  );
}
