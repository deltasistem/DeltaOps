/**
 * DGP-011.3 · Bodegas y ubicaciones (árbol jerárquico).
 *
 * Árbol de bodegas → ubicaciones (mapa jerárquico navegable), capacidad y
 * disponibilidad, con alta de bodegas y ubicaciones vía Dynamic Forms.
 */
import React, { useMemo, useState } from "react";
import { useSearch } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Spinner,
  EmptyState,
  ErrorState,
  Progress,
  Modal,
  Alert,
} from "@workspace/design-system";
import { ShellInventario } from "../lib/inventario/Shell";
import { useBodegas, useUbicaciones } from "../lib/inventario/hooks";
import { crearBodega, crearUbicacion } from "../lib/inventario/mutaciones";
import { construirInputBodega, construirInputUbicacion } from "../lib/inventario/alta";
import { useOffline } from "../lib/offline/contexto";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaBodega, plantillaUbicacion } from "../lib/forms/plantillas-inventario";
import { leerParam } from "../lib/inventario/deep-links";
import type { BodegaRow, UbicacionRow } from "../lib/inventario/tipos";

export default function InventarioBodegasPage() {
  return (
    <ShellInventario activo="/inventario/bodegas">
      <Contenido />
    </ShellInventario>
  );
}

function Contenido() {
  const bodegaUrl = leerParam(useSearch(), "bodega");
  const { datos, cargando, error, recargar } = useBodegas();
  const [seleccion, setSeleccion] = useState<string | null>(bodegaUrl || null);
  const [crearBod, setCrearBod] = useState(false);

  const activa = useMemo(() => (datos ?? []).find((b) => b.id === seleccion) ?? null, [datos, seleccion]);

  return (
    <>
      <PageHeader titulo="Bodegas y ubicaciones" descripcion="Árbol jerárquico de bodegas, ubicaciones, capacidad y disponibilidad."
        acciones={<Button variant="primario" onClick={() => setCrearBod(true)}>Nueva bodega</Button>} />
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "minmax(240px, 1fr) 2fr" }}>
        <Section titulo="Bodegas">
          {cargando ? <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
            : error ? <Card><CardContent><ErrorState titulo="No se pudieron cargar las bodegas" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>
            : (datos ?? []).length === 0 ? <Card><CardContent><EmptyState titulo="Sin bodegas" descripcion="Crea la primera bodega." /></CardContent></Card>
            : (
              <nav aria-label="Árbol de bodegas" style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
                {(datos as BodegaRow[]).map((b) => (
                  <Card key={b.id} interactiva>
                    <CardContent>
                      <button type="button" onClick={() => setSeleccion(b.id)} aria-pressed={seleccion === b.id}
                        style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left", width: "100%" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
                          <strong>{b.nombre ?? b.codigo ?? b.id}</strong>
                          {b.tipo && <Badge variant="neutro">{b.tipo}</Badge>}
                        </div>
                        <div style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{b.codigo}</div>
                        {typeof b.capacidad === "number" && b.capacidad > 0 && (
                          <div style={{ marginTop: "var(--do-sp-2)" }}>
                            <Progress etiqueta={`Ocupación de ${b.nombre ?? b.id}`} value={b.ocupacion ?? 0} max={b.capacidad} />
                            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{b.ocupacion ?? 0} / {b.capacidad}</span>
                          </div>
                        )}
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </nav>
            )}
        </Section>
        <Section titulo={activa ? `Ubicaciones · ${activa.nombre ?? activa.codigo}` : "Ubicaciones"}>
          {!activa ? <Card><CardContent><EmptyState titulo="Selecciona una bodega" descripcion="Elige una bodega para ver su mapa de ubicaciones." /></CardContent></Card>
            : <PanelUbicaciones bodega={activa} />}
        </Section>
      </div>
      {crearBod && <ModalBodega onCerrar={() => setCrearBod(false)} onOk={() => { setCrearBod(false); recargar(); }} />}
    </>
  );
}

function PanelUbicaciones({ bodega }: { bodega: BodegaRow }) {
  const { datos, cargando, error, recargar } = useUbicaciones(bodega.id);
  const [crear, setCrear] = useState(false);

  // Construye el árbol jerárquico por padreId.
  const arbol = useMemo(() => {
    const lista = (datos ?? []) as UbicacionRow[];
    const hijos = new Map<string, UbicacionRow[]>();
    const raices: UbicacionRow[] = [];
    for (const u of lista) {
      if (u.padreId) {
        if (!hijos.has(u.padreId)) hijos.set(u.padreId, []);
        hijos.get(u.padreId)!.push(u);
      } else raices.push(u);
    }
    return { hijos, raices };
  }, [datos]);

  function Nodo({ u, nivel }: { u: UbicacionRow; nivel: number }) {
    const sub = arbol.hijos.get(u.id) ?? [];
    return (
      <li>
        <div style={{ paddingLeft: `calc(var(--do-sp-4) * ${nivel})`, display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
          <Badge variant="neutro">{u.nivel}</Badge>
          <span>{u.valor}</span>
        </div>
        {sub.length > 0 && <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{sub.map((s) => <Nodo key={s.id} u={s} nivel={nivel + 1} />)}</ul>}
      </li>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Mapa de ubicaciones</strong>
          <Button size="sm" variant="primario" onClick={() => setCrear(true)}>Nueva ubicación</Button>
        </div>
      </CardHeader>
      <CardContent>
        {cargando ? <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
          : error ? <ErrorState titulo="No se pudieron cargar las ubicaciones" descripcion={error.message} onReintentar={recargar} />
          : arbol.raices.length === 0 ? <EmptyState titulo="Sin ubicaciones" descripcion="Esta bodega no tiene ubicaciones." />
          : <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>{arbol.raices.map((r) => <Nodo key={r.id} u={r} nivel={0} />)}</ul>}
      </CardContent>
      {crear && <ModalUbicacion bodegaId={bodega.id} onCerrar={() => setCrear(false)} onOk={() => { setCrear(false); recargar(); }} />}
    </Card>
  );
}

function ModalBodega({ onCerrar, onOk }: { onCerrar: () => void; onOk: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaBodega(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Revisa los campos obligatorios."); return; }
    setGuardando(true); setErr(null);
    const r = await crearBodega(cola, construirInputBodega(form.valores));
    setGuardando(false);
    if (r.error) setErr(r.error.message); else onOk();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Nueva bodega"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Crear</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}

function ModalUbicacion({ bodegaId, onCerrar, onOk }: { bodegaId: string; onCerrar: () => void; onOk: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaUbicacion(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Revisa los campos obligatorios."); return; }
    setGuardando(true); setErr(null);
    const r = await crearUbicacion(cola, construirInputUbicacion(bodegaId, form.valores));
    setGuardando(false);
    if (r.error) setErr(r.error.message); else onOk();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Nueva ubicación"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Crear</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}
