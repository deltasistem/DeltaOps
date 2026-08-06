/**
 * DGP-013 · Ficha 360° de un artículo del catálogo.
 *
 * Pestañas: General (datos + edición), Costos (promedio/último/estándar +
 * historial de costos), Historial (bitácora), Timeline (eventos), Comentarios y
 * Adjuntos (degradan con 404 si el módulo aún no expone esas superficies, sin
 * fabricar datos). Integración: enlaces a solicitudes/OC del artículo y al item
 * de inventario vinculado (deep links). Consume `?tab=`.
 */
import React, { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Tabs, Table, Button, Spinner, EmptyState, ErrorState, Modal, Alert, Timeline, Badge,
} from "@workspace/design-system";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useArticulo, useCostosArticulo, useHistorial, useEventos, useCatalogo } from "../lib/abastecimiento/hooks";
import { useOffline } from "../lib/offline/contexto";
import { editarArticulo } from "../lib/abastecimiento/mutaciones";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaEditarArticulo } from "../lib/forms/plantillas-abastecimiento";
import { fechaCorta, montoMoneda } from "../lib/abastecimiento/componentes";
import { leerParam, urlItemInventario, urlSolicitudes, urlOrdenesCompra } from "../lib/abastecimiento/deep-links";
import { CATALOGO_FAMILIA, CATALOGO_UNIDAD, CATALOGO_METODO_VALORACION } from "../lib/abastecimiento/constantes";
import { TabComentariosDegradable, TabAdjuntosDegradable } from "./abastecimiento/tabs-degradables";
import type { ArticuloRow } from "../lib/abastecimiento/tipos";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";

export default function AbastecimientoArticuloFichaPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellAbastecimiento>
      <Ficha id={id} />
    </ShellAbastecimiento>
  );
}

function Ficha({ id }: { id: string }) {
  const { datos: articulo, cargando, error, recargar } = useArticulo(id);
  const tabInicial = leerParam(typeof window !== "undefined" ? window.location.search : "", "tab");

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el artículo" descripcion={error.message} onReintentar={recargar} />;
  if (!articulo) return <EmptyState titulo="Artículo no encontrado" descripcion="El artículo solicitado no existe o no está disponible." />;

  return (
    <>
      <PageHeader
        titulo={articulo.nombre}
        descripcion={`${articulo.tipo} · ${articulo.unidad} · ${articulo.metodoValoracion}`}
        acciones={<Badge variant={articulo.activo === false ? "neutro" : "exito"}>{articulo.activo === false ? "Inactivo" : "Activo"}</Badge>}
      />
      <Tabs
        porDefecto={tabInicial}
        items={[
          { id: "general", etiqueta: "General", contenido: <TabGeneral articulo={articulo} onCambio={recargar} /> },
          { id: "costos", etiqueta: "Costos", contenido: <TabCostos articulo={articulo} /> },
          { id: "abastecimiento", etiqueta: "Solicitudes y OC", contenido: <TabRelacionados articulo={articulo} /> },
          { id: "historial", etiqueta: "Historial", contenido: <TabHistorial entityRef={`articulo:${id}`} /> },
          { id: "timeline", etiqueta: "Timeline", contenido: <TabTimeline articuloId={id} /> },
          { id: "comentarios", etiqueta: "Comentarios", contenido: <TabComentariosDegradable entityRef={`articulo:${id}`} /> },
          { id: "adjuntos", etiqueta: "Adjuntos", contenido: <TabAdjuntosDegradable entityRef={`articulo:${id}`} /> },
        ]}
      />
    </>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--do-texto-suave)" }}>{etiqueta}</dt>
      <dd style={{ margin: 0 }}>{valor}</dd>
    </>
  );
}

