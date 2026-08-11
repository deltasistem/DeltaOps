/**
 * DGP-011.3 · Pestañas de la ficha del item (superficies compuestas).
 *
 * NOTA de contrato: la OpenAPI congelada de Inventario NO expone endpoints
 * dedicados de comentarios/adjuntos/timeline/historial (a diferencia de
 * Activos/Órdenes). Por integridad de datos NO se inventan endpoints:
 *  · Timeline/Historial se DERIVAN de los movimientos del item (fuente de
 *    verdad del ledger de inventario), en modo lectura.
 *  · Comentarios/Adjuntos consumen capacidades de plataforma (platform.comment /
 *    platform.attachment) por rutas convencionales; si la plataforma no las
 *    monta para este módulo, degradan elegantemente (404 → aviso claro), sin
 *    fabricar datos.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Section,
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Alert,
  EmptyState,
  ErrorState,
  Spinner,
  Modal,
  Timeline,
  Table,
} from "@workspace/design-system";
import {
  useExistenciasItem,
  useMovimientosExistencia,
  useLotes,
  useSeries,
  useReservas,
  useTransferencias,
  useConteos,
  useAjustes,
} from "../../lib/inventario/hooks";
import { inventarioFetch, esFuncionNoDisponible } from "../../lib/inventario/api";
import { useConsulta } from "../../lib/ordenes/hooks";
import { useOffline } from "../../lib/offline/contexto";
import {
  mover,
  reservar,
  liberarReserva,
  ajustar,
  crearLote,
  registrarSerie,
} from "../../lib/inventario/mutaciones";
import {
  construirInputMovimiento,
  construirInputReserva,
  construirInputAjuste,
  construirInputLote,
  construirInputSerie,
} from "../../lib/inventario/alta";
import { hashArchivo } from "../../lib/activos/hash";
import { FormularioDinamico, useFormularioDinamico } from "../../lib/forms/FormularioDinamico";
import {
  plantillaMovimiento,
  plantillaReserva,
  plantillaLiberarReserva,
  plantillaAjuste,
  plantillaLote,
  plantillaSerie,
  plantillaComentario,
  plantillaAdjunto,
} from "../../lib/forms/plantillas-inventario";
import { BadgeEstadoTransferencia, BadgeEstadoConteo, fechaCorta } from "../../lib/inventario/componentes";
import { ETIQUETA_TIPO_MOVIMIENTO, TONO_TIPO_MOVIMIENTO, type Tono } from "../../lib/inventario/constantes";
import { urlItemTab } from "../../lib/inventario/deep-links";
import type {
  ItemRow,
  ExistenciaRow,
  MovimientoRow,
  LoteRow,
  SerieRow,
  ReservaRow,
  TransferenciaRow,
  ConteoRow,
  AjusteRow,
} from "../../lib/inventario/tipos";

/* ------------------------- utilidades compartidas ----------------------- */

function Cargando() {
  return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
}

function Marco({ children }: { children: React.ReactNode }) {
  return <Card><CardContent>{children}</CardContent></Card>;
}

/* ------------------------------ Existencias ----------------------------- */

