/**
 * DGP-013 · Ficha 360° de una orden de compra.
 *
 * Pestañas: General, Líneas (con avance de recepción por línea: parcial/total),
 * Recepciones (registro por líneas + MATERIALIZACIÓN a inventario, mostrando
 * movimientos creados vs idempotentes con deep link a movimientos de
 * inventario), Historial. Las acciones de Workflow (`AccionesWorkflow`) envían SU
 * transición real (`aprobar`/`enviar`/`cancelar`) al endpoint gobernado.
 * Consume `?tab=`.
 */
import React, { useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Tabs, Table, Button, Spinner, EmptyState, ErrorState, Modal, Alert, Badge, Progress,
} from "@workspace/design-system";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useOrdenCompra, useRecepciones, useHistorial } from "../lib/abastecimiento/hooks";
import { useOffline } from "../lib/offline/contexto";
import { transicionarOrdenCompra, registrarRecepcion, materializarRecepcion } from "../lib/abastecimiento/mutaciones";
import { construirInputRecepcion } from "../lib/abastecimiento/alta";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaRecepcion } from "../lib/forms/plantillas-abastecimiento";
import { BadgeEstadoOC, fechaCorta, montoMoneda, cantidadTexto, dinero } from "../lib/abastecimiento/componentes";
import { leerParam, urlMovimientosInventario } from "../lib/abastecimiento/deep-links";
import { EtiquetaRecepcion, EtiquetaItem } from "../lib/abastecimiento/EtiquetaAbastecimiento";
import {
  ACCIONES_OC, ACCIONES_OC_POR_ESTADO, type AccionOC, type DefinicionAccion,
} from "../lib/abastecimiento/constantes";
import type { OrdenCompraRow, RecepcionRow, ResultadoMaterializacion } from "../lib/abastecimiento/tipos";

export default function AbastecimientoOrdenFichaPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellAbastecimiento>
      <Ficha id={id} />
    </ShellAbastecimiento>
  );
}

function Ficha({ id }: { id: string }) {
  const { datos: oc, cargando, error, recargar } = useOrdenCompra(id);
  const tabInicial = leerParam(typeof window !== "undefined" ? window.location.search : "", "tab");

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar la orden" descripcion={error.message} onReintentar={recargar} />;
  if (!oc) return <EmptyState titulo="Orden no encontrada" descripcion="La orden de compra solicitada no existe o no está disponible." />;

  return (
    <>
      <PageHeader
        titulo={oc.codigo ?? `OC ${oc.id}`}
        descripcion={`Proveedor ${oc.proveedorNombre ?? oc.proveedorId} · ${montoMoneda(oc.total, oc.moneda)}`}
        acciones={<BadgeEstadoOC estado={oc.estado} />}
      />
      <AccionesWorkflow oc={oc} onCambio={recargar} />
      <Tabs
        porDefecto={tabInicial}
        items={[
          { id: "general", etiqueta: "General", contenido: <TabGeneral oc={oc} /> },
          { id: "lineas", etiqueta: "Líneas", contenido: <TabLineas oc={oc} /> },
          { id: "recepciones", etiqueta: "Recepciones", contenido: <TabRecepciones oc={oc} onCambio={recargar} /> },
          { id: "historial", etiqueta: "Historial", contenido: <TabHistorial entityRef={`orden-compra:${id}`} /> },
        ]}
      />
    </>
  );
}

/* --------------------------- Acciones de Workflow ----------------------- */

