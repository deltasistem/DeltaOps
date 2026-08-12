/**
 * DGP-008.3 · Pestaña Relaciones de la ficha.
 * Grafo SVG navegable + crear/eliminar relación (con confirmación).
 */
import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  Button,
  Modal,
  Alert,
  EmptyState,
  Spinner,
  ErrorState,
  Table as DoTable,
} from "@workspace/design-system";
import { useRelacionados } from "../../lib/activos/hooks";
import { useOffline } from "../../lib/offline/contexto";
import { crearRelacion, eliminarRelacion } from "../../lib/activos/mutaciones";
import { RelacionesGrafo } from "../../lib/activos/RelacionesGrafo";
import { FormularioDinamico, useFormularioDinamico } from "../../lib/forms/FormularioDinamico";
import { plantillaRelacion } from "../../lib/forms/plantillas";
import { useSesion } from "../../lib/identidad/sesion";
import { capacidadesActivos } from "../../lib/activos/capacidades";

const TIPOS_RELACION = [
  "padre-de", "hijo-de", "compuesto-por", "componente-de",
  "depende-de", "requerido-por", "reemplaza-a", "reemplazado-por", "relacionado-con",
];

export function TabRelaciones({ id, nombre, onNavegar }: { id: string; nombre: string; onNavegar: (id: string) => void }) {
  const { cola } = useOffline();
  const { sesion } = useSesion();
  const puedeEscribir = capacidadesActivos(sesion).editar;
  const { datos, cargando, error, recargar } = useRelacionados(id);
  const [crear, setCrear] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function borrar(relId: string) {
    const r = await eliminarRelacion(cola, relId);
    setConfirmarBorrar(null);
    setMsg(r.encolada ? "Sin conexión: se sincronizará." : r.error ? r.error.message : "Relación eliminada.");
    if (!r.error) recargar();
  }

  // Robustez: `useRelacionados` ya normaliza la respuesta del backend a
  // `Relacion[]`; esta guarda evita cualquier `.map` sobre un valor no-arreglo.
  const relaciones = Array.isArray(datos) ? datos : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      {msg && <Alert variant="info" titulo={msg} />}
      {puedeEscribir && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primario" size="sm" onClick={() => setCrear(true)}>Crear relación</Button>
        </div>
      )}
      {cargando ? (
        <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
      ) : error ? (
        <Card><CardContent><ErrorState titulo="No se pudieron cargar las relaciones" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>
      ) : relaciones.length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin relaciones" descripcion="Este activo no tiene relaciones con otros activos." /></CardContent></Card>
      ) : (
        <>
          <Card><CardContent><RelacionesGrafo centroId={id} centroNombre={nombre} relaciones={relaciones} onNavegar={onNavegar} /></CardContent></Card>
          <Card>
            <CardContent>
              <DoTable caption="Relaciones del activo">
                <thead><tr><th>Tipo</th><th>Origen</th><th>Destino</th>{puedeEscribir && <th></th>}</tr></thead>
                <tbody>
                  {relaciones.map((r) => (
                    <tr key={r.id}>
                      <td><code style={{ fontSize: "var(--do-text-xs)" }}>{r.tipo}</code></td>
                      <td><button className="do-vinculo" onClick={() => onNavegar(r.origenId)} style={{ background: "none", border: "none", color: "var(--do-primario)", cursor: "pointer", padding: 0 }}>{r.origenNombre ?? r.origenId.slice(0, 8)}</button></td>
                      <td><button onClick={() => onNavegar(r.destinoId)} style={{ background: "none", border: "none", color: "var(--do-primario)", cursor: "pointer", padding: 0 }}>{r.destinoNombre ?? r.destinoId.slice(0, 8)}</button></td>
                      {puedeEscribir && <td><Button variant="peligro" size="sm" onClick={() => setConfirmarBorrar(r.id)}>Eliminar</Button></td>}
                    </tr>
                  ))}
                </tbody>
              </DoTable>
            </CardContent>
          </Card>
        </>
      )}

      {crear && <CrearRelacionModal origenId={id} onCerrar={() => setCrear(false)} onGuardado={() => { setCrear(false); recargar(); }} />}
      {confirmarBorrar && (
        <Modal abierto onClose={() => setConfirmarBorrar(null)} titulo="Eliminar relación"
          pie={<><Button variant="fantasma" onClick={() => setConfirmarBorrar(null)}>Cancelar</Button><Button variant="peligro" onClick={() => void borrar(confirmarBorrar)}>Eliminar</Button></>}>
          <p>¿Confirmas la eliminación de esta relación?</p>
        </Modal>
      )}
    </div>
  );
}

function CrearRelacionModal({ origenId, onCerrar, onGuardado }: { origenId: string; onCerrar: () => void; onGuardado: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(
    () => plantillaRelacion(TIPOS_RELACION.map((t) => ({ valor: t, etiqueta: t }))),
    [],
  );
  const form = useFormularioDinamico(def, {}, { tipo: TIPOS_RELACION[0]! });
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (form.validarAhora().some((h) => h.severidad !== "advertencia")) { setErr("Revisa los campos obligatorios."); return; }
    const tipo = String(form.valores.tipo ?? "");
    const destinoId = String(form.valores.destinoId ?? "").trim();
    setGuardando(true);
    setErr(null);
    const r = await crearRelacion(cola, origenId, destinoId, tipo);
    setGuardando(false);
    if (r.error) setErr(r.error.message);
    else onGuardado();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Crear relación"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Crear</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}
