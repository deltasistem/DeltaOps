/**
 * DGP-019.2 · FICHA OPERACIONAL 360° — panel operacional integrado.
 *
 * COMPOSICIÓN pura sobre read models/endpoints EXISTENTES (§18/§19). No abre
 * endpoints nuevos ni calcula dominio en React: los deltas, L/h, L/100 km y
 * costos los provee `modulo.utilizacion.resumen` (backend). Este panel se INYECTA
 * en la ficha de Activos (no crea una segunda ficha) y añade:
 *   - cabecera operacional con acciones rápidas por capacidad (RBAC, ocultar);
 *   - indicadores (horómetro/odómetro/consumo/último tanqueo/utilización/
 *     disponibilidad) con "Sin datos" literal (nunca 0) y período visible;
 *   - estado visual del equipo (estados REALES del dominio);
 *   - combustible con la métrica correcta por medidor (L/h vs L/100 km);
 *   - consumo de los últimos 30 días con tendencia y empty state de negocio;
 *   - próximo mantenimiento + últimas intervenciones (deep links, sin duplicar);
 *   - resumen de órdenes con navegación a la OT;
 *   - acceso a la Timeline compartida y al QR existentes;
 *   - acciones de campo Offline First con estado visible.
 *
 * Sólo Design System + tokens `--do-*`. Tema: heredado del ThemeProvider raíz
 * (jamás `data-do-theme` local). Móvil ~390px prioritario: orden §13 y tarjetas
 * responsive (sin overflow).
 */
import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Section,
  Card,
  CardHeader,
  CardContent,
  Badge,
  Button,
  KpiCard,
  Timeline,
  EmptyState,
  ErrorState,
  Spinner,
  Alert,
  Modal,
  OfflineBadge,
  Select,
  useToast,
} from "@workspace/design-system";
import type { ActivoRow } from "../activos/tipos";
import { useResumen, useTanqueos, useLecturas, useUltimaLectura, useCombustibles } from "./hooks";
import { useOrdenesDeActivo, useTimelineActivo } from "../ecosistema/hooks";
import { useEstadoRutinas } from "../planes/hooks";
import type { EstadoRutinaActivo } from "../planes/tipos";
import { OfflineProvider, useOffline } from "../offline/contexto";
import { useSesion } from "../identidad/sesion";
import { moduloHabilitado } from "../identidad/rbac";
import type { Sesion } from "../identidad/tipos";
import { capacidadesUtilizacion, type CapacidadesUtilizacion } from "./capacidades";
import { capacidadesOrdenes, type CapacidadesOrdenes } from "../ordenes/capacidades";
import { registrarLectura, registrarTanqueo } from "./mutaciones";
import { ValorCalculo, etiquetaCombustible } from "./componentes";
import {
  ETIQUETA_TIPO_MEDIDOR,
  UNIDAD_POR_MEDIDOR,
  TIPOS_MEDIDOR,
  TENANT,
  SYNC_URL,
  MODULO_OFFLINE,
} from "./constantes";
import {
  ventanasComparacion,
  etiquetaPeriodo,
  metricaCombustible,
  tendenciaConsumo,
  estadoVisual,
  fmtFechaHora,
  fmtFecha,
  fmtNumero,
} from "./ficha-operacional";
import { urlOrden, urlNuevaOrden, urlActivoTab } from "../ecosistema/deep-links";
import { ETIQUETA_ESTADO as ETIQUETA_ESTADO_ORDEN, TONO_ESTADO as TONO_ESTADO_ORDEN, ESTADOS_FINALES } from "../ordenes/constantes";
import type { OrdenRow } from "../ordenes/tipos";

const DIAS_VENTANA = 30;

/** Punto de entrada: envuelve el panel en el OfflineProvider de Utilización.
 *  (La ficha de Activos usa la cola de Activos; las acciones de medidor/tanqueo
 *  deben encolar en la cola de UTILIZACIÓN, con su propio /sync — sin crear cola
 *  nueva: reutiliza `OfflineProvider` con el namespace del módulo.) */
export function PanelOperacional({ activo, ahoraIso }: { activo: ActivoRow; ahoraIso?: string }) {
  // "Ahora" se resuelve una vez al montar (estable para las ventanas del período).
  const ahora = useMemo(() => ahoraIso ?? new Date().toISOString(), [ahoraIso]);
  return (
    <OfflineProvider tenant={TENANT} modulo={MODULO_OFFLINE} syncUrl={SYNC_URL}>
      <PanelContenido activo={activo} ahoraIso={ahora} />
    </OfflineProvider>
  );
}

