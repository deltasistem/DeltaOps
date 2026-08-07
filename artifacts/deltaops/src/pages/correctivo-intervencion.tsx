/**
 * DGP-015 · Ficha de una intervención correctiva.
 *
 * Pestañas: General, Cuadrillas (correctivo mayor: múltiples cuadrillas,
 * responsables y recursos), Repuestos (reservar / consumir parcial / devolver
 * contra inventario real, con DEEP LINK a la solicitud de abastecimiento
 * auto-generada por faltante) e Historial. Las acciones de Workflow
 * (asignar|iniciarEjecucion|enviarVerificacion|cerrar) envían SU transición
 * REAL al endpoint gobernado (nunca bypass). Consume `?tab=`.
 */
import React, { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  PageHeader, Section, Card, CardContent, CardHeader, Tabs, Table, Badge,
  Button, Spinner, EmptyState, ErrorState, Modal, Alert,
} from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellCorrectivo } from "../lib/correctivo/Shell";
import { useIntervencion } from "../lib/correctivo/hooks";
import { useItems } from "../lib/inventario/hooks";
import { useArticulos } from "../lib/abastecimiento/hooks";
import { useOffline } from "../lib/offline/contexto";
import type { ColaSync } from "../lib/offline/cola";
import {
  transicionarIntervencion, asignarCuadrillas, reservarRepuestos,
  consumirRepuesto, devolverRepuesto,
} from "../lib/correctivo/mutaciones";
import { BadgeEstadoIntervencion } from "../lib/correctivo/componentes";
import {
  leerParam, urlOrdenTrabajo, urlItemInventario, urlSolicitudAbastecimiento, urlSolicitud,
} from "../lib/correctivo/deep-links";
import {
  ACCIONES_INTERVENCION, ACCIONES_INTERVENCION_POR_ESTADO,
  type AccionIntervencion, type DefinicionAccion,
} from "../lib/correctivo/constantes";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaCuadrillas, plantillaReservar, plantillaLineaRepuesto } from "../lib/forms/plantillas-correctivo";
import { construirCuadrillas, construirLineasRepuesto, construirLineaRepuesto } from "../lib/correctivo/alta";
import type { IntervencionRow, MovimientoRepuesto } from "../lib/correctivo/tipos";

export default function CorrectivoIntervencionPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellCorrectivo>
      <Ficha id={id} />
    </ShellCorrectivo>
  );
}

function Ficha({ id }: { id: string }) {
  const { datos: intervencion, cargando, error, recargar } = useIntervencion(id);
  const [, navegar] = useLocation();
  const tabInicial = leerParam(typeof window !== "undefined" ? window.location.search : "", "tab");

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar la intervención" descripcion={error.message} onReintentar={recargar} />;
  if (!intervencion) return <EmptyState titulo="Intervención no encontrada" descripcion="La intervención solicitada no existe o no está disponible." />;

  return (
    <>
      <PageHeader
        titulo={`Intervención ${intervencion.mayor ? "(mayor) " : ""}${intervencion.id}`}
        descripcion={intervencion.solicitudId ? `Solicitud ${intervencion.solicitudId}` : "Intervención correctiva"}
        acciones={<BadgeEstadoIntervencion estado={intervencion.estado} />}
      />
      <AccionesWorkflow intervencion={intervencion} onCambio={recargar} />
      <Tabs
        porDefecto={tabInicial}
        items={[
          { id: "general", etiqueta: "General", contenido: <TabGeneral intervencion={intervencion} onNavegar={navegar} /> },
          { id: "cuadrillas", etiqueta: "Cuadrillas", contenido: <TabCuadrillas intervencion={intervencion} onCambio={recargar} /> },
          { id: "repuestos", etiqueta: "Repuestos", contenido: <TabRepuestos intervencion={intervencion} onCambio={recargar} onNavegar={navegar} /> },
        ]}
      />
    </>
  );
}

/* --------------------------- Acciones de Workflow ----------------------- */

