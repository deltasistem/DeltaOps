/**
 * DeltaOps · Proveedor de correo Microsoft Graph (OAuth Client Credentials).
 *
 * ADAPTADOR CONCRETO reemplazable detrás de `EmailNotificationPort` (definido en
 * `email.ts`). Sustituye al antiguo adaptador SMTP. El dominio y los módulos de
 * negocio JAMÁS conocen Microsoft Graph: dependen solo del puerto. Esta es una
 * EXTENSIÓN ADITIVA que no toca el puerto ni el modelo de identidad/autorización/
 * tenancy de DGP-017.
 *
 * Autenticación: OAuth 2.0 client_credentials (app-only).
 *   token endpoint: https://login.microsoftonline.com/<GRAPH_TENANT_ID>/oauth2/v2.0/token
 *   scope:          https://graph.microsoft.com/.default
 *   permiso:        Microsoft Graph Application permission `Mail.Send`.
 * Envío: POST https://graph.microsoft.com/v1.0/users/<GRAPH_SENDER>/sendMail
 *   202 Accepted = aceptado por Graph (no garantiza recepción del destinatario).
 *
 * MULTITENANCY: el tenant de Entra (GRAPH_TENANT_ID) es INDEPENDIENTE del tenant
 * DeltaOps (message.tenantId). Graph solo transporta el mensaje; el tenant
 * DeltaOps se preserva en plantilla/metadata/idempotencyKey/outbox/auditoría.
 *
 * SEGURIDAD: nunca se registran Authorization/access_token/client_secret en
 * logs, errores, HTTP ni docs. Ver `redactarSecretos`.
 */
import type { EmailMessage, EmailNotificationPort } from "./email";

/* --------------------------------- Config --------------------------------- */

/** Configuración validada del proveedor Microsoft Graph. */
export interface ConfigGraph {
  tenantId: string; // tenant de Entra ID (NO el tenant de DeltaOps)
  clientId: string;
  clientSecret: string;
  sender: string; // buzón remitente autorizado (GRAPH_SENDER)
  tokenEndpoint: string;
  graphBaseUrl: string; // https://graph.microsoft.com/v1.0
  scope: string; // https://graph.microsoft.com/.default
  timeoutMs: number;
  maxReintentos: number;
}

export interface ConfigGraphIssue {
  campo: string;
  motivo: string;
}

export type ResultadoConfigGraph =
  | { ok: true; config: ConfigGraph }
  | { ok: false; issues: ConfigGraphIssue[] };

const CLOUD_LOGIN = "https://login.microsoftonline.com";
const DEFAULT_SCOPE = "https://graph.microsoft.com/.default";
const DEFAULT_GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REINTENTOS = 2;

/**
 * Construye y VALIDA la configuración Graph desde variables de entorno
 * (Secrets GRAPH_*). No lanza: devuelve la lista de problemas (diagnóstico sin
 * secretos). Configuration First.
 */
export function resolverConfigGraph(
  env: NodeJS.ProcessEnv = process.env,
): ResultadoConfigGraph {
  const issues: ConfigGraphIssue[] = [];
  const req = (k: string): string => {
    const v = (env[k] ?? "").trim();
    if (!v) issues.push({ campo: k, motivo: "obligatoria y ausente/vacía" });
    return v;
  };

  const tenantId = req("GRAPH_TENANT_ID");
  const clientId = req("GRAPH_CLIENT_ID");
  const clientSecret = req("GRAPH_CLIENT_SECRET");
  const sender = req("GRAPH_SENDER");

  if (sender && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
    issues.push({ campo: "GRAPH_SENDER", motivo: "no parece un correo válido" });
  }

  const tokenEndpoint =
    (env.GRAPH_OAUTH_TOKEN_ENDPOINT ?? "").trim() ||
    `${CLOUD_LOGIN}/${encodeURIComponent(tenantId || "TENANT")}/oauth2/v2.0/token`;
  const graphBaseUrl =
    ((env.GRAPH_BASE_URL ?? "").trim() || DEFAULT_GRAPH_BASE).replace(/\/+$/, "");
  const scope = (env.GRAPH_OAUTH_SCOPE ?? "").trim() || DEFAULT_SCOPE;
  const timeoutMs = Number(env.GRAPH_TIMEOUT_MS ?? "") || DEFAULT_TIMEOUT_MS;
  const maxReintentos =
    env.GRAPH_MAX_REINTENTOS != null && env.GRAPH_MAX_REINTENTOS !== ""
      ? Math.max(0, Number(env.GRAPH_MAX_REINTENTOS) || 0)
      : DEFAULT_MAX_REINTENTOS;

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    config: {
      tenantId,
      clientId,
      clientSecret,
      sender,
      tokenEndpoint,
      graphBaseUrl,
      scope,
      timeoutMs,
      maxReintentos,
    },
  };
}

