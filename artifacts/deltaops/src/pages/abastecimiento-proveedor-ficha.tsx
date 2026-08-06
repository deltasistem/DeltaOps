/**
 * DGP-013 · Ficha 360° de un proveedor.
 *
 * Pestañas: Comercial (datos + edición), Contactos, Certificaciones, SLA,
 * Calificación (promedio + criterios + acción «Calificar» con historial de
 * evaluaciones). La calificación va anclada a la versión (concurrencia
 * optimista). Consume `?tab=`.
 */
import React, { useMemo, useState } from "react";
import { useParams } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Tabs, Table, Button, Spinner, EmptyState, ErrorState, Modal, Alert,
} from "@workspace/design-system";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useProveedor, useHistorial, useCatalogo } from "../lib/abastecimiento/hooks";
import { useOffline } from "../lib/offline/contexto";
import { calificarProveedor, editarProveedor } from "../lib/abastecimiento/mutaciones";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaCalificarProveedor, plantillaEditarProveedor } from "../lib/forms/plantillas-abastecimiento";
import { BadgeEstadoProveedor, Estrellas, fechaCorta } from "../lib/abastecimiento/componentes";
import { leerParam } from "../lib/abastecimiento/deep-links";
import { construirInputProveedor } from "../lib/abastecimiento/alta";
import { CATALOGO_TIPO_PROVEEDOR, CATALOGO_MONEDA } from "../lib/abastecimiento/constantes";
import type { ProveedorRow } from "../lib/abastecimiento/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function AbastecimientoProveedorFichaPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellAbastecimiento>
      <Ficha id={id} />
    </ShellAbastecimiento>
  );
}