function mapa(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

function TabGeneral({ articulo, onCambio }: { articulo: ArticuloRow; onCambio: () => void }) {
  const [editar, setEditar] = useState(false);
  return (
    <Section
      titulo="Datos generales"
      acciones={<Button variant="secundario" size="sm" onClick={() => setEditar(true)}>Editar</Button>}
    >
      <Card><CardContent>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)" }}>
          <Fila etiqueta="Nombre" valor={articulo.nombre} />
          <Fila etiqueta="Descripción" valor={articulo.descripcion ?? "—"} />
          <Fila etiqueta="Tipo" valor={articulo.tipo} />
          <Fila etiqueta="Familia" valor={articulo.familia ?? "—"} />
          <Fila etiqueta="Unidad" valor={articulo.unidad} />
          <Fila etiqueta="Método de valoración" valor={articulo.metodoValoracion} />
          <Fila etiqueta="Moneda" valor={articulo.moneda} />
          <Fila etiqueta="Costo estándar" valor={montoMoneda(articulo.costoEstandar, articulo.moneda)} />
          <Fila etiqueta="Tolerancia sobre-recepción" valor={typeof articulo.toleranciaSobreRecepcion === "number" ? articulo.toleranciaSobreRecepcion : "—"} />
          <Fila etiqueta="Item de inventario" valor={articulo.inventarioItemId ? <Link href={urlItemInventario(articulo.inventarioItemId)}><Button variant="fantasma" size="sm">Ver item {articulo.inventarioItemId}</Button></Link> : "No vinculado"} />
          <Fila etiqueta="Versión" valor={articulo.version ?? 1} />
        </dl>
      </CardContent></Card>
      {editar && <ModalEditar articulo={articulo} onCerrar={() => setEditar(false)} onGuardado={() => { setEditar(false); onCambio(); }} />}
    </Section>
  );
}