export function TabExistencias({ itemId }: { itemId: string }) {
  const { datos, cargando, error, recargar } = useExistenciasItem(itemId);
  return (
    <Section titulo="Existencias por ubicación">
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar las existencias" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin existencias" descripcion="Este item no tiene existencias registradas." /></Marco>
        : (
          <Table caption="Existencias del item por bodega y ubicación">
            <thead><tr><th scope="col">Bodega</th><th scope="col">Ubicación</th><th scope="col">Cantidad</th><th scope="col">Disponible</th><th scope="col">Reservado</th></tr></thead>
            <tbody>
              {(datos as ExistenciaRow[]).map((e) => (
                <tr key={e.id}>
                  <td>{e.bodegaId}</td>
                  <td>{e.ubicacionId}</td>
                  <td>{e.cantidad ?? "—"}</td>
                  <td>{e.disponible ?? "—"}</td>
                  <td>{e.reservado ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
    </Section>
  );
}

/* ------------------------------- Movimientos ---------------------------- */

/** Movimientos consolidados de todas las existencias del item. */
function useMovimientosItem(itemId: string) {
  const existencias = useExistenciasItem(itemId);
  const ids = (existencias.datos ?? []).map((e) => e.id);
  const clave = ids.join(",");
  const consulta = useConsulta<MovimientoRow[]>(
    async (signal) => {
      if (ids.length === 0) return [];
      const lotes = await Promise.all(
        ids.map((id) =>
          inventarioFetch<MovimientoRow[] | { movimientos?: MovimientoRow[] }>(
            `/existencias/${encodeURIComponent(id)}/movimientos`,
            { signal, toleraNoEncontrado: true },
          ).then((r) => (Array.isArray(r) ? r : (r?.movimientos ?? []))).catch(() => []),
        ),
      );
      return lotes.flat().sort((a, b) => String(b.ocurridoAt ?? b.fecha ?? "").localeCompare(String(a.ocurridoAt ?? a.fecha ?? "")));
    },
    [clave],
  );
  return { ...consulta, cargando: consulta.cargando || existencias.cargando };
}

export function TabMovimientos({ item, onCambio }: { item: ItemRow; onCambio: () => void }) {
  const { datos, cargando, error, recargar } = useMovimientosItem(item.id);
  const [registrar, setRegistrar] = useState(false);
  return (
    <Section titulo="Movimientos" acciones={<Button size="sm" variant="primario" onClick={() => setRegistrar(true)}>Registrar movimiento</Button>}>
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar los movimientos" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin movimientos" descripcion="Aún no hay movimientos para este item." /></Marco>
        : (
          <Table caption="Movimientos de stock del item">
            <thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Cantidad</th><th scope="col">Bodega/Ubicación</th><th scope="col">Referencia</th></tr></thead>
            <tbody>
              {(datos as MovimientoRow[]).map((m) => (
                <tr key={m.id}>
                  <td>{fechaCorta(m.ocurridoAt ?? m.fecha)}</td>
                  <td><Badge variant={(TONO_TIPO_MOVIMIENTO[m.tipo ?? ""] ?? "neutro") as Tono}>{ETIQUETA_TIPO_MOVIMIENTO[m.tipo ?? ""] ?? m.tipo ?? "—"}</Badge></td>
                  <td>{m.cantidad ?? "—"}</td>
                  <td>{m.bodegaId ?? "—"}{m.ubicacionId ? ` / ${m.ubicacionId}` : ""}</td>
                  <td>{m.referencia ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      {registrar && (
        <ModalFormulario
          titulo="Registrar movimiento"
          def={plantillaMovimiento()}
          onCerrar={() => setRegistrar(false)}
          ejecutar={(cola, valores) => mover(cola, { ...construirInputMovimiento(item.id, valores), itemId: item.id })}
          onOk={() => { setRegistrar(false); recargar(); onCambio(); }}
        />
      )}
    </Section>
  );
}

/* --------------------------------- Lotes -------------------------------- */

export function TabLotes({ item, onCambio }: { item: ItemRow; onCambio: () => void }) {
  const { datos, cargando, error, recargar } = useLotes(item.id);
  const [crear, setCrear] = useState(false);
  const hoy = Date.now();
  return (
    <Section titulo="Lotes" acciones={<Button size="sm" variant="primario" onClick={() => setCrear(true)}>Crear lote</Button>}>
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar los lotes" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin lotes" descripcion="Este item no maneja lotes o no hay lotes registrados." /></Marco>
        : (
          <Table caption="Lotes del item">
            <thead><tr><th scope="col">Código</th><th scope="col">Vencimiento</th><th scope="col">Cantidad</th><th scope="col">Estado</th></tr></thead>
            <tbody>
              {(datos as LoteRow[]).map((l) => {
                const venc = l.vencimiento ? new Date(l.vencimiento).getTime() : null;
                const vencido = venc != null && venc < hoy;
                const proximo = venc != null && !vencido && venc - hoy < 1000 * 60 * 60 * 24 * 30;
                return (
                  <tr key={l.id}>
                    <td style={{ fontFamily: "var(--do-font-mono)" }}>{l.codigo ?? l.id}</td>
                    <td>{fechaCorta(l.vencimiento)} {vencido ? <Badge variant="error">Vencido</Badge> : proximo ? <Badge variant="advertencia">Por vencer</Badge> : null}</td>
                    <td>{l.cantidad ?? "—"}</td>
                    <td>{vencido ? "Vencido" : "Vigente"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      {crear && (
        <ModalFormulario
          titulo="Crear lote"
          def={plantillaLote()}
          onCerrar={() => setCrear(false)}
          ejecutar={(cola, valores) => crearLote(cola, construirInputLote(item.id, valores))}
          onOk={() => { setCrear(false); recargar(); onCambio(); }}
        />
      )}
    </Section>
  );
}

/* --------------------------------- Series ------------------------------- */

export function TabSeries({ item, onCambio }: { item: ItemRow; onCambio: () => void }) {
  const { datos, cargando, error, recargar } = useSeries(item.id);
  const [crear, setCrear] = useState(false);
  return (
    <Section titulo="Series" acciones={<Button size="sm" variant="primario" onClick={() => setCrear(true)}>Registrar serie</Button>}>
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar las series" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin series" descripcion="Este item no maneja series o no hay series registradas." /></Marco>
        : (
          <Table caption="Series del item">
            <thead><tr><th scope="col">Número</th><th scope="col">Lote</th><th scope="col">Estado</th></tr></thead>
            <tbody>
              {(datos as SerieRow[]).map((s) => (
                <tr key={s.id}>
                  <td style={{ fontFamily: "var(--do-font-mono)" }}>{s.numero ?? s.id}</td>
                  <td>{s.loteId ?? "—"}</td>
                  <td>{s.estado ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      {crear && (
        <ModalFormulario
          titulo="Registrar serie"
          def={plantillaSerie()}
          onCerrar={() => setCrear(false)}
          ejecutar={(cola, valores) => registrarSerie(cola, construirInputSerie(item.id, valores))}
          onOk={() => { setCrear(false); recargar(); onCambio(); }}
        />
      )}
    </Section>
  );
}

/* -------------------------------- Reservas ------------------------------ */

export function TabReservas({ item, onCambio }: { item: ItemRow; onCambio: () => void }) {
  const { datos, cargando, error, recargar } = useReservas(item.id);
  const [crear, setCrear] = useState(false);
  const [liberar, setLiberar] = useState<ReservaRow | null>(null);
  return (
    <Section titulo="Reservas" acciones={<Button size="sm" variant="primario" onClick={() => setCrear(true)}>Crear reserva</Button>}>
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar las reservas" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin reservas" descripcion="No hay reservas activas para este item." /></Marco>
        : (
          <Table caption="Reservas del item">
            <thead><tr><th scope="col">Demanda</th><th scope="col">Cantidad</th><th scope="col">Bodega/Ubicación</th><th scope="col">Estado</th><th scope="col"><span className="do-visualmente-oculto">Acciones</span></th></tr></thead>
            <tbody>
              {(datos as ReservaRow[]).map((r) => (
                <tr key={r.id}>
                  <td>{r.demanda ? `${r.demanda.tipo}:${r.demanda.id}` : "—"}</td>
                  <td>{r.cantidad ?? "—"}</td>
                  <td>{r.bodegaId ?? "—"}{r.ubicacionId ? ` / ${r.ubicacionId}` : ""}</td>
                  <td>{r.estado ?? "—"}</td>
                  <td><Button size="sm" variant="secundario" onClick={() => setLiberar(r)}>Liberar / consumir</Button></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      {crear && (
        <ModalFormulario
          titulo="Crear reserva"
          def={plantillaReserva()}
          onCerrar={() => setCrear(false)}
          ejecutar={(cola, valores) => reservar(cola, construirInputReserva(item.id, valores))}
          onOk={() => { setCrear(false); recargar(); onCambio(); }}
        />
      )}
      {liberar && (
        <ModalFormulario
          titulo="Liberar o consumir reserva"
          def={plantillaLiberarReserva()}
          onCerrar={() => setLiberar(null)}
          ejecutar={(cola, valores) => liberarReserva(cola, liberar.id, liberar.version ?? 1, String(valores.motivo ?? "") || undefined)}
          onOk={() => { setLiberar(null); recargar(); onCambio(); }}
        />
      )}
    </Section>
  );
}

/* ----------------------------- Transferencias --------------------------- */

export function TabTransferencias({ itemId }: { itemId: string }) {
  const { datos, cargando, error, recargar } = useTransferencias();
  const relacionadas = useMemo(
    () => (datos ?? []).filter((t) => (t.lineas ?? []).some((l) => l.itemId === itemId)),
    [datos, itemId],
  );
  return (
    <Section titulo="Transferencias">
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar las transferencias" descripcion={error.message} onReintentar={recargar} /></Marco>
        : relacionadas.length === 0 ? <Marco><EmptyState titulo="Sin transferencias" descripcion="Este item no participa en transferencias." /></Marco>
        : (
          <Table caption="Transferencias del item">
            <thead><tr><th scope="col">Id</th><th scope="col">Origen → Destino</th><th scope="col">Estado</th><th scope="col"><span className="do-visualmente-oculto">Acciones</span></th></tr></thead>
            <tbody>
              {(relacionadas as TransferenciaRow[]).map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{t.id}</td>
                  <td>{t.origen?.bodegaId ?? "—"} → {t.destino?.bodegaId ?? "—"}</td>
                  <td><BadgeEstadoTransferencia estado={t.estado} /></td>
                  <td><Link href={`/inventario/transferencias?id=${encodeURIComponent(t.id)}`}><Button size="sm" variant="secundario">Ver</Button></Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
    </Section>
  );
}

/* -------------------------------- Conteos ------------------------------- */

export function TabConteos() {
  const { datos, cargando, error, recargar } = useConteos();
  return (
    <Section titulo="Conteos">
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar los conteos" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin conteos" descripcion="No hay conteos programados." /></Marco>
        : (
          <Table caption="Conteos">
            <thead><tr><th scope="col">Id</th><th scope="col">Tipo</th><th scope="col">Bodega</th><th scope="col">Estado</th></tr></thead>
            <tbody>
              {(datos as ConteoRow[]).map((c) => (
                <tr key={c.id}>
                  <td style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{c.id}</td>
                  <td>{c.tipo ?? "—"}</td>
                  <td>{c.bodegaId ?? "—"}</td>
                  <td><BadgeEstadoConteo estado={c.estado} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
    </Section>
  );
}

/* -------------------------------- Ajustes ------------------------------- */

export function TabAjustes({ item, onCambio }: { item: ItemRow; onCambio: () => void }) {
  const { datos, cargando, error, recargar } = useAjustes(item.id);
  const [crear, setCrear] = useState(false);
  return (
    <Section titulo="Ajustes" acciones={<Button size="sm" variant="primario" onClick={() => setCrear(true)}>Registrar ajuste</Button>}>
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar los ajustes" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin ajustes" descripcion="No hay ajustes registrados para este item." /></Marco>
        : (
          <Table caption="Ajustes del item">
            <thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Cantidad</th><th scope="col">Motivo</th><th scope="col">Estado</th></tr></thead>
            <tbody>
              {(datos as AjusteRow[]).map((a) => (
                <tr key={a.id}>
                  <td>{fechaCorta(a.actualizadoAt)}</td>
                  <td>{a.tipo ?? "—"}</td>
                  <td>{a.cantidad ?? "—"}</td>
                  <td>{a.motivo ?? "—"}</td>
                  <td>{a.estado ?? (a.aprobado ? "Aprobado" : "Pendiente")}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      {crear && (
        <ModalFormulario
          titulo="Registrar ajuste"
          def={plantillaAjuste()}
          onCerrar={() => setCrear(false)}
          ejecutar={(cola, valores) => ajustar(cola, construirInputAjuste(item.id, valores))}
          onOk={() => { setCrear(false); recargar(); onCambio(); }}
        />
      )}
    </Section>
  );
}

/* ------------------------- Timeline / Historial ------------------------- */

/** Timeline (lectura) derivado del ledger de movimientos del item. */
export function TabTimeline({ itemId }: { itemId: string }) {
  const { datos, cargando, error, recargar } = useMovimientosItem(itemId);
  const eventos = (datos ?? []).slice(0, 100).map((m) => ({
    titulo: ETIQUETA_TIPO_MOVIMIENTO[m.tipo ?? ""] ?? m.tipo ?? "Movimiento",
    hora: fechaCorta(m.ocurridoAt ?? m.fecha),
    descripcion: `${m.cantidad ?? ""} · ${m.bodegaId ?? ""}${m.ubicacionId ? ` / ${m.ubicacionId}` : ""}${m.referencia ? ` · ${m.referencia}` : ""}`,
    tono: (TONO_TIPO_MOVIMIENTO[m.tipo ?? ""] ?? "neutro") as Tono,
  }));
  return (
    <Section titulo="Timeline">
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudo cargar el timeline" descripcion={error.message} onReintentar={recargar} /></Marco>
        : eventos.length === 0 ? <Marco><EmptyState titulo="Sin eventos" descripcion="Aún no hay eventos en la línea de tiempo." /></Marco>
        : <Marco><Timeline label="Eventos del item" eventos={eventos} /></Marco>}
    </Section>
  );
}

/** Historial (lectura) — tabla cronológica completa de movimientos. */
export function TabHistorial({ itemId }: { itemId: string }) {
  const { datos, cargando, error, recargar } = useMovimientosItem(itemId);
  return (
    <Section titulo="Historial">
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudo cargar el historial" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin historial" descripcion="No hay eventos históricos." /></Marco>
        : (
          <Table caption="Historial de movimientos del item">
            <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th><th scope="col">Cantidad</th><th scope="col">Ubicación</th></tr></thead>
            <tbody>
              {(datos as MovimientoRow[]).map((m) => (
                <tr key={m.id}>
                  <td>{fechaCorta(m.ocurridoAt ?? m.fecha)}</td>
                  <td>{ETIQUETA_TIPO_MOVIMIENTO[m.tipo ?? ""] ?? m.tipo ?? "—"}</td>
                  <td>{m.cantidad ?? "—"}</td>
                  <td>{m.bodegaId ?? "—"}{m.ubicacionId ? ` / ${m.ubicacionId}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
    </Section>
  );
}

/* ------------------------- Comentarios (platform) ----------------------- */

interface ComentarioVista { id: string; texto: string; autor?: string; creadoAt?: string }

export function TabComentarios({ itemId }: { itemId: string }) {
  const { datos, cargando, error, recargar } = useConsulta<ComentarioVista[] | null>(
    async (signal) => {
      const r = await inventarioFetch<{ comentarios?: ComentarioVista[] } | ComentarioVista[]>(
        `/${encodeURIComponent(itemId)}/comentarios`,
        { signal, toleraNoEncontrado: true },
      );
      if (r === null) return null; // capacidad de plataforma no montada para el módulo
      return Array.isArray(r) ? r : (r.comentarios ?? []);
    },
    [itemId],
  );
  const [nuevo, setNuevo] = useState(false);

  if (datos === null && !cargando && !error) {
    return (
      <Section titulo="Comentarios">
        <Marco>
          <Alert variant="info" titulo="Comentarios no disponibles">
            La capacidad de comentarios de plataforma (platform.comment) no está habilitada para el módulo de inventario en este entorno.
          </Alert>
        </Marco>
      </Section>
    );
  }

  return (
    <Section titulo="Comentarios" acciones={<Button size="sm" variant="primario" onClick={() => setNuevo(true)}>Comentar</Button>}>
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar los comentarios" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin comentarios" descripcion="Sé el primero en comentar." /></Marco>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
            {(datos ?? []).map((c) => (
              <Card key={c.id}><CardContent>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
                  <strong style={{ fontSize: "var(--do-text-sm)" }}>{c.autor ?? "—"}</strong>
                  <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{fechaCorta(c.creadoAt)}</span>
                </div>
                <p style={{ margin: "var(--do-sp-1) 0 0" }}>{c.texto}</p>
              </CardContent></Card>
            ))}
          </div>
        )}
      {nuevo && (
        <ModalComentario
          itemId={itemId}
          onCerrar={() => setNuevo(false)}
          onOk={() => { setNuevo(false); recargar(); }}
        />
      )}
    </Section>
  );
}

function ModalComentario({ itemId, onCerrar, onOk }: { itemId: string; onCerrar: () => void; onOk: () => void }) {
  const def = useMemo(() => plantillaComentario(), []);
  const form = useFormularioDinamico(def, {}, {});
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Escribe un comentario."); return; }
    setGuardando(true); setErr(null);
    try {
      await inventarioFetch(`/${encodeURIComponent(itemId)}/comentarios`, { method: "POST", body: { texto: String(form.valores.texto ?? "") } });
      onOk();
    } catch (e) {
      setErr(esFuncionNoDisponible(e) ? "Los comentarios no están habilitados para este módulo." : (e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Nuevo comentario"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Publicar</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}

/* -------------------------- Adjuntos (platform) ------------------------- */

interface AdjuntoVista { attachmentId: string; categoria?: string; nombreArchivo?: string; mimeType?: string; tamanoBytes?: number; hashSha256?: string }

export function TabAdjuntos({ itemId }: { itemId: string }) {
  const { datos, cargando, error, recargar } = useConsulta<AdjuntoVista[] | null>(
    async (signal) => {
      const r = await inventarioFetch<{ adjuntos?: AdjuntoVista[] } | AdjuntoVista[]>(
        `/${encodeURIComponent(itemId)}/adjuntos`,
        { signal, toleraNoEncontrado: true },
      );
      if (r === null) return null;
      return Array.isArray(r) ? r : (r.adjuntos ?? []);
    },
    [itemId],
  );
  const [nuevo, setNuevo] = useState(false);

  if (datos === null && !cargando && !error) {
    return (
      <Section titulo="Adjuntos">
        <Marco>
          <Alert variant="info" titulo="Adjuntos no disponibles">
            La capacidad de adjuntos de plataforma (platform.attachment, referencia-only) no está habilitada para el módulo de inventario en este entorno.
          </Alert>
        </Marco>
      </Section>
    );
  }

  return (
    <Section titulo="Adjuntos" acciones={<Button size="sm" variant="primario" onClick={() => setNuevo(true)}>Agregar adjunto</Button>}>
      {cargando ? <Marco><Cargando /></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar los adjuntos" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin adjuntos" descripcion="No hay adjuntos registrados." /></Marco>
        : (
          <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))" }}>
            {(datos ?? []).map((a) => (
              <Card key={a.attachmentId}><CardHeader><strong>{a.nombreArchivo ?? a.attachmentId}</strong> {a.categoria && <Badge variant="neutro">{a.categoria}</Badge>}</CardHeader>
                <CardContent>
                  <dl style={{ margin: 0, fontSize: "var(--do-text-xs)", display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-1) var(--do-sp-2)" }}>
                    <dt style={{ color: "var(--do-texto-suave)" }}>Tipo</dt><dd style={{ margin: 0 }}>{a.mimeType ?? "—"}</dd>
                    <dt style={{ color: "var(--do-texto-suave)" }}>SHA-256</dt><dd style={{ margin: 0 }}><code style={{ wordBreak: "break-all" }}>{a.hashSha256 ?? "—"}</code></dd>
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      {nuevo && (
        <ModalAdjunto itemId={itemId} onCerrar={() => setNuevo(false)} onOk={() => { setNuevo(false); recargar(); }} />
      )}
    </Section>
  );
}

function ModalAdjunto({ itemId, onCerrar, onOk }: { itemId: string; onCerrar: () => void; onOk: () => void }) {
  const def = useMemo(() => plantillaAdjunto(), []);
  const form = useFormularioDinamico(def, {}, { categoria: "foto" });
  const [hash, setHash] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = form.valores.archivo instanceof File ? (form.valores.archivo as File) : null;

  useEffect(() => {
    let cancelado = false;
    setHash("");
    if (!file) return;
    setCalculando(true);
    void hashArchivo(file).then((h) => { if (!cancelado) setHash(h); }).finally(() => { if (!cancelado) setCalculando(false); });
    return () => { cancelado = true; };
  }, [file]);

  async function guardar() {
    if (!file || !hash) { setErr("Selecciona un archivo (se calculará su hash)."); return; }
    setGuardando(true); setErr(null);
    try {
      // Registro REFERENCIA-ONLY: metadatos + hash (el Attachment Service asigna
      // el attachmentId en el servidor). Operación ONLINE (no se encola).
      await inventarioFetch(`/${encodeURIComponent(itemId)}/adjuntos`, {
        method: "POST",
        body: {
          categoria: String(form.valores.categoria ?? "otros"),
          nombreArchivo: file.name,
          mimeType: file.type || "application/octet-stream",
          tamanoBytes: file.size,
          hashSha256: hash,
        },
      });
      onOk();
    } catch (e) {
      setErr(esFuncionNoDisponible(e) ? "Los adjuntos no están habilitados para este módulo." : (e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal abierto onClose={onCerrar} titulo="Agregar adjunto"
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} disabled={calculando} onClick={() => void guardar()}>Registrar</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <Alert variant="info" titulo="Custodia por referencia">Se registran metadatos y hash SHA-256; el binario no se sube.</Alert>
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
      {calculando && <p style={{ display: "flex", gap: "var(--do-sp-1)", alignItems: "center" }}><Spinner /> Calculando hash…</p>}
      {hash && <code style={{ fontSize: "10px", wordBreak: "break-all" }}>sha256:{hash}</code>}
    </Modal>
  );
}

/* ----------------------- Modal de formulario común ---------------------- */

import type { ColaSync } from "../../lib/offline/cola";
import type { DefinicionFormulario } from "@workspace/dynamic-forms/definicion";
import type { ResultadoMutacion } from "../../lib/inventario/mutaciones";
import type { ValoresFormulario } from "../../lib/forms/tipos";

/** Modal genérico: renderiza una definición de Dynamic Forms y ejecuta una mutación. */
export function ModalFormulario({
  titulo,
  def,
  onCerrar,
  ejecutar,
  onOk,
  inicial,
}: {
  titulo: string;
  def: DefinicionFormulario;
  onCerrar: () => void;
  ejecutar: (cola: ColaSync, valores: ValoresFormulario) => Promise<ResultadoMutacion>;
  onOk: () => void;
  inicial?: ValoresFormulario;
}) {
  const { cola } = useOffline();
  const form = useFormularioDinamico(def, {}, inicial ?? {});
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { form.validarAhora(); setErr("Revisa los campos obligatorios."); return; }
    setGuardando(true); setErr(null);
    const r = await ejecutar(cola, form.valores);
    setGuardando(false);
    if (r.error) setErr(r.error.message);
    else onOk();
  }

  return (
    <Modal abierto onClose={onCerrar} titulo={titulo}
      pie={<><Button variant="fantasma" onClick={onCerrar}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Guardar</Button></>}>
      {err && <Alert variant="error" titulo={err} />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}
