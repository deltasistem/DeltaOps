/**
 * DGP-019.1 · Consulta de lecturas (historial de horómetro/odómetro).
 *
 * Historial por activo, con filtro por tipo de medidor y rango de fechas,
 * paginado. Muestra SIEMPRE el `estado` (Válida/Inconsistente/Anulada) y el
 * estado de `sincronizacionActivo` (pendiente|confirmada|no-aplica|fallida).
 * La CONSULTA no tiene CTAs de escritura: la acción de anular sólo aparece con
 * la capacidad `lecturas.anular` (el backend es la autoridad, 403). Sólo Design
 * System + tokens `--do-*`.
 */
import React, { useMemo, useState } from "react";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState,
  ErrorState, Table, Pagination, Field, Select, Input, Modal, Textarea,
} from "@workspace/design-system";
import { ShellUtilizacion } from "../lib/utilizacion/Shell";
import { useLecturas } from "../lib/utilizacion/hooks";
import { useSesion } from "../lib/identidad/sesion";
import { capacidadesUtilizacion } from "../lib/utilizacion/capacidades";
import { useOffline } from "../lib/offline/contexto";
import { SelectorActivo, BadgeEstadoLectura, BadgeSyncActivo } from "../lib/utilizacion/componentes";
import { anularLectura } from "../lib/utilizacion/mutaciones";
import { TAMANO_PAGINA, TIPOS_MEDIDOR, ETIQUETA_TIPO_MEDIDOR } from "../lib/utilizacion/constantes";
import type { LecturaRow } from "../lib/utilizacion/tipos";

export default function UtilizacionLecturasPage() {
  return (
    <ShellUtilizacion activo="/utilizacion/lecturas">
      <Consulta />
    </ShellUtilizacion>
  );
}

function fmtFecha(v?: string): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

export function Consulta() {
  const { sesion } = useSesion();
  const cap = capacidadesUtilizacion(sesion ?? { rol: "CONSULTA" });
  const { cola } = useOffline();

  const [activoId, setActivoId] = useState("");
  const [tipoMedidor, setTipoMedidor] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);

  const filtro = useMemo(
    () => ({ activoId: activoId || undefined, tipoMedidor: tipoMedidor || undefined, desde: desde || undefined, hasta: hasta || undefined, limit: 500 }),
    [activoId, tipoMedidor, desde, hasta],
  );
  const { datos, cargando, error, recargar } = useLecturas(filtro);
  const lecturas = datos ?? [];

  const totalPaginas = Math.max(1, Math.ceil(lecturas.length / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = lecturas.slice((paginaActual - 1) * TAMANO_PAGINA, paginaActual * TAMANO_PAGINA);

  const [anulando, setAnulando] = useState<LecturaRow | null>(null);

  return (
    <>
      <PageHeader titulo="Consulta de lecturas" descripcion="Historial de lecturas de horómetro/odómetro por activo." />

      <Section titulo="Filtros">
        <Card>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
              <SelectorActivo valor={activoId} onCambio={(v) => { setActivoId(v); setPagina(1); }} permiteTodos />
              <Field label="Tipo de medidor">
                <Select value={tipoMedidor} onChange={(e) => { setTipoMedidor(e.target.value); setPagina(1); }}>
                  <option value="">Todos</option>
                  {TIPOS_MEDIDOR.map((t) => (
                    <option key={t} value={t}>{ETIQUETA_TIPO_MEDIDOR[t]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Desde">
                <Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(1); }} />
              </Field>
              <Field label="Hasta">
                <Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(1); }} />
              </Field>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section titulo="Lecturas">
        {cargando ? (
          <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
        ) : error ? (
          <ErrorState titulo="No se pudo cargar el historial" descripcion={error.message} onReintentar={recargar} />
        ) : lecturas.length === 0 ? (
          <EmptyState titulo="Sin lecturas" descripcion="No hay lecturas para los filtros seleccionados." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
            {/* Desktop: tabla desplazable. Móvil: tarjetas (evita el scroll
                horizontal de PÁGINA que una tabla ancha provoca a ~375px). */}
            <div className="do-solo-desktop">
              <TablaLecturas
                lecturas={visibles}
                puedeAnular={cap.anularLectura}
                onAnular={(l) => setAnulando(l)}
              />
            </div>
            <div className="do-solo-movil">
              <TarjetasLecturas
                lecturas={visibles}
                puedeAnular={cap.anularLectura}
                onAnular={(l) => setAnulando(l)}
              />
            </div>
            {totalPaginas > 1 && <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} />}
          </div>
        )}
      </Section>

      {anulando && (
        <ModalAnular
          lectura={anulando}
          onCerrar={() => setAnulando(null)}
          onConfirmado={() => { setAnulando(null); recargar(); }}
          anular={(motivo) => anularLectura(cola, anulando.id, motivo)}
        />
      )}
    </>
  );
}

