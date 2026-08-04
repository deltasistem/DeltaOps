/**
 * DGP-008.3 · Pestaña Comentarios de la ficha (crear/editar/eliminar).
 */
import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  Button,
  Alert,
  EmptyState,
  Spinner,
  ErrorState,
  Modal,
} from "@workspace/design-system";
import { useComentarios } from "../../lib/activos/hooks";
import { useOffline } from "../../lib/offline/contexto";
import { comentar, editarComentario, borrarComentario } from "../../lib/activos/mutaciones";
import type { Comentario } from "../../lib/activos/tipos";
import { FormularioDinamico, useFormularioDinamico } from "../../lib/forms/FormularioDinamico";
import { plantillaComentario } from "../../lib/forms/plantillas";

function fecha(c: Comentario): string {
  const iso = c.creadoAt ?? c.editadoAt ?? undefined;
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("es");
}

export function TabComentarios({ id }: { id: string }) {
  const { cola } = useOffline();
  const { datos, cargando, error, recargar } = useComentarios(id);
  const defComentario = useMemo(() => plantillaComentario(), []);
  const form = useFormularioDinamico(defComentario);
  const [msg, setMsg] = useState<string | null>(null);
  const [editar, setEditar] = useState<Comentario | null>(null);
  const [confirmar, setConfirmar] = useState<Comentario | null>(null);
  const [enviando, setEnviando] = useState(false);

  const texto = String(form.valores.texto ?? "");

  async function publicar() {
    if (form.validarAhora().some((h) => h.severidad !== "advertencia")) return;
    setEnviando(true);
    const r = await comentar(cola, id, texto.trim());
    setEnviando(false);
    form.setValores({});
    setMsg(r.encolada ? "Sin conexión: el comentario se sincronizará." : r.error ? r.error.message : null);
    if (!r.error) recargar();
  }

  async function borrar(c: Comentario) {
    const r = await borrarComentario(cola, c.id);
    setConfirmar(null);
    setMsg(r.encolada ? "Sin conexión: se sincronizará." : r.error ? r.error.message : null);
    if (!r.error) recargar();
  }

  const comentarios = datos ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      {msg && <Alert variant="info" titulo={msg} />}
      <Card>
        <CardContent>
          <FormularioDinamico
            definicion={defComentario}
            valores={form.valores}
            onCambio={form.setValores}
            hallazgos={form.hallazgos}
          />
          <div style={{ marginTop: "var(--do-sp-2)", display: "flex", justifyContent: "flex-end" }}>
            <Button variant="primario" size="sm" loading={enviando} disabled={!texto.trim()} onClick={() => void publicar()}>Publicar</Button>
          </div>
        </CardContent>
      </Card>

      {cargando ? (
        <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
      ) : error ? (
        <Card><CardContent><ErrorState titulo="No se pudieron cargar los comentarios" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>
      ) : comentarios.length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin comentarios" descripcion="Sé el primero en comentar este activo." /></CardContent></Card>
      ) : (
        comentarios.map((c) => (
          <Card key={c.id}>
            <CardContent>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
                  <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{c.autor ?? c.actorId ?? "Anónimo"} · {fecha(c)}</span>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{c.texto}</p>
                </div>
                <div style={{ display: "flex", gap: "var(--do-sp-1)" }}>
                  <Button variant="fantasma" size="sm" onClick={() => setEditar(c)}>Editar</Button>
                  <Button variant="peligro" size="sm" onClick={() => setConfirmar(c)}>Eliminar</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {editar && <EditarModal comentario={editar} onCerrar={() => setEditar(null)} onGuardado={() => { setEditar(null); recargar(); }} />}
      {confirmar && (
        <Modal abierto onClose={() => setConfirmar(null)} titulo="Eliminar comentario"
          pie={<><Button variant="fantasma" onClick={() => setConfirmar(null)}>Cancelar</Button><Button variant="peligro" onClick={() => void borrar(confirmar)}>Eliminar</Button></>}>
          <p>¿Confirmas la eliminación del comentario?</p>
        </Modal>
      )}
    </div>
  );
}

function EditarModal({ comentario, onCerrar, onGuardado }: { comentario: Comentario; onCerrar: () => void; onGuardado: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaComentario(), []);
  const form = useFormularioDinamico(def, {}, { texto: comentario.texto });
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (form.validarAhora().some((h) => h.severidad !== "advertencia")) return;
    setGuardando(true);
    setErr(null);
    const r = await editarComentario(cola, comentario.id, comentario.version ?? 0, String(form.valores.texto ?? ""));
    setGuardando(false);
    if (r.error) setErr(r.error.message);
    else onGuardado();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Editar comentario"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Guardar</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}