function mapa(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

function Ficha({ id }: { id: string }) {
  const { datos: proveedor, cargando, error, recargar } = useProveedor(id);
  const tabInicial = leerParam(typeof window !== "undefined" ? window.location.search : "", "tab");

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el proveedor" descripcion={error.message} onReintentar={recargar} />;
  if (!proveedor) return <EmptyState titulo="Proveedor no encontrado" descripcion="El proveedor solicitado no existe o no está disponible." />;

  return (
    <>
      <PageHeader
        titulo={proveedor.razonSocial}
        descripcion={`${proveedor.nombreComercial ?? proveedor.tipo}`}
        acciones={<BadgeEstadoProveedor activo={proveedor.activo} />}
      />
      <Tabs
        porDefecto={tabInicial}
        items={[
          { id: "comercial", etiqueta: "Comercial", contenido: <TabComercial proveedor={proveedor} onCambio={recargar} /> },
          { id: "contactos", etiqueta: "Contactos", contenido: <TabContactos proveedor={proveedor} /> },
          { id: "certificaciones", etiqueta: "Certificaciones", contenido: <TabCertificaciones proveedor={proveedor} /> },
          { id: "sla", etiqueta: "SLA", contenido: <TabSla proveedor={proveedor} /> },
          { id: "calificacion", etiqueta: "Calificación", contenido: <TabCalificacion proveedor={proveedor} onCambio={recargar} /> },
          { id: "historial", etiqueta: "Historial", contenido: <TabHistorial entityRef={`proveedor:${id}`} /> },
        ]}
      />
    </>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (<><dt style={{ color: "var(--do-texto-suave)" }}>{etiqueta}</dt><dd style={{ margin: 0 }}>{valor}</dd></>);
}

function TabComercial({ proveedor, onCambio }: { proveedor: ProveedorRow; onCambio: () => void }) {
  const [editar, setEditar] = useState(false);
  return (
    <Section titulo="Datos comerciales" acciones={<Button variant="secundario" size="sm" onClick={() => setEditar(true)}>Editar</Button>}>
      <Card><CardContent>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
          <Fila etiqueta="Razón social" valor={proveedor.razonSocial} />
          <Fila etiqueta="Nombre comercial" valor={proveedor.nombreComercial ?? "—"} />
          <Fila etiqueta="Identificación tributaria" valor={proveedor.identificacionTributaria ?? "—"} />
          <Fila etiqueta="Tipo" valor={proveedor.tipo} />
          <Fila etiqueta="Moneda preferida" valor={proveedor.monedaPreferida ?? "—"} />
          <Fila etiqueta="Versión" valor={proveedor.version ?? 1} />
        </dl>
      </CardContent></Card>
      {editar && <ModalEditar proveedor={proveedor} onCerrar={() => setEditar(false)} onGuardado={() => { setEditar(false); onCambio(); }} />}
    </Section>
  );
}

function ModalEditar({ proveedor, onCerrar, onGuardado }: { proveedor: ProveedorRow; onCerrar: () => void; onGuardado: () => void }) {
  const { cola } = useOffline();
  const tipos = useCatalogo(CATALOGO_TIPO_PROVEEDOR);
  const monedas = useCatalogo(CATALOGO_MONEDA);
  const def = useMemo(() => plantillaEditarProveedor({ tipos: mapa(tipos.datos ?? []), monedas: mapa(monedas.datos ?? []) }), [tipos.datos, monedas.datos]);
  const form = useFormularioDinamico(def, {}, {
    razonSocial: proveedor.razonSocial,
    nombreComercial: proveedor.nombreComercial ?? "",
    identificacionTributaria: proveedor.identificacionTributaria ?? "",
    tipo: proveedor.tipo,
    monedaPreferida: proveedor.monedaPreferida ?? "",
    contactos: proveedor.contactos ?? [],
    certificaciones: proveedor.certificaciones ?? [],
    slaTiempoRespuestaHoras: proveedor.sla?.tiempoRespuestaHoras ?? "",
    slaPlazoEntregaDias: proveedor.sla?.plazoEntregaDias ?? "",
    slaNivelServicio: proveedor.sla?.nivelServicio ?? "",
  });
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Revisa los campos marcados."); return; }
    const construido = construirInputProveedor(form.valores);
    const cambios = {
      razonSocial: construido.razonSocial,
      nombreComercial: construido.nombreComercial ?? null,
      identificacionTributaria: construido.identificacionTributaria ?? null,
      tipo: construido.tipo,
      monedaPreferida: construido.monedaPreferida ?? null,
      contactos: construido.contactos ?? [],
      certificaciones: construido.certificaciones ?? [],
      sla: construido.sla ?? {},
    };
    setOcupado(true); setErr(null);
    const r = await editarProveedor(cola, proveedor.id, proveedor.version ?? 1, cambios);
    setOcupado(false);
    if (r.encolada) onGuardado();
    else if (r.error) setErr(r.error.message);
    else onGuardado();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Editar proveedor"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={ocupado} onClick={() => void guardar()}>Guardar cambios</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}

function TabContactos({ proveedor }: { proveedor: ProveedorRow }) {
  const contactos = proveedor.contactos ?? [];
  if (contactos.length === 0) return <Section titulo="Contactos"><Card><CardContent><EmptyState titulo="Sin contactos" descripcion="No hay contactos registrados." /></CardContent></Card></Section>;
  return (
    <Section titulo="Contactos">
      <Card><CardContent>
        <Table caption="Contactos del proveedor" captionOculto>
          <thead><tr><th scope="col">Nombre</th><th scope="col">Cargo</th><th scope="col">Email</th><th scope="col">Teléfono</th></tr></thead>
          <tbody>
            {contactos.map((c, i) => (<tr key={i}><td>{c.nombre ?? "—"}</td><td>{c.cargo ?? "—"}</td><td>{c.email ?? "—"}</td><td>{c.telefono ?? "—"}</td></tr>))}
          </tbody>
        </Table>
      </CardContent></Card>
    </Section>
  );
}

function TabCertificaciones({ proveedor }: { proveedor: ProveedorRow }) {
  const certs = proveedor.certificaciones ?? [];
  if (certs.length === 0) return <Section titulo="Certificaciones"><Card><CardContent><EmptyState titulo="Sin certificaciones" descripcion="No hay certificaciones registradas." /></CardContent></Card></Section>;
  return (
    <Section titulo="Certificaciones">
      <Card><CardContent>
        <Table caption="Certificaciones del proveedor" captionOculto>
          <thead><tr><th scope="col">Certificación</th><th scope="col">Emisor</th><th scope="col">Vigente hasta</th></tr></thead>
          <tbody>
            {certs.map((c, i) => (<tr key={i}><td>{c.nombre ?? "—"}</td><td>{c.emisor ?? "—"}</td><td>{fechaCorta(c.vigenteHasta)}</td></tr>))}
          </tbody>
        </Table>
      </CardContent></Card>
    </Section>
  );
}

function TabSla({ proveedor }: { proveedor: ProveedorRow }) {
  const sla = proveedor.sla;
  if (!sla || Object.keys(sla).length === 0) return <Section titulo="SLA"><Card><CardContent><EmptyState titulo="Sin SLA" descripcion="No hay acuerdos de nivel de servicio registrados." /></CardContent></Card></Section>;
  return (
    <Section titulo="Nivel de servicio (SLA)">
      <Card><CardContent>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
          <Fila etiqueta="Tiempo de respuesta (h)" valor={sla.tiempoRespuestaHoras ?? "—"} />
          <Fila etiqueta="Plazo de entrega (días)" valor={sla.plazoEntregaDias ?? "—"} />
          <Fila etiqueta="Nivel de servicio" valor={typeof sla.nivelServicio === "number" ? `${Math.round(sla.nivelServicio * 100)}%` : "—"} />
        </dl>
      </CardContent></Card>
    </Section>
  );
}

function TabCalificacion({ proveedor, onCambio }: { proveedor: ProveedorRow; onCambio: () => void }) {
  const [calificar, setCalificar] = useState(false);
  const c = proveedor.calificacion;
  return (
    <Section titulo="Calificación" acciones={<Button variant="primario" size="sm" onClick={() => setCalificar(true)}>Calificar</Button>}>
      <Card><CardContent>
        {c ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)" }}>
              <Estrellas valor={c.promedio} />
              <strong>{typeof c.promedio === "number" ? c.promedio.toFixed(1) : "—"} / 5</strong>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)", marginTop: "var(--do-sp-3)" }}>
              <Fila etiqueta="Calidad" valor={c.calidad ?? "—"} />
              <Fila etiqueta="Tiempo" valor={c.tiempo ?? "—"} />
              <Fila etiqueta="Precio" valor={c.precio ?? "—"} />
              <Fila etiqueta="Servicio" valor={c.servicio ?? "—"} />
              <Fila etiqueta="Nota" valor={c.nota ?? "—"} />
              <Fila etiqueta="Última evaluación" valor={fechaCorta(c.fecha)} />
            </dl>
          </>
        ) : (
          <EmptyState titulo="Sin calificación" descripcion="Este proveedor aún no ha sido calificado." />
        )}
      </CardContent></Card>
      {calificar && <ModalCalificar proveedor={proveedor} onCerrar={() => setCalificar(false)} onOk={() => { setCalificar(false); onCambio(); }} />}
    </Section>
  );
}

