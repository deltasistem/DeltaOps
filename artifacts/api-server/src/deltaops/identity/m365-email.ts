/**
 * DeltaOps · Integración Microsoft 365 / Exchange Online (SMTP + OAuth2).
 *
 * ADAPTADOR REEMPLAZABLE detrás de `EmailNotificationPort` (definido en
 * `email.ts`). El dominio y los módulos de negocio JAMÁS conocen a Microsoft
 * 365: solo dependen del puerto. Este archivo es una EXTENSIÓN ADITIVA que no
 * modifica el puerto ni el modelo de identidad/autorización/tenancy de DGP-017.
 *
 * Mecanismo de autenticación: OAuth 2.0 client_credentials (Modern Auth).
 *   - token endpoint: https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token
 *   - scope:          https://outlook.office365.com/.default
 *   - SMTP AUTH XOAUTH2 sobre smtp.outlook.com:587 con STARTTLS.
 * NUNCA se usa la contraseña del buzón como mecanismo permanente.
 *
 * IMPORTANTE (multitenancy): el tenant de Microsoft 365 (M365_TENANT_ID) es
 * INDEPENDIENTE del tenant de DeltaOps. Este adaptador recibe su configuración
 * por variable de entorno (default global) pero admite, vía `resolverConfigM365`,
 * una resolución por tenant DeltaOps en el futuro SIN cambiar el puerto.
 *
 * Seguridad de logs: se redactan client_secret y access_token siempre.
 */
import type { EmailMessage, EmailNotificationPort } from "./email";

/* ------------------------------- Config ---------------------------------- */

/** Configuración validada del proveedor Microsoft 365. */
export interface ConfigM365 {
  tenantId: string; // tenant de Entra ID (NO el tenant de DeltaOps)
  clientId: string;
  clientSecret: string;
  from: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  /** Endpoint OAuth (derivable de tenantId; override solo para pruebas/soberanía de nube). */
  tokenEndpoint: string;
  /** Scope OAuth (default recomendado por Microsoft). */
  scope: string;
  /** Timeout por operación de red (ms). */
  timeoutMs: number;
  /** Reintentos ante errores TEMPORALES (además del intento inicial). */
  maxReintentos: number;
}

export interface ConfigM365Issue {
  campo: string;
  motivo: string;
}

export type ResultadoConfigM365 =
  | { ok: true; config: ConfigM365 }
  | { ok: false; issues: ConfigM365Issue[] };

const CLOUD_LOGIN = "https://login.microsoftonline.com";
const DEFAULT_SCOPE = "https://outlook.office365.com/.default";
const DEFAULT_SMTP_HOST = "smtp.outlook.com";
const DEFAULT_SMTP_PORT = 587;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REINTENTOS = 2;

/**
 * Construye y VALIDA la configuración M365 desde variables de entorno.
 * No lanza: devuelve la lista de problemas (útil para diagnóstico sin secretos).
 * Configuration First: si falta algo obligatorio, `ok: false`.
 */
export function resolverConfigM365(
  env: NodeJS.ProcessEnv = process.env,
): ResultadoConfigM365 {
  const issues: ConfigM365Issue[] = [];
  const req = (k: string): string => {
    const v = (env[k] ?? "").trim();
    if (!v) issues.push({ campo: k, motivo: "obligatoria y ausente/vacía" });
    return v;
  };

  const tenantId = req("M365_TENANT_ID");
  const clientId = req("M365_CLIENT_ID");
  const clientSecret = req("M365_CLIENT_SECRET");
  const from = req("M365_MAIL_FROM");

  const smtpHost = (env.M365_SMTP_HOST ?? DEFAULT_SMTP_HOST).trim() || DEFAULT_SMTP_HOST;
  const smtpPortRaw = (env.M365_SMTP_PORT ?? "").trim();
  let smtpPort = DEFAULT_SMTP_PORT;
  if (smtpPortRaw) {
    const n = Number(smtpPortRaw);
    if (!Number.isInteger(n) || n <= 0 || n > 65535) {
      issues.push({ campo: "M365_SMTP_PORT", motivo: "puerto inválido" });
    } else {
      smtpPort = n;
    }
  }
  // Por defecto STARTTLS en 587 (secure=false: TLS se negocia con STARTTLS).
  const smtpSecure = (env.M365_SMTP_SECURE ?? "").trim().toLowerCase() === "true";

  if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    issues.push({ campo: "M365_MAIL_FROM", motivo: "no parece un correo válido" });
  }

  const tokenEndpoint =
    (env.M365_OAUTH_TOKEN_ENDPOINT ?? "").trim() ||
    `${CLOUD_LOGIN}/${encodeURIComponent(tenantId || "TENANT")}/oauth2/v2.0/token`;
  const scope = (env.M365_OAUTH_SCOPE ?? "").trim() || DEFAULT_SCOPE;
  const timeoutMs = Number(env.M365_TIMEOUT_MS ?? "") || DEFAULT_TIMEOUT_MS;
  const maxReintentos =
    env.M365_MAX_REINTENTOS != null && env.M365_MAX_REINTENTOS !== ""
      ? Math.max(0, Number(env.M365_MAX_REINTENTOS) || 0)
      : DEFAULT_MAX_REINTENTOS;

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    config: {
      tenantId,
      clientId,
      clientSecret,
      from,
      smtpHost,
      smtpPort,
      smtpSecure,
      tokenEndpoint,
      scope,
      timeoutMs,
      maxReintentos,
    },
  };
}