export function AccionesWorkflow({ oc, onCambio }: { oc: OrdenCompraRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<DefinicionAccion<AccionOC> | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const version = oc.version ?? 1;
  const disponibles = ACCIONES_OC_POR_ESTADO[oc.estado] ?? [];
  const acciones = ACCIONES_OC.filter((a) => disponibles.includes(a.clave));

  async function ejecutar(a: DefinicionAccion<AccionOC>) {
    setOcupado(a.clave); setMsg(null);
    const r = await transicionarOrdenCompra(cola, oc.id, a.clave, version);
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
              data-testid={`accion-oc-${a.clave}`}
              loading={ocupado === a.clave}
              onClick={() => (a.peligro ? setConfirmar(a) : void ejecutar(a))}
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
        <Modal abierto onClose={() => setConfirmar(null)} titulo={`Transición: ${confirmar.etiqueta}`}
          pie={<><Button variant="fantasma" onClick={() => setConfirmar(null)}>Volver</Button><Button variant="peligro" loading={ocupado === confirmar.clave} data-testid="confirmar-oc" onClick={() => void ejecutar(confirmar)}>{`Confirmar ${confirmar.etiqueta.toLowerCase()}`}</Button></>}>
          <p>¿Confirmas la transición «{confirmar.etiqueta}» de esta orden de compra?</p>
        </Modal>
      )}
    </Section>
  );
}

/* ------------------------------- Tabs base ------------------------------ */

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (<><dt style={{ color: "var(--do-texto-suave)" }}>{etiqueta}</dt><dd style={{ margin: 0 }}>{valor}</dd></>);
}

function TabGeneral({ oc }: { oc: OrdenCompraRow }) {
  return (
    <Section titulo="Datos generales">
      <Card><CardContent>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
          <Fila etiqueta="Código" valor={oc.codigo ?? oc.id} />
          <Fila etiqueta="Proveedor" valor={oc.proveedorNombre ?? oc.proveedorId} />
          <Fila etiqueta="Moneda" valor={oc.moneda} />
          <Fila etiqueta="Total" valor={montoMoneda(oc.total, oc.moneda)} />
          <Fila etiqueta="Solicitud de origen" valor={oc.solicitudId ?? "—"} />
          <Fila etiqueta="Cotización" valor={oc.cotizacionId ?? "—"} />
          <Fila etiqueta="Condiciones de pago" valor={oc.condicionesPago ?? "—"} />
          <Fila etiqueta="Condiciones de entrega" valor={oc.condicionesEntrega ?? "—"} />
          <Fila etiqueta="Estado" valor={<BadgeEstadoOC estado={oc.estado} />} />
          <Fila etiqueta="Versión" valor={oc.version ?? 1} />
        </dl>
      </CardContent></Card>
    </Section>
  );
}

