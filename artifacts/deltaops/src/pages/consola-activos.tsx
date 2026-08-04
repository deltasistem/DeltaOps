/**
 * DGP-008.2 · Consola Técnica del Módulo de Activos Empresariales.
 *
 * Consola de DIAGNÓSTICO exclusiva para administradores (admin / platform_admin).
 * Lee el estado técnico del módulo desde GET /api/deltaops/activos/consola
 * (query modulo.activos.consola, exige permiso modulo.activos.admin).
 *
 * NO contiene KPIs ejecutivos ni analítica: solo estado técnico del módulo,
 * read models/proyecciones, eventos de dominio, políticas, catálogos, tipos de
 * relación, configuración operativa y verificación de aislamiento (RLS).
 *
 * Usa EXCLUSIVAMENTE el Design System (tokens --do-* y componentes Do*).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useDeltaopsMe, getDeltaopsMeQueryKey } from "@workspace/api-client-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Spinner,
  Alert,
  Table as DoTable,
  Tabs,
  Timeline,
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  KpiCard,
  ThemeProvider,
} from "@workspace/design-system";

/* ------------------------------ Contrato --------------------------------- */

const API = "/api/deltaops/activos";

const ROLES_ADMIN = ["admin", "platform_admin"];

interface TipoRelacion {
  tipo: string;
  categoria: string;
  inverso: string;
}

interface EventoOutbox {
  id: string;
  tipo: string;
  processedAt: string | null;
  occurredAt: string;
}

interface ReciboSync {
  opId: string;
  comando: string;
  estado: string;
  clienteId: string;
  createdAt: string | null;
  resultado?: unknown;
}

interface ConsolaResp {
  modulo: string;
  version: string;
  estados: string[];
  eventos: string[];
  policies: string[];
  catalogos: string[];
  tiposRelacion: TipoRelacion[];
  configuracion: Record<string, string>;
  readModels: {
    activos: { total: number; porEstado: Record<string, number>; lastEventId?: string | null };
    relaciones: { total: number; lastEventId?: string | null };
    historial: { total: number; lastEventId?: string | null };
  };
  outbox: {
    pendientes: number;
    procesados: number;
    ultimos: EventoOutbox[];
  };
  sincronizacion: {
    total: number;
    porEstado: Record<string, number>;
    ultimos: ReciboSync[];
    conflictos: ReciboSync[];
  };
  colaboracion: {
    timelineModulo: number;
    comentarios: number;
    adjuntos: number;
    activosInspeccionados: number;
    truncado: boolean;
    nota: string;
  };
  rls: {
    tablas: string[];
    aislamiento: string;
  };
}

type EstadoCarga =
  | { fase: "cargando" }
  | { fase: "ok"; datos: ConsolaResp }
  | { fase: "prohibido"; mensaje: string }
  | { fase: "error"; mensaje: string };

/* --------------------------------- Página -------------------------------- */

export default function ConsolaActivosPage() {
  return (
    <ThemeProvider>
      <div
        className="do-root"
        data-do-theme="light"
        style={{ minHeight: "100vh", background: "var(--do-bg)", padding: "var(--do-sp-6)" }}
      >
        <div
          style={{
            maxWidth: "var(--do-max-ancho)",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "var(--do-sp-5)",
          }}
        >
          <ConsolaActivos />
        </div>
      </div>
    </ThemeProvider>
  );
}