function PanelContenido({ activo, ahoraIso }: { activo: ActivoRow; ahoraIso?: string }) {
  const { sesion } = useSesion();
  const cap = capacidadesUtilizacion(sesion ?? { rol: "CONSULTA" });
  // Señal CANÓNICA de capacidad de Órdenes (réplica de aRolLegacy→principalOrdenes).
  // Gatea la creación de OT (escritura de Órdenes) desde este panel.
  const capOrd = capacidadesOrdenes(sesion ?? { rol: "CONSULTA" });
  const rol = String(sesion?.rol ?? "CONSULTA").toUpperCase();

  // Ventana temporal (últimos 30 días) + período anterior para tendencia.
  const ventanas = useMemo(() => ventanasComparacion(new Date(ahoraIso ?? "2026-01-01T00:00:00.000Z"), DIAS_VENTANA), [ahoraIso]);

  const resumenTotal = useResumen(activo.id);
  const resumenActual = useResumen(activo.id, ventanas.actual);
  const resumenAnterior = useResumen(activo.id, ventanas.anterior);
  const tanqueos = useTanqueos({ activoId: activo.id, estado: "vigente", limit: 20 });
  const lecturas = useLecturas({ activoId: activo.id, estado: "vigente", limit: 20 });

  const [accion, setAccion] = useState<null | "lectura" | "tanqueo">(null);

  return (
    <>
      <CabeceraOperacional activo={activo} cap={cap} capOrd={capOrd} rol={rol} sesion={sesion} onAccion={setAccion} />

      <IndicadoresOperacionales
        activo={activo}
        resumenTotal={resumenTotal}
        resumenActual={resumenActual}
        tanqueos={tanqueos}
        lecturas={lecturas}
      />

      <div style={{ display: "grid", gap: "var(--do-sp-5)", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
        <SeccionMantenimiento activoId={activo.id} activoNombre={activo.nombre} capOrd={capOrd} />
        <SeccionConsumo activo={activo} resumenActual={resumenActual} resumenAnterior={resumenAnterior} tanqueos={tanqueos} />
      </div>

      <SeccionOrdenes activoId={activo.id} activoNombre={activo.nombre} capOrd={capOrd} rol={rol} />

      <SeccionHistorial activoId={activo.id} />

      {accion === "lectura" && (
        <ModalRegistrarLectura activoId={activo.id} onCerrar={() => setAccion(null)} onHecho={() => { setAccion(null); resumenTotal.recargar(); lecturas.recargar(); }} />
      )}
      {accion === "tanqueo" && (
        <ModalRegistrarTanqueo activoId={activo.id} onCerrar={() => setAccion(null)} onHecho={() => { setAccion(null); resumenTotal.recargar(); tanqueos.recargar(); }} />
      )}
    </>
  );
}

/* =============================== Cabecera ================================= */

function CabeceraOperacional({ activo, cap, capOrd, rol, sesion, onAccion }: {
  activo: ActivoRow;
  cap: CapacidadesUtilizacion;
  capOrd: CapacidadesOrdenes;
  rol: string;
  sesion: Sesion | null | undefined;
  onAccion: (a: "lectura" | "tanqueo") => void;
}) {
  const ev = estadoVisual(activo.estado);
  const { pendientes, enLinea } = useOffline();
  const estadoSync = !enLinea ? "offline" : pendientes > 0 ? "sincronizando" : "sincronizado";
  const esTecnico = rol === "TECNICO";
  // Preoperacional se ancla a Activos (mismo entitlement); sólo roles con
  // escritura (CONSULTA nunca ejecuta). Coincide con el gating de la ficha.
  const puedePreoperacional = !!sesion && moduloHabilitado(sesion, "activos") && rol !== "CONSULTA";

  return (
    <Section titulo="Panel operacional">
      <Card>
        <CardContent>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
            {/* Estado (§13: primero en móvil) + identificación */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--do-sp-3)", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)", minWidth: 0 }}>
                <span
                  aria-hidden="true"
                  title={ev.etiqueta}
                  className={`do-semaforo do-semaforo--${ev.semaforo}`}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "var(--do-text-lg)" }}>{activo.nombre}</strong>
                    <Badge variant={ev.variante}>{ev.etiqueta}</Badge>
                  </div>
                  <div style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)", display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                    <code>{activo.codigoEmpresarial}</code>
                    <span>·</span>
                    <span>{activo.tipo}</span>
                    {ubicacionTexto(activo) && (
                      <>
                        <span>·</span>
                        <span>{ubicacionTexto(activo)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <OfflineBadge estado={estadoSync} />
            </div>

            {/* Acciones del expediente por perfil (§8/§25). Composición: cada
                acción reutiliza flujos existentes; ocultar sin permiso (§2/§12).
                [Preoperacional][Registrar lectura][Registrar combustible]
                [Ver mantenimiento][Registrar trabajo][Ver historial]. */}
            <div role="group" aria-label="Acciones del activo" style={{ display: "grid", gap: "var(--do-sp-2)", gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))" }}>
              {puedePreoperacional && (
                <Link href={`/activos/${encodeURIComponent(activo.id)}/preoperacional`}>
                  <Button variant="secundario" size="lg" style={{ ...ESTILO_TACTIL, width: "100%" }}>Preoperacional</Button>
                </Link>
              )}
              {cap.registrarLectura && (
                <Button variant={esTecnico ? "primario" : "secundario"} size="lg" style={ESTILO_TACTIL} onClick={() => onAccion("lectura")}>
                  Registrar lectura
                </Button>
              )}
              {cap.registrarTanqueo && (
                <Button variant={esTecnico ? "primario" : "secundario"} size="lg" style={ESTILO_TACTIL} onClick={() => onAccion("tanqueo")}>
                  Registrar combustible
                </Button>
              )}
              <Link href={urlActivoTab(activo.id, "planes")}>
                <Button variant="secundario" size="lg" style={{ ...ESTILO_TACTIL, width: "100%" }}>Ver mantenimiento</Button>
              </Link>
              {/* Registrar trabajo = ESCRITURA de Órdenes: gatear con la
                  capacidad canónica (ocultar sin permiso, no deshabilitar). */}
              {capOrd.crear && (
                <Link href={urlNuevaOrden({ activo: activo.id, activoEtiqueta: activo.nombre })}>
                  <Button variant="secundario" size="lg" style={{ ...ESTILO_TACTIL, width: "100%" }}>Registrar trabajo</Button>
                </Link>
              )}
              <Link href={esTecnico ? "/ordenes/operaciones" : urlActivoTab(activo.id, "ordenes")}>
                <Button variant="secundario" size="lg" style={{ ...ESTILO_TACTIL, width: "100%" }}>{esTecnico ? "Mis órdenes" : "Ver órdenes"}</Button>
              </Link>
              <Link href={urlActivoTab(activo.id, "timeline")}>
                <Button variant="secundario" size="lg" style={{ ...ESTILO_TACTIL, width: "100%" }}>Ver historial</Button>
              </Link>
              <Link href="/activos/escanear">
                <Button variant="secundario" size="lg" style={{ ...ESTILO_TACTIL, width: "100%" }}>Escanear QR</Button>
              </Link>
              <Link href={urlActivoTab(activo.id, "etiqueta")}>
                <Button variant="secundario" size="lg" style={{ ...ESTILO_TACTIL, width: "100%" }}>Ver QR</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

const ESTILO_TACTIL: React.CSSProperties = { minHeight: 48, justifyContent: "center" };

function ubicacionTexto(activo: ActivoRow): string {
  const u = activo.ubicacionId ?? (activo.datos as Record<string, unknown> | undefined)?.["ubicacion"];
  return u == null ? "" : String(u);
}

/* ============================= Indicadores =============================== */

function IndicadoresOperacionales({ activo, resumenTotal, resumenActual, tanqueos, lecturas }: {
  activo: ActivoRow;
  resumenTotal: ReturnType<typeof useResumen>;
  resumenActual: ReturnType<typeof useResumen>;
  tanqueos: ReturnType<typeof useTanqueos>;
  lecturas: ReturnType<typeof useLecturas>;
}) {
  const cargando = resumenTotal.cargando || resumenActual.cargando;
  // Medidores ACTUALES: valor absoluto de la última lectura vigente por tipo.
  const ultimoPorTipo = useMemo(() => {
    const filas = lecturas.datos ?? [];
    const mapa: Record<string, { valor?: number; unidad?: string; fechaHora?: string }> = {};
    for (const l of filas) {
      if (!l.tipoMedidor || l.inconsistente) continue;
      const prev = mapa[l.tipoMedidor];
      const cur = { valor: l.valor, unidad: l.unidad, fechaHora: l.fechaHora };
      if (!prev || (l.fechaHora && prev.fechaHora && l.fechaHora > prev.fechaHora)) mapa[l.tipoMedidor] = cur;
    }
    return mapa;
  }, [lecturas.datos]);

  const ultimoTanqueo = useMemo(() => {
    const filas = (tanqueos.datos ?? []).slice().sort((a, b) => String(b.fechaHora ?? "").localeCompare(String(a.fechaHora ?? "")));
    return filas[0] ?? null;
  }, [tanqueos.datos]);

  const combustible = metricaCombustible(resumenActual.datos);
  const periodo = etiquetaPeriodo(DIAS_VENTANA);

  if (cargando) {
    return (
      <Section titulo="Indicadores">
        <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
      </Section>
    );
  }

  const horo = ultimoPorTipo["horometro"];
  const odo = ultimoPorTipo["odometro"];

  return (
    <Section titulo="Indicadores">
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
        <KpiCard
          titulo="Horómetro actual"
          valor={horo && horo.valor != null ? fmtNumero(horo.valor, 1, horo.unidad ?? UNIDAD_POR_MEDIDOR.horometro) : <SinDatos />}
          delta={horo?.fechaHora ? { valor: `al ${fmtFecha(horo.fechaHora)}`, tendencia: "neutra" } : undefined}
        />
        <KpiCard
          titulo="Odómetro actual"
          valor={odo && odo.valor != null ? fmtNumero(odo.valor, 0, odo.unidad ?? UNIDAD_POR_MEDIDOR.odometro) : <SinDatos />}
          delta={odo?.fechaHora ? { valor: `al ${fmtFecha(odo.fechaHora)}`, tendencia: "neutra" } : undefined}
        />
        <KpiCard
          titulo={`Consumo promedio · ${periodo}`}
          valor={<ValorCalculo resultado={combustible.resultado} unidad={combustible.unidad} decimales={2} />}
        />
        <KpiCard
          titulo="Último tanqueo"
          valor={ultimoTanqueo ? fmtNumero(ultimoTanqueo.litros, 1, "L") : <SinDatos />}
          delta={ultimoTanqueo?.fechaHora ? { valor: fmtFecha(ultimoTanqueo.fechaHora), tendencia: "neutra" } : undefined}
        />
        <KpiCard
          titulo={`Utilización · ${periodo}`}
          valor={<Utilizacion resumen={resumenActual.datos} />}
        />
        <KpiCard
          titulo="Disponibilidad"
          valor={<SinDatos titulo="Sin fuente de disponibilidad en el dominio actual" />}
        />
      </div>
      {resumenTotal.error && (
        <div style={{ marginTop: "var(--do-sp-3)" }}>
          <ErrorState titulo="No se pudo cargar el resumen operacional" descripcion={resumenTotal.error.message} onReintentar={resumenTotal.recargar} />
        </div>
      )}
    </Section>
  );
}

/** Utilización derivada del período: variación del medidor principal. No
 *  calcula "horas trabajadas" (§5: sin fuente suficiente → mensaje literal). */
function Utilizacion({ resumen }: { resumen: import("./tipos").ResumenActivo | null }) {
  const clase = metricaCombustible(resumen).clase;
  if (!resumen) return <SinDatos />;
  if (clase === "maquinaria") {
    return <ValorCalculo resultado={resumen.deltaHorometro} unidad="h" decimales={1} />;
  }
  if (clase === "vehiculo") {
    return <ValorCalculo resultado={resumen.deltaOdometro} unidad="km" decimales={0} />;
  }
  return <SinDatos />;
}

function SinDatos({ titulo }: { titulo?: string }) {
  return <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-md)" }} title={titulo}>Sin datos</span>;
}

/* ============================ Mantenimiento ============================== */

function SeccionMantenimiento({ activoId, activoNombre, capOrd }: { activoId: string; activoNombre: string; capOrd: CapacidadesOrdenes }) {
  const rutinas = useEstadoRutinas(activoId);
  const ordenes = useOrdenesDeActivo(activoId);

  const filas = useMemo(() => (rutinas.datos?.rutinas ?? []).slice(0, 5), [rutinas.datos]);

  const intervenciones = useMemo(() => {
    return (ordenes.datos ?? [])
      .filter((o) => ESTADOS_FINALES.includes(o.estado as string))
      .slice()
      .sort((a, b) => String(b.actualizadoAt ?? "").localeCompare(String(a.actualizadoAt ?? "")))
      .slice(0, 4);
  }, [ordenes.datos]);

  const cargando = ordenes.cargando;

  return (
    <Section titulo="Mantenimiento">
      <Card>
        <CardHeader><strong>Próximo mantenimiento</strong></CardHeader>
        <CardContent>
          {rutinas.cargando ? (
            <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-5)" }}><Spinner /></div>
          ) : rutinas.error ? (
            <ErrorState titulo="No se pudo evaluar el mantenimiento por uso" descripcion={rutinas.error.message} onReintentar={rutinas.recargar} />
          ) : filas.length === 0 ? (
            <EmptyState titulo="Sin rutinas por uso" descripcion="Este activo no tiene planes vigentes que apliquen a su uso o tiempo." />
          ) : (
            <ul style={LISTA}>
              {filas.map((r) => (
                <li key={r.planId}>
                  <FilaRutina rutina={r} activoId={activoId} activoNombre={activoNombre} puedeGenerar={capOrd.crear} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><strong>Últimas intervenciones</strong></CardHeader>
        <CardContent>
          {cargando ? (
            <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-5)" }}><Spinner /></div>
          ) : intervenciones.length === 0 ? (
            <EmptyState titulo="Sin intervenciones" descripcion="Aún no hay órdenes cerradas para este activo." />
          ) : (
            <ul style={LISTA}>
              {intervenciones.map((o) => (
                <li key={o.id}>
                  <Link href={urlOrden(o.id)} style={ENLACE_FILA}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}><code style={{ fontSize: "var(--do-text-xs)" }}>{o.codigo}</code> {o.titulo}</span>
                      <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>{o.tipo} · {fmtFecha(o.actualizadoAt)}</span>
                    </div>
                    <Badge variant={TONO_ESTADO_ORDEN[o.estado as string] ?? "neutro"}>{ETIQUETA_ESTADO_ORDEN[o.estado as string] ?? o.estado}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: "var(--do-sp-3)" }}>
            <Link href={urlActivoTab(activoId, "planes")}>
              <Button variant="fantasma" size="sm">Ver planes de {activoNombre}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

/** Mapea el semáforo del backend a punto de color + variante del DS + emoji. */
const SEMAFORO_RUTINA: Record<string, { clase: string; variante: "exito" | "advertencia" | "error" | "neutro"; emoji: string }> = {
  verde: { clase: "operativo", variante: "exito", emoji: "🟢" },
  amarillo: { clase: "atencion", variante: "advertencia", emoji: "🟡" },
  rojo: { clase: "fuera", variante: "error", emoji: "🔴" },
  "sin-datos": { clase: "neutro", variante: "neutro", emoji: "⚪" },
};

/** Formatea el faltante/excedente en unidades de la regla (h/km/días/…). */
function textoFaltante(r: EstadoRutinaActivo): string {
  if (r.faltante == null || !r.unidad) return "Sin datos suficientes";
  const u = r.unidad === "horometro" ? "h" : r.unidad === "odometro" ? "km" : r.unidad;
  if (r.vencida) {
    const exc = r.excedente != null ? Math.abs(r.excedente) : Math.abs(r.faltante);
    return `Excedido ${fmtNumero(exc, 0)} ${u}`;
  }
  return `Faltan ${fmtNumero(r.faltante, 0)} ${u}`;
}

/**
 * Fila de una rutina por uso/tiempo (§3-5). Muestra meta · actual/faltante ·
 * estado con COLOR + TEXTO. Si está vencida (o próxima), ofrece "Generar
 * mantenimiento" que abre el flujo LITE-05 de creación de OT (nunca crea la OT
 * automáticamente). El botón se oculta sin capacidad de crear órdenes.
 */
function FilaRutina({ rutina, activoId, activoNombre, puedeGenerar }: {
  rutina: EstadoRutinaActivo;
  activoId: string;
  activoNombre: string;
  puedeGenerar: boolean;
}) {
  const sem = SEMAFORO_RUTINA[rutina.semaforo] ?? SEMAFORO_RUTINA["sin-datos"];
  const metaTexto = rutina.meta && rutina.dominio === "temporal" ? fmtFecha(rutina.meta) : rutina.meta;
  const unidad = rutina.unidad === "horometro" ? "h" : rutina.unidad === "odometro" ? "km" : rutina.unidad;
  const ofrecerGenerar = puedeGenerar && (rutina.vencida || rutina.semaforo === "amarillo");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)", padding: "var(--do-sp-2) 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", minWidth: 0 }}>
          <span aria-hidden="true" title={rutina.etiqueta} className={`do-semaforo do-semaforo--${sem.clase}`} />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{rutina.nombre}</span>
            <div style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
              {metaTexto != null && rutina.dominio !== "temporal" && unidad
                ? `Mantenimiento a ${fmtNumero(Number(metaTexto), 0)} ${unidad}`
                : metaTexto != null
                  ? `Próxima: ${metaTexto}`
                  : rutina.tipoPlan}
            </div>
          </div>
        </div>
        <Badge variant={sem.variante}>{sem.emoji} {rutina.etiqueta}</Badge>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)", flexWrap: "wrap", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--do-text-md)", fontWeight: 600 }}>{textoFaltante(rutina)}</span>
        {ofrecerGenerar && (
          <Link
            href={urlNuevaOrden({
              activo: activoId,
              activoEtiqueta: activoNombre,
              plan: rutina.planId,
              planEtiqueta: rutina.nombre,
              motivo: rutina.vencida
                ? `Rutina vencida: ${rutina.nombre} (${textoFaltante(rutina)})`
                : `Rutina próxima: ${rutina.nombre} (${textoFaltante(rutina)})`,
            })}
          >
            <Button variant={rutina.vencida ? "primario" : "secundario"} size="sm" style={{ minHeight: 40 }}>
              Generar mantenimiento
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

/* =============================== Consumo ================================= */

function SeccionConsumo({ activo, resumenActual, resumenAnterior, tanqueos }: {
  activo: ActivoRow;
  resumenActual: ReturnType<typeof useResumen>;
  resumenAnterior: ReturnType<typeof useResumen>;
  tanqueos: ReturnType<typeof useTanqueos>;
}) {
  void activo;
  const periodo = etiquetaPeriodo(DIAS_VENTANA);
  const metrica = metricaCombustible(resumenActual.datos);
  const metricaPrev = metricaCombustible(resumenAnterior.datos);
  const tendencia = tendenciaConsumo(metrica.resultado, metricaPrev.resultado);

  const puntos = useMemo(() => {
    return (tanqueos.datos ?? [])
      .filter((t) => t.litros != null)
      .slice()
      .sort((a, b) => String(a.fechaHora ?? "").localeCompare(String(b.fechaHora ?? "")));
  }, [tanqueos.datos]);

  const maxLitros = Math.max(1, ...puntos.map((p) => Number(p.litros ?? 0)));
  const cargando = resumenActual.cargando || tanqueos.cargando;

  return (
    <Section titulo="Consumo de combustible">
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <strong>Consumo · {periodo}</strong>
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{metrica.unidad}</span>
          </div>
        </CardHeader>
        <CardContent>
          {cargando ? (
            <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-5)" }}><Spinner /></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
                <span style={{ fontSize: "var(--do-text-2xl)", fontWeight: 700 }}>
                  <ValorCalculo resultado={metrica.resultado} unidad={metrica.unidad} decimales={2} />
                </span>
                {tendencia && (
                  <Badge variant={tendencia.tono === "error" ? "error" : tendencia.tono === "exito" ? "exito" : "neutro"}>
                    {tendencia.etiqueta}
                  </Badge>
                )}
              </div>

              {puntos.length < 2 ? (
                <EmptyState titulo="Aún no hay tendencia" descripcion="Registra más tanqueos para visualizar la tendencia de consumo." />
              ) : (
                <div role="img" aria-label={`Litros por tanqueo del activo en ${periodo}`} style={{ display: "flex", alignItems: "flex-end", gap: "var(--do-sp-1)", height: 96, padding: "var(--do-sp-2) 0", overflowX: "auto" }}>
                  {puntos.map((p) => {
                    const h = Math.round((Number(p.litros ?? 0) / maxLitros) * 84) + 4;
                    return (
                      <div key={p.id} title={`${fmtNumero(p.litros, 1, "L")} · ${fmtFecha(p.fechaHora)}`} style={{ flex: "1 0 10px", minWidth: 10, height: h, background: "var(--do-primario)", borderRadius: "var(--do-radius-sm) var(--do-radius-sm) 0 0", opacity: 0.85 }} />
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)", flexWrap: "wrap", gap: "var(--do-sp-2)" }}>
                <span>Litros totales: {fmtNumero(resumenActual.datos?.litrosTotal, 1, "L")}</span>
                <span>Costo: {resumenActual.datos?.costoTotal != null ? fmtNumero(resumenActual.datos.costoTotal, 0) : "Sin datos"}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}

/* =============================== Órdenes ================================= */

function SeccionOrdenes({ activoId, activoNombre, capOrd, rol }: {
  activoId: string;
  activoNombre: string;
  capOrd: CapacidadesOrdenes;
  rol: string;
}) {
  const { datos, cargando, error, recargar } = useOrdenesDeActivo(activoId);

  const grupos = useMemo(() => {
    const todas = datos ?? [];
    const finales = new Set(ESTADOS_FINALES);
    const pendientes = todas.filter((o) => o.estado === "ABIERTA" || o.estado === "PLANIFICADA" || o.estado === "ASIGNADA");
    const ejecucion = todas.filter((o) => o.estado === "EN_EJECUCION" || o.estado === "PAUSADA" || o.estado === "EN_VALIDACION");
    const cerradas = todas.filter((o) => finales.has(o.estado as string));
    const recientes = todas
      .slice()
      .sort((a, b) => String(b.actualizadoAt ?? "").localeCompare(String(a.actualizadoAt ?? "")))
      .slice(0, 5);
    return { todas, pendientes, ejecucion, cerradas, recientes };
  }, [datos]);

  return (
    <Section titulo="Órdenes del activo">
      <Card>
        <CardContent>
          {cargando ? (
            <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
          ) : error ? (
            <ErrorState titulo="No se pudieron cargar las órdenes" descripcion={error.message} onReintentar={recargar} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
              <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
                <KpiCard titulo="Pendientes" valor={String(grupos.pendientes.length)} />
                <KpiCard titulo="En ejecución" valor={String(grupos.ejecucion.length)} />
                <KpiCard titulo="Cerradas" valor={String(grupos.cerradas.length)} />
              </div>

              {grupos.todas.length === 0 ? (
                <EmptyState titulo="Sin órdenes" descripcion="Este activo no tiene órdenes de trabajo registradas." />
              ) : (
                <ul style={LISTA}>
                  {grupos.recientes.map((o) => (
                    <li key={o.id}>
                      <Link href={urlOrden(o.id)} style={ENLACE_FILA}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", minWidth: 0 }}>
                          <span style={{ fontWeight: 600 }}><code style={{ fontSize: "var(--do-text-xs)" }}>{o.codigo}</code> {o.titulo}</span>
                          <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>{o.tipo}{o.prioridad ? ` · ${o.prioridad}` : ""} · {fmtFecha(o.actualizadoAt)}</span>
                        </div>
                        <Badge variant={TONO_ESTADO_ORDEN[o.estado as string] ?? "neutro"}>{ETIQUETA_ESTADO_ORDEN[o.estado as string] ?? o.estado}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                {/* "Ver todas las órdenes" = navegación de consulta (autorizada
                    para cualquier rol con lectura). "Nueva orden" = ESCRITURA:
                    gatear con la capacidad canónica (ocultar sin permiso). */}
                <Link href={urlActivoTab(activoId, "ordenes")}><Button variant="secundario" size="sm">Ver todas las órdenes</Button></Link>
                {capOrd.crear && (
                  <Link href={urlNuevaOrden({ activo: activoId, activoEtiqueta: activoNombre })}><Button variant="primario" size="sm">Nueva orden</Button></Link>
                )}
                {rol === "TECNICO" && <Link href="/ordenes/operaciones"><Button variant="fantasma" size="sm">Mis órdenes</Button></Link>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}

/* ============================== Historial ================================ */

function SeccionHistorial({ activoId }: { activoId: string }) {
  const { datos, cargando, error, recargar } = useTimelineActivo(activoId);

  const eventos = useMemo(() => {
    return (datos ?? []).slice(0, 6).map((ev) => ({
      titulo: (ev.descripcion ?? ev.resumen ?? ev.tipo ?? "Evento") as React.ReactNode,
      hora: fmtFechaHora(ev.ocurridoAt ?? ev.occurredAt ?? ev.fecha),
      descripcion: [ev.actor && `Actor: ${ev.actor}`, ev.estado && `Estado: ${ev.estado}`].filter(Boolean).join(" · ") || undefined,
      tono: tonoEvento(String(ev.tipo ?? "")),
    }));
  }, [datos]);

  return (
    <Section titulo="Historial operacional">
      <Card>
        <CardContent>
          {cargando ? (
            <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
          ) : error ? (
            <ErrorState titulo="No se pudo cargar el historial" descripcion={error.message} onReintentar={recargar} />
          ) : eventos.length === 0 ? (
            <EmptyState titulo="Sin actividad reciente" descripcion="Aún no hay eventos en la cronología de este activo." />
          ) : (
            <Timeline eventos={eventos} label={`Cronología reciente del activo ${activoId}`} />
          )}
          <div style={{ marginTop: "var(--do-sp-3)" }}>
            <Link href={urlActivoTab(activoId, "timeline")}>
              <Button variant="secundario" size="sm">Ver historial completo</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

function tonoEvento(tipo: string): "neutro" | "primario" | "exito" | "advertencia" | "error" | "info" {
  const t = tipo.toLowerCase();
  if (t.includes("retir") || t.includes("fuera") || t.includes("anul")) return "error";
  if (t.includes("mantenimiento")) return "advertencia";
  if (t.includes("tanqueo") || t.includes("operativo")) return "exito";
  if (t.includes("lectura") || t.includes("registr")) return "info";
  return "neutro";
}

/* ======================== Acciones Offline First ======================== */

/**
 * DELTAOPS LITE-08 §6-7 · CAPTURA RÁPIDA DE LECTURA (mobile-first).
 * Experiencia sencilla: equipo → última lectura → nueva lectura → guardar →
 * feedback inmediato con «Próximo mantenimiento · Faltan N». Compone la
 * Utilización existente (append-only, valor decreciente ⇒ inconsistente que NO
 * propaga, regularización auditada intactas) y el patrón offline First — jamás
 * una segunda cola. Tras guardar, refresca el estado-rutinas del punto 1.
 */
export function ModalRegistrarLectura({ activoId, onCerrar, onHecho }: { activoId: string; onCerrar: () => void; onHecho: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const [tipoMedidor, setTipoMedidor] = useState<string>(TIPOS_MEDIDOR[0]);
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<null | { encolada: boolean; inconsistente: boolean }>(null);

  // Última lectura del medidor seleccionado (para mostrar el punto de partida y
  // detectar valor decreciente = inconsistente). El backend es la autoridad.
  const ultima = useUltimaLectura(activoId, tipoMedidor);
  // Estado de rutinas por uso (para el feedback tras guardar). Se refresca al
  // cerrar el flujo. Lee medidores server-side (autoridad backend).
  const rutinas = useEstadoRutinas(activoId);

  const nueva = Number(valor);
  const valorUltima = typeof ultima.datos?.valor === "number" ? ultima.datos.valor : null;
  const seraInconsistente = valorUltima != null && Number.isFinite(nueva) && nueva < valorUltima;
  const unidad = UNIDAD_POR_MEDIDOR[tipoMedidor];

  async function guardar() {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) { setErr("Indica un valor de lectura válido."); return; }
    if (!fecha.trim()) { setErr("Indica la fecha y hora de la lectura."); return; }
    setGuardando(true);
    setErr(null);
    const r = await registrarLectura(cola, {
      activoId,
      tipoMedidor,
      valor: n,
      unidad,
      fechaHora: new Date(fecha).toISOString(),
    });
    setGuardando(false);
    if (r.error) { setErr(r.error.message); return; }
    toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "Lectura en cola (se sincronizará)" : "Lectura registrada" });
    // Refresca el estado de rutinas para el feedback (el punto 1).
    rutinas.recargar();
    setHecho({ encolada: r.encolada, inconsistente: seraInconsistente });
  }

  // Rutinas relevantes al medidor recién capturado (uso: horómetro/odómetro).
  const rutinasDelMedidor = (rutinas.datos?.rutinas ?? []).filter(
    (r) => r.dominio === "uso" && (r.unidad === tipoMedidor || r.unidad === unidad),
  );

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo="Registrar lectura"
      pie={
        hecho ? (
          <Button variant="primario" onClick={onHecho}>Cerrar</Button>
        ) : (
          <><Button variant="fantasma" onClick={onCerrar} disabled={guardando}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Registrar</Button></>
        )
      }
    >
      {hecho ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }} data-testid="lectura-feedback">
          <Alert
            variant={hecho.encolada ? "info" : "exito"}
            titulo={hecho.encolada ? "Lectura en cola (se sincronizará)" : "Lectura registrada"}
          >
            {ETIQUETA_TIPO_MEDIDOR[tipoMedidor]}: {fmtNumero(nueva, 0)} {unidad}
          </Alert>
          {hecho.inconsistente && (
            <Alert variant="advertencia" titulo="Lectura menor que la anterior (inconsistente)">
              Se guarda para auditoría pero NO actualiza el medidor del activo. Si el medidor se reinició, usa la regularización auditada.
            </Alert>
          )}
          <div>
            <strong style={{ fontSize: "var(--do-text-sm)" }}>Próximo mantenimiento</strong>
            {rutinas.cargando ? (
              <div style={{ padding: "var(--do-sp-3)" }}><Spinner /></div>
            ) : rutinasDelMedidor.length === 0 ? (
              <p style={{ margin: "var(--do-sp-1) 0 0", color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
                Sin rutinas por {ETIQUETA_TIPO_MEDIDOR[tipoMedidor].toLowerCase()} para este activo.
              </p>
            ) : (
              <ul style={{ ...LISTA, marginTop: "var(--do-sp-2)" }}>
                {rutinasDelMedidor.slice(0, 3).map((r) => {
                  const sem = SEMAFORO_RUTINA[r.semaforo] ?? SEMAFORO_RUTINA["sin-datos"];
                  return (
                    <li key={r.planId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", minWidth: 0 }}>
                        <span aria-hidden="true" className={`do-semaforo do-semaforo--${sem.clase}`} />
                        <span style={{ fontWeight: 600 }}>{r.nombre}</span>
                      </span>
                      <Badge variant={sem.variante}>{sem.emoji} {textoFaltante(r)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
            <p style={{ margin: "var(--do-sp-2) 0 0", color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
              El estado se recalcula cuando la lectura se sincroniza al activo.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
          {err && <Alert variant="error" titulo={err} />}
          <div role="group" aria-label="Tipo de medidor" style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            {TIPOS_MEDIDOR.map((t) => (
              <Button key={t} size="sm" variant={tipoMedidor === t ? "primario" : "fantasma"} aria-pressed={tipoMedidor === t} onClick={() => setTipoMedidor(t)}>
                {ETIQUETA_TIPO_MEDIDOR[t]}
              </Button>
            ))}
          </div>
          <div style={{ padding: "var(--do-sp-2) var(--do-sp-3)", borderRadius: "var(--do-radius-sm)", background: "var(--do-surface-2)", fontSize: "var(--do-text-sm)" }}>
            {ultima.cargando ? (
              <span style={{ color: "var(--do-texto-suave)" }}>Cargando última lectura…</span>
            ) : valorUltima != null ? (
              <>Última lectura: <strong>{fmtNumero(valorUltima, 0)} {unidad}</strong>{ultima.datos?.fechaHora ? ` · ${fmtFechaHora(ultima.datos.fechaHora)}` : ""}</>
            ) : (
              <span style={{ color: "var(--do-texto-suave)" }}>Sin lecturas previas de {ETIQUETA_TIPO_MEDIDOR[tipoMedidor].toLowerCase()}.</span>
            )}
          </div>
          <label style={CAMPO_LABEL}>
            <span>Nueva lectura ({unidad})</span>
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} style={CAMPO_INPUT} />
          </label>
          {seraInconsistente && (
            <Alert variant="advertencia" titulo="El valor es menor que la última lectura">
              Se registrará como inconsistente (no actualiza el medidor). Si el medidor se reinició, usa la regularización auditada.
            </Alert>
          )}
          <label style={CAMPO_LABEL}>
            <span>Fecha y hora</span>
            <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} style={CAMPO_INPUT} />
          </label>
        </div>
      )}
    </Modal>
  );
}

/** Claves de combustible por defecto si el catálogo del tenant está vacío. */
const COMBUSTIBLES_FALLBACK = ["diesel", "gasolina", "gas-natural", "glp", "electrico", "biodiesel"] as const;

/**
 * DELTAOPS LITE-08 §9-13 · Experiencia de tanqueo/abastecimiento del activo.
 * Compone el dominio existente de Utilización (append-only, catálogo
 * multi-energía tipos-combustible, dinero snapshot, proveedor string sin FK).
 * Captura los campos §9 disponibles: activo (implícito), fecha, cantidad,
 * tipo de energía (catálogo real del tenant), costo, proveedor +
 * identificación (opcionales, snapshot), observación; y muestra la última
 * lectura del activo como contexto. GAP-TANQUEO: la cantidad es "litros" en el
 * contrato congelado (no hay campo unidad multi-energía) — no se convierte en
 * silencio; se documenta.
 */
export function ModalRegistrarTanqueo({ activoId, onCerrar, onHecho }: { activoId: string; onCerrar: () => void; onHecho: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const combustibles = useCombustibles();
  // Contexto: última lectura del horómetro (referencia §9 «lectura del activo»).
  const ultimaHoro = useUltimaLectura(activoId, TIPOS_MEDIDOR[0]);
  const opciones = (combustibles.datos ?? []).filter((o) => o.habilitado !== false);
  const [litros, setLitros] = useState("");
  const [combustible, setCombustible] = useState("");
  const [fecha, setFecha] = useState("");
  const [costo, setCosto] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [identificacion, setIdentificacion] = useState("");
  const [observacion, setObservacion] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Selección efectiva: 1º catálogo del tenant, luego fallback.
  const listaCombustible = opciones.length > 0 ? opciones.map((o) => o.clave) : [...COMBUSTIBLES_FALLBACK];
  const combustibleSel = combustible || listaCombustible[0] || "diesel";

  async function guardar() {
    const l = Number(litros);
    if (!Number.isFinite(l) || l <= 0) { setErr("Indica la cantidad del tanqueo."); return; }
    if (!fecha.trim()) { setErr("Indica la fecha y hora del tanqueo."); return; }
    setGuardando(true);
    setErr(null);
    const c = Number(costo);
    // Proveedor + identificación (opcional) → snapshot transaccional en un solo
    // string (proveedorId sin FK dura). La identificación se concatena de forma
    // legible sin inventar estructura no soportada por el contrato congelado.
    const proveedorId = proveedor.trim() !== ""
      ? (identificacion.trim() !== "" ? `${proveedor.trim()} · ${identificacion.trim()}` : proveedor.trim())
      : undefined;
    const r = await registrarTanqueo(cola, {
      activoId,
      litros: l,
      tipoCombustible: combustibleSel,
      fechaHora: new Date(fecha).toISOString(),
      costoTotal: costo.trim() !== "" && Number.isFinite(c) ? c : undefined,
      proveedorId,
      observacion: observacion.trim() !== "" ? observacion.trim() : undefined,
    });
    setGuardando(false);
    if (r.error) { setErr(r.error.message); return; }
    toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "Tanqueo en cola (se sincronizará)" : "Tanqueo registrado" });
    onHecho();
  }

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo="Registrar combustible"
      pie={<><Button variant="fantasma" onClick={onCerrar} disabled={guardando}>Cancelar</Button><Button variant="primario" loading={guardando} onClick={() => void guardar()}>Registrar</Button></>}
    >
      {err && <Alert variant="error" titulo={err} />}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
        {/* Contexto: última lectura del activo (referencia §9). */}
        <div style={{ padding: "var(--do-sp-2) var(--do-sp-3)", borderRadius: "var(--do-radius-sm)", background: "var(--do-surface-2)", fontSize: "var(--do-text-sm)" }}>
          {ultimaHoro.cargando ? (
            <span style={{ color: "var(--do-texto-suave)" }}>Cargando lectura del activo…</span>
          ) : typeof ultimaHoro.datos?.valor === "number" ? (
            <>Lectura del activo: <strong>{fmtNumero(ultimaHoro.datos.valor, 0)} {ultimaHoro.datos.unidad ?? "h"}</strong></>
          ) : (
            <span style={{ color: "var(--do-texto-suave)" }}>Sin lectura previa del activo.</span>
          )}
        </div>
        <label style={CAMPO_LABEL}>
          <span>Tipo de energía / combustible</span>
          <Select value={combustibleSel} onChange={(e) => setCombustible(e.target.value)}>
            {opciones.length > 0
              ? opciones.map((o) => <option key={o.clave} value={o.clave}>{o.etiqueta}</option>)
              : listaCombustible.map((c) => <option key={c} value={c}>{etiquetaCombustible(c)}</option>)}
          </Select>
        </label>
        <label style={CAMPO_LABEL}>
          <span>Cantidad (litros)</span>
          <input inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} style={CAMPO_INPUT} />
        </label>
        <label style={CAMPO_LABEL}>
          <span>Costo total (opcional)</span>
          <input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} style={CAMPO_INPUT} />
        </label>
        <label style={CAMPO_LABEL}>
          <span>Proveedor (opcional)</span>
          <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} style={CAMPO_INPUT} />
        </label>
        <label style={CAMPO_LABEL}>
          <span>Identificación / ticket proveedor (opcional)</span>
          <input value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} style={CAMPO_INPUT} />
        </label>
        <label style={CAMPO_LABEL}>
          <span>Observación (opcional)</span>
          <input value={observacion} onChange={(e) => setObservacion(e.target.value)} style={CAMPO_INPUT} />
        </label>
        <label style={CAMPO_LABEL}>
          <span>Fecha y hora</span>
          <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} style={CAMPO_INPUT} />
        </label>
      </div>
    </Modal>
  );
}

/* -------------------------------- estilos -------------------------------- */

const LISTA: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" };
const ENLACE_FILA: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)",
  padding: "var(--do-sp-3)", borderRadius: "var(--do-radius-md)", border: "1px solid var(--do-borde)",
  background: "var(--do-surface)", color: "inherit", textDecoration: "none", minHeight: 48,
};
const CAMPO_LABEL: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", fontSize: "var(--do-text-sm)" };
const CAMPO_INPUT: React.CSSProperties = { padding: "var(--do-sp-2)", borderRadius: "var(--do-radius-sm)", border: "1px solid var(--do-borde)", minHeight: 48, background: "var(--do-surface)", color: "var(--do-texto)" };
