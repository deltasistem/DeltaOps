/**
 * DGP-010 · Gestión de dependencias OT↔OT (punto 7) — pestaña de la ficha.
 *
 * Muestra las órdenes que BLOQUEAN a esta OT, las que ESTA bloquea (impacto),
 * las relacionadas, la secuencia de ejecución sugerida y alertas (p.ej. «OT lista
 * pero bloqueada»). Permite crear dependencias vía `crearRelacion` (Offline
 * First). Compone `GET /:id/dependencias` (DGP-009.2); sin API nueva.
 */
import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  Alert,
  Modal,
  Select,
  useToast,
} from "@workspace/design-system";
import { useDependencias } from "../../lib/ordenes/hooks";
import { crearRelacion } from "../../lib/ordenes/mutaciones";
import { useOffline } from "../../lib/offline/contexto";
import { analizarDependencias, secuenciaEjecucion, type DependenciaClasificada } from "../../lib/ecosistema/dependencias";
import { urlOrden } from "../../lib/ecosistema/deep-links";
import type { OrdenRow } from "../../lib/ordenes/tipos";

const TIPOS_DEPENDENCIA = [
  { valor: "bloqueada-por", etiqueta: "Esta OT está bloqueada por…" },
  { valor: "bloquea", etiqueta: "Esta OT bloquea a…" },
  { valor: "relacionada", etiqueta: "Relacionada con…" },
];

export function TabDependencias({ orden, onCambio }: { orden: OrdenRow; onCambio: () => void }) {
  const { datos, cargando, error, recargar } = useDependencias(orden.id);
  const [nueva, setNueva] = useState(false);

  const analisis = useMemo(() => analizarDependencias(datos, orden), [datos, orden]);
  const secuencia = useMemo(
    () => secuenciaEjecucion(analisis, { id: orden.id, codigo: orden.codigo }),
    [analisis, orden.id, orden.codigo],
  );

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudieron cargar las dependencias" descripcion={error.message} onReintentar={recargar} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      {analisis.listaPeroBloqueada && (
        <Alert variant="advertencia" titulo="OT lista pero bloqueada">
          Esta orden está en un estado ejecutable pero depende de {analisis.bloqueantes.length} orden(es) sin completar.
          Resuélvelas antes de continuar.
        </Alert>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Badge variant={analisis.bloqueada ? "error" : "exito"}>{analisis.bloqueantes.length} bloqueante(s)</Badge>
          <Badge variant="info">{analisis.dependientes.length} dependiente(s)</Badge>
          <Badge variant="neutro">{analisis.relacionadas.length} relacionada(s)</Badge>
        </div>
        <Button variant="primario" size="sm" onClick={() => setNueva(true)}>Añadir dependencia</Button>
      </div>

      <SecuenciaEjecucion secuencia={secuencia} />

      <GrupoDependencias titulo="Bloquean a esta orden" descripcion="Deben completarse primero." items={analisis.bloqueantes} tono="error" />
      <GrupoDependencias titulo="Esta orden bloquea (impacto)" descripcion="Se liberarán al cerrar esta OT." items={analisis.dependientes} tono="info" />
      <GrupoDependencias titulo="Relacionadas" items={analisis.relacionadas} tono="neutro" />

      {(datos ?? []).length === 0 && (
        <Card><CardContent><EmptyState titulo="Sin dependencias" descripcion="Esta orden no tiene relaciones con otras órdenes." /></CardContent></Card>
      )}

      {nueva && (
        <ModalDependencia
          orden={orden}
          onCerrar={() => setNueva(false)}
          onGuardado={() => { setNueva(false); recargar(); onCambio(); }}
        />
      )}
    </div>
  );
}

function SecuenciaEjecucion({ secuencia }: { secuencia: ReturnType<typeof secuenciaEjecucion> }) {
  if (secuencia.length <= 1) return null;
  return (
    <Card>
      <CardHeader><strong>Secuencia de ejecución sugerida</strong></CardHeader>
      <CardContent>
        <ol aria-label="Secuencia de ejecución" style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", listStyle: "none", margin: 0, padding: 0 }}>
          {secuencia.map((p, i) => (
            <li key={`${p.ordenId}-${i}`} style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
              <Badge variant={p.rol === "actual" ? "primario" : p.rol === "predecesora" ? "advertencia" : "info"}>
                {p.rol === "actual" ? "▶ " : ""}{p.etiqueta}
              </Badge>
              {i < secuencia.length - 1 && <span aria-hidden="true">→</span>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function GrupoDependencias({ titulo, descripcion, items, tono }: {
  titulo: string; descripcion?: string; items: DependenciaClasificada[]; tono: "error" | "info" | "neutro";
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader><strong>{titulo}</strong></CardHeader>
      <CardContent>
        {descripcion && <p style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", marginTop: 0 }}>{descripcion}</p>}
        <ul aria-label={titulo} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          {items.map((d) => (
            <li key={d.relacion.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap", borderTop: "1px solid var(--do-borde)", paddingTop: "var(--do-sp-2)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <Badge variant={tono}>{d.relacion.tipo}</Badge>
                <span>{d.relacion.destinoCodigo || d.relacion.destinoNombre || d.relacion.destinoId}</span>
              </span>
              <Link href={urlOrden(d.relacion.destinoId)}><Button variant="fantasma" size="sm">Abrir</Button></Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ModalDependencia({ orden, onCerrar, onGuardado }: { orden: OrdenRow; onCerrar: () => void; onGuardado: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const [tipo, setTipo] = useState("bloqueada-por");
  const [destinoId, setDestinoId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!destinoId.trim()) { setErr("Indica el identificador de la orden destino."); return; }
    if (destinoId.trim() === orden.id) { setErr("Una orden no puede depender de sí misma."); return; }
    setGuardando(true);
    setErr(null);
    const r = await crearRelacion(cola, orden.id, { tipo, destinoId: destinoId.trim(), categoria: "orden" });
    setGuardando(false);
    if (r.error) { setErr(r.error.message); return; }
    toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "Dependencia en cola" : "Dependencia creada" });
    onGuardado();
  }

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo="Añadir dependencia"
      pie={
        <>
          <Button variant="fantasma" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primario" loading={guardando} onClick={() => void guardar()}>Crear</Button>
        </>
      }
    >
      {err && <Alert variant="error" titulo={err} />}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
          <span style={{ fontSize: "var(--do-text-sm)" }}>Tipo de dependencia</span>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de dependencia">
            {TIPOS_DEPENDENCIA.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </Select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
          <span style={{ fontSize: "var(--do-text-sm)" }}>Orden destino (identificador)</span>
          <input value={destinoId} onChange={(e) => setDestinoId(e.target.value)} placeholder="ID de la OT destino" style={{ padding: "var(--do-sp-2)", borderRadius: "var(--do-radius-sm)", border: "1px solid var(--do-borde)", minHeight: "var(--do-sp-10)" }} />
        </label>
      </div>
    </Modal>
  );
}
