/**
 * DGP-018 · Centro Operacional (landing EMPRESARIAL del tenant).
 *
 * Evoluciona la landing de identidad (DGP-017) hacia el "Centro Operacional":
 * saludo, resumen operacional con datos REALES del read model de Órdenes,
 * trabajo de hoy, activos que requieren atención, próximos mantenimientos,
 * alertas operacionales y accesos rápidos, todo variando por ROL y respetando
 * capacidades/entitlements de la sesión. Es COMPOSICIÓN pura sobre superficies
 * y contratos ya existentes: no abre endpoints, no duplica lógica de dominio ni
 * fichas, no inventa métricas. Cada sección sin fuente real se oculta o muestra
 * su estado vacío correcto. NUNCA muestra la consola técnica global (SUPER_ADMIN).
 */
import React, { useMemo } from "react";
import { Link } from "wouter";
import {
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  EmptyState,
  ErrorState,
  Spinner,
  Alert,
  KpiCard,
} from "@workspace/design-system";
import {
  ArrowRight,
  Building2,
  Users,
  SlidersHorizontal,
  ClipboardList,
  PackagePlus,
  Gauge,
  Boxes,
  QrCode,
  CalendarDays,
  ListChecks,
  WifiOff,
  RefreshCw,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { AppShellIdentidad } from "@/lib/identidad/AppShell";
import { useSesionActiva, useSesion } from "@/lib/identidad/sesion";
import {
  landingOperacional,
  nombreRol,
  moduloHabilitado,
  esAdminEmpresa,
} from "@/lib/identidad/rbac";
import { useOrdenesGlobal } from "@/lib/ecosistema/hooks";
import { OfflineProvider, useOffline } from "@/lib/offline/contexto";
import { BadgeEstado, BadgePrioridad } from "@/lib/ordenes/componentes";
import { estadoSla, tonoRiesgo } from "@/lib/ecosistema/sla";
import { urlOrden, urlActivo, urlOrdenesDeActivo, urlNuevaOrden } from "@/lib/ecosistema/deep-links";
import {
  resumenOperacional,
  activosConOrdenes,
  alertasOperacionales,
  ordenesDeHoy,
  type ResumenOperacional,
} from "@/lib/centro/resumen";
import {
  urlEjecutarOrden,
  urlBandejaOrdenes,
  RUTA_ESCANEAR_ACTIVO,
  INTEGRACIONES,
  ordenAsignadaAIdentidad,
  type AccesoModulo,
} from "@/lib/centro/enlaces";
import type { OrdenRow } from "@/lib/ordenes/tipos";
import type { Sesion, Rol } from "@/lib/identidad/tipos";

const gapCol = { display: "flex", flexDirection: "column" as const, gap: "var(--do-sp-6)" };
const gridAuto = (min = 200) => ({
  display: "grid" as const,
  gap: "var(--do-sp-4)",
  // minmax(min(Xpx, 100%), 1fr) evita desbordes en móviles muy estrechos y
  // colapsa a una sola columna: responsive real desktop→tablet→mobile.
  gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`,
  marginTop: "var(--do-sp-3)",
});
/** Objetivo táctil ≥48px (mandato §13) para toda la superficie nueva. */
const botonTactil = { minHeight: 48 } as const;

/** ¿El rol puede ejecutar escrituras de negocio (crear OT/activo, registrar)? */
function puedeEscribir(rol: Rol): boolean {
  return rol !== "CONSULTA";
}

/* ------------------------------- Saludo -------------------------------- */

function Saludo({ sesion }: { sesion: Sesion }) {
  return (
    <Section titulo={`Bienvenido, ${sesion.nombre}`}>
      <p style={{ color: "var(--do-texto-suave)", marginTop: "var(--do-sp-2)" }}>
        <Building2 size={16} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {sesion.tenant.nombre}
        {" · "}
        <Badge variant="info">{nombreRol(sesion.rol)}</Badge>
      </p>
    </Section>
  );
}

/* --------------------- ¿Qué necesita tu atención? ---------------------- */

/**
 * DELTAOPS LITE-03 §2 · Encabezado ACCIONABLE del inicio. Responde "¿qué
 * necesita tu atención?" con las señales reales del resumen (SLA vencido/en
 * riesgo, sin asignar, críticas) traducidas a tarjetas con acción directa a la
 * superficie que resuelve cada una. Es composición pura sobre `alertasOperacionales`
 * (sin sistema de alertas nuevo). Si no hay nada urgente, muestra un estado
 * positivo honesto en lugar de vacío frío. Los destinos son deep links a las
 * bandejas de Órdenes ya existentes: no se crean rutas.
 */
function AtencionAhora({ resumen }: { resumen: ResumenOperacional | null }) {
  const alertas = resumen ? alertasOperacionales(resumen) : [];
  // Destino accionable por señal, SIEMPRE a una bandeja REAL existente del
  // Centro de Operaciones (BANDEJAS de ordenes/constantes). No se inventan
  // bandejas: "sin asignar" no tiene bandeja propia → se dirige a la lista
  // general de Órdenes, donde el filtro de responsable ya está disponible.
  const rutaPorClave: Record<string, string> = {
    "sla-vencido": urlBandejaOrdenes("vencer"),
    "sla-riesgo": urlBandejaOrdenes("vencer"),
    "sin-asignar": "/ordenes",
    criticas: urlBandejaOrdenes("criticas"),
  };
  return (
    <Section titulo="¿Qué necesita tu atención?">
      {alertas.length === 0 ? (
        <Alert variant="info" titulo="Todo bajo control">
          No hay órdenes vencidas, en riesgo, sin asignar ni críticas en este momento.
        </Alert>
      ) : (
        <div style={gridAuto(240)}>
          {alertas.map((a) => (
            <Card key={a.clave} style={{ borderColor: a.tono === "error" ? "var(--do-error)" : undefined }}>
              <CardContent>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
                  <Badge variant={a.tono}>{a.cantidad}</Badge>
                  <strong style={{ fontSize: "var(--do-text-base)" }}>{a.titulo}</strong>
                </div>
                <div style={{ marginTop: "var(--do-sp-3)" }}>
                  <Link href={rutaPorClave[a.clave] ?? "/ordenes"}>
                    <Button variant="secundario" size="md" style={botonTactil}>
                      Revisar <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ------------------------- Resumen operacional ------------------------- */

function ResumenOperacionalSeccion({
  resumen,
  cargando,
  error,
  onReintentar,
}: {
  resumen: ResumenOperacional | null;
  cargando: boolean;
  error: unknown;
  onReintentar: () => void;
}) {
  return (
    <Section titulo="Resumen operacional">
      {cargando ? (
        <div style={{ padding: "var(--do-sp-4)" }}>
          <Spinner label="Cargando resumen operacional" />
        </div>
      ) : error ? (
        <ErrorState
          descripcion="No fue posible cargar el resumen operacional."
          onReintentar={onReintentar}
        />
      ) : !resumen || resumen.abiertas.length === 0 ? (
        <EmptyState
          titulo="Sin órdenes abiertas"
          descripcion="No hay órdenes de trabajo abiertas en este momento."
        />
      ) : (
        <div style={gridAuto(200)}>
          <KpiCard titulo="Abiertas" valor={resumen.abiertas.length} icono={ClipboardList} />
          <KpiCard titulo="En ejecución" valor={resumen.enEjecucion.length} icono={Gauge} />
          <KpiCard titulo="Pendientes" valor={resumen.pendientes.length} icono={ListChecks} />
          <KpiCard titulo="SLA vencido" valor={resumen.vencidas.length} />
          <KpiCard titulo="SLA en riesgo" valor={resumen.enRiesgo.length} />
          <KpiCard titulo="Sin asignar" valor={resumen.sinAsignar.length} />
        </div>
      )}
    </Section>
  );
}

/* ------------------------ Alertas operacionales ------------------------ */

function AlertasSeccion({ resumen }: { resumen: ResumenOperacional | null }) {
  const alertas = resumen ? alertasOperacionales(resumen) : [];
  if (alertas.length === 0) return null;
  return (
    <Section titulo="Alertas operacionales">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)", marginTop: "var(--do-sp-3)" }}>
        {alertas.map((a) => (
          <Alert key={a.clave} variant={a.tono} titulo={`${a.cantidad} · ${a.titulo}`}>
            <Link href="/centro">
              <Button variant="fantasma" size="md" style={botonTactil}>
                Ver en el centro de mantenimiento <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
          </Alert>
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------- Lista de OT ----------------------------- */

function FilaOrden({ orden, ahora, ejecutar = false }: { orden: OrdenRow; ahora: number; ejecutar?: boolean }) {
  const sla = estadoSla(orden, ahora);
  const etiquetaActivo = (orden.datos?.activoPrincipal?.etiqueta as string | undefined) ?? orden.activoPrincipalId;
  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--do-sp-2)" }}>
          <strong>{orden.codigo}</strong>
          <span style={{ color: "var(--do-texto-suave)" }}>{orden.titulo}</span>
          <BadgeEstado estado={orden.estado} />
          <BadgePrioridad prioridad={orden.prioridad} />
          {sla.riesgo !== "sin-sla" && <Badge variant={tonoRiesgo(sla.riesgo)}>SLA: {sla.etiqueta}</Badge>}
          {orden.responsable ? (
            <Badge variant="neutro">{orden.responsable}</Badge>
          ) : (
            <Badge variant="advertencia">Sin asignar</Badge>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-2)", marginTop: "var(--do-sp-3)" }}>
          {ejecutar && (
            <Link href={urlEjecutarOrden(orden.id)}>
              <Button variant="primario" size="md" style={botonTactil}>
                <Wrench size={16} aria-hidden="true" /> Ejecutar
              </Button>
            </Link>
          )}
          {etiquetaActivo && orden.activoPrincipalId && (
            <Link href={urlActivo(orden.activoPrincipalId)}>
              <Button variant="fantasma" size="md" style={botonTactil}>Ver activo</Button>
            </Link>
          )}
          <Link href={urlOrden(orden.id)}>
            <Button variant="secundario" size="md" style={botonTactil}>
              Abrir <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function TrabajoDeHoy({
  titulo,
  ordenes,
  vacioTitulo,
  vacioDescripcion,
  ahora,
  verTodoRuta,
  ejecutar = false,
}: {
  titulo: string;
  ordenes: OrdenRow[];
  vacioTitulo: string;
  vacioDescripcion: string;
  ahora: number;
  verTodoRuta: string;
  ejecutar?: boolean;
}) {
  const visibles = ordenes.slice(0, 8);
  return (
    <Section
      titulo={titulo}
      acciones={
        <Link href={verTodoRuta}>
          <Button variant="fantasma" size="md" style={botonTactil}>
            Ver todo <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </Link>
      }
    >
      {visibles.length === 0 ? (
        <EmptyState titulo={vacioTitulo} descripcion={vacioDescripcion} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)", marginTop: "var(--do-sp-3)" }}>
          {visibles.map((o) => (
            <FilaOrden key={o.id} orden={o} ahora={ahora} ejecutar={ejecutar} />
          ))}
        </div>
      )}
    </Section>
  );
}

/* --------------------- Activos que requieren atención ------------------ */

function ActivosAtencion({ ordenes, ahora }: { ordenes: OrdenRow[]; ahora: number }) {
  const grupos = useMemo(() => activosConOrdenes(ordenes, ahora).filter((g) => g.requiereAtencion).slice(0, 6), [ordenes, ahora]);
  if (grupos.length === 0) return null;
  return (
    <Section titulo="Activos que requieren atención">
      <div style={gridAuto(260)}>
        {grupos.map((g) => (
          <Card key={g.activoId}>
            <CardContent>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <strong>{g.etiqueta}</strong>
                <Badge variant="advertencia">{g.ordenes.length} OT</Badge>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-2)", marginTop: "var(--do-sp-3)" }}>
                <Link href={urlActivo(g.activoId)}>
                  <Button variant="secundario" size="md" style={botonTactil}>Vista 360°</Button>
                </Link>
                <Link href={urlOrdenesDeActivo(g.activoId)}>
                  <Button variant="fantasma" size="md" style={botonTactil}>Sus órdenes</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------- Accesos rápidos --------------------------- */

interface AccesoRapido {
  clave: string;
  etiqueta: string;
  ruta: string;
  icono: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  /** Requiere capacidad de escritura (oculto para CONSULTA). */
  escritura?: boolean;
  /** Módulo requerido (entitlement). */
  modulo?: Parameters<typeof moduloHabilitado>[1];
}

function AccesosRapidos({ sesion }: { sesion: Sesion }) {
  const escribir = puedeEscribir(sesion.rol);
  const todos: AccesoRapido[] = [
    { clave: "nueva-ot", etiqueta: "Nueva orden", ruta: urlNuevaOrden(), icono: ClipboardList, escritura: true, modulo: "ordenes" },
    { clave: "nuevo-activo", etiqueta: "Nuevo activo", ruta: "/activos/nuevo", icono: PackagePlus, escritura: true, modulo: "activos" },
    { clave: "registrar-lectura", etiqueta: "Registrar lectura", ruta: "/activos", icono: Gauge, escritura: true, modulo: "activos" },
    { clave: "inventario", etiqueta: "Inventario", ruta: "/inventario", icono: Boxes, modulo: "inventario" },
    { clave: "escanear-qr", etiqueta: "Escanear QR", ruta: "/activos?accion=qr", icono: QrCode, modulo: "activos" },
    { clave: "calendario", etiqueta: "Calendario", ruta: "/planes/calendario", icono: CalendarDays, modulo: "planes" },
    { clave: "mis-ordenes", etiqueta: "Mis órdenes", ruta: "/ordenes", icono: ListChecks, modulo: "ordenes" },
  ];
  const visibles = todos.filter((a) => {
    if (a.escritura && !escribir) return false;
    if (a.modulo && !moduloHabilitado(sesion, a.modulo)) return false;
    return true;
  });
  if (visibles.length === 0) return null;
  return (
    <Section titulo="Accesos rápidos">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-3)", marginTop: "var(--do-sp-3)" }}>
        {visibles.map((a) => {
          const Icono = a.icono;
          return (
            <Link key={a.clave} href={a.ruta}>
              <Button variant="secundario" size="md" style={{ minHeight: 48 }}>
                <Icono size={18} aria-hidden={true} /> {a.etiqueta}
              </Button>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

/* --------------------------- Estado offline ---------------------------- */

/**
 * Estado offline/sincronización del TECNICO. Se envuelve en su propio
 * OfflineProvider (público) leyendo la cola persistente del tenant: la landing
 * de identidad no está bajo un provider de módulo, así que refleja el estado
 * real de la cola sin depender de una superficie concreta.
 */
function EstadoOffline({ tenant }: { tenant: string }) {
  return (
    <OfflineProvider tenant={tenant} modulo="ordenes">
      <EstadoOfflineContenido />
    </OfflineProvider>
  );
}

function EstadoOfflineContenido() {
  const { enLinea, pendientes } = useOffline();
  if (enLinea && pendientes === 0) return null;
  return (
    <Alert
      variant={enLinea ? "info" : "advertencia"}
      titulo={enLinea ? "Sincronización pendiente" : "Trabajando sin conexión"}
    >
      {enLinea ? (
        <span>
          <RefreshCw size={16} aria-hidden="true" style={{ verticalAlign: "-3px" }} /> {pendientes} operación(es) en cola de
          sincronización.
        </span>
      ) : (
        <span>
          <WifiOff size={16} aria-hidden="true" style={{ verticalAlign: "-3px" }} /> Sin conexión. Tus cambios se guardan
          localmente y se sincronizarán al reconectar
          {pendientes > 0 ? ` (${pendientes} pendiente${pendientes === 1 ? "" : "s"})` : ""}.
        </span>
      )}
    </Alert>
  );
}

/* -------------------------- Punto de partida --------------------------- */

function PuntoDePartida({ sesion }: { sesion: Sesion }) {
  const landing = landingOperacional(sesion);
  if (!landing) return null;
  return (
    <Section titulo="Tu punto de partida">
      <Card style={{ borderColor: "var(--do-primario)", borderWidth: 2, marginTop: "var(--do-sp-3)" }}>
        <CardContent>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <h3 style={{ margin: 0, fontSize: "var(--do-text-lg)" }}>{landing.etiqueta}</h3>
                <Badge variant="primario">Recomendado</Badge>
              </div>
              <p style={{ margin: "var(--do-sp-2) 0 0", color: "var(--do-texto-suave)" }}>
                Superficie operacional destacada para tu perfil.
              </p>
            </div>
            <Link href={landing.ruta}>
              <Button variant="primario" size="md" style={{ minHeight: 48 }}>
                Abrir <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

/* -------------------------- Administración ----------------------------- */

function AdministracionSeccion() {
  const { capacidades } = useSesion();
  if (!capacidades.administrarUsuarios && !capacidades.configurarEmpresa) return null;
  return (
    <Section titulo="Administración de la empresa">
      <div style={gridAuto(240)}>
        {capacidades.administrarUsuarios && (
          <Card>
            <CardHeader>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <Users size={18} aria-hidden="true" /> Usuarios
              </span>
            </CardHeader>
            <CardContent>
              <p style={{ margin: "0 0 var(--do-sp-3)", color: "var(--do-texto-suave)" }}>
                Gestiona usuarios, roles e invitaciones de tu empresa.
              </p>
              <Link href="/administracion/usuarios">
                <Button variant="secundario" size="md" style={botonTactil}>Administrar usuarios</Button>
              </Link>
            </CardContent>
          </Card>
        )}
        {capacidades.configurarEmpresa && (
          <Card>
            <CardHeader>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <SlidersHorizontal size={18} aria-hidden="true" /> Configuración
              </span>
            </CardHeader>
            <CardContent>
              <p style={{ margin: "0 0 var(--do-sp-3)", color: "var(--do-texto-suave)" }}>
                Idioma, zona horaria, moneda, branding y notificaciones.
              </p>
              <Link href="/administracion/configuracion">
                <Button variant="secundario" size="md" style={botonTactil}>Configurar empresa</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </Section>
  );
}

/* ------------------ TECNICO · foco de ejecución móvil ------------------ */

/**
 * Bloque prioritario del TÉCNICO, pensado mobile-first (aparece primero en el
 * DOM → primero en pantalla estrecha). Prioriza: orden prioritaria (ejecutar),
 * escanear QR y acceso a "mis órdenes". La ejecución de checklist/formulario/
 * evidencia/medidor/recursos/firma/cierre se abre por deep link a la pestaña
 * de ejecución de la OT (no se duplica la ficha).
 *
 * Gap bloqueante G-1: SÓLO se muestra/ofrece "Ejecutar" sobre una OT si está
 * asignada INEQUÍVOCAMENTE a la identidad de la sesión (match estricto con
 * `identityId`/`email`). Sin match, el foco es conservador: bandeja oficial
 * "Mis órdenes", escanear QR y estado vacío. Nunca se atribuye trabajo ajeno.
 */
function FocoTecnico({
  sesion,
  ordenesPropias,
  ahora,
}: {
  sesion: Sesion;
  /** OTs asignadas ESTRICTAMENTE a la identidad de la sesión (ya filtradas). */
  ordenesPropias: OrdenRow[];
  ahora: number;
}) {
  const tieneOrdenes = moduloHabilitado(sesion, "ordenes");
  const tieneActivos = moduloHabilitado(sesion, "activos");
  // Orden prioritaria: dentro de LAS PROPIAS, la primera vencida/en riesgo; si
  // ninguna está en riesgo, la primera propia. Nunca una OT de otro responsable.
  const prioritaria =
    ordenesPropias.find((o) => estadoSla(o, ahora).riesgo === "vencido") ??
    ordenesPropias.find((o) => estadoSla(o, ahora).riesgo === "critico") ??
    ordenesPropias.find((o) => estadoSla(o, ahora).riesgo === "riesgo") ??
    ordenesPropias[0] ??
    null;
  return (
    <Section titulo="Tu foco ahora">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)", marginTop: "var(--do-sp-3)" }}>
        {tieneOrdenes && prioritaria ? (
          <div>
            <p style={{ margin: "0 0 var(--do-sp-2)", color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
              <AlertTriangle size={16} aria-hidden="true" style={{ verticalAlign: "-3px" }} /> Orden prioritaria
            </p>
            <FilaOrden orden={prioritaria} ahora={ahora} ejecutar />
          </div>
        ) : tieneOrdenes ? (
          <EmptyState
            titulo="No tienes órdenes asignadas para hoy"
            descripcion="Abre «Mis órdenes» para ver tu bandeja oficial o escanea un activo para empezar."
          />
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-3)" }}>
          {tieneActivos && (
            <Link href={RUTA_ESCANEAR_ACTIVO}>
              <Button variant="secundario" size="md" style={botonTactil}>
                <QrCode size={18} aria-hidden={true} /> Escanear QR
              </Button>
            </Link>
          )}
          {tieneOrdenes && (
            <Link href="/ordenes">
              <Button variant="secundario" size="md" style={botonTactil}>
                <ListChecks size={18} aria-hidden={true} /> Mis órdenes
              </Button>
            </Link>
          )}
          {tieneOrdenes && (
            <Link href={urlBandejaOrdenes("ejecucion")}>
              <Button variant="fantasma" size="md" style={botonTactil}>
                <Wrench size={18} aria-hidden={true} /> En ejecución
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ----------------------- Integraciones por módulo ---------------------- */

/**
 * Accesos de integración a los módulos operativos (mandato §8-12) vía rutas y
 * deep links existentes. Se muestran sólo los módulos habilitados (entitlement).
 * Los accesos son de navegación (lectura), aptos para todos los roles con el
 * módulo; las escrituras siguen gated en sus propias superficies + backend.
 */
function IntegracionesSeccion({ sesion }: { sesion: Sesion }) {
  const bloques = (Object.keys(INTEGRACIONES) as Array<keyof typeof INTEGRACIONES>)
    .filter((m) => moduloHabilitado(sesion, m as Parameters<typeof moduloHabilitado>[1]))
    .map((m) => ({ modulo: m, accesos: INTEGRACIONES[m] as AccesoModulo[] }));
  if (bloques.length === 0) return null;
  const nombreModulo: Record<string, string> = {
    activos: "Activos",
    ordenes: "Órdenes",
    inventario: "Inventario",
    planes: "Planes",
    preventivo: "Preventivo",
    abastecimiento: "Abastecimiento",
  };
  return (
    <Section titulo="Explorar por módulo">
      <div style={gridAuto(260)}>
        {bloques.map((b) => (
          <Card key={b.modulo}>
            <CardHeader>{nombreModulo[b.modulo] ?? b.modulo}</CardHeader>
            <CardContent>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
                {b.accesos.map((a) => (
                  <Link key={a.clave} href={a.ruta}>
                    <Button variant="fantasma" size="md" style={{ ...botonTactil, justifyContent: "flex-start", width: "100%" }}>
                      {a.etiqueta} <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------- Composición ------------------------------- */

/**
 * Título y bandeja "de hoy" según el rol (composición de presentación).
 *
 * Para TECNICO, "Mi trabajo" se limita a las OTs asignadas ESTRICTAMENTE a la
 * identidad de la sesión (G-1): nunca OTs de otros responsables del tenant.
 * SUPERVISOR/PLANIFICADOR/otros ven la operación del tenant (correcto): sus
 * secciones son de supervisión/planificación, no atribución "asignada a mí".
 */
function trabajoPorRol(
  sesion: Sesion,
  resumen: ResumenOperacional,
  ordenes: OrdenRow[],
  ahora: number,
): {
  titulo: string;
  ordenes: OrdenRow[];
  vacioTitulo: string;
  vacioDescripcion: string;
} {
  switch (sesion.rol) {
    case "TECNICO":
      return {
        titulo: "Mi trabajo de hoy",
        ordenes: ordenesDeHoy(ordenes, ahora).filter((o) => ordenAsignadaAIdentidad(o.responsable, sesion)),
        vacioTitulo: "No tienes órdenes asignadas para hoy",
        vacioDescripcion: "Cuando se te asignen órdenes con trabajo para hoy, aparecerán aquí.",
      };
    case "SUPERVISOR":
      return {
        titulo: "Prioridades de supervisión",
        ordenes: [...resumen.vencidas, ...resumen.enRiesgo].map((x) => x.o).concat(resumen.sinAsignar),
        vacioTitulo: "Sin prioridades pendientes",
        vacioDescripcion: "No hay órdenes vencidas, en riesgo ni sin asignar.",
      };
    case "PLANIFICADOR":
      return {
        titulo: "Pendiente de planificar",
        ordenes: resumen.pendientes,
        vacioTitulo: "Sin órdenes pendientes de planificar",
        vacioDescripcion: "No hay órdenes abiertas pendientes de programación.",
      };
    default:
      return {
        titulo: "Trabajo de hoy",
        ordenes: ordenesDeHoy(ordenes, ahora),
        vacioTitulo: "Sin trabajo programado para hoy",
        vacioDescripcion: "No hay órdenes con inicio o vencimiento previsto para hoy.",
      };
  }
}

function ContenidoInicio() {
  const sesion = useSesionActiva();
  const tieneOrdenes = moduloHabilitado(sesion, "ordenes");

  // Read model REAL de órdenes (sólo si el módulo está habilitado). Es el
  // CONTENIDO que se dispara al montar la Home tras login: `toleraNoAutorizado`
  // evita que un 401 transitorio (cookie recién emitida aún no propagada) haga
  // una redirección DURA a /login y deje al usuario varado allí; la autoridad de
  // sesión (useSesion) es la única que redirige. Ver LITE-03 · fix carrera.
  const { datos, cargando, error, recargar } = useOrdenesGlobal(
    tieneOrdenes ? { limit: 200 } : { limit: 0 },
    { toleraNoAutorizado: true },
  );
  const ahora = Date.now();
  const ordenes = datos ?? [];
  const resumen = useMemo(
    () => (tieneOrdenes ? resumenOperacional(ordenes, ahora) : null),
    [tieneOrdenes, ordenes, ahora],
  );

  const trabajo = resumen ? trabajoPorRol(sesion, resumen, ordenes, ahora) : null;

  const esTecnico = sesion.rol === "TECNICO";
  // OTs asignadas ESTRICTAMENTE a la identidad de la sesión (G-1): base del foco
  // del técnico. Sin match estricto → lista vacía → estado vacío conservador.
  const ordenesPropias = useMemo(
    () =>
      resumen && esTecnico
        ? ordenes.filter((o) => ordenAsignadaAIdentidad(o.responsable, sesion))
        : [],
    [resumen, esTecnico, ordenes, sesion],
  );

  return (
    <div style={gapCol}>
      <Saludo sesion={sesion} />

      {/*
        TECNICO mobile-first: estado offline + foco de ejecución primero en el
        DOM (aparecen arriba en pantalla estrecha). El resto de roles ven su
        punto de partida operacional.
      */}
      {esTecnico && <EstadoOffline tenant={sesion.tenant.id} />}

      {esTecnico && !cargando && !error && resumen && (
        <FocoTecnico sesion={sesion} ordenesPropias={ordenesPropias} ahora={ahora} />
      )}

      {/*
        LITE-03 §2 · PRIMER PLANO ACCIONABLE. Lo urgente ("¿qué necesita tu
        atención?") encabeza la experiencia de todos los roles con Órdenes; el
        punto de partida operacional lo sigue para roles no-técnicos.
      */}
      {tieneOrdenes && !cargando && !error && <AtencionAhora resumen={resumen} />}

      {!esTecnico && <PuntoDePartida sesion={sesion} />}

      {tieneOrdenes && (
        <ResumenOperacionalSeccion
          resumen={resumen}
          cargando={cargando}
          error={error}
          onReintentar={recargar}
        />
      )}

      {tieneOrdenes && !cargando && !error && <AlertasSeccion resumen={resumen} />}

      {tieneOrdenes && !cargando && !error && trabajo && (
        <TrabajoDeHoy
          titulo={trabajo.titulo}
          ordenes={trabajo.ordenes}
          vacioTitulo={trabajo.vacioTitulo}
          vacioDescripcion={trabajo.vacioDescripcion}
          ahora={ahora}
          verTodoRuta="/ordenes"
          ejecutar={esTecnico}
        />
      )}

      {tieneOrdenes && !cargando && !error && !esTecnico && (
        <ActivosAtencion ordenes={ordenes} ahora={ahora} />
      )}

      <AccesosRapidos sesion={sesion} />

      {/*
        SEGUNDO PLANO · exploración. LITE-03 §1 retira la parrilla "Módulos
        disponibles" del primer plano (la navegación por proceso ya cubre el
        descubrimiento de módulos). Se conserva "Explorar por módulo" como
        acceso secundario a integraciones profundas, más abajo en el flujo.
      */}
      <IntegracionesSeccion sesion={sesion} />

      {esAdminEmpresa(sesion.rol) && <AdministracionSeccion />}
    </div>
  );
}

export default function InicioEmpresa() {
  return (
    <AppShellIdentidad>
      <ContenidoInicio />
    </AppShellIdentidad>
  );
}
