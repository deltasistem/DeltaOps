/**
 * DGP-020.2 · Panel de SESIÓN DE TRABAJO integrado en la experiencia de Órdenes.
 *
 * No es un dashboard paralelo (§28/§30): vive dentro de la ficha/ejecución de la
 * OT. Móvil primero (§29): botón primario grande (≥48px), estado visible,
 * cronómetro legible, sin overflow a 390px, sin tablas obligatorias.
 *
 * Contrato (§21/§22/§19/§31):
 *  - Duraciones efectivo/pausado/transcurrido vienen del READ MODEL; el cliente
 *    NO las recompone. Para ABIERTA se extrapola un tick local no definitivo.
 *  - CTAs por estado: sin sesión → [INICIAR TRABAJO]; ABIERTA → [PAUSAR][FINALIZAR];
 *    PAUSADA → [REANUDAR][FINALIZAR]; CERRADA → sólo lectura.
 *  - Offline First: los 4 comandos degradan a la cola existente (mismo `opId`,
 *    conservando `ocurridoAt` de dispositivo).
 *  - RBAC de PRESENTACIÓN: CONSULTA no ve ninguna CTA; el TECNICO opera SÓLO su
 *    propia sesión (se OCULTA la CTA de iniciar si se sabe que no es el asignado);
 *    el backend es la autoridad y su rechazo se refleja con un error claro. Se
 *    OCULTA, no se deshabilita.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, Button, Badge, Alert, useToast } from "@workspace/design-system";
import type { BadgeVariant } from "@workspace/design-system";
import { useOffline } from "../offline/contexto";
import { useSesion } from "../identidad/sesion";
import { capacidadesOrdenes } from "./capacidades";
import { abrirSesion, pausarSesion, reanudarSesion, cerrarSesion } from "./mutaciones";
import { useSesionActiva, useSesionesOrden, useDuracionesSesion } from "./hooks";
import { formatearDuracion, extrapolar } from "./duracion";
import { derivarSesionOptimista } from "./sesion-optimista";
import type { OrdenRow, SesionTrabajo, DuracionesSesion, EstadoSesion } from "./tipos";

const ETIQUETA_ESTADO_SESION: Record<string, string> = {
  ABIERTA: "En curso",
  PAUSADA: "En pausa",
  CERRADA: "Finalizada",
  SIN_SESION: "Sin sesión iniciada",
};

const TONO_ESTADO_SESION: Record<string, BadgeVariant> = {
  ABIERTA: "exito",
  PAUSADA: "advertencia",
  CERRADA: "neutro",
  SIN_SESION: "info",
};

/** Estado de sesión efectivo para presentación (incluye «sin sesión»). */
type EstadoPresentacion = EstadoSesion | "SIN_SESION";

function estadoDe(sesion: SesionTrabajo | null): EstadoPresentacion {
  if (!sesion) return "SIN_SESION";
  return sesion.estado;
}

/** Un contador con etiqueta (efectivo/pausado/transcurrido). */
function Contador({ etiqueta, ms, enfasis }: { etiqueta: string; ms: number; enfasis?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>{etiqueta}</div>
      <div
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          fontSize: enfasis ? "clamp(var(--do-text-xl), 8vw, var(--do-text-2xl))" : "var(--do-text-lg)",
          lineHeight: 1.1,
        }}
      >
        {formatearDuracion(ms)}
      </div>
    </div>
  );
}