/** Redacta cualquier secreto para logging seguro (sin exponer valores). */
export function redactarSecretos<T>(obj: T): T {
  const CLAVES = /secret|token|authorization|password|client_secret|access_token|bearer/i;
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

/* ------------------------------- Fetch/reloj ------------------------------ */

/** `fetch` inyectable para tests deterministas (sin Internet). */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

/** Reloj inyectable (tests controlan el tiempo sin `Date.now`). */
export type RelojMs = () => number;

/* ------------------------------ Errores ----------------------------------- */

export class GraphAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GraphAuthError";
  }
}

/** Error de la API de Graph al enviar (con status HTTP y código de error Graph). */
export class GraphSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly graphCode?: string,
    readonly temporal = false,
  ) {
    super(message);
    this.name = "GraphSendError";
  }
}

/* --------------------------- Cliente OAuth -------------------------------- */

export interface TokenGraph {
  accessToken: string;
  /** epoch ms de expiración efectiva (con margen de seguridad ya aplicado). */
  expiraEnMs: number;
}

/**
 * Cliente OAuth client_credentials con CACHÉ por expiración y renovación.
 * Margen de seguridad de 60 s antes del vencimiento. NUNCA persiste el token ni
 * lo registra. Nunca pide un token por correo (se reutiliza el cacheado).
 */
export class GraphOAuthClient {
  private cache: TokenGraph | null = null;
  private readonly margenMs = 60_000;

  constructor(
    private readonly cfg: ConfigGraph,
    private readonly deps: { fetch: FetchLike; now: RelojMs },
  ) {}

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