function ConsolaActivos() {
  const { data: user, error: userError, isLoading: userLoading } = useDeltaopsMe({
    query: { retry: false, queryKey: getDeltaopsMeQueryKey() },
  });

  const esAdmin = !!user && ROLES_ADMIN.includes(user.rol);

  const [estado, setEstado] = useState<EstadoCarga>({ fase: "cargando" });
  const [recarga, setRecarga] = useState(0);

  // Sesión inválida → volver al login (patrón de la consola de plataforma).
  useEffect(() => {
    if (userError) {
      window.location.assign(`${import.meta.env.BASE_URL}login`);
    }
  }, [userError]);

  useEffect(() => {
    if (userLoading || !user) return;
    if (!esAdmin) {
      setEstado({
        fase: "prohibido",
        mensaje: "Se requiere permiso modulo.activos.admin (rol administrador).",
      });
      return;
    }
    let vivo = true;
    setEstado({ fase: "cargando" });
    fetch(`${API}/consola`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.assign(`${import.meta.env.BASE_URL}login`);
          return;
        }
        const body = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (r.status === 403) {
          setEstado({
            fase: "prohibido",
            mensaje: body?.error ?? "Acceso denegado: se requiere permiso modulo.activos.admin.",
          });
          return;
        }
        if (!r.ok) {
          setEstado({ fase: "error", mensaje: body?.error ?? r.statusText });
          return;
        }
        setEstado({ fase: "ok", datos: body as ConsolaResp });
      })
      .catch((e: Error) => {
        if (vivo) setEstado({ fase: "error", mensaje: e.message });
      });
    return () => {
      vivo = false;
    };
  }, [user, userLoading, esAdmin, recarga]);

  const cabecera = (
    <PageHeader
      titulo="Consola Técnica · Módulo de Activos"
      descripcion="Diagnóstico técnico del módulo de Activos Empresariales: read models, proyecciones, eventos de dominio, políticas, catálogos, configuración operativa y aislamiento (RLS)."
      acciones={
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {estado.fase === "ok" && (
            <Button variant="secundario" onClick={() => setRecarga((n) => n + 1)}>
              Actualizar
            </Button>
          )}
          <Link href="/">
            <Button variant="fantasma">Volver a la consola</Button>
          </Link>
        </div>
      }
    />
  );

  if (userLoading || estado.fase === "cargando") {
    return (
      <>
        {cabecera}
        <Card>
          <CardContent>
            <div
              style={{
                display: "flex",
                gap: "var(--do-sp-3)",
                alignItems: "center",
                justifyContent: "center",
                padding: "var(--do-sp-6)",
              }}
            >
              <Spinner />
              <span style={{ color: "var(--do-texto-suave)" }}>Cargando estado del módulo…</span>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (estado.fase === "prohibido") {
    return (
      <>
        {cabecera}
        <Card>
          <CardContent>
            <ErrorState
              titulo="403 · Acceso restringido"
              descripcion={estado.mensaje}
            >
              <Alert variant="advertencia" titulo="Consola solo para administradores">
                Esta consola técnica es exclusiva de administradores del módulo de Activos.
              </Alert>
              <div style={{ marginTop: "var(--do-sp-3)" }}>
                <Link href="/">
                  <Button variant="secundario">Volver a la consola</Button>
                </Link>
              </div>
            </ErrorState>
          </CardContent>
        </Card>
      </>
    );
  }

  if (estado.fase === "error") {
    return (
      <>
        {cabecera}
        <Card>
          <CardContent>
            <ErrorState
              titulo="No se pudo cargar la consola"
              descripcion={estado.mensaje}
              onReintentar={() => setRecarga((n) => n + 1)}
            />
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      {cabecera}
      <ConsolaContenido datos={estado.datos} />
    </>
  );
}

/* ------------------------------ Contenido -------------------------------- */

function ConsolaContenido({ datos }: { datos: ConsolaResp }) {
  const totalRm = datos.readModels.activos.total;
  const porEstado = useMemo(
    () => Object.entries(datos.readModels.activos.porEstado),
    [datos],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-5)" }}>
      {/* Resumen técnico (conteos, no KPIs ejecutivos) */}
      <div
        style={{
          display: "grid",
          gap: "var(--do-sp-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}
      >
        <KpiCard titulo="Activos en read model" valor={String(totalRm)} />
        <KpiCard titulo="Outbox pendientes" valor={String(datos.outbox.pendientes)} />
        <KpiCard titulo="Recibos de sincronización" valor={String(datos.sincronizacion.total)} />
        <KpiCard
          titulo="Conflictos de sincronización"
          valor={String(datos.sincronizacion.conflictos.length)}
        />
      </div>

      <Tabs
        items={[
          {
            id: "modulo",
            etiqueta: "Módulo",
            contenido: <SeccionModulo datos={datos} />,
          },
          {
            id: "read-models",
            etiqueta: "Read models & proyecciones",
            contenido: <SeccionReadModels datos={datos} porEstado={porEstado} />,
          },
          {
            id: "outbox",
            etiqueta: "Outbox",
            contenido: <SeccionOutbox datos={datos} />,
          },
          {
            id: "sincronizacion",
            etiqueta: "Sincronización",
            contenido: <SeccionSincronizacion datos={datos} />,
          },
          {
            id: "colaboracion",
            etiqueta: "Colaboración",
            contenido: <SeccionColaboracion datos={datos} />,
          },
          {
            id: "eventos",
            etiqueta: "Eventos & políticas",
            contenido: <SeccionEventos datos={datos} />,
          },
          {
            id: "relaciones",
            etiqueta: "Tipos de relación",
            contenido: <SeccionRelaciones datos={datos} />,
          },
          {
            id: "catalogos",
            etiqueta: "Catálogos & configuración",
            contenido: <SeccionCatalogos datos={datos} />,
          },
          {
            id: "rls",
            etiqueta: "Aislamiento (RLS)",
            contenido: <SeccionRls datos={datos} />,
          },
        ]}
      />
    </div>
  );
}

function CampoDato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
      <span
        style={{
          fontSize: "var(--do-text-xs)",
          color: "var(--do-texto-suave)",
          textTransform: "uppercase",
          letterSpacing: "var(--do-tracking-etiquetas)",
        }}
      >
        {etiqueta}
      </span>
      <span style={{ fontFamily: "var(--do-font-mono)" }}>{children}</span>
    </div>
  );
}

/** Muestra el lastEventId (id de evento) o un guion cuando aún no hay proyección. */
function LastEventId({ valor }: { valor?: string | null }) {
  if (!valor) {
    return <span style={{ color: "var(--do-texto-suave)" }}>—</span>;
  }
  return (
    <code style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{valor}</code>
  );
}

/** Formatea una fecha ISO a locale corto; devuelve "—" si es nula. */
function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Mapea un estado de recibo de sincronización a la variante semántica del Badge. */
function variantEstadoSync(estado: string): "exito" | "advertencia" | "error" | "info" | "neutro" {
  switch (estado) {
    case "aplicada":
      return "exito";
    case "idempotente":
      return "info";
    case "conflicto":
      return "error";
    case "rechazada":
      return "advertencia";
    case "pendiente":
    case "reintentable":
      return "neutro";
    default:
      return "neutro";
  }
}

/* --------------------------------- Módulo -------------------------------- */

function SeccionModulo({ datos }: { datos: ConsolaResp }) {
  return (
    <Section titulo="Estado del módulo">
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Identidad del servicio</span>
            <Badge variant="exito">operativo</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            style={{
              display: "grid",
              gap: "var(--do-sp-4)",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            <CampoDato etiqueta="Servicio">{datos.modulo}</CampoDato>
            <CampoDato etiqueta="Versión">{datos.version}</CampoDato>
            <CampoDato etiqueta="Estados del ciclo de vida">{datos.estados.length}</CampoDato>
            <CampoDato etiqueta="Políticas de autorización">{datos.policies.length}</CampoDato>
          </div>
          <Divider />
          <span
            style={{
              fontSize: "var(--do-text-xs)",
              color: "var(--do-texto-suave)",
              textTransform: "uppercase",
              letterSpacing: "var(--do-tracking-etiquetas)",
            }}
          >
            Estados del ciclo de vida del activo
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-2)", marginTop: "var(--do-sp-2)" }}>
            {datos.estados.map((e) => (
              <Badge key={e} variant="info">{e}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

/* --------------------------- Read models & proyecciones ------------------ */

function SeccionReadModels({
  datos,
  porEstado,
}: {
  datos: ConsolaResp;
  porEstado: [string, number][];
}) {
  return (
    <Section titulo="Read models y proyecciones">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Conteos por read model (CQRS)</span>
          </CardHeader>
          <CardContent>
            <DoTable caption="Read models del módulo de Activos">
              <thead>
                <tr>
                  <th>Read model</th>
                  <th style={{ textAlign: "right" }}>Registros</th>
                  <th>Último evento aplicado</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>act_activos_read</code></td>
                  <td style={{ textAlign: "right" }}>{datos.readModels.activos.total}</td>
                  <td><LastEventId valor={datos.readModels.activos.lastEventId} /></td>
                </tr>
                <tr>
                  <td><code>act_relaciones_read</code></td>
                  <td style={{ textAlign: "right" }}>{datos.readModels.relaciones.total}</td>
                  <td><LastEventId valor={datos.readModels.relaciones.lastEventId} /></td>
                </tr>
                <tr>
                  <td><code>act_historial</code></td>
                  <td style={{ textAlign: "right" }}>{datos.readModels.historial.total}</td>
                  <td><LastEventId valor={datos.readModels.historial.lastEventId} /></td>
                </tr>
              </tbody>
            </DoTable>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Proyección de activos por estado</span>
          </CardHeader>
          <CardContent>
            {porEstado.length === 0 ? (
              <EmptyState
                titulo="Sin activos proyectados"
                descripcion="El read model de activos aún no tiene registros para este tenant."
              />
            ) : (
              <DoTable caption="Distribución del read model de activos por estado">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th style={{ textAlign: "right" }}>Activos</th>
                  </tr>
                </thead>
                <tbody>
                  {porEstado.map(([e, n]) => (
                    <tr key={e}>
                      <td><Badge variant="info">{e}</Badge></td>
                      <td style={{ textAlign: "right" }}>{n}</td>
                    </tr>
                  ))}
                </tbody>
              </DoTable>
            )}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

/* --------------------------------- Outbox -------------------------------- */

function SeccionOutbox({ datos }: { datos: ConsolaResp }) {
  const { pendientes, procesados, ultimos } = datos.outbox;
  return (
    <Section titulo="Outbox del módulo (patrón transaccional)">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
        <Card>
          <CardHeader>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
              <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Estado del outbox</span>
              <Badge variant={pendientes > 0 ? "advertencia" : "exito"}>
                {pendientes > 0 ? `${pendientes} pendientes` : "al día"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div
              style={{
                display: "grid",
                gap: "var(--do-sp-4)",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <CampoDato etiqueta="Eventos pendientes">{pendientes}</CampoDato>
              <CampoDato etiqueta="Eventos procesados">{procesados}</CampoDato>
            </div>
            <Alert variant="info" titulo="Lectura de sólo diagnóstico" style={{ marginTop: "var(--do-sp-3)" }}>
              Lectura de sólo diagnóstico sobre <code>deltaops.kernel_outbox</code> (no reclama registros; no perturba al procesador de outbox).
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Últimos eventos del outbox</span>
          </CardHeader>
          <CardContent>
            {ultimos.length === 0 ? (
              <EmptyState
                titulo="Sin eventos en el outbox"
                descripcion="No hay eventos del módulo registrados en el outbox para este tenant."
              />
            ) : (
              <DoTable caption="Últimos eventos del outbox del módulo">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>Ocurrido</th>
                    <th>Procesado</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimos.map((e) => (
                    <tr key={e.id}>
                      <td><code style={{ fontSize: "var(--do-text-xs)" }}>{e.id}</code></td>
                      <td><code style={{ fontSize: "var(--do-text-xs)" }}>{e.tipo}</code></td>
                      <td>{fmtFecha(e.occurredAt)}</td>
                      <td>
                        {e.processedAt ? (
                          <Badge variant="exito">{fmtFecha(e.processedAt)}</Badge>
                        ) : (
                          <Badge variant="advertencia">pendiente</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DoTable>
            )}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

/* ------------------------------ Sincronización --------------------------- */

const ESTADOS_SYNC = ["pendiente", "aplicada", "idempotente", "conflicto", "rechazada"] as const;

function SeccionSincronizacion({ datos }: { datos: ConsolaResp }) {
  const { total, porEstado, ultimos, conflictos } = datos.sincronizacion;
  return (
    <Section titulo="Sincronización (recibos de operaciones offline)">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
        {conflictos.length > 0 && (
          <Alert variant="error" titulo={`${conflictos.length} conflicto(s) de sincronización`}>
            Hay recibos en estado <code>conflicto</code> que requieren revisión del cliente. Detalle abajo.
          </Alert>
        )}

        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Recibos por estado ({total} en total)</span>
          </CardHeader>
          <CardContent>
            {total === 0 ? (
              <EmptyState
                titulo="Sin recibos de sincronización"
                descripcion="Aún no se han registrado operaciones sincronizadas para este tenant."
              />
            ) : (
              <DoTable caption="Distribución de recibos de sincronización por estado">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th style={{ textAlign: "right" }}>Recibos</th>
                  </tr>
                </thead>
                <tbody>
                  {ESTADOS_SYNC.map((e) => (
                    <tr key={e}>
                      <td><Badge variant={variantEstadoSync(e)}>{e}</Badge></td>
                      <td style={{ textAlign: "right" }}>{porEstado[e] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </DoTable>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Últimos recibos</span>
          </CardHeader>
          <CardContent>
            {ultimos.length === 0 ? (
              <EmptyState titulo="Sin recibos recientes" descripcion="No hay operaciones recientes que mostrar." />
            ) : (
              <DoTable caption="Últimos recibos de sincronización">
                <thead>
                  <tr>
                    <th>Op ID</th>
                    <th>Comando</th>
                    <th>Estado</th>
                    <th>Cliente</th>
                    <th>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimos.map((r) => (
                    <tr key={r.opId}>
                      <td><code style={{ fontSize: "var(--do-text-xs)" }}>{r.opId}</code></td>
                      <td><code style={{ fontSize: "var(--do-text-xs)" }}>{r.comando}</code></td>
                      <td><Badge variant={variantEstadoSync(r.estado)}>{r.estado}</Badge></td>
                      <td><code style={{ fontSize: "var(--do-text-xs)" }}>{r.clienteId}</code></td>
                      <td>{fmtFecha(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </DoTable>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
              <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Conflictos</span>
              <Badge variant={conflictos.length > 0 ? "error" : "exito"}>
                {conflictos.length > 0 ? `${conflictos.length} activo(s)` : "sin conflictos"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {conflictos.length === 0 ? (
              <EmptyState
                titulo="Sin conflictos"
                descripcion="No hay recibos en estado conflicto para este tenant."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
                {conflictos.map((c) => (
                  <div
                    key={c.opId}
                    style={{
                      border: "1px solid var(--do-borde)",
                      borderRadius: "var(--do-radius-md)",
                      padding: "var(--do-sp-3)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--do-sp-2)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
                      <Badge variant="error">conflicto</Badge>
                      <code style={{ fontSize: "var(--do-text-xs)" }}>{c.comando}</code>
                      <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                        opId {c.opId} · cliente {c.clienteId} · {fmtFecha(c.createdAt)}
                      </span>
                    </div>
                    {c.resultado != null && (
                      <pre
                        style={{
                          margin: 0,
                          padding: "var(--do-sp-2)",
                          background: "var(--do-surface-2)",
                          borderRadius: "var(--do-radius-sm)",
                          fontFamily: "var(--do-font-mono)",
                          fontSize: "var(--do-text-xs)",
                          overflowX: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {JSON.stringify(c.resultado, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

/* ------------------------------- Colaboración ---------------------------- */

function SeccionColaboracion({ datos }: { datos: ConsolaResp }) {
  const { timelineModulo, comentarios, adjuntos, activosInspeccionados, truncado, nota } =
    datos.colaboracion;
  return (
    <Section titulo="Colaboración (timeline, comentarios y adjuntos)">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
        {truncado && (
          <Alert variant="advertencia" titulo="Conteo parcial (agregación truncada)">
            {nota}
          </Alert>
        )}
        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Actividad de colaboración</span>
          </CardHeader>
          <CardContent>
            <div
              style={{
                display: "grid",
                gap: "var(--do-sp-4)",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <CampoDato etiqueta="Entradas de timeline (módulo)">{timelineModulo}</CampoDato>
              <CampoDato etiqueta="Comentarios (plataforma)">{comentarios}</CampoDato>
              <CampoDato etiqueta="Adjuntos (plataforma)">{adjuntos}</CampoDato>
              <CampoDato etiqueta="Activos inspeccionados">{activosInspeccionados}</CampoDato>
            </div>
            {!truncado && (
              <Alert variant="info" titulo="Origen del conteo" style={{ marginTop: "var(--do-sp-3)" }}>
                {nota}
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

/* --------------------------- Eventos & políticas ------------------------- */

function SeccionEventos({ datos }: { datos: ConsolaResp }) {
  const eventos = datos.eventos.map((e) => ({
    titulo: <code style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-sm)" }}>{e}</code>,
    tono: "primario" as const,
  }));

  return (
    <Section titulo="Eventos de dominio y políticas de autorización">
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Eventos de dominio ({datos.eventos.length})</span>
          </CardHeader>
          <CardContent>
            <Timeline eventos={eventos} label="Eventos de dominio del módulo" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Políticas ({datos.policies.length})</span>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
              {datos.policies.map((p) => (
                <code key={p} style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-sm)" }}>{p}</code>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

/* ---------------------------- Tipos de relación -------------------------- */

function SeccionRelaciones({ datos }: { datos: ConsolaResp }) {
  return (
    <Section titulo="Tipos de relación entre activos">
      <Card>
        <CardContent>
          <DoTable caption="Catálogo de tipos de relación del módulo">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Inverso</th>
              </tr>
            </thead>
            <tbody>
              {datos.tiposRelacion.map((t) => (
                <tr key={t.tipo}>
                  <td><code>{t.tipo}</code></td>
                  <td><Badge variant="info">{t.categoria}</Badge></td>
                  <td><code>{t.inverso}</code></td>
                </tr>
              ))}
            </tbody>
          </DoTable>
        </CardContent>
      </Card>
    </Section>
  );
}

/* ------------------------- Catálogos & configuración --------------------- */

function SeccionCatalogos({ datos }: { datos: ConsolaResp }) {
  const config = Object.entries(datos.configuracion);
  return (
    <Section titulo="Catálogos y configuración operativa">
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Catálogos configurables ({datos.catalogos.length})</span>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-2)" }}>
              {datos.catalogos.map((c) => (
                <Badge key={c}>{c}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Configuración por defecto</span>
          </CardHeader>
          <CardContent>
            {config.length === 0 ? (
              <EmptyState titulo="Sin configuración" descripcion="No hay claves de configuración para este tenant." />
            ) : (
              <DoTable caption="Configuración operativa del módulo">
                <thead>
                  <tr>
                    <th>Clave</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {config.map(([k, v]) => (
                    <tr key={k}>
                      <td><code>{k}</code></td>
                      <td><code>{v === "" ? "—" : v}</code></td>
                    </tr>
                  ))}
                </tbody>
              </DoTable>
            )}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

/* ------------------------------ RLS -------------------------------------- */

function SeccionRls({ datos }: { datos: ConsolaResp }) {
  return (
    <Section titulo="Verificación de aislamiento (Row-Level Security)">
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Tablas con RLS por tenant</span>
            <Badge variant="exito">aislado</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="info" titulo="Estrategia de aislamiento">
            <code style={{ fontFamily: "var(--do-font-mono)" }}>{datos.rls.aislamiento}</code>
          </Alert>
          <div style={{ marginTop: "var(--do-sp-3)" }}>
            <DoTable caption="Tablas del módulo protegidas por RLS">
              <thead>
                <tr>
                  <th>Tabla</th>
                  <th>Política</th>
                </tr>
              </thead>
              <tbody>
                {datos.rls.tablas.map((t) => (
                  <tr key={t}>
                    <td><code>{t}</code></td>
                    <td><Badge variant="exito">RLS activo</Badge></td>
                  </tr>
                ))}
              </tbody>
            </DoTable>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}