export interface VistaPanelSesionProps {
  /** ¿El rol puede operar sesiones? (capacidad `ejecutar` del módulo). */
  readonly puedeOperar: boolean;
  /**
   * ¿La sesión pertenece al usuario actual? Cuando es `false` y se SABE que no es
   * el asignado, se ocultan las CTAs de operación (el TECNICO sólo opera su
   * propia sesión). `null` = desconocido (no se puede afirmar que NO lo es).
   */
  readonly esPropia: boolean | null;
  readonly sesion: SesionTrabajo | null;
  readonly duraciones: DuracionesSesion | null;
  /** Historial de sesiones (para el contexto de escritorio). */
  readonly historial?: readonly SesionTrabajo[];
  readonly cargando?: boolean;
  readonly ocupado?: boolean;
  readonly sinConexion?: boolean;
  readonly error?: string | null;
  /**
   * Hay operaciones de sesión ENCOLADAS sin sincronizar para esta OT: el estado
   * mostrado es OPTIMISTA local (§19/§39). Muestra un distintivo y evita la
   * doble extrapolación (las duraciones locales ya llegan hasta «ahora»).
   */
  readonly pendienteSync?: boolean;
  readonly onAccion?: (accion: "abrir" | "pausar" | "reanudar" | "cerrar") => void;
}

/**
 * Núcleo PRESENTACIONAL puro del panel (sin data fetching): recibe todo por
 * props para poder probarse en la matriz de roles y transiciones por estado.
 */
