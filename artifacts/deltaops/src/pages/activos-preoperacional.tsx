/**
 * DGP-LITE-04 · PREOPERACIONAL / Checklist Operacional (mobile-first).
 *
 * Flujo anclado al activo (§4): identifica el equipo → resuelve la plantilla
 * ACTIVA → checklist agrupado por categoría con control segmentado
 * CUMPLE/NO CUMPLE/OBSERVACIÓN/NO APLICA (mapeado al contrato del motor sin
 * romperlo) → progreso → registro → RESULTADO con veredicto sellado por el
 * backend (texto + color + icono). Estados honestos, sin datos falsos. El
 * veredicto y la criticidad los decide y sella EXCLUSIVAMENTE el backend.
 *
 * Reutiliza la ÚNICA cola offline (OfflineProvider con namespace
 * "preoperacional"). NO genera OT: ante fallas, ofrece prellenar una NOVEDAD en
 * Correctivo con la procedencia completa (activo → ítem → observación).
 */
import React, { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  PageHeader, Card, CardContent, CardHeader, Button, Alert, Badge, Textarea, Progress, Spinner, EmptyState,
} from "@workspace/design-system";
import { Check, X, AlertTriangle, MinusCircle, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { ShellActivos } from "../lib/activos/Shell";
import { useDetalle } from "../lib/activos/hooks";
import { useSesion } from "../lib/identidad/sesion";
import { OfflineProvider, useOffline } from "../lib/offline/contexto";
import { MODULO_OFFLINE, SYNC_URL, OPCIONES_SEGMENTO, PRESENTACION_VEREDICTO, type EstadoItem } from "../lib/preoperacional/constantes";
import { obtenerPlantilla, registrarPreoperacional } from "../lib/preoperacional/mutaciones";
import { AccionHallazgo } from "../lib/hallazgo/AccionHallazgo";
import type { PlantillaPreoperacional, RespuestaLocal, ResultadoRegistro } from "../lib/preoperacional/tipos";
import { PreoperacionalApiError } from "../lib/preoperacional/api";

/** Deriva la clave de plantilla por tipo de equipo (demo: `preop-<tipo>`). */
function claveDePlantilla(tipo: string): string {
  const t = (tipo || "movil").toLowerCase();
  return `preop-${t}`;
}

function IconoSegmento({ clave, size = 16 }: { clave: EstadoItem; size?: number }) {
  if (clave === "cumple") return <Check size={size} aria-hidden="true" />;
  if (clave === "no_cumple") return <X size={size} aria-hidden="true" />;
  if (clave === "observacion") return <AlertTriangle size={size} aria-hidden="true" />;
  return <MinusCircle size={size} aria-hidden="true" />;
}

/* ----------------------------- Contenido --------------------------------- */

function Contenido({ activoId }: { activoId: string }) {
  const detalle = useDetalle(activoId);
  const { cola, enLinea, pendientes } = useOffline();
  const { sesion } = useSesion();
  const tenant = sesion?.tenant.id ?? "deltaops";

  const [plantilla, setPlantilla] = useState<PlantillaPreoperacional | null>(null);
  const [cargandoPlantilla, setCargandoPlantilla] = useState(true);
  const [errorPlantilla, setErrorPlantilla] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaLocal>>({});
  const [resultado, setResultado] = useState<ResultadoRegistro | null>(null);
  const [encolado, setEncolado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const activo = detalle.datos ?? null;

  // Resolver la plantilla ACTIVA por tipo de equipo (autoridad backend).
  React.useEffect(() => {
    let vivo = true;
    if (!activo) return;
    setCargandoPlantilla(true);
    obtenerPlantilla(claveDePlantilla(activo.tipo))
      .then((p) => {
        if (!vivo) return;
        if (!p) setErrorPlantilla("No hay una plantilla de preoperacional activa para este tipo de equipo.");
        setPlantilla(p);
      })
      .catch((e) => {
        if (!vivo) return;
        setErrorPlantilla(e instanceof PreoperacionalApiError ? e.message : "No se pudo cargar la plantilla.");
      })
      .finally(() => vivo && setCargandoPlantilla(false));
    return () => { vivo = false; };
  }, [activo]);

  const categorias = useMemo(() => {
    const map = new Map<string, PlantillaPreoperacional["items"]>();
    for (const it of plantilla?.items ?? []) {
      const cat = it.categoria ?? "General";
      map.set(cat, [...(map.get(cat) ?? []), it]);
    }
    return [...map.entries()];
  }, [plantilla]);

  const totalObligatorios = useMemo(
    () => (plantilla?.items ?? []).filter((i) => i.obligatorio).length,
    [plantilla],
  );
  const respondidosObligatorios = useMemo(
    () => (plantilla?.items ?? []).filter((i) => i.obligatorio && respuestas[i.clave]?.estado).length,
    [plantilla, respuestas],
  );
  const progreso = totalObligatorios === 0 ? 0 : Math.round((respondidosObligatorios / totalObligatorios) * 100);
  const completo = respondidosObligatorios === totalObligatorios && totalObligatorios > 0;

  function marcar(clave: string, estado: EstadoItem) {
    setRespuestas((prev) => ({ ...prev, [clave]: { ...prev[clave], estado } }));
  }
  function comentar(clave: string, comentario: string) {
    setRespuestas((prev) => ({ ...prev, [clave]: { ...prev[clave], comentario } }));
  }

  async function registrar() {
    if (!plantilla) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const r = await registrarPreoperacional(cola, {
        activoId,
        plantillaClave: plantilla.clave,
        plantillaVersion: plantilla.version,
        respuestas,
      });
      if (r.error) {
        setErrorEnvio(r.error.message);
      } else if (r.encolada) {
        setEncolado(true);
      } else if (r.resultado) {
        setResultado(r.resultado);
      }
    } catch (e) {
      setErrorEnvio(e instanceof Error ? e.message : "No se pudo registrar el preoperacional.");
    } finally {
      setEnviando(false);
    }
  }

  if (detalle.cargando) return <Spinner />;
  if (detalle.error || !activo) {
    return <ErrorHonesto texto="No se pudo cargar el activo." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <PageHeader
        titulo="Preoperacional"
        descripcion={`${activo.codigoEmpresarial} · ${activo.nombre}`}
      />

      {(!enLinea || pendientes > 0) && (
        <Alert
          variant="info"
          titulo={!enLinea ? "Sin conexión: el registro se guardará y sincronizará luego." : `${pendientes} registro(s) en cola de sincronización.`}
        />
      )}

      {/* RESULTADO sellado por el backend (texto + color + icono). §8/§10 */}
      {resultado && <ResultadoVeredicto resultado={resultado} tenant={tenant} />}

      {encolado && !resultado && (
        <Alert variant="advertencia" titulo="Registro en cola: se sellará el veredicto al sincronizar con el servidor." />
      )}

      {!resultado && !encolado && (
        <>
          {cargandoPlantilla && <Spinner />}
          {!cargandoPlantilla && errorPlantilla && <ErrorHonesto texto={errorPlantilla} />}

          {!cargandoPlantilla && plantilla && (
            <>
              <Card>
                <CardContent>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
                    <strong>{plantilla.titulo}</strong>
                    <Badge variant="neutro">v{plantilla.version}</Badge>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
                      {respondidosObligatorios}/{totalObligatorios} obligatorios
                    </span>
                  </div>
                  <div style={{ marginTop: "var(--do-sp-2)" }}>
                    <Progress value={progreso} etiqueta="Progreso" />
                  </div>
                </CardContent>
              </Card>

              {categorias.map(([cat, items]) => (
                <Card key={cat}>
                  <CardHeader>{cat}</CardHeader>
                  <CardContent>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
                      {items.map((it) => {
                        const r = respuestas[it.clave];
                        const muestraComentario = r?.estado === "no_cumple" || r?.estado === "observacion";
                        return (
                          <div key={it.clave} style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                              <span>{it.etiqueta}</span>
                              {it.critico && <Badge variant="error">Crítico</Badge>}
                              {it.obligatorio && <Badge variant="neutro">Obligatorio</Badge>}
                            </div>
                            <div role="group" aria-label={`Estado de ${it.etiqueta}`} style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                              {OPCIONES_SEGMENTO.map((op) => (
                                <Button
                                  key={op.clave}
                                  type="button"
                                  size="sm"
                                  variant={r?.estado === op.clave ? "primario" : "fantasma"}
                                  aria-pressed={r?.estado === op.clave}
                                  onClick={() => marcar(it.clave, op.clave)}
                                >
                                  <IconoSegmento clave={op.clave} /> {op.etiqueta}
                                </Button>
                              ))}
                            </div>
                            {muestraComentario && (
                              <Textarea
                                aria-label={`Observación de ${it.etiqueta}`}
                                placeholder={r?.estado === "no_cumple" ? "Describe la falla (requerido para el seguimiento)" : "Describe la observación"}
                                value={r?.comentario ?? ""}
                                onChange={(e) => comentar(it.clave, (e.target as HTMLTextAreaElement).value)}
                                rows={2}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {errorEnvio && <Alert variant="error" titulo={errorEnvio} />}

              <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <Link href={`/activos/${encodeURIComponent(activoId)}`}>
                  <Button variant="secundario">Cancelar</Button>
                </Link>
                <Button variant="primario" disabled={!completo || enviando} onClick={() => void registrar()}>
                  {enviando ? "Registrando…" : "Registrar preoperacional"}
                </Button>
              </div>
              {!completo && (
                <p style={{ textAlign: "right", fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
                  Responde todos los puntos obligatorios para registrar.
                </p>
              )}
            </>
          )}
        </>
      )}

      {(resultado || encolado) && (
        <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Link href={`/activos/${encodeURIComponent(activoId)}`}>
            <Button variant="secundario">Volver al activo</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

/** Presentación honesta de error. */
function ErrorHonesto({ texto }: { texto: string }) {
  return (
    <EmptyState
      titulo="No disponible"
      descripcion={texto}
    />
  );
}

/**
 * Resultado con veredicto sellado (texto + color + icono). LITE-05: cada hallazgo
 * (incumplimiento u observación) expone su ACCIÓN del bucle Hallazgo→OT según el
 * estado que resuelve el backend (pendiente/convertido/descartado), en lugar del
 * antiguo puente único a Correctivo.
 */
function ResultadoVeredicto({ resultado, tenant }: { resultado: ResultadoRegistro; tenant: string }) {
  const p = PRESENTACION_VEREDICTO[resultado.veredicto];
  const Icono = p.icono === "check" ? ShieldCheck : p.icono === "warning" ? ShieldAlert : ShieldX;
  const variant = p.tono === "exito" ? "exito" : p.tono === "advertencia" ? "advertencia" : "error";
  const hayHallazgos = resultado.incumplimientos.length > 0 || resultado.observaciones.length > 0;
  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)" }}>
          <Icono size={28} aria-hidden="true" />
          <div>
            <Badge variant={variant}>{p.etiqueta}</Badge>
            <p style={{ margin: "var(--do-sp-1) 0 0", color: "var(--do-texto-suave)" }}>{p.descripcion}</p>
          </div>
        </div>

        {hayHallazgos && (
          <div style={{ marginTop: "var(--do-sp-4)", display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            <strong>Hallazgos</strong>
            {resultado.incumplimientos.map((h) => (
              <div key={`i-${h.clave}`} style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", paddingBottom: "var(--do-sp-2)", borderBottom: "1px solid var(--do-borde)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                  <X size={14} aria-hidden="true" />
                  <span>{h.etiqueta}</span>
                  {h.critico && <Badge variant="error">Crítico</Badge>}
                  {h.comentario && <span style={{ color: "var(--do-texto-suave)" }}>— {h.comentario}</span>}
                </div>
                <AccionHallazgo ejecucionId={resultado.id} itemClave={h.clave} tenant={tenant} />
              </div>
            ))}
            {resultado.observaciones.map((h) => (
              <div key={`o-${h.clave}`} style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", paddingBottom: "var(--do-sp-2)", borderBottom: "1px solid var(--do-borde)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>{h.etiqueta}</span>
                  {h.comentario && <span style={{ color: "var(--do-texto-suave)" }}>— {h.comentario}</span>}
                </div>
                <AccionHallazgo ejecucionId={resultado.id} itemClave={h.clave} tenant={tenant} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------- Página ---------------------------------- */

export default function ActivosPreoperacional() {
  const [, params] = useRoute("/activos/:id/preoperacional");
  const { sesion } = useSesion();
  const activoId = params?.id ?? "";
  const tenant = sesion?.tenant.id ?? "deltaops";

  return (
    <ShellActivos activo={`/activos/${activoId}`}>
      <OfflineProvider tenant={tenant} modulo={MODULO_OFFLINE} syncUrl={SYNC_URL}>
        {activoId ? <Contenido activoId={activoId} /> : <ErrorHonesto texto="Activo no especificado." />}
      </OfflineProvider>
    </ShellActivos>
  );
}
