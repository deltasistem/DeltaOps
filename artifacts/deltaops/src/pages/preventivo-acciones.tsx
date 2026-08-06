/**
 * DGP-014 · Paneles de acciones de programación preventiva (modales DS).
 *
 * Reprogramar / Suspender / Excluir / Generar OT. Cada panel captura con Dynamic
 * Forms (motivo desde catálogo de tenant), valida y envía el comando REAL con
 * degradación offline. La generación es idempotente: la respuesta distingue
 * `materializada` vs `pendiente` y `idempotente`, con DEEP LINK a la OT (destino
 * que ya consume su :id, DGP-010). Reutilizado por la ficha y el calendario.
 */
import React, { useMemo, useState } from "react";
import { Modal, Button, Alert } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo } from "../lib/preventivo/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import {
  plantillaReprogramar, plantillaSuspender, plantillaExcluir, plantillaGenerar,
} from "../lib/forms/plantillas-preventivo";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { reprogramar, suspender, excluir, generar } from "../lib/preventivo/mutaciones";
import { construirInputGenerar, txt } from "../lib/preventivo/alta";
import {
  CATALOGO_MOTIVO_REPROGRAMACION, CATALOGO_MOTIVO_SUSPENSION, CATALOGO_MOTIVO_EXCLUSION,
} from "../lib/preventivo/constantes";
import { urlOrdenTrabajo } from "../lib/preventivo/deep-links";
import type { ActividadRow, ResultadoGeneracion } from "../lib/preventivo/tipos";

const REGLAS = {};

function opc(r: { clave: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.clave, etiqueta: o.etiqueta }));
}

type Cerrar = (recarga: boolean) => void;
type Msg = { tono: "exito" | "info" | "error"; texto: string } | null;

/* ------------------------------ Reprogramar ----------------------------- */

export function PanelReprogramar({ programaId, onClose }: { programaId: string; onClose: Cerrar }) {
  const { cola } = useOffline();
  const motivos = useCatalogo(CATALOGO_MOTIVO_REPROGRAMACION);
  const definicion = useMemo(() => plantillaReprogramar(opc(motivos.datos ?? [])), [motivos.datos]);
  const [valores, setValores] = useState<ValoresFormulario>({});
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const h = validar(definicion, REGLAS, valores);
    setHallazgos(h);
    if (hayBloqueos(h)) { setMsg({ tono: "error", texto: "Completa los campos obligatorios." }); return; }
    setEnviando(true);
    const r = await reprogramar(cola, {
      programaId,
      fechaOriginal: txt(valores.fechaOriginal),
      fechaNueva: txt(valores.fechaNueva),
      motivo: txt(valores.motivo),
    });
    setEnviando(false);
    resolver(r, setMsg, onClose);
  }

  return (
    <PanelBase titulo="Reprogramar ocurrencia" msg={msg} enviando={enviando} onClose={onClose} onEnviar={enviar}>
      <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} />
    </PanelBase>
  );
}

/* ------------------------------- Suspender ------------------------------ */

export function PanelSuspender({ programaId, onClose }: { programaId: string; onClose: Cerrar }) {
  const { cola } = useOffline();
  const motivos = useCatalogo(CATALOGO_MOTIVO_SUSPENSION);
  const definicion = useMemo(() => plantillaSuspender(opc(motivos.datos ?? [])), [motivos.datos]);
  const [valores, setValores] = useState<ValoresFormulario>({ sujetoId: programaId, ambito: "programa" });
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const h = validar(definicion, REGLAS, valores);
    setHallazgos(h);
    if (hayBloqueos(h)) { setMsg({ tono: "error", texto: "Completa los campos obligatorios." }); return; }
    setEnviando(true);
    const hasta = txt(valores.hasta);
    const r = await suspender(cola, {
      programaId,
      ambito: txt(valores.ambito),
      sujetoId: txt(valores.sujetoId),
      motivo: txt(valores.motivo),
      desde: txt(valores.desde),
      ...(hasta ? { hasta } : {}),
    });
    setEnviando(false);
    resolver(r, setMsg, onClose);
  }

  return (
    <PanelBase titulo="Suspender" msg={msg} enviando={enviando} onClose={onClose} onEnviar={enviar}>
      <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} />
    </PanelBase>
  );
}

/* -------------------------------- Excluir ------------------------------- */