function TabLineas({ oc }: { oc: OrdenCompraRow }) {
  const lineas = oc.lineas ?? [];
  if (lineas.length === 0) return <Section titulo="Líneas"><Card><CardContent><EmptyState titulo="Sin líneas" descripcion="La orden no tiene líneas." /></CardContent></Card></Section>;
  return (
    <Section titulo="Líneas y avance de recepción">
      <Card><CardContent>
        <Table caption="Líneas de la orden de compra" captionOculto>
          <thead><tr><th scope="col">#</th><th scope="col">Descripción</th><th scope="col">Cantidad</th><th scope="col">Precio unit.</th><th scope="col">Recibido</th><th scope="col">Avance</th></tr></thead>
          <tbody>
            {lineas.map((l, i) => {
              const pedida = l.cantidad?.valor ?? 0;
              const recibida = l.cantidadRecibida ?? 0;
              const pct = pedida > 0 ? Math.min(100, Math.round((recibida / pedida) * 100)) : 0;
              return (
                <tr key={i}>
                  <td>{l.numero ?? i + 1}</td>
                  <td>{l.descripcion}</td>
                  <td>{cantidadTexto(l.cantidad)}</td>
                  <td>{dinero(l.precioUnitario)}</td>
                  <td>{recibida} / {pedida}</td>
                  <td style={{ minWidth: 140 }}>
                    <Progress value={pct} etiqueta={`${pct}%`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </CardContent></Card>
    </Section>
  );
}

/* ------------------------------ Recepciones ----------------------------- */

function TabRecepciones({ oc, onCambio }: { oc: OrdenCompraRow; onCambio: () => void }) {
  const { datos: recepciones, cargando, error, recargar } = useRecepciones(oc.id);
  const [registrar, setRegistrar] = useState(false);
  const puedeRecibir = oc.estado === "ENVIADA" || oc.estado === "APROBADA" || oc.estado === "RECIBIDA_PARCIAL";

  return (
    <Section
      titulo="Recepciones"
      acciones={puedeRecibir ? <Button variant="primario" size="sm" data-testid="registrar-recepcion" onClick={() => setRegistrar(true)}>Registrar recepción</Button> : undefined}
    >
      {cargando ? <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
        : error ? <ErrorState titulo="No se pudieron cargar las recepciones" descripcion={error.message} onReintentar={recargar} />
        : (recepciones ?? []).length === 0 ? <Card><CardContent><EmptyState titulo="Sin recepciones" descripcion="Aún no se ha registrado ninguna recepción para esta orden." /></CardContent></Card>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            {(recepciones ?? []).map((r) => <TarjetaRecepcion key={r.id} recepcion={r} onCambio={() => { recargar(); onCambio(); }} />)}
          </div>
        )}
      {registrar && (
        <ModalRecepcion
          oc={oc}
          onCerrar={() => setRegistrar(false)}
          onOk={() => { setRegistrar(false); recargar(); onCambio(); }}
        />
      )}
    </Section>
  );
}

export function TarjetaRecepcion({ recepcion, onCambio }: { recepcion: RecepcionRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const [, navegar] = useLocation();
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoMaterializacion | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);
  const [etiqueta, setEtiqueta] = useState(false);
  const [almacenExpandido, setAlmacenExpandido] = useState<string | null>(null);

  async function materializar() {
    setOcupado(true); setMsg(null);
    const r = await materializarRecepcion(cola, recepcion.id, {});
    setOcupado(false);
    if (r.encolada) { setMsg({ tono: "info", texto: "Sin conexión: la materialización se encoló." }); return; }
    if (r.error) { setMsg({ tono: "error", texto: r.error.message }); return; }
    const res = (r.resultado ?? {}) as ResultadoMaterializacion;
    setResultado(res);
    const movs = res.movimientos ?? [];
    const creados = movs.filter((m) => !m.idempotente).length;
    const idem = movs.filter((m) => m.idempotente).length;
    setMsg({ tono: "exito", texto: `Materializada: ${creados} movimiento(s) creado(s), ${idem} idempotente(s).` });
    onCambio();
  }

  const movs = resultado?.movimientos ?? [];

  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <div>
            <strong>Recepción {recepcion.id}</strong>
            <div style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
              {(recepcion.lineas ?? []).length} línea(s) · {fechaCorta(recepcion.creadoEn)} {recepcion.nota ? `· ${recepcion.nota}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
            <Button variant="secundario" size="sm" data-testid={`etiqueta-recepcion-${recepcion.id}`} aria-pressed={etiqueta} onClick={() => setEtiqueta((v) => !v)}>
              {etiqueta ? "Ocultar etiqueta" : "Etiqueta"}
            </Button>
            {recepcion.materializada ? (
              <Badge variant="exito">Materializada</Badge>
            ) : (
              <Button variant="primario" size="sm" data-testid={`materializar-${recepcion.id}`} loading={ocupado} onClick={() => void materializar()}>
                Materializar a inventario
              </Button>
            )}
          </div>
        </div>

        {etiqueta && (
          <div style={{ marginTop: "var(--do-sp-3)" }} data-testid={`panel-etiqueta-recepcion-${recepcion.id}`}>
            <EtiquetaRecepcion recepcionId={recepcion.id} ordenCompraId={recepcion.ordenCompraId} materializada={recepcion.materializada} />
          </div>
        )}

        {(recepcion.lineas ?? []).length > 0 && (
          <Table caption="Líneas recibidas" captionOculto>
            <thead><tr><th scope="col">Línea OC</th><th scope="col">Cantidad</th><th scope="col">Novedad</th><th scope="col">Lote/Serie</th></tr></thead>
            <tbody>
              {(recepcion.lineas ?? []).map((l, i) => (
                <tr key={i}><td>{l.numeroLineaOC}</td><td>{cantidadTexto(l.cantidad)}</td><td>{l.novedad ?? "—"}</td><td>{l.lote ?? l.serie ?? "—"}</td></tr>
              ))}
            </tbody>
          </Table>
        )}

        {msg && <Alert variant={msg.tono} titulo={msg.texto} />}

        {movs.length > 0 && (
          <div style={{ marginTop: "var(--do-sp-3)" }}>
            <strong style={{ fontSize: "var(--do-text-sm)" }}>Movimientos de inventario</strong>
            <Table caption="Movimientos creados" captionOculto>
              <thead><tr><th scope="col">Movimiento</th><th scope="col">Item</th><th scope="col">Cantidad</th><th scope="col">Resultado</th><th scope="col">Almacenamiento</th><th scope="col"><span className="do-visualmente-oculto">Deep link</span></th></tr></thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.movimientoId} data-testid={`movimiento-${m.movimientoId}`}>
                    <td>{m.movimientoId}</td>
                    <td>{m.itemId ?? "—"}</td>
                    <td>{m.cantidad ?? "—"}</td>
                    <td><Badge variant={m.idempotente ? "neutro" : "exito"}>{m.idempotente ? "Idempotente" : "Creado"}</Badge></td>
                    <td>
                      {m.itemId
                        ? <Button variant="secundario" size="sm" data-testid={`etiqueta-almacenamiento-${m.movimientoId}`} aria-pressed={almacenExpandido === m.movimientoId} onClick={() => setAlmacenExpandido((v) => (v === m.movimientoId ? null : m.movimientoId))}>Etiqueta</Button>
                        : "—"}
                    </td>
                    <td><Button variant="fantasma" size="sm" data-testid={`ver-movimiento-${m.movimientoId}`} onClick={() => navegar(urlMovimientosInventario(m.itemId))}>Ver en inventario</Button></td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {(() => {
              const mov = movs.find((m) => m.movimientoId === almacenExpandido);
              if (!mov || !mov.itemId) return null;
              return (
                <div style={{ marginTop: "var(--do-sp-3)" }} data-testid={`panel-almacenamiento-${mov.movimientoId}`}>
                  <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", marginBottom: "var(--do-sp-1)" }}>Etiqueta de almacenamiento (QR del item de inventario)</div>
                  <EtiquetaItem itemId={mov.itemId} sku={mov.itemId} nombre={`Item ${mov.itemId}`} />
                </div>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ModalRecepcion({ oc, onCerrar, onOk }: { oc: OrdenCompraRow; onCerrar: () => void; onOk: () => void }) {
  const { cola } = useOffline();
  const lineasOC = (oc.lineas ?? []).map((l, i) => ({
    numeroLineaOC: l.numero ?? i + 1,
    descripcion: l.descripcion,
    unidad: l.cantidad?.unidad ?? "unidad",
  }));
  const def = useMemo(() => plantillaRecepcion(lineasOC), [oc.id]);
  const form = useFormularioDinamico(def, {}, {});
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Revisa las líneas recibidas."); return; }
    const input = construirInputRecepcion(form.valores, oc.id, oc.version ?? 1);
    if (input.lineas.length === 0) { setErr("Ingresa cantidad recibida (>0) en al menos una línea."); return; }
    setOcupado(true); setErr(null);
    const r = await registrarRecepcion(cola, input);
    setOcupado(false);
    if (r.encolada) onOk();
    else if (r.error) setErr(r.error.message);
    else onOk();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Registrar recepción"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={ocupado} data-testid="confirmar-recepcion" onClick={() => void guardar()}>Registrar</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
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
        <Table caption="Historial de la orden de compra" captionOculto>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Descripción</th><th scope="col">Actor</th></tr></thead>
          <tbody>
            {datos.map((h, i) => (<tr key={h.id ?? i}><td>{fechaCorta(h.fecha)}</td><td>{h.tipo}</td><td>{h.descripcion ?? "—"}</td><td>{h.actor ?? "—"}</td></tr>))}
          </tbody>
        </Table>
      </CardContent></Card>
    </Section>
  );
}