/** Redacta cualquier secreto para logging seguro (sin exponer valores). */
export function redactarSecretos<T>(obj: T): T {
  const CLAVES = /secret|token|password|authorization|client_secret|access_token/i;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = CLAVES.test(k) ? "[REDACTED]" : walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(obj) as T;
}

/* --------------------------- Cliente OAuth -------------------------------- */

export interface TokenM365 {
  accessToken: string;
  /** epoch ms de expiración efectiva (con margen de seguridad ya aplicado). */
  expiraEnMs: number;
}

/** `fetch` inyectable para tests deterministas (sin Internet). */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

/** Reloj inyectable (tests controlan el tiempo sin `Date.now` no determinista). */
export type RelojMs = () => number;

export class M365AuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "M365AuthError";
  }
}

/**
 * Cliente OAuth client_credentials con CACHÉ de token por expiración y
 * renovación automática. Margen de seguridad de 60 s antes del vencimiento.
 */
export class M365OAuthClient {
  private cache: TokenM365 | null = null;
  private readonly margenMs = 60_000;

  constructor(
    private readonly cfg: ConfigM365,
    private readonly deps: { fetch: FetchLike; now: RelojMs },
  ) {}

  /** Devuelve un token válido; reutiliza el cacheado si no ha expirado. */
  async obtenerToken(): Promise<string> {
    const ahora = this.deps.now();
    if (this.cache && this.cache.expiraEnMs > ahora) {
      return this.cache.accessToken;
    }
    const token = await this.solicitarToken();
    this.cache = token;
    return token.accessToken;
  }

  /** Fuerza la renovación (invalida caché). */
  invalidar(): void {
    this.cache = null;
  }