export function PanelExcluir({ programaId, onClose }: { programaId: string; onClose: Cerrar }) {
  const { cola } = useOffline();
  const motivos = useCatalogo(CATALOGO_MOTIVO_EXCLUSION);
  const definicion = useMemo(() => plantillaExcluir(opc(motivos.datos ?? [])), [motivos.datos]);
  const [valores, setValores] = useState<ValoresFormulario>({});
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const h = validar(definicion, REGLAS, valores);
    setHallazgos(h);
    if (hayBloqueos(h)) { setMsg({ tono: "error", texto: "Completa los campos obligatorios." }); return; }
    setEnviando(true);
    const r = await excluir(cola, {
      programaId,
      desde: txt(valores.desde),
      hasta: txt(valores.hasta),
      motivo: txt(valores.motivo),
    });
    setEnviando(false);
    resolver(r, setMsg, onClose);
  }

  return (
    <PanelBase titulo="Excluir rango" msg={msg} enviando={enviando} onClose={onClose} onEnviar={enviar}>
      <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} />
    </PanelBase>
  );
}

/* -------------------------------- Generar ------------------------------- */

export function PanelGenerar({
  programaId, actividades, activos, onClose, onNavegar,
}: {
  programaId: string;
  actividades: ActividadRow[];
  activos: string[];
  onClose: Cerrar;
  onNavegar: (u: string) => void;
}) {
  const { cola } = useOffline();
  const opcActividades = useMemo<OpcionSeleccion[]>(() => actividades.map((a) => ({ valor: a.id, etiqueta: `#${a.orden} ${a.nombre}` })), [actividades]);
  const opcActivos = useMemo<OpcionSeleccion[]>(() => activos.map((a) => ({ valor: a, etiqueta: a })), [activos]);
  const definicion = useMemo(() => plantillaGenerar(opcActividades, opcActivos), [opcActividades, opcActivos]);
  const [valores, setValores] = useState<ValoresFormulario>({ ventana: "programada", origen: "manual" });
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [enviando, setEnviando] = useState(false);
  const [ot, setOt] = useState<string | null>(null);

  async function enviar() {
    const h = validar(definicion, REGLAS, valores);
    setHallazgos(h);
    if (hayBloqueos(h)) { setMsg({ tono: "error", texto: "Completa los campos obligatorios." }); return; }
    setEnviando(true);
    const input = construirInputGenerar({
      programaId,
      actividadId: txt(valores.actividadId),
      activoId: txt(valores.activoId),
      ventana: txt(valores.ventana) || "programada",
      origen: txt(valores.origen) || "manual",
      fechaObjetivo: txt(valores.fechaObjetivo),
    });
    const r = await generar(cola, input);
    setEnviando(false);
    if (r.encolada) { setMsg({ tono: "info", texto: "Sin conexión: la generación se encoló (idempotente al sincronizar)." }); return; }
    if (r.error) { setMsg({ tono: "error", texto: r.error.message }); return; }
    const res = (r.resultado ?? {}) as ResultadoGeneracion;
    setOt(res.ordenTrabajoId ?? null);
    const etiqueta = res.estado === "materializada"
      ? (res.idempotente ? "OT ya existente (idempotente): no se duplicó." : "OT generada correctamente.")
      : "Generación pendiente: no correspondía materializar aún.";
    setMsg({ tono: res.estado === "materializada" ? "exito" : "info", texto: etiqueta });
  }

  return (
    <Modal
      abierto
      onClose={() => onClose(Boolean(ot))}
      titulo="Generar orden de trabajo"
      pie={
        <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
          {ot && <Button variant="primario" onClick={() => onNavegar(urlOrdenTrabajo(ot))}>Ver OT →</Button>}
          <Button variant="fantasma" onClick={() => onClose(Boolean(ot))}>Cerrar</Button>
          {!ot && <Button variant="primario" disabled={enviando} onClick={() => void enviar()}>{enviando ? "Generando…" : "Generar"}</Button>}
        </div>
      }
    >
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} />
    </Modal>
  );
}

/* -------------------------------- Base ---------------------------------- */

function PanelBase({
  titulo, children, msg, enviando, onClose, onEnviar,
}: {
  titulo: string;
  children: React.ReactNode;
  msg: Msg;
  enviando: boolean;
  onClose: Cerrar;
  onEnviar: () => void;
}) {
  return (
    <Modal
      abierto
      onClose={() => onClose(false)}
      titulo={titulo}
      pie={
        <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
          <Button variant="fantasma" onClick={() => onClose(false)}>Cancelar</Button>
          <Button variant="primario" disabled={enviando} onClick={onEnviar}>{enviando ? "Enviando…" : "Confirmar"}</Button>
        </div>
      }
    >
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      {children}
    </Modal>
  );
}

function resolver(r: { encolada: boolean; error?: Error }, setMsg: (m: Msg) => void, onClose: Cerrar) {
  if (r.encolada) { setMsg({ tono: "info", texto: "Sin conexión: la acción se encoló y se sincronizará." }); setTimeout(() => onClose(true), 900); return; }
  if (r.error) { setMsg({ tono: "error", texto: r.error.message }); return; }
  setMsg({ tono: "exito", texto: "Acción aplicada." });
  setTimeout(() => onClose(true), 700);
}
