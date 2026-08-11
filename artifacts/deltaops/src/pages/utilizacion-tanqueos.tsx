/**
 * DGP-019.1 · Consulta de tanqueos (historial de combustible por activo).
 *
 * Historial por activo con rango de fechas, paginado. Muestra litros, tipo de
 * combustible, costo/moneda y estado. La acción de anular sólo aparece con la
 * capacidad `tanqueos.anular` (backend autoritativo, 403). Sólo Design System.
 */
import React, { useMemo, useState } from "react";
import {
  PageHeader, Section, Card, CardContent, Button, Spinner, EmptyState,
  ErrorState, Table, Pagination, Field, Input, Modal, Textarea,
} from "@workspace/design-system";
import { ShellUtilizacion } from "../lib/utilizacion/Shell";
import { useTanqueos } from "../lib/utilizacion/hooks";
import { useSesion } from "../lib/identidad/sesion";
import { capacidadesUtilizacion } from "../lib/utilizacion/capacidades";
import { useOffline } from "../lib/offline/contexto";
import { SelectorActivo, BadgeEstadoTanqueo, etiquetaCombustible } from "../lib/utilizacion/componentes";
import { anularTanqueo } from "../lib/utilizacion/mutaciones";
import { TAMANO_PAGINA } from "../lib/utilizacion/constantes";
import type { TanqueoRow } from "../lib/utilizacion/tipos";

export default function UtilizacionTanqueosPage() {
  return (
    <ShellUtilizacion activo="/utilizacion/tanqueos">
      <Consulta />
    </ShellUtilizacion>
  );
}

function fmtFecha(v?: string): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

function fmtCosto(t: TanqueoRow): string {
  if (t.costoTotal == null) return "—";
  return `${t.costoTotal}${t.moneda ? ` ${t.moneda}` : ""}`;
}

export function Consulta() {
  const { sesion } = useSesion();
  const cap = capacidadesUtilizacion(sesion ?? { rol: "CONSULTA" });
  const { cola } = useOffline();

  const [activoId, setActivoId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);

  const filtro = useMemo(
    () => ({ activoId: activoId || undefined, desde: desde || undefined, hasta: hasta || undefined, limit: 500 }),
    [activoId, desde, hasta],
  );
  const { datos, cargando, error, recargar } = useTanqueos(filtro);
  const tanqueos = datos ?? [];

  const totalPaginas = Math.max(1, Math.ceil(tanqueos.length / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = tanqueos.slice((paginaActual - 1) * TAMANO_PAGINA, paginaActual * TAMANO_PAGINA);

  const [anulando, setAnulando] = useState<TanqueoRow | null>(null);

  return (
    <>
      <PageHeader titulo="Consulta de tanqueos" descripcion="Historial de cargas de combustible por activo." />

      <Section titulo="Filtros">
        <Card>
          <CardContent>
            <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
              <SelectorActivo valor={activoId} onCambio={(v) => { setActivoId(v); setPagina(1); }} permiteTodos />
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

      <Section titulo="Tanqueos">
        {cargando ? (
          <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
        ) : error ? (
          <ErrorState titulo="No se pudo cargar el historial" descripcion={error.message} onReintentar={recargar} />
        ) : tanqueos.length === 0 ? (
          <EmptyState titulo="Sin tanqueos" descripcion="No hay tanqueos para los filtros seleccionados." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
            {/* Desktop: tabla desplazable. Móvil: tarjetas (evita el scroll
                horizontal de PÁGINA que una tabla ancha provoca a ~375px). */}
            <div className="do-solo-desktop">
              <TablaTanqueos tanqueos={visibles} puedeAnular={cap.anularTanqueo} onAnular={setAnulando} />
            </div>
            <div className="do-solo-movil">
              <TarjetasTanqueos tanqueos={visibles} puedeAnular={cap.anularTanqueo} onAnular={setAnulando} />
            </div>
            {totalPaginas > 1 && <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} />}
          </div>
        )}
      </Section>

      {anulando && (
        <ModalAnular
          tanqueo={anulando}
          onCerrar={() => setAnulando(null)}
          onConfirmado={() => { setAnulando(null); recargar(); }}
          anular={(motivo) => anularTanqueo(cola, anulando.id, motivo)}
        />
      )}
    </>
  );
}

function TablaTanqueos({ tanqueos, puedeAnular, onAnular }: { tanqueos: TanqueoRow[]; puedeAnular: boolean; onAnular: (t: TanqueoRow) => void }) {
  return (
    <Table caption="Historial de tanqueos" captionOculto>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Activo</th>
          <th scope="col">Litros</th>
          <th scope="col">Combustible</th>
          <th scope="col">Costo</th>
          <th scope="col">Estado</th>
          {puedeAnular && <th scope="col"><span className="do-visualmente-oculto">Acciones</span></th>}
        </tr>
      </thead>
      <tbody>
        {tanqueos.map((t) => (
          <tr key={t.id}>
            <td>{fmtFecha(t.fechaHora)}</td>
            <td>{t.activoId ?? "—"}</td>
            <td>{t.litros != null ? `${t.litros} L` : "—"}</td>
            <td>{etiquetaCombustible(t.tipoCombustible)}</td>
            <td>{fmtCosto(t)}</td>
            <td><BadgeEstadoTanqueo estado={t.estado} /></td>
            {puedeAnular && (
              <td>
                {t.estado === "anulada" ? (
                  <span style={{ color: "var(--do-texto-suave)" }}>—</span>
                ) : (
                  <Button size="sm" variant="secundario" onClick={() => onAnular(t)}>Anular</Button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function TarjetasTanqueos({ tanqueos, puedeAnular, onAnular }: { tanqueos: TanqueoRow[]; puedeAnular: boolean; onAnular: (t: TanqueoRow) => void }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      {tanqueos.map((t) => (
        <li key={t.id}>
          <Card>
            <CardContent>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                  <strong>{t.litros != null ? `${t.litros} L` : "—"}</strong>
                  <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>{etiquetaCombustible(t.tipoCombustible)}</span>
                </div>
                <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>{fmtFecha(t.fechaHora)}</span>
                <span style={{ fontSize: "var(--do-text-sm)", wordBreak: "break-word" }}>Activo: {t.activoId ?? "—"}</span>
                <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
                  <BadgeEstadoTanqueo estado={t.estado} />
                  <span style={{ fontSize: "var(--do-text-sm)" }}>{fmtCosto(t)}</span>
                </div>
                {puedeAnular && t.estado !== "anulada" && (
                  <Button size="sm" variant="secundario" onClick={() => onAnular(t)}>Anular</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ModalAnular({ tanqueo, onCerrar, onConfirmado, anular }: {
  tanqueo: TanqueoRow;
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
      titulo="Anular tanqueo"
      onClose={onCerrar}
      pie={
        <>
          <Button variant="fantasma" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button variant="peligro" onClick={confirmar} disabled={enviando}>{enviando ? "Anulando…" : "Anular tanqueo"}</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
        <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>
          Se anulará el tanqueo del {fmtFecha(tanqueo.fechaHora)}. El motivo es obligatorio y queda auditado.
        </p>
        <Field label="Motivo" required error={err ?? undefined}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Describe el motivo de la anulación" />
        </Field>
      </div>
    </Modal>
  );
}