export function ModalCalificar({ proveedor, onCerrar, onOk }: { proveedor: ProveedorRow; onCerrar: () => void; onOk: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaCalificarProveedor(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Todos los criterios (0 a 5) son obligatorios."); return; }
    const n = (k: string) => Number(form.valores[k] ?? 0);
    setOcupado(true); setErr(null);
    const r = await calificarProveedor(cola, proveedor.id, proveedor.version ?? 1, {
      calidad: n("calidad"), tiempo: n("tiempo"), precio: n("precio"), servicio: n("servicio"),
      nota: String(form.valores.nota ?? "").trim() || null,
    });
    setOcupado(false);
    if (r.encolada) onOk();
    else if (r.error) setErr(r.error.message);
    else onOk();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Calificar proveedor"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={ocupado} onClick={() => void guardar()}>Guardar calificación</Button></>}>
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
        <Table caption="Historial del proveedor" captionOculto>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Descripción</th><th scope="col">Actor</th></tr></thead>
          <tbody>
            {datos.map((h, i) => (<tr key={h.id ?? i}><td>{fechaCorta(h.fecha)}</td><td>{h.tipo}</td><td>{h.descripcion ?? "—"}</td><td>{h.actor ?? "—"}</td></tr>))}
          </tbody>
        </Table>
      </CardContent></Card>
    </Section>
  );
}