  private async solicitarToken(): Promise<TokenGraph> {
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
      throw new GraphAuthError(
        `Fallo de red al obtener token OAuth: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      // NO se registra el cuerpo crudo (puede contener detalles sensibles).
      throw new GraphAuthError(`Endpoint OAuth respondió ${resp.status}`, resp.status);
    }
    const json = (await resp.json()) as {
      access_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    if (!json.access_token) {
      throw new GraphAuthError("Respuesta OAuth sin access_token");
    }
    const expiresInMs = (Number(json.expires_in) || 3600) * 1000;
    return {
      accessToken: json.access_token,
      expiraEnMs: this.deps.now() + expiresInMs - this.margenMs,
    };
  }
}

/* --------------------------- Construcción sendMail ------------------------ */

interface GraphRecipient {
  emailAddress: { address: string };
}

export interface GraphSendMailBody {
  message: {
    subject: string;
    body: { contentType: "HTML" | "Text"; content: string };
    toRecipients: GraphRecipient[];
    ccRecipients?: GraphRecipient[];
    bccRecipients?: GraphRecipient[];
    attachments?: Array<Record<string, unknown>>;
  };
  saveToSentItems: boolean;
}

/** Convierte un valor (string | string[]) en direcciones Graph. */
function aRecipients(v: unknown): GraphRecipient[] {
  const lista = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[;,]/) : [];
  return lista
    .map((x) => String(x).trim())
    .filter((x) => x.length > 0)
    .map((address) => ({ emailAddress: { address } }));
}

/**
 * Construye el cuerpo JSON de `sendMail` a partir del `EmailMessage`.
 * - `cuerpo` se envía como HTML (el contenido ya viene escapado por las
 *   plantillas de DeltaOps; los `\n` se convierten a `<br>`).
 * - CC/BCC y adjuntos se leen de `metadata` SOLO si están presentes, sin
 *   modificar el contrato del puerto (Contract First).
 */
export function construirSendMail(message: EmailMessage): GraphSendMailBody {
  const md = (message.metadata ?? {}) as Record<string, unknown>;
  const contenidoHtml = htmlDesdeTexto(message.cuerpo);

  const body: GraphSendMailBody = {
    message: {
      subject: message.asunto,
      body: { contentType: "HTML", content: contenidoHtml },
      toRecipients: aRecipients(message.destinatario),
    },
    saveToSentItems: true,
  };

  const cc = aRecipients(md.cc);
  if (cc.length > 0) body.message.ccRecipients = cc;
  const bcc = aRecipients(md.bcc);
  if (bcc.length > 0) body.message.bccRecipients = bcc;

  // Adjuntos: el contrato del puerto NO los declara; si en el futuro llegan por
  // metadata en el formato Graph, se mapean sin alterar el contrato.
  if (Array.isArray(md.attachments) && md.attachments.length > 0) {
    body.message.attachments = md.attachments as Array<Record<string, unknown>>;
  }

  return body;
}

/** HTML mínimo y seguro a partir del texto de plantilla (ya escapado). */
export function htmlDesdeTexto(texto: string): string {
  const escapado = String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<html><body>${escapado.replace(/\n/g, "<br>")}</body></html>`;
}

/* --------------------------- Clasificación 4xx/5xx ------------------------ */

/** ¿El status HTTP de Graph es reintentable de forma segura? (429 y 5xx). */
export function esStatusTemporal(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function backoffMs(intento: number): number {
  return Math.min(2000, 200 * 2 ** (intento - 1));
}
function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ---------------------------- Proveedor Graph ----------------------------- */

export interface GraphProviderDeps {
  oauth: GraphOAuthClient;
  fetch: FetchLike;
  logger?: { warn: (o: unknown, m?: string) => void; error?: (o: unknown, m?: string) => void };
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Proveedor Microsoft Graph sobre `EmailNotificationPort`. Traduce el
 * `EmailMessage` (propiedad de DeltaOps: destinatario, asunto, cuerpo, tenant,
 * idioma, metadata, idempotencyKey) a un POST `sendMail`. Los errores se
 * PROPAGAN al llamador (`enqueueEmail`), que los captura y marca la fila del
 * outbox como FAILED — el dominio nunca se rompe. NO hay sistema de reintentos
 * paralelo: los reintentos internos son solo para errores TEMPORALES seguros
 * dentro de un mismo intento de entrega del outbox.
 */
export class M365GraphEmailProvider implements EmailNotificationPort {
  readonly nombre = "m365-graph";

  constructor(
    private readonly cfg: ConfigGraph,
    private readonly deps: GraphProviderDeps,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const total = this.cfg.maxReintentos + 1;
    let ultimo: unknown = null;
    for (let intento = 1; intento <= total; intento++) {
      try {
        await this.enviarUnaVez(message);
        return;
      } catch (err) {
        ultimo = err;
        const temporal = err instanceof GraphSendError ? err.temporal : false;
        this.deps.logger?.warn(
          redactarSecretos({
            proveedor: "m365-graph",
            tenantId: message.tenantId,
            tipo: message.tipo,
            intento,
            temporal,
            status: err instanceof GraphSendError ? err.status : undefined,
            graphCode: err instanceof GraphSendError ? err.graphCode : undefined,
            error: (err as Error)?.message ?? String(err),
          }),
          "Graph: fallo de envío",
        );
        if (!temporal || intento === total) break;
        // Token pudo caducar en el borde (p. ej. 401 tratado aparte): renueva.
        if (err instanceof GraphSendError && err.status === 401) this.deps.oauth.invalidar();
        await (this.deps.sleep ?? defaultSleep)(backoffMs(intento));
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error(String(ultimo ?? "Fallo de envío Graph"));
  }

  private async enviarUnaVez(message: EmailMessage): Promise<void> {
    const accessToken = await this.deps.oauth.obtenerToken();
    const url = `${this.cfg.graphBaseUrl}/users/${encodeURIComponent(this.cfg.sender)}/sendMail`;
    const payload = construirSendMail(message);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    let resp;
    try {
      resp = await this.deps.fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      // Timeout / error de red: temporal (reintentable).
      throw new GraphSendError(
        `Fallo de red al enviar por Graph: ${(err as Error).message}`,
        0,
        undefined,
        true,
      );
    } finally {
      clearTimeout(timer);
    }

    // 202 Accepted = aceptado por Graph.
    if (resp.status === 202 || resp.ok) return;

    const graphCode = await extraerCodigoGraph(resp);
    const temporal = esStatusTemporal(resp.status);
    // Mensaje SIN token ni Authorization; solo status + código Graph.
    throw new GraphSendError(
      `Microsoft Graph respondió ${resp.status}${graphCode ? ` (${graphCode})` : ""}`,
      resp.status,
      graphCode,
      temporal,
    );
  }
}

/** Extrae el `error.code` de Graph sin exponer cuerpos sensibles. */
async function extraerCodigoGraph(resp: {
  json: () => Promise<unknown>;
}): Promise<string | undefined> {
  try {
    const j = (await resp.json()) as { error?: { code?: string } };
    return j?.error?.code;
  } catch {
    return undefined;
  }
}