function ModalEditar({ articulo, onCerrar, onGuardado }: { articulo: ArticuloRow; onCerrar: () => void; onGuardado: () => void }) {
  const { cola } = useOffline();
  const familias = useCatalogo(CATALOGO_FAMILIA);
  const unidades = useCatalogo(CATALOGO_UNIDAD);
  const metodos = useCatalogo(CATALOGO_METODO_VALORACION);
  const def = useMemo(
    () => plantillaEditarArticulo({ familias: mapa(familias.datos ?? []), unidades: mapa(unidades.datos ?? []), metodosValoracion: mapa(metodos.datos ?? []) }),
    [familias.datos, unidades.datos, metodos.datos],
  );
  const form = useFormularioDinamico(def, {}, {
    nombre: articulo.nombre,
    descripcion: articulo.descripcion ?? "",
    familia: articulo.familia ?? "",
    unidad: articulo.unidad,
    metodoValoracion: articulo.metodoValoracion,
    costoEstandar: articulo.costoEstandar ?? "",
    toleranciaSobreRecepcion: articulo.toleranciaSobreRecepcion ?? "",
    inventarioItemId: articulo.inventarioItemId ?? "",
  });
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Revisa los campos marcados."); return; }
    const v = form.valores;
    const cambios: Record<string, unknown> = {};
    const s = (k: string) => String(v[k] ?? "").trim();
    const n = (k: string) => { const x = Number(v[k]); return Number.isFinite(x) && s(k) !== "" ? x : undefined; };
    if (s("nombre")) cambios.nombre = s("nombre");
    cambios.descripcion = s("descripcion") || null;
    cambios.familia = s("familia") || null;
    if (s("unidad")) cambios.unidad = s("unidad");
    if (s("metodoValoracion")) cambios.metodoValoracion = s("metodoValoracion");
    if (n("costoEstandar") !== undefined) cambios.costoEstandar = n("costoEstandar");
    if (n("toleranciaSobreRecepcion") !== undefined) cambios.toleranciaSobreRecepcion = n("toleranciaSobreRecepcion");
    cambios.inventarioItemId = s("inventarioItemId") || null;
    setOcupado(true); setErr(null);
    const r = await editarArticulo(cola, articulo.id, articulo.version ?? 1, cambios);
    setOcupado(false);
    if (r.encolada) onGuardado();
    else if (r.error) setErr(r.error.message);
    else onGuardado();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Editar artículo"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={ocupado} onClick={() => void guardar()}>Guardar cambios</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}

function TabCostos({ articulo }: { articulo: ArticuloRow }) {
  const { datos, cargando, error } = useCostosArticulo(articulo.id);
  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudieron cargar los costos" descripcion={error.message} />;
  if (!datos) return <EmptyState titulo="Sin costos" descripcion="Aún no hay información de costos para este artículo." />;
  const moneda = datos.moneda ?? articulo.moneda;
  return (
    <Section titulo="Costos">
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Card><CardContent><span style={{ color: "var(--do-texto-suave)" }}>Promedio</span><div style={{ fontSize: "var(--do-text-xl)" }}>{montoMoneda(datos.promedio, moneda)}</div></CardContent></Card>
        <Card><CardContent><span style={{ color: "var(--do-texto-suave)" }}>Último</span><div style={{ fontSize: "var(--do-text-xl)" }}>{montoMoneda(datos.ultimo, moneda)}</div></CardContent></Card>
        <Card><CardContent><span style={{ color: "var(--do-texto-suave)" }}>Estándar</span><div style={{ fontSize: "var(--do-text-xl)" }}>{montoMoneda(datos.estandar ?? articulo.costoEstandar, moneda)}</div></CardContent></Card>
      </div>
      {(datos.historial ?? []).length > 0 && (
        <Card><CardContent>
          <Table caption="Historial de costos" captionOculto>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Método</th><th scope="col">Costo unitario</th><th scope="col">Origen</th></tr></thead>
            <tbody>
              {(datos.historial ?? []).map((h, i) => (
                <tr key={i}>
                  <td>{fechaCorta(h.fecha)}</td>
                  <td>{h.metodoValoracion ?? "—"}</td>
                  <td>{montoMoneda(h.costoUnitario, moneda)}</td>
                  <td>{h.origen ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent></Card>
      )}
    </Section>
  );
}

function TabRelacionados({ articulo }: { articulo: ArticuloRow }) {
  return (
    <Section titulo="Solicitudes y órdenes del artículo">
      <Card><CardContent>
        <p style={{ color: "var(--do-texto-suave)" }}>
          Consulta las solicitudes de compra y órdenes vinculadas a este artículo. Se abren filtradas por su referencia (deep link ruta→filtro).
        </p>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", marginTop: "var(--do-sp-3)" }}>
          <Link href={urlSolicitudes()}><Button variant="secundario" size="sm">Ver solicitudes</Button></Link>
          <Link href={urlOrdenesCompra()}><Button variant="secundario" size="sm">Ver órdenes de compra</Button></Link>
          {articulo.inventarioItemId && (
            <Link href={urlItemInventario(articulo.inventarioItemId)}><Button variant="fantasma" size="sm">Item de inventario vinculado</Button></Link>
          )}
        </div>
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
        <Table caption="Historial del artículo" captionOculto>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Descripción</th><th scope="col">Actor</th></tr></thead>
          <tbody>
            {datos.map((h, i) => (
              <tr key={h.id ?? i}><td>{fechaCorta(h.fecha)}</td><td>{h.tipo}</td><td>{h.descripcion ?? "—"}</td><td>{h.actor ?? "—"}</td></tr>
            ))}
          </tbody>
        </Table>
      </CardContent></Card>
    </Section>
  );
}

function TabTimeline({ articuloId }: { articuloId: string }) {
  const { datos, cargando, error } = useEventos();
  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el timeline" descripcion={error.message} />;
  const eventos = (datos ?? []).filter((e) => !e.entityRef || e.entityRef.includes(articuloId));
  if (eventos.length === 0) return <EmptyState titulo="Sin eventos" descripcion="Aún no hay eventos para este artículo." />;
  const items = eventos.map((e) => ({
    titulo: e.descripcion ?? e.tipo,
    hora: e.fecha ? new Date(e.fecha).toLocaleString("es") : "",
    descripcion: e.tipo,
  }));
  return (
    <Section titulo="Timeline">
      <Card><CardContent><Timeline eventos={items} /></CardContent></Card>
    </Section>
  );
}