function AccionesWorkflow({ intervencion, onCambio }: { intervencion: IntervencionRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const [confirmar, setConfirmar] = useState<DefinicionAccion<AccionIntervencion> | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  const disponibles = ACCIONES_INTERVENCION_POR_ESTADO[intervencion.estado ?? ""] ?? [];
  const acciones = ACCIONES_INTERVENCION.filter((a) => disponibles.includes(a.clave));

  async function ejecutar(accion: AccionIntervencion) {
    setOcupado(accion); setMsg(null);
    const r = await transicionarIntervencion(cola, intervencion.id, accion);
    setOcupado(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la acción se encoló y se sincronizará." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Acción aplicada." }); onCambio(); }
  }

  if (acciones.length === 0 && !msg) return null;

  return (
    <Section titulo="Acciones de workflow">
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        {acciones.map((a) => (
          <Button
            key={a.clave}
            variant={a.peligro ? "peligro" : "secundario"}
            disabled={ocupado != null}
            onClick={() => (a.peligro ? setConfirmar(a) : void ejecutar(a.clave))}
          >
            {ocupado === a.clave ? "…" : a.etiqueta}
          </Button>
        ))}
      </div>
      {confirmar && (
        <Modal
          abierto
          onClose={() => setConfirmar(null)}
          titulo={`Confirmar: ${confirmar.etiqueta}`}
          pie={
            <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
              <Button variant="fantasma" onClick={() => setConfirmar(null)}>Cancelar</Button>
              <Button variant="peligro" onClick={() => { const c = confirmar.clave; setConfirmar(null); void ejecutar(c); }}>{confirmar.etiqueta}</Button>
            </div>
          }
        >
          <p>¿Deseas continuar con «{confirmar.etiqueta}» sobre esta intervención?</p>
        </Modal>
      )}
    </Section>
  );
}

/* -------------------------------- General ------------------------------- */