export function VistaPanelSesion(props: VistaPanelSesionProps) {
  const { puedeOperar, esPropia, sesion, duraciones, historial, cargando, ocupado, sinConexion, error, pendienteSync, onAccion } = props;
  const estado = estadoDe(sesion);
  // El TECNICO sólo opera su PROPIA sesión: si se sabe que no es el asignado
  // (esPropia === false), se ocultan las CTAs. `null` (desconocido) no oculta.
  const puedeCTA = puedeOperar && esPropia !== false;

  const base = duraciones
    ? { efectivoMs: duraciones.efectivoMs, pausadoMs: duraciones.pausadoMs, transcurridoMs: duraciones.transcurridoMs }
    : { efectivoMs: 0, pausadoMs: 0, transcurridoMs: 0 };

  // Tick local: anima el cronómetro mientras la sesión está ABIERTA (§22). Cuando
  // el estado es OPTIMISTA (pendiente de sync) las duraciones ya llegan hasta
  // «ahora» → NO extrapolamos de nuevo (evita doble conteo), pero seguimos
  // refrescando el reloj para que avance visualmente.
  const [leidoEnMs] = useState(() => Date.now());
  const [ahoraMs, setAhoraMs] = useState(() => leidoEnMs);
  useEffect(() => {
    if (estado !== "ABIERTA") return;
    const t = setInterval(() => setAhoraMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [estado]);
  const vista = useMemo(
    () => (pendienteSync ? base : extrapolar(base, estado, leidoEnMs, ahoraMs)),
    [base, estado, leidoEnMs, ahoraMs, pendienteSync],
  );

  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <strong>Sesión de trabajo</strong>
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            {pendienteSync && <Badge variant="advertencia">Pendiente de sincronizar</Badge>}
            <Badge variant={TONO_ESTADO_SESION[estado] ?? "neutro"}>{ETIQUETA_ESTADO_SESION[estado] ?? estado}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div style={{ marginBottom: "var(--do-sp-3)" }}>
            <Alert variant="error" titulo="No se pudo completar la acción">{error}</Alert>
          </div>
        )}
        {(sinConexion || pendienteSync) && (
          <div style={{ marginBottom: "var(--do-sp-3)" }}>
            <Alert variant="info" titulo={pendienteSync ? "Trabajo registrado sin conexión" : "Sin conexión"}>
              {pendienteSync
                ? "Estás operando la sesión sin conexión: cada acción conserva la hora del dispositivo y se sincronizará en orden al recuperar la conexión."
                : "La acción quedó en cola y se sincronizará al recuperar conexión (se conserva la hora en que la registraste)."}
            </Alert>
          </div>
        )}

        {/* Cronómetros del read model (transcurrido en énfasis). */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(120px, 100%), 1fr))",
            gap: "var(--do-sp-3)",
            marginBottom: "var(--do-sp-4)",
          }}
        >
          <Contador etiqueta="Tiempo efectivo" ms={vista.efectivoMs} enfasis />
          <Contador etiqueta="Tiempo en pausa" ms={vista.pausadoMs} />
          <Contador etiqueta="Transcurrido" ms={vista.transcurridoMs} />
        </div>
        {duraciones && (estado === "ABIERTA" || pendienteSync) && (
          <p style={{ margin: "0 0 var(--do-sp-3)", color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
            {pendienteSync
              ? "Tiempos derivados de tus registros locales; el servidor los confirmará al sincronizar."
              : "Acumulado en vivo; la cifra definitiva la fija el servidor al refrescar."}
          </p>
        )}

        {/* CTAs por estado (ocultas para CONSULTA / no asignado). */}
        {puedeCTA && (
          <div style={{ display: "flex", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
            {estado === "SIN_SESION" && (
              <Button size="lg" variant="primario" loading={ocupado} disabled={cargando} onClick={() => onAccion?.("abrir")} style={{ flex: "1 1 12rem", minWidth: 0 }}>
                Iniciar trabajo
              </Button>
            )}
            {estado === "ABIERTA" && (
              <>
                <Button size="lg" variant="secundario" loading={ocupado} onClick={() => onAccion?.("pausar")} style={{ flex: "1 1 8rem", minWidth: 0 }}>
                  Pausar
                </Button>
                <Button size="lg" variant="primario" loading={ocupado} onClick={() => onAccion?.("cerrar")} style={{ flex: "1 1 8rem", minWidth: 0 }}>
                  Finalizar
                </Button>
              </>
            )}
            {estado === "PAUSADA" && (
              <>
                <Button size="lg" variant="primario" loading={ocupado} onClick={() => onAccion?.("reanudar")} style={{ flex: "1 1 8rem", minWidth: 0 }}>
                  Reanudar
                </Button>
                <Button size="lg" variant="secundario" loading={ocupado} onClick={() => onAccion?.("cerrar")} style={{ flex: "1 1 8rem", minWidth: 0 }}>
                  Finalizar
                </Button>
              </>
            )}
            {estado === "CERRADA" && (
              <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>La sesión está finalizada (no admite reapertura).</p>
            )}
          </div>
        )}

        {/* Historial de sesiones (contexto de escritorio; sin tabla obligatoria). */}
        {historial && historial.length > 0 && (
          <div style={{ marginTop: "var(--do-sp-5)" }}>
            <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)", marginBottom: "var(--do-sp-2)" }}>
              Historial de sesiones
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--do-sp-2)" }}>
              {historial.map((s) => (
                <li
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--do-sp-2)",
                    flexWrap: "wrap",
                    padding: "var(--do-sp-2) var(--do-sp-3)",
                    border: "1px solid var(--do-borde)",
                    borderRadius: "var(--do-radius-md)",
                  }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {new Date(s.iniciadoAt).toLocaleString("es")}
                    {s.cerradoAt ? ` – ${new Date(s.cerradoAt).toLocaleString("es")}` : ""}
                  </span>
                  <Badge variant={TONO_ESTADO_SESION[s.estado] ?? "neutro"}>
                    {ETIQUETA_ESTADO_SESION[s.estado] ?? s.estado}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Determina si `sesion` (o la asignación de la OT) pertenece al usuario actual. */
function esPropiaDe(orden: OrdenRow, identityId: string | undefined, sesion: SesionTrabajo | null): boolean | null {
  if (!identityId) return null;
  // Si hay sesión activa CON identidad conocida, su `identityId` es la señal más
  // fuerte. Una sesión OPTIMISTA local (aún sin sincronizar) no lleva identityId
  // del servidor: fue el propio usuario quien encoló la acción → cae al criterio
  // de asignación de la OT (nunca se oculta por identidad desconocida).
  if (sesion && sesion.identityId) return sesion.identityId === identityId;
  // Sin sesión: usamos la referencia canónica de responsable de la OT si existe.
  const asignado = (orden.datos as { asignadoIdentityId?: string | null } | undefined)?.asignadoIdentityId
    ?? (orden as unknown as { asignadoIdentityId?: string | null }).asignadoIdentityId;
  if (asignado) return asignado === identityId;
  // Desconocido: no podemos afirmar que NO es su OT → no ocultamos por identidad.
  return null;
}

/**
 * Panel conectado: obtiene sesión activa + duraciones + historial del read model
 * y ejecuta los comandos Offline First. Integra RBAC de presentación.
 */
export function PanelSesion({
  orden,
  conHistorial = false,
}: {
  orden: OrdenRow;
  /** Muestra el historial de sesiones (contexto de escritorio). */
  conHistorial?: boolean;
}) {
  const { cola, enLinea, operaciones } = useOffline();
  const { sesion: identidad } = useSesion();
  const toast = useToast();
  const capacidades = capacidadesOrdenes(identidad ?? { rol: "CONSULTA" });

  const activa = useSesionActiva(orden.id);
  const duraciones = useDuracionesSesion({ sesionId: activa.datos?.id });
  const historial = useSesionesOrden(conHistorial ? orden.id : "");

  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reloj de 1s para animar las duraciones optimistas mientras hay ops en cola.
  const [ahoraMs, setAhoraMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhoraMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const dur = duraciones.datos && duraciones.datos.length > 0 ? duraciones.datos[0]! : null;

  // Estado OPTIMISTA: pliega las operaciones de sesión ENCOLADAS (§19/§39) sobre
  // el read model del servidor. Con la conexión restaurada y la cola vacía, el
  // resultado coincide con el servidor (pendienteSync=false).
  const optimista = useMemo(
    () => derivarSesionOptimista(operaciones, orden.id, activa.datos ?? null, dur, ahoraMs),
    [operaciones, orden.id, activa.datos, dur, ahoraMs],
  );

  // Al RECONECTAR (offline→online), refresca las queries para sustituir el estado
  // optimista por el del servidor (§22). Se dispara tras drenar la cola.
  const antesEnLinea = useRef(enLinea);
  useEffect(() => {
    if (!antesEnLinea.current && enLinea) {
      activa.recargar();
      duraciones.recargar();
      if (conHistorial) historial.recargar();
    }
    antesEnLinea.current = enLinea;
  }, [enLinea, activa, duraciones, historial, conHistorial]);

  // Cuando se drena la cola (sin pendientes) tras haber tenido estado optimista,
  // refresca para tomar la verdad del servidor.
  const habiaPendientes = useRef(false);
  useEffect(() => {
    const hay = optimista.pendienteSync;
    if (habiaPendientes.current && !hay) {
      activa.recargar();
      duraciones.recargar();
      if (conHistorial) historial.recargar();
    }
    habiaPendientes.current = hay;
  }, [optimista.pendienteSync, activa, duraciones, historial, conHistorial]);

  const esPropia = esPropiaDe(orden, identidad?.identityId, optimista.sesion);

  // CONSULTA (sin `ejecutar`) no ve NADA de la sesión (cero CTAs).
  if (!capacidades.leer) return null;

  async function operar(accion: "abrir" | "pausar" | "reanudar" | "cerrar") {
    setOcupado(true);
    setError(null);
    try {
      const fn = { abrir: abrirSesion, pausar: pausarSesion, reanudar: reanudarSesion, cerrar: cerrarSesion }[accion];
      const r = await fn(cola, orden.id);
      if (r.error) {
        setError(r.error.message);
        toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
      } else if (r.encolada) {
        // El estado optimista (derivado de la cola) refleja la acción; sólo avisamos.
        toast.mostrar({ variant: "info", titulo: "Sin conexión", mensaje: "Acción registrada; se sincronizará al reconectar." });
      } else {
        activa.recargar();
        duraciones.recargar();
        if (conHistorial) historial.recargar();
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <VistaPanelSesion
      puedeOperar={capacidades.ejecutar}
      esPropia={esPropia}
      sesion={optimista.sesion}
      duraciones={optimista.duraciones}
      pendienteSync={optimista.pendienteSync}
      historial={conHistorial ? (historial.datos ?? []) : undefined}
      cargando={activa.cargando}
      ocupado={ocupado}
      sinConexion={!enLinea && !optimista.pendienteSync}
      error={error}
      onAccion={(a) => void operar(a)}
    />
  );
}
