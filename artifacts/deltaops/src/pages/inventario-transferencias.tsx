/**
 * DGP-011.3 · Transferencias entre bodegas/ubicaciones.
 *
 * Crear (POST `/transferencias`, despacha a tránsito) y transicionar (POST
 * `/transferencias/:id/transicion`) con las CUATRO acciones del contrato:
 * `recibir`/`completar` (stock entra a destino) y `cancelar`/`rechazar` (stock
 * restituido al origen). Cada botón envía SU acción real — nunca se mapea todo a
 * "completar". El frontend NUNCA hace bypass: transporta la acción, el
 * `expectedVersion` y, cuando aplica, el `motivo`.
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
  Table,
  Modal,
  Alert,
  Field,
  Textarea,
} from "@workspace/design-system";
import { ShellInventario } from "../lib/inventario/Shell";
import { useTransferencias, useTransferencia } from "../lib/inventario/hooks";
import { transferir, transicionarTransferencia } from "../lib/inventario/mutaciones";
import { construirInputTransferencia } from "../lib/inventario/alta";
import { useOffline } from "../lib/offline/contexto";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaTransferencia } from "../lib/forms/plantillas-inventario";
import { BadgeEstadoTransferencia, fechaCorta } from "../lib/inventario/componentes";
import { ACCIONES_TRANSFERENCIA, type AccionTransferencia } from "../lib/inventario/constantes";
import { leerParam } from "../lib/inventario/deep-links";
import type { TransferenciaRow } from "../lib/inventario/tipos";

export default function InventarioTransferenciasPage() {
  return (
    <ShellInventario activo="/inventario/transferencias">
      <Contenido />
    </ShellInventario>
  );
}

function Contenido() {
  const search = useSearch();
  const idUrl = leerParam(search, "id");
  const { datos, cargando, error, recargar } = useTransferencias();
  const [crear, setCrear] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(idUrl || null);

  return (
    <>
      <PageHeader
        titulo="Transferencias"
        descripcion="Movimientos de stock entre bodegas/ubicaciones, gobernados por Workflow."
        acciones={<Button variant="primario" onClick={() => setCrear(true)}>Nueva transferencia</Button>}
      />
      <Section titulo="Transferencias">
        {cargando ? <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
          : error ? <Card><CardContent><ErrorState titulo="No se pudieron cargar las transferencias" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>
          : (datos ?? []).length === 0 ? <Card><CardContent><EmptyState titulo="Sin transferencias" descripcion="Crea la primera transferencia." /></CardContent></Card>
          : (
            <Card><CardContent>
              <Table caption="Listado de transferencias">
                <thead><tr><th scope="col">Id</th><th scope="col">Origen → Destino</th><th scope="col">Líneas</th><th scope="col">Estado</th><th scope="col">Actualizado</th><th scope="col"><span className="do-visualmente-oculto">Acciones</span></th></tr></thead>
                <tbody>
                  {(datos as TransferenciaRow[]).map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{t.id}</td>
                      <td>{t.origen?.bodegaId ?? "—"} → {t.destino?.bodegaId ?? "—"}</td>
                      <td>{(t.lineas ?? []).length}</td>
                      <td><BadgeEstadoTransferencia estado={t.estado} /></td>
                      <td>{fechaCorta(t.actualizadoAt)}</td>
                      <td><Button size="sm" variant="secundario" onClick={() => setDetalle(t.id)}>Abrir</Button></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent></Card>
          )}
      </Section>
      {crear && <ModalCrear onCerrar={() => setCrear(false)} onOk={() => { setCrear(false); recargar(); }} />}
      {detalle && <ModalDetalle id={detalle} onCerrar={() => setDetalle(null)} onCambio={recargar} />}
    </>
  );
}

function ModalCrear({ onCerrar, onOk }: { onCerrar: () => void; onOk: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaTransferencia(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Revisa los campos obligatorios."); return; }
    setGuardando(true); setErr(null);
    const r = await transferir(cola, construirInputTransferencia(form.valores));
    setGuardando(false);
    if (r.error) setErr(r.error.message);
    else onOk();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Nueva transferencia"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Crear</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <Alert variant="info" titulo="Gobernada por Workflow">Al crear, la transferencia se despacha a tránsito. Las transiciones (recibir, completar, cancelar, rechazar) las resuelve el motor.</Alert>
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}

export function ModalDetalle({ id, onCerrar, onCambio }: { id: string; onCerrar: () => void; onCambio: () => void }) {
  const { cola } = useOffline();
  const { datos, cargando, error, recargar } = useTransferencia(id);
  const [ejecutando, setEjecutando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);
  const [confirmar, setConfirmar] = useState<AccionTransferencia | null>(null);
  const [motivo, setMotivo] = useState("");

  const acciones: AccionTransferencia[] = datos?.estado ? (ACCIONES_TRANSFERENCIA[datos.estado] ?? []) : [];

  function pedir(a: AccionTransferencia) {
    setMsg(null);
    setMotivo("");
    setConfirmar(a);
  }

  async function ejecutar(a: AccionTransferencia, motivoTexto: string) {
    if (!datos) return;
    setEjecutando(a.clave); setMsg(null);
    // Cada acción envía SU transición REAL a /transferencias/:id/transicion. El
    // motor aplica el efecto autoritativo sobre el stock (destino/restitución).
    const r = await transicionarTransferencia(cola, datos.id, a.clave, datos.version ?? 1, a.pideMotivo ? motivoTexto : undefined);
    setEjecutando(null);
    setConfirmar(null);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la transición se encoló y se aplicará al sincronizar." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: `Transición «${a.etiqueta}» aplicada.` }); recargar(); onCambio(); }
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Transferencia"
      pie={<Button variant="fantasma" onClick={onCerrar}>Cerrar</Button>}>
      {cargando ? <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
        : error ? <ErrorState titulo="No se pudo cargar" descripcion={error.message} onReintentar={recargar} />
        : !datos ? <EmptyState titulo="No encontrada" descripcion={`No existe la transferencia ${id}.`} />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
            <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
              <BadgeEstadoTransferencia estado={datos.estado} />
              <span style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{datos.id}</span>
            </div>
            <Card><CardHeader><strong>Ruta</strong></CardHeader><CardContent>
              {datos.origen?.bodegaId ?? "—"} / {datos.origen?.ubicacionId ?? "—"} → {datos.destino?.bodegaId ?? "—"} / {datos.destino?.ubicacionId ?? "—"}
            </CardContent></Card>
            <Card><CardHeader><strong>Líneas</strong></CardHeader><CardContent>
              {(datos.lineas ?? []).length === 0 ? <EmptyState titulo="Sin líneas" /> : (
                <Table caption="Líneas de la transferencia">
                  <thead><tr><th scope="col">Item</th><th scope="col">Cantidad</th><th scope="col">Lote</th><th scope="col">Serie</th></tr></thead>
                  <tbody>
                    {(datos.lineas ?? []).map((l, i) => (
                      <tr key={i}><td>{l.itemId}</td><td>{l.cantidad}</td><td>{l.loteCodigo ?? "—"}</td><td>{l.serieNumero ?? "—"}</td></tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent></Card>
            {acciones.length > 0 ? (
              <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                {acciones.map((a) => (
                  <Button
                    key={a.clave}
                    variant={a.peligro ? "peligro" : "primario"}
                    size="sm"
                    loading={ejecutando === a.clave}
                    onClick={() => (a.pideMotivo ? pedir(a) : void ejecutar(a, ""))}
                  >
                    {a.etiqueta}
                  </Button>
                ))}
              </div>
            ) : (
              <Badge variant="neutro">Sin transiciones disponibles en este estado</Badge>
            )}
          </div>
        )}
      {confirmar && (
        <Modal
          abierto
          onClose={() => setConfirmar(null)}
          titulo={`Confirmar: ${confirmar.etiqueta}`}
          pie={
            <>
              <Button variant="fantasma" onClick={() => setConfirmar(null)}>Volver</Button>
              <Button
                variant={confirmar.peligro ? "peligro" : "primario"}
                loading={ejecutando === confirmar.clave}
                disabled={confirmar.pideMotivo && motivo.trim() === ""}
                onClick={() => void ejecutar(confirmar, motivo)}
              >
                Confirmar {confirmar.etiqueta.toLowerCase()}
              </Button>
            </>
          }
        >
          <Alert variant="advertencia" titulo="Decisión explícita">
            {confirmar.clave === "cancelar" || confirmar.clave === "rechazar"
              ? "Esta acción restituye el stock al origen. Indica el motivo."
              : "Confirma la transición."}
          </Alert>
          {confirmar.pideMotivo && (
            <Field label="Motivo" htmlFor="motivo-transicion">
              <Textarea id="motivo-transicion" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
            </Field>
          )}
        </Modal>
      )}
    </Modal>
  );
}