function Dato({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (<><dt style={{ color: "var(--do-texto-suave)" }}>{termino}</dt><dd style={{ margin: 0 }}>{children}</dd></>);
}

function TabGeneral({ intervencion, onNavegar }: { intervencion: IntervencionRow; onNavegar: (u: string) => void }) {
  return (
    <Card><CardContent>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
        <Dato termino="Estado"><BadgeEstadoIntervencion estado={intervencion.estado} /></Dato>
        <Dato termino="Correctivo mayor">{intervencion.mayor ? "Sí" : "No"}</Dato>
        <Dato termino="Solicitud">{intervencion.solicitudId ? <Button size="sm" variant="fantasma" onClick={() => onNavegar(urlSolicitud(intervencion.solicitudId!))}>{intervencion.solicitudId} →</Button> : "—"}</Dato>
        <Dato termino="Orden de trabajo">{intervencion.ordenTrabajoId ? <Button size="sm" variant="fantasma" onClick={() => onNavegar(urlOrdenTrabajo(intervencion.ordenTrabajoId!))}>{intervencion.ordenTrabajoId} →</Button> : "—"}</Dato>
        <Dato termino="Cuadrillas">{(intervencion.cuadrillas ?? []).length}</Dato>
      </dl>
    </CardContent></Card>
  );
}

/* ------------------------------ Cuadrillas ------------------------------ */

function TabCuadrillas({ intervencion, onCambio }: { intervencion: IntervencionRow; onCambio: () => void }) {
  const { cola } = useOffline();
  const def = plantillaCuadrillas();
  const form = useFormularioDinamico(def, {}, {});
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);
  const cuadrillas = intervencion.cuadrillas ?? [];

  async function guardar() {
    const nuevas = construirCuadrillas(form.valores);
    if (nuevas.length === 0) { setMsg({ tono: "error", texto: "Añade al menos una cuadrilla con responsables." }); return; }
    setOcupado(true); setMsg(null);
    const r = await asignarCuadrillas(cola, intervencion.id, nuevas);
    setOcupado(false);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la asignación se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Cuadrillas asignadas." }); form.setValores({}); onCambio(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <Card>
        <CardHeader><strong>Asignar cuadrillas</strong></CardHeader>
        <CardContent>
          <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} />
          <div style={{ marginTop: "var(--do-sp-2)" }}>
            <Button variant="primario" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar cuadrillas"}</Button>
          </div>
        </CardContent>
      </Card>
      {cuadrillas.length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin cuadrillas" descripcion="Aún no hay cuadrillas asignadas." /></CardContent></Card>
      ) : cuadrillas.map((c, i) => (
        <Card key={c.cuadrillaId ?? i}>
          <CardHeader><strong>{c.etiqueta ?? c.cuadrillaId}</strong></CardHeader>
          <CardContent>
            <div><strong>Responsables:</strong> {(c.responsables ?? []).map((r) => `${r.responsableId} (${r.rol})`).join(", ") || "—"}</div>
            <div><strong>Recursos:</strong> {(c.recursos ?? []).map((r) => `${r.tipo}:${r.referencia?.id}`).join(", ") || "—"}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------- Repuestos ------------------------------ */

function TabRepuestos({ intervencion, onCambio, onNavegar }: { intervencion: IntervencionRow; onCambio: () => void; onNavegar: (u: string) => void }) {
  const { cola } = useOffline();
  const items = useItems({ limit: 300 });
  const articulos = useArticulos({ limit: 300 });
  const [panel, setPanel] = useState<null | "reservar" | "consumir" | "devolver">(null);

  const opcItems = useMemo<OpcionSeleccion[]>(() => (items.datos ?? []).map((i) => ({ valor: i.id, etiqueta: `${i.nombre} (${i.sku})` })), [items.datos]);
  const opcArticulos = useMemo<OpcionSeleccion[]>(() => (articulos.datos ?? []).map((a) => ({ valor: a.id, etiqueta: `${a.nombre} (${a.unidad})` })), [articulos.datos]);

  const movimientos: MovimientoRepuesto[] = [
    ...(intervencion.reservas ?? []).map((m) => ({ ...m, tipo: m.tipo ?? "reserva" })),
    ...(intervencion.consumos ?? []).map((m) => ({ ...m, tipo: m.tipo ?? "consumo" })),
    ...(intervencion.devoluciones ?? []).map((m) => ({ ...m, tipo: m.tipo ?? "devolucion" })),
    ...(intervencion.repuestos ?? []),
  ];

  const solicitudesCompra = intervencion.solicitudesCompra ?? [];
  const comprasDeMovimientos = movimientos.map((m) => m.solicitudCompraId).filter((x): x is string => !!x);
  const todasCompras = Array.from(new Set([...solicitudesCompra.map((s) => s.id), ...comprasDeMovimientos]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <Button variant="primario" onClick={() => setPanel("reservar")}>Reservar</Button>
        <Button variant="secundario" onClick={() => setPanel("consumir")}>Consumir</Button>
        <Button variant="secundario" onClick={() => setPanel("devolver")}>Devolver</Button>
      </div>

      {todasCompras.length > 0 && (
        <Alert variant="advertencia" titulo="Abastecimiento por faltante">
          Se detectaron faltantes que dispararon compras automáticas:
          <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", marginTop: "var(--do-sp-2)" }}>
            {todasCompras.map((sc) => (
              <Button key={sc} size="sm" variant="fantasma" onClick={() => onNavegar(urlSolicitudAbastecimiento(sc))}>Ver solicitud de compra {sc} →</Button>
            ))}
          </div>
        </Alert>
      )}

      {movimientos.length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin movimientos de repuestos" descripcion="Reserva repuestos desde inventario para comenzar." /></CardContent></Card>
      ) : (
        <Table caption="Movimientos de repuestos" captionOculto>
          <thead><tr><th scope="col">Tipo</th><th scope="col">Item</th><th scope="col">Cantidad</th><th scope="col">Estado</th><th scope="col">Abastecimiento</th></tr></thead>
          <tbody>
            {movimientos.map((m, i) => (
              <tr key={i}>
                <td><Badge variant={m.tipo === "consumo" ? "primario" : m.tipo === "devolucion" ? "advertencia" : "info"}>{m.tipo}</Badge></td>
                <td>{m.inventarioId ? <Button size="sm" variant="fantasma" onClick={() => onNavegar(urlItemInventario(m.inventarioId!))}>{m.inventarioId} →</Button> : "—"}</td>
                <td>{m.cantidad ?? "—"} {m.unidad ?? ""}</td>
                <td>{m.estado ?? "—"}</td>
                <td>{m.solicitudCompraId ? <Button size="sm" variant="fantasma" onClick={() => onNavegar(urlSolicitudAbastecimiento(m.solicitudCompraId!))}>Ver compra →</Button> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {panel === "reservar" && (
        <PanelReservar intervencionId={intervencion.id} items={opcItems} articulos={opcArticulos} onClose={(r) => { setPanel(null); if (r) onCambio(); }} cola={cola} />
      )}
      {panel === "consumir" && (
        <PanelLinea titulo="Consumir repuesto" intervencionId={intervencion.id} items={opcItems} articulos={opcArticulos} accion="consumir" onClose={(r) => { setPanel(null); if (r) onCambio(); }} cola={cola} />
      )}
      {panel === "devolver" && (
        <PanelLinea titulo="Devolver repuesto" intervencionId={intervencion.id} items={opcItems} articulos={opcArticulos} accion="devolver" onClose={(r) => { setPanel(null); if (r) onCambio(); }} cola={cola} />
      )}
    </div>
  );
}

function PanelReservar({ intervencionId, items, articulos, onClose, cola }: { intervencionId: string; items: OpcionSeleccion[]; articulos: OpcionSeleccion[]; onClose: (recarga: boolean) => void; cola: ColaSync }) {
  const def = plantillaReservar({ items, articulos });
  const form = useFormularioDinamico(def, {}, {});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const lineas = construirLineasRepuesto(form.valores);
    if (lineas.length === 0) { setError("Añade al menos una línea válida (item, artículo y cantidad > 0)."); return; }
    setOcupado(true); setError(null);
    const r = await reservarRepuestos(cola, intervencionId, lineas);
    setOcupado(false);
    if (r.error && !r.encolada) { setError(r.error.message); return; }
    onClose(true);
  }

  return (
    <Modal abierto onClose={() => onClose(false)} titulo="Reservar repuestos" pie={
      <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
        <Button variant="fantasma" onClick={() => onClose(false)}>Cancelar</Button>
        <Button variant="primario" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Reservando…" : "Reservar"}</Button>
      </div>
    }>
      {error && <Alert variant="error" titulo={error} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} />
    </Modal>
  );
}

function PanelLinea({ titulo, intervencionId, items, articulos, accion, onClose, cola }: { titulo: string; intervencionId: string; items: OpcionSeleccion[]; articulos: OpcionSeleccion[]; accion: "consumir" | "devolver"; onClose: (recarga: boolean) => void; cola: ColaSync }) {
  const def = plantillaLineaRepuesto(titulo, { items, articulos });
  const form = useFormularioDinamico(def, {}, {});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const linea = construirLineaRepuesto(form.valores);
    if (!linea) { setError("Completa item, artículo y una cantidad > 0."); return; }
    setOcupado(true); setError(null);
    const r = accion === "consumir"
      ? await consumirRepuesto(cola, intervencionId, linea)
      : await devolverRepuesto(cola, intervencionId, linea);
    setOcupado(false);
    if (r.error && !r.encolada) { setError(r.error.message); return; }
    onClose(true);
  }

  return (
    <Modal abierto onClose={() => onClose(false)} titulo={titulo} pie={
      <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
        <Button variant="fantasma" onClick={() => onClose(false)}>Cancelar</Button>
        <Button variant="primario" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : titulo}</Button>
      </div>
    }>
      {error && <Alert variant="error" titulo={error} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} />
    </Modal>
  );
}