function TablaLecturas({ lecturas, puedeAnular, onAnular }: { lecturas: LecturaRow[]; puedeAnular: boolean; onAnular: (l: LecturaRow) => void }) {
  return (
    <Table caption="Historial de lecturas de medidor" captionOculto>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Activo</th>
          <th scope="col">Medidor</th>
          <th scope="col">Valor</th>
          <th scope="col">Estado</th>
          <th scope="col">Sincronización</th>
          <th scope="col">Origen</th>
          {puedeAnular && <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>}
        </tr>
      </thead>
      <tbody>
        {lecturas.map((l) => (
          <tr key={l.id}>
            <td>{fmtFecha(l.fechaHora)}</td>
            <td>{l.activoId ?? "—"}</td>
            <td>{l.tipoMedidor ? ETIQUETA_TIPO_MEDIDOR[l.tipoMedidor] ?? l.tipoMedidor : "—"}</td>
            <td>{l.valor != null ? `${l.valor}${l.unidad ? ` ${l.unidad}` : ""}` : "—"}</td>
            <td><BadgeEstadoLectura estado={l.estado} inconsistente={l.inconsistente} /></td>
            <td><BadgeSyncActivo valor={l.sincronizacionActivo} motivo={l.motivo} /></td>
            <td>{l.origen ?? "—"}</td>
            {puedeAnular && (
              <td>
                {l.estado === "anulada" ? (
                  <span style={{ color: "var(--do-texto-suave)" }}>—</span>
                ) : (
                  <Button size="sm" variant="secundario" onClick={() => onAnular(l)}>Anular</Button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function TarjetasLecturas({ lecturas, puedeAnular, onAnular }: { lecturas: LecturaRow[]; puedeAnular: boolean; onAnular: (l: LecturaRow) => void }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      {lecturas.map((l) => (
        <li key={l.id}>
          <Card>
            <CardContent>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                  <strong>{l.valor != null ? `${l.valor}${l.unidad ? ` ${l.unidad}` : ""}` : "—"}</strong>
                  <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
                    {l.tipoMedidor ? ETIQUETA_TIPO_MEDIDOR[l.tipoMedidor] ?? l.tipoMedidor : "—"}
                  </span>
                </div>
                <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>{fmtFecha(l.fechaHora)}</span>
                <span style={{ fontSize: "var(--do-text-sm)", wordBreak: "break-word" }}>Activo: {l.activoId ?? "—"}</span>
                <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
                  <BadgeEstadoLectura estado={l.estado} inconsistente={l.inconsistente} />
                  <BadgeSyncActivo valor={l.sincronizacionActivo} motivo={l.motivo} />
                  <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{l.origen ?? "—"}</span>
                </div>
                {puedeAnular && l.estado !== "anulada" && (
                  <Button size="sm" variant="secundario" onClick={() => onAnular(l)}>Anular</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ModalAnular({ lectura, onCerrar, onConfirmado, anular }: {
  lectura: LecturaRow;
  onCerrar: () => void;
  onConfirmado: () => void;
  anular: (motivo: string) => Promise<{ encolada: boolean; error?: Error }>;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirmar() {
    if (motivo.trim() === "") { setErr("El motivo es obligatorio."); return; }
    setEnviando(true);
    setErr(null);
    const r = await anular(motivo.trim());
    setEnviando(false);
    if (r.error) { setErr(r.error.message); return; }
    onConfirmado();
  }

  return (
    <Modal
      abierto
      titulo="Anular lectura"
      onClose={onCerrar}
      pie={
        <>
          <Button variant="fantasma" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button variant="peligro" onClick={confirmar} disabled={enviando}>{enviando ? "Anulando…" : "Anular lectura"}</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
        <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>
          Se anulará la lectura del {fmtFecha(lectura.fechaHora)}. El motivo es obligatorio y queda auditado.
        </p>
        <Field label="Motivo" required error={err ?? undefined}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Describe el motivo de la anulación" />
        </Field>
      </div>
    </Modal>
  );
}
