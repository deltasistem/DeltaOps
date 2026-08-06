/**
 * DGP-011.3 · Conteos de inventario (cíclicos/físicos).
 * Programar (selección de items→existencias a contar) → ejecutar (registrar
 * cantidades) → reconteo → cerrar. El cierre lleva la decisión explícita y
 * AUTORITATIVA `aplicarDiferencias`: false no muta stock; true aplica los
 * ajustes. La respuesta trae `{diferencias, aplicadas}`. Nunca hay bypass.
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
  Spinner,
  EmptyState,
  ErrorState,
  Table,
  Modal,
  Alert,
} from "@workspace/design-system";
import { ShellInventario } from "../lib/inventario/Shell";
import { useConteos, useConteo, useItems } from "../lib/inventario/hooks";
import { iniciarConteo, registrarConteo, cerrarConteo } from "../lib/inventario/mutaciones";
import { construirInputConteo } from "../lib/inventario/alta";
import { inventarioFetch } from "../lib/inventario/api";
import { useOffline } from "../lib/offline/contexto";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaConteo, plantillaRegistrarConteo } from "../lib/forms/plantillas-inventario";
import { BadgeEstadoConteo, fechaCorta } from "../lib/inventario/componentes";
import { leerParam } from "../lib/inventario/deep-links";
import type { ConteoRow, ExistenciaRow } from "../lib/inventario/tipos";

export default function InventarioConteosPage() {
  return (
    <ShellInventario activo="/inventario/conteos">
      <Contenido />
    </ShellInventario>
  );
}

function Contenido() {
  const idUrl = leerParam(useSearch(), "id");
  const { datos, cargando, error, recargar } = useConteos();
  const [programar, setProgramar] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(idUrl || null);

  return (
    <>
      <PageHeader titulo="Conteos" descripcion="Conteos cíclicos y físicos con reconteo y aplicación de diferencias."
        acciones={<Button variant="primario" onClick={() => setProgramar(true)}>Programar conteo</Button>} />
      <Section titulo="Conteos">
        {cargando ? <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
          : error ? <Card><CardContent><ErrorState titulo="No se pudieron cargar los conteos" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>
          : (datos ?? []).length === 0 ? <Card><CardContent><EmptyState titulo="Sin conteos" descripcion="Programa el primer conteo." /></CardContent></Card>
          : (
            <Card><CardContent>
              <Table caption="Listado de conteos">
                <thead><tr><th scope="col">Id</th><th scope="col">Tipo</th><th scope="col">Bodega</th><th scope="col">Estado</th><th scope="col">Actualizado</th><th scope="col"><span className="do-visualmente-oculto">Acciones</span></th></tr></thead>
                <tbody>
                  {(datos as ConteoRow[]).map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{c.id}</td>
                      <td>{c.tipo ?? "—"}</td>
                      <td>{c.bodegaId ?? "—"}</td>
                      <td><BadgeEstadoConteo estado={c.estado} /></td>
                      <td>{fechaCorta(c.actualizadoAt)}</td>
                      <td><Button size="sm" variant="secundario" onClick={() => setDetalle(c.id)}>Abrir</Button></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent></Card>
          )}
      </Section>
      {programar && <ModalProgramar onCerrar={() => setProgramar(false)} onOk={() => { setProgramar(false); recargar(); }} />}
      {detalle && <ModalDetalle id={detalle} onCerrar={() => setDetalle(null)} onCambio={recargar} />}
    </>
  );
}

function ModalProgramar({ onCerrar, onOk }: { onCerrar: () => void; onOk: () => void }) {
  const { cola } = useOffline();
  const items = useItems({ limit: 500 });
  const opcionesItems = useMemo(
    () => (items.datos ?? []).map((i) => ({ valor: i.id, etiqueta: `${i.nombre} · ${i.sku}` })),
    [items.datos],
  );
  const def = useMemo(() => plantillaConteo(opcionesItems), [opcionesItems]);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Selecciona el tipo y al menos un item a contar."); return; }
    const itemIds = (Array.isArray(form.valores.items) ? form.valores.items : []).map(String).filter(Boolean);
    if (itemIds.length === 0) { setErr("Selecciona al menos un item a contar."); return; }
    setGuardando(true); setErr(null);
    // Resuelve las existencias (inventarioId) de los items elegidos para armar
    // `lineas:[{inventarioId}]` que exige el contrato de iniciar-conteo.
    let inventarioIds: string[] = [];
    try {
      const listas = await Promise.all(
        itemIds.map(async (itemId) => {
          const res = await inventarioFetch<{ existencias?: ExistenciaRow[] } | ExistenciaRow[]>(
            `/items/${encodeURIComponent(itemId)}/existencias`,
            { toleraNoEncontrado: true },
          );
          const arr = Array.isArray(res) ? res : (res?.existencias ?? []);
          return arr.map((e) => e.id).filter((x): x is string => Boolean(x));
        }),
      );
      inventarioIds = Array.from(new Set(listas.flat()));
    } catch (e) {
      setGuardando(false);
      setErr((e as Error).message);
      return;
    }
    if (inventarioIds.length === 0) {
      setGuardando(false);
      setErr("Los items seleccionados no tienen existencias que contar.");
      return;
    }
    const r = await iniciarConteo(cola, construirInputConteo(form.valores, inventarioIds));
    setGuardando(false);
    if (r.encolada) { onOk(); return; }
    if (r.error) setErr(r.error.message);
    else onOk();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Programar conteo"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Programar</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <Alert variant="info" titulo="Selección de existencias">El conteo se inicia con las existencias de los items elegidos; el alcance (bodega) es opcional.</Alert>
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}

export function ModalDetalle({ id, onCerrar, onCambio }: { id: string; onCerrar: () => void; onCambio: () => void }) {
  const { cola } = useOffline();
  const { datos, cargando, error, recargar } = useConteo(id);
  const defRegistrar = useMemo(() => plantillaRegistrarConteo(), []);
  const formRegistrar = useFormularioDinamico(defRegistrar, {}, {});
  const [accion, setAccion] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);
  const [resultadoCierre, setResultadoCierre] = useState<{ diferencias?: unknown[]; aplicadas?: number } | null>(null);

  async function registrar() {
    if (!datos) return;
    if (!formRegistrar.esValido()) { formRegistrar.validarAhora(); setMsg({ tono: "error", texto: "Indica existencia y cantidad contada." }); return; }
    setAccion("registrar"); setMsg(null);
    const r = await registrarConteo(cola, datos.id, datos.version ?? 1, [{
      inventarioId: String(formRegistrar.valores.inventarioId ?? ""),
      cantidad: Number(formRegistrar.valores.cantidad ?? 0),
    }]);
    setAccion(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: el conteo se encoló." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Conteo registrado." }); formRegistrar.setValores({}); recargar(); onCambio(); }
  }

  async function cerrar(aplicarDiferencias: boolean) {
    if (!datos) return;
    setAccion(aplicarDiferencias ? "aplicar" : "cerrar"); setMsg(null); setResultadoCierre(null);
    const r = await cerrarConteo(cola, datos.id, datos.version ?? 1, aplicarDiferencias);
    setAccion(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: el cierre se encoló y se aplicará al sincronizar." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else {
      const resp = (r.resultado ?? {}) as { diferencias?: unknown[]; aplicadas?: number };
      setResultadoCierre(resp);
      const n = typeof resp.aplicadas === "number" ? resp.aplicadas : (resp.diferencias?.length ?? 0);
      setMsg({ tono: "exito", texto: aplicarDiferencias ? `Conteo cerrado: ${n} diferencia(s) aplicada(s).` : "Conteo cerrado sin aplicar diferencias." });
      recargar(); onCambio();
    }
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Conteo"
      pie={<Button variant="fantasma" onClick={onCerrar}>Cerrar</Button>}>
      {cargando ? <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
        : error ? <ErrorState titulo="No se pudo cargar" descripcion={error.message} onReintentar={recargar} />
        : !datos ? <EmptyState titulo="No encontrado" descripcion={`No existe el conteo ${id}.`} />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
            <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
              <BadgeEstadoConteo estado={datos.estado} />
              <span style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{datos.id}</span>
            </div>
            <Card><CardHeader><strong>Registrar / recontar</strong></CardHeader><CardContent>
              <FormularioDinamico definicion={defRegistrar} valores={formRegistrar.valores} onCambio={formRegistrar.setValores} hallazgos={formRegistrar.hallazgos} />
              <div style={{ marginTop: "var(--do-sp-3)" }}>
                <Button variant="primario" size="sm" loading={accion === "registrar"} onClick={() => void registrar()}>Registrar conteo</Button>
              </div>
            </CardContent></Card>
            {(datos.diferencias ?? []).length > 0 && (
              <Card><CardHeader><strong>Diferencias</strong></CardHeader><CardContent>
                <Table caption="Diferencias del conteo">
                  <thead><tr><th scope="col">Existencia</th><th scope="col">Sistema</th><th scope="col">Contado</th><th scope="col">Diferencia</th></tr></thead>
                  <tbody>
                    {(datos.diferencias ?? []).map((d, i) => (
                      <tr key={i}><td>{d.inventarioId}</td><td>{d.sistema ?? "—"}</td><td>{d.contado}</td><td>{d.diferencia ?? "—"}</td></tr>
                    ))}
                  </tbody>
                </Table>
              </CardContent></Card>
            )}
            <Card><CardHeader><strong>Cerrar conteo</strong></CardHeader><CardContent>
              <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>Decisión explícita y autoritativa: «aplicar diferencias» genera los ajustes correspondientes (muta stock); «sin aplicar» cierra sin modificar el stock.</p>
              <div style={{ display: "flex", gap: "var(--do-sp-2)", marginTop: "var(--do-sp-2)", flexWrap: "wrap" }}>
                <Button variant="primario" size="sm" loading={accion === "aplicar"} onClick={() => void cerrar(true)}>Cerrar y aplicar diferencias</Button>
                <Button variant="secundario" size="sm" loading={accion === "cerrar"} onClick={() => void cerrar(false)}>Cerrar sin aplicar</Button>
              </div>
              {resultadoCierre && (
                <div style={{ marginTop: "var(--do-sp-3)" }}>
                  <p style={{ fontSize: "var(--do-text-sm)" }}>
                    Diferencias detectadas: <strong>{resultadoCierre.diferencias?.length ?? 0}</strong>
                    {typeof resultadoCierre.aplicadas === "number" && <> · aplicadas: <strong>{resultadoCierre.aplicadas}</strong></>}
                  </p>
                </div>
              )}
            </CardContent></Card>
          </div>
        )}
    </Modal>
  );
}