  private async solicitarToken(): Promise<TokenM365> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      scope: this.cfg.scope,
    }).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    let resp;
    try {
      resp = await this.deps.fetch(this.cfg.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      throw new M365AuthError(
        `Fallo de red al obtener token OAuth: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      // NO se registra el cuerpo crudo (puede contener detalles sensibles).
      throw new M365AuthError(
        `Endpoint OAuth respondió ${resp.status}`,
        resp.status,
      );
    }
    const json = (await resp.json()) as {
      access_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    if (!json.access_token) {
      throw new M365AuthError("Respuesta OAuth sin access_token");
    }
    const expiresInMs = (Number(json.expires_in) || 3600) * 1000;
    return {
      accessToken: json.access_token,
      expiraEnMs: this.deps.now() + expiresInMs - this.margenMs,
    };
  }
}

/* ---------------------- Transporte SMTP (inyectable) ---------------------- */

/** Objeto mínimo de transporte (compatible con nodemailer). */
export interface SmtpTransport {
  sendMail(opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

/**
 * Fábrica de transporte inyectable. En producción crea un transporte
 * nodemailer con XOAUTH2; en tests se sustituye por un doble determinista.
 */
export type TransportFactory = (opts: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  accessToken: string;
  timeoutMs: number;
}) => Promise<SmtpTransport>;

/**
 * Fábrica por defecto: carga `nodemailer` de forma perezosa y crea un
 * transporte STARTTLS con autenticación OAuth2 (XOAUTH2). `nodemailer` es una
 * dependencia real requerida SOLO cuando el proveedor m365 está activo.
 */
export const transportNodemailer: TransportFactory = async (opts) => {
  const especificador = "nodemailer";
  const mod = (await import(/* @vite-ignore */ especificador).catch(() => null)) as {
    createTransport: (o: unknown) => SmtpTransport;
  } | null;
  if (!mod) {
    throw new Error(
      "Proveedor m365 activo pero 'nodemailer' no está instalado. Instálelo para entrega real.",
    );
  }
  return mod.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.secure, // false en 587 → STARTTLS
    requireTLS: !opts.secure, // fuerza STARTTLS cuando no es TLS implícito
    connectionTimeout: opts.timeoutMs,
    greetingTimeout: opts.timeoutMs,
    socketTimeout: opts.timeoutMs,
    auth: {
      type: "OAuth2",
      user: opts.user,
      accessToken: opts.accessToken,
    },
  });
};

/* --------------------------- Errores temporales --------------------------- */

/**
 * Heurística conservadora de error TEMPORAL de Exchange (reintentable):
 * timeouts, 4xx de throttling (421/429/451) y 5xx transitorios. Los errores
 * permanentes (auth, remitente inválido) NO se reintentan.
 */
export function esErrorTemporal(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number; message?: string; name?: string };
  if (e?.name === "AbortError" || e?.code === "ETIMEDOUT" || e?.code === "ECONNRESET")
    return true;
  const rc = Number(e?.responseCode);
  if ([421, 429, 451, 500, 502, 503, 504].includes(rc)) return true;
  const msg = String(e?.message ?? "");
  return /timeout|temporar|throttl|try again|too many/i.test(msg);
}

/* ---------------------------- Proveedor M365 ------------------------------ */

export interface M365ProviderDeps {
  oauth: M365OAuthClient;
  transportFactory?: TransportFactory;
  logger?: { warn: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void };
  /** espera inyectable para tests (evita esperas reales entre reintentos). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Proveedor Microsoft 365 sobre `EmailNotificationPort`. Traduce el
 * `EmailMessage` (propiedad de DeltaOps: destinatario, asunto, cuerpo, tenant,
 * idioma, metadata, idempotencyKey) a un envío SMTP XOAUTH2. Los errores del
 * proveedor se PROPAGAN al llamador (`enqueueEmail`), que los captura y marca la
 * fila del outbox como FAILED — el dominio nunca se rompe.
 */
export class M365EmailProvider implements EmailNotificationPort {
  readonly nombre = "m365";
  private readonly transportFactory: TransportFactory;

  constructor(
    private readonly cfg: ConfigM365,
    private readonly deps: M365ProviderDeps,
  ) {
    this.transportFactory = deps.transportFactory ?? transportNodemailer;
  }

  async send(message: EmailMessage): Promise<void> {
    const total = this.cfg.maxReintentos + 1;
    let ultimoError: unknown = null;
    for (let intento = 1; intento <= total; intento++) {
      try {
        await this.enviarUnaVez(message);
        return;
      } catch (err) {
        ultimoError = err;
        const temporal = esErrorTemporal(err);
        // Logging SIN secretos: solo metadatos de diagnóstico.
        this.deps.logger?.warn(
          redactarSecretos({
            proveedor: "m365",
            tenantId: message.tenantId,
            tipo: message.tipo,
            intento,
            temporal,
            error: (err as Error)?.message ?? String(err),
          }),
          "M365: fallo de envío",
        );
        if (!temporal || intento === total) break;
        // token pudo caducar en el borde: renovar para el siguiente intento.
        this.deps.oauth.invalidar();
        await (this.deps.sleep ?? defaultSleep)(backoffMs(intento));
      }
    }
    throw ultimoError instanceof Error
      ? ultimoError
      : new Error(String(ultimoError ?? "Fallo de envío M365"));
  }

  private async enviarUnaVez(message: EmailMessage): Promise<void> {
    const accessToken = await this.deps.oauth.obtenerToken();
    const transport = await this.transportFactory({
      host: this.cfg.smtpHost,
      port: this.cfg.smtpPort,
      secure: this.cfg.smtpSecure,
      user: this.cfg.from,
      accessToken,
      timeoutMs: this.cfg.timeoutMs,
    });
    await transport.sendMail({
      from: this.cfg.from,
      to: message.destinatario,
      subject: message.asunto,
      text: message.cuerpo,
    });
  }
}

function backoffMs(intento: number): number {
  return Math.min(2000, 200 * 2 ** (intento - 1));
}
function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
