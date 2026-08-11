/**
 * DeltaOps · Selección del proveedor de notificaciones por correo.
 *
 * Configuration First + Clean Architecture: los módulos de negocio NUNCA
 * eligen proveedor; dependen solo de `EmailNotificationPort`. Aquí se resuelve
 * el adaptador concreto según `NOTIFICATION_PROVIDER`:
 *
 *   NOTIFICATION_PROVIDER=fake        → FakeEmailProvider (solo dev/test).
 *   NOTIFICATION_PROVIDER=m365-graph  → M365GraphEmailProvider (Microsoft Graph).
 *   (futuro)                          → otro adaptador tras el mismo puerto.
 *
 * El proveedor de PRODUCCIÓN es Microsoft Graph. Ya NO existe adaptador SMTP.
 *
 * Reglas de seguridad (mandato):
 *   - En PRODUCCIÓN, si se pide `m365-graph` y la config es inválida/incompleta
 *     ⇒ FAIL FAST (throw al arrancar). NUNCA fallback silencioso a fake.
 *   - Fake SOLO explícito en development/test.
 *   - Cero secretos en logs (solo nombres de variables faltantes).
 */
import {
  FakeEmailProvider,
  setEmailProvider,
  type EmailNotificationPort,
} from "./email";
import {
  GraphOAuthClient,
  M365GraphEmailProvider,
  resolverConfigGraph,
  type ConfigGraph,
  type FetchLike,
  type RelojMs,
} from "./m365-graph-email";

export type NombreProveedor = "fake" | "m365-graph";

export interface LoggerLike {
  info: (o: unknown, m?: string) => void;
  warn: (o: unknown, m?: string) => void;
  error: (o: unknown, m?: string) => void;
}

const consoleLogger: LoggerLike = {
  info: (o, m) => console.info(m ?? "", o),
  warn: (o, m) => console.warn(m ?? "", o),
  error: (o, m) => console.error(m ?? "", o),
};

export interface ResolverProviderDeps {
  env?: NodeJS.ProcessEnv;
  logger?: LoggerLike;
  /** `fetch` para OAuth y para Graph (default: global fetch). */
  fetch?: FetchLike;
  /** reloj para caché de token (default: Date.now). */
  now?: RelojMs;
}

/** Proveedor solicitado por entorno. Default `fake` (dev/test). */
export function proveedorSolicitado(env: NodeJS.ProcessEnv = process.env): NombreProveedor {
  const v = (env.NOTIFICATION_PROVIDER ?? "").trim().toLowerCase();
  if (v === "m365-graph" || v === "graph") return "m365-graph";
  return "fake";
}

const defaultFetch: FetchLike = (url, init) =>
  // Runtime real: usa fetch global. En tests se inyecta un doble.
  (globalThis.fetch as unknown as FetchLike)(url, init);

/**
 * Construye el M365GraphEmailProvider a partir de una config validada (fábrica
 * reutilizada por el resolver y por la prueba de conexión/smoke).
 */
export function construirProveedorGraph(
  config: ConfigGraph,
  deps: ResolverProviderDeps = {},
): { provider: M365GraphEmailProvider; oauth: GraphOAuthClient } {
  const fetch = deps.fetch ?? defaultFetch;
  const oauth = new GraphOAuthClient(config, {
    fetch,
    now: deps.now ?? (() => Date.now()),
  });
  const provider = new M365GraphEmailProvider(config, {
    oauth,
    fetch,
    logger: deps.logger ?? consoleLogger,
  });
  return { provider, oauth };
}

/**
 * Resuelve el proveedor de correo según configuración y entorno.
 * - fake: FakeEmailProvider (solo dev/test explícito).
 * - m365-graph: valida config; si falla, en producción THROW (fail fast), en
 *   dev/test fallback a fake (logueado).
 */
export function resolverProveedorNotificaciones(
  deps: ResolverProviderDeps = {},
): EmailNotificationPort {
  const env = deps.env ?? process.env;
  const logger = deps.logger ?? consoleLogger;
  const esProduccion = (env.NODE_ENV ?? "development") === "production";
  const solicitado = proveedorSolicitado(env);

  if (solicitado === "fake") {
    if (esProduccion) {
      // El proveedor de producción debe ser Graph: fake explícito en prod es un
      // error de configuración, no un modo de operación válido.
      throw new Error(
        "NOTIFICATION_PROVIDER=fake no es válido en producción. " +
          "El proveedor de producción es Microsoft Graph (m365-graph).",
      );
    }
    return new FakeEmailProvider();
  }

  // Solicitado m365-graph.
  const cfg = resolverConfigGraph(env);
  if (!cfg.ok) {
    const campos = cfg.issues.map((i) => i.campo).join(", ");
    if (esProduccion) {
      // FAIL FAST: NUNCA fallback silencioso en producción.
      throw new Error(
        `NOTIFICATION_PROVIDER=m365-graph en producción con configuración inválida. ` +
          `Variables inválidas/ausentes: ${campos}`,
      );
    }
    logger.warn(
      { proveedorSolicitado: "m365-graph", fallback: "fake", variablesFaltantes: campos },
      "Microsoft Graph mal configurado en dev/test: usando FakeEmailProvider",
    );
    return new FakeEmailProvider();
  }

  const { provider } = construirProveedorGraph(cfg.config, deps);
  logger.info(
    { proveedor: "m365-graph", graphBaseUrl: cfg.config.graphBaseUrl },
    "Proveedor de notificaciones: Microsoft Graph",
  );
  return provider;
}

/**
 * Instala el proveedor resuelto como singleton usado por `enqueueEmail`.
 * Se invoca en el arranque (`app.ts`). En producción con Graph mal configurado,
 * lanza aquí (FAIL FAST al arrancar), conforme al mandato.
 */
export function instalarProveedorNotificaciones(
  deps: ResolverProviderDeps = {},
): EmailNotificationPort {
  const p = resolverProveedorNotificaciones(deps);
  setEmailProvider(p);
  return p;
}
