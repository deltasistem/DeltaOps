/**
 * DeltaOps · Selección del proveedor de notificaciones por correo.
 *
 * Configuration First + Clean Architecture: los módulos de negocio NUNCA
 * eligen proveedor; dependen solo de `EmailNotificationPort`. Aquí se resuelve
 * el adaptador concreto según `NOTIFICATION_PROVIDER`:
 *
 *   NOTIFICATION_PROVIDER=fake   → FakeEmailProvider (default dev/test).
 *   NOTIFICATION_PROVIDER=m365   → M365EmailProvider (SMTP + OAuth2).
 *   (futuro)                     → otro adaptador tras el mismo puerto.
 *
 * Reglas de seguridad (mandato):
 *   - En PRODUCCIÓN, si se pide `m365` y la config es inválida/incompleta ⇒
 *     FALLO EXPLÍCITO (throw). NUNCA fallback silencioso a fake.
 *   - Fallback a fake SOLO en development/test y SIEMPRE logueado.
 *   - Cero secretos en logs (se registran nombres de variables faltantes, nunca
 *     sus valores).
 */
import {
  FakeEmailProvider,
  setEmailProvider,
  type EmailNotificationPort,
} from "./email";
import {
  M365EmailProvider,
  M365OAuthClient,
  resolverConfigM365,
  type ConfigM365,
  type FetchLike,
  type RelojMs,
} from "./m365-email";

export type NombreProveedor = "fake" | "m365";

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
  /** `fetch` para el cliente OAuth (default: global fetch). */
  fetch?: FetchLike;
  /** reloj para caché de token (default: Date.now). */
  now?: RelojMs;
}

/** `true` si el proveedor solicitado por entorno es m365. */
export function proveedorSolicitado(env: NodeJS.ProcessEnv = process.env): NombreProveedor {
  const v = (env.NOTIFICATION_PROVIDER ?? "").trim().toLowerCase();
  // M365_MAIL_ENABLED=true también activa m365 (compatibilidad de nombres)
  // cuando NOTIFICATION_PROVIDER no está explícito.
  if (v === "m365") return "m365";
  if (v === "" && (env.M365_MAIL_ENABLED ?? "").trim().toLowerCase() === "true") {
    return "m365";
  }
  return "fake";
}

const defaultFetch: FetchLike = (url, init) =>
  // Runtime real: usa fetch global. En tests se inyecta un doble.
  (globalThis.fetch as unknown as FetchLike)(url, init);

/**
 * Construye el M365EmailProvider a partir de una config validada (fábrica
 * reutilizada por el resolver y por la prueba de conexión).
 */
export function construirProveedorM365(
  config: ConfigM365,
  deps: ResolverProviderDeps = {},
): { provider: M365EmailProvider; oauth: M365OAuthClient } {
  const oauth = new M365OAuthClient(config, {
    fetch: deps.fetch ?? defaultFetch,
    now: deps.now ?? (() => Date.now()),
  });
  const provider = new M365EmailProvider(config, {
    oauth,
    logger: deps.logger ?? consoleLogger,
  });
  return { provider, oauth };
}

/**
 * Resuelve el proveedor de correo según configuración y entorno.
 * - fake: devuelve FakeEmailProvider.
 * - m365: valida config; si falla, en producción THROW, en dev/test fallback
 *   a fake (logueado).
 */
export function resolverProveedorNotificaciones(
  deps: ResolverProviderDeps = {},
): EmailNotificationPort {
  const env = deps.env ?? process.env;
  const logger = deps.logger ?? consoleLogger;
  const esProduccion = (env.NODE_ENV ?? "development") === "production";
  const solicitado = proveedorSolicitado(env);

  if (solicitado === "fake") {
    return new FakeEmailProvider();
  }

  // Solicitado m365.
  const cfg = resolverConfigM365(env);
  if (!cfg.ok) {
    const campos = cfg.issues.map((i) => i.campo).join(", ");
    if (esProduccion) {
      // Fallo explícito: NUNCA fallback silencioso en producción.
      throw new Error(
        `NOTIFICATION_PROVIDER=m365 en producción con configuración inválida. ` +
          `Variables inválidas/ausentes: ${campos}`,
      );
    }
    // dev/test: fallback controlado y LOGUEADO (sin valores, solo nombres).
    logger.warn(
      { proveedorSolicitado: "m365", fallback: "fake", variablesFaltantes: campos },
      "M365 mal configurado en dev/test: usando FakeEmailProvider",
    );
    return new FakeEmailProvider();
  }

  const { provider } = construirProveedorM365(cfg.config, deps);
  logger.info(
    { proveedor: "m365", smtpHost: cfg.config.smtpHost, smtpPort: cfg.config.smtpPort },
    "Proveedor de notificaciones: Microsoft 365",
  );
  return provider;
}

/**
 * Instala el proveedor resuelto como singleton usado por `enqueueEmail`.
 * Se invoca en el arranque (`app.ts`). En producción con m365 mal configurado,
 * lanza aquí (fallo al arrancar), conforme al mandato.
 */
export function instalarProveedorNotificaciones(
  deps: ResolverProviderDeps = {},
): EmailNotificationPort {
  const p = resolverProveedorNotificaciones(deps);
  setEmailProvider(p);
  return p;
}
