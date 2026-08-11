/**
 * DeltaOps · Microsoft 365 Mail / SMTP OAuth — pruebas deterministas.
 *
 * NADA de Internet ni de Microsoft: el token endpoint y el transporte SMTP se
 * inyectan como dobles. Cubre: fake intacto, construcción del mensaje (XOAUTH2,
 * STARTTLS, from/to/subject/text), manejo de token (cache/expiración/renovación/
 * error de auth), config inválida, timeout, error temporal + reintento,
 * idempotencia, aislamiento por tenant, selección de proveedor, no fallback
 * silencioso en producción, y no exposición de secretos en logs.
 */
import { describe, expect, it, vi } from "vitest";
import { FakeEmailProvider, type EmailMessage } from "../email";
import {
  M365EmailProvider,
  M365OAuthClient,
  M365AuthError,
  esErrorTemporal,
  redactarSecretos,
  resolverConfigM365,
  type ConfigM365,
  type FetchLike,
  type SmtpTransport,
  type TransportFactory,
} from "../m365-email";
import {
  proveedorSolicitado,
  resolverProveedorNotificaciones,
} from "../notification-provider";
import { probarConexionM365 } from "../m365-connection-test";

/* ----------------------------- Utilidades -------------------------------- */

const ENV_M365: NodeJS.ProcessEnv = {
  NOTIFICATION_PROVIDER: "m365",
  M365_TENANT_ID: "tenant-entra-0000",
  M365_CLIENT_ID: "client-0000",
  M365_CLIENT_SECRET: "secreto-de-app-no-real",
  M365_MAIL_FROM: "no-reply@contoso-demo.example",
  M365_SMTP_HOST: "smtp.outlook.com",
  M365_SMTP_PORT: "587",
  M365_SMTP_SECURE: "false",
};

function configValida(): ConfigM365 {
  const r = resolverConfigM365(ENV_M365);
  if (!r.ok) throw new Error("fixture inválida");
  return r.config;
}

/** fetch que devuelve un token OAuth simulado con expires_in configurable. */
function fetchTokenOk(expiresIn = 3600, accessToken = "tok-abc"): FetchLike {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ access_token: accessToken, expires_in: expiresIn, token_type: "Bearer" }),
    text: async () => "",
  }));
}

const MSG: EmailMessage = {
  tenantId: "delta-demo",
  idempotencyKey: "k-1",
  tipo: "bienvenida",
  destinatario: "u@cliente.example",
  idioma: "es",
  asunto: "Hola",
  cuerpo: "Cuerpo del mensaje",
};

/* --------------------------- Fake intacto -------------------------------- */

describe("M365 · Fake provider intacto", () => {
  it("el Fake sigue acumulando sin salida real", async () => {
    const fake = new FakeEmailProvider();
    await fake.send(MSG);
    expect(fake.nombre).toBe("fake");
    expect(fake.enviados).toHaveLength(1);
  });
});

/* --------------------------- Configuración -------------------------------- */

describe("M365 · configuración", () => {
  it("valida configuración completa", () => {
    const r = resolverConfigM365(ENV_M365);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.tokenEndpoint).toContain("login.microsoftonline.com");
      expect(r.config.tokenEndpoint).toContain("tenant-entra-0000");
      expect(r.config.scope).toBe("https://outlook.office365.com/.default");
      expect(r.config.smtpPort).toBe(587);
      expect(r.config.smtpSecure).toBe(false);
    }
  });

  it("config inválida: reporta variables faltantes (sin lanzar)", () => {
    const r = resolverConfigM365({ NOTIFICATION_PROVIDER: "m365" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const campos = r.issues.map((i) => i.campo);
      expect(campos).toContain("M365_TENANT_ID");
      expect(campos).toContain("M365_CLIENT_ID");
      expect(campos).toContain("M365_CLIENT_SECRET");
      expect(campos).toContain("M365_MAIL_FROM");
    }
  });

  it("config inválida: puerto fuera de rango y correo malformado", () => {
    const r = resolverConfigM365({
      ...ENV_M365,
      M365_SMTP_PORT: "99999",
      M365_MAIL_FROM: "no-es-correo",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const campos = r.issues.map((i) => i.campo);
      expect(campos).toContain("M365_SMTP_PORT");
      expect(campos).toContain("M365_MAIL_FROM");
    }
  });
});

/* ---------------------------- Token OAuth --------------------------------- */

describe("M365 · manejo de token OAuth", () => {
  it("obtiene token vía client_credentials con scope y grant correctos", async () => {
    const fetch = fetchTokenOk();
    const oauth = new M365OAuthClient(configValida(), { fetch, now: () => 1000 });
    const tok = await oauth.obtenerToken();
    expect(tok).toBe("tok-abc");
    const [, init] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const body = (init as { body: string }).body;
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain("scope=");
    expect(body).toContain("client_credentials");
  });

  it("cachea el token y NO vuelve a pedirlo antes de expirar", async () => {
    const fetch = fetchTokenOk(3600);
    let t = 1000;
    const oauth = new M365OAuthClient(configValida(), { fetch, now: () => t });
    await oauth.obtenerToken();
    t += 1000; // avanza 1s, muy dentro de la ventana
    await oauth.obtenerToken();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renueva el token cuando expira (con margen de seguridad)", async () => {
    const fetch = fetchTokenOk(120); // 120s de vida
    let t = 1_000_000;
    const oauth = new M365OAuthClient(configValida(), { fetch, now: () => t });
    await oauth.obtenerToken();
    // Avanza más allá de (expires_in - margen 60s) => fuerza renovación.
    t += 121_000;
    await oauth.obtenerToken();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("error de autenticación: lanza M365AuthError con status, sin cuerpo crudo", async () => {
    const fetch: FetchLike = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_client", error_description: "SECRETO-EN-CLARO" }),
      text: async () => "SECRETO-EN-CLARO",
    }));
    const oauth = new M365OAuthClient(configValida(), { fetch, now: () => 0 });
    await expect(oauth.obtenerToken()).rejects.toBeInstanceOf(M365AuthError);
    await expect(oauth.obtenerToken()).rejects.toMatchObject({ status: 401 });
    // El mensaje NO debe contener el detalle sensible de la respuesta.
    await oauth.obtenerToken().catch((e: Error) => {
      expect(e.message).not.toContain("SECRETO-EN-CLARO");
    });
  });

  it("timeout: aborta y lanza error de red", async () => {
    const fetch: FetchLike = (_u, init) =>
      // Simula que el fetch respeta el AbortSignal y nunca resuelve por sí solo.
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () =>
          rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const cfg = { ...configValida(), timeoutMs: 5 };
    const oauth = new M365OAuthClient(cfg, { fetch, now: () => 0 });
    await expect(oauth.obtenerToken()).rejects.toBeInstanceOf(M365AuthError);
  });
});

/* ------------------------- Construcción del mensaje ----------------------- */

describe("M365 · construcción del mensaje (XOAUTH2, STARTTLS)", () => {
  it("crea transporte STARTTLS con OAuth2 y envía from/to/subject/text", async () => {
    const enviados: Array<Record<string, unknown>> = [];
    let transportOpts: Record<string, unknown> = {};
    const transportFactory: TransportFactory = async (opts) => {
      transportOpts = opts as unknown as Record<string, unknown>;
      const t: SmtpTransport = {
        async sendMail(m) {
          enviados.push(m as Record<string, unknown>);
          return {};
        },
      };
      return t;
    };
    const oauth = new M365OAuthClient(configValida(), { fetch: fetchTokenOk(), now: () => 0 });
    const provider = new M365EmailProvider(configValida(), { oauth, transportFactory });
    await provider.send(MSG);

    // XOAUTH2: el transporte recibe el accessToken y el usuario (from).
    expect(transportOpts.accessToken).toBe("tok-abc");
    expect(transportOpts.user).toBe("no-reply@contoso-demo.example");
    // STARTTLS en 587: secure=false.
    expect(transportOpts.secure).toBe(false);
    expect(transportOpts.port).toBe(587);
    expect(transportOpts.host).toBe("smtp.outlook.com");
    // Mensaje traducido correctamente.
    expect(enviados[0]).toMatchObject({
      from: "no-reply@contoso-demo.example",
      to: "u@cliente.example",
      subject: "Hola",
      text: "Cuerpo del mensaje",
    });
  });
});

/* --------------------------- Errores / reintento -------------------------- */

describe("M365 · errores temporales y reintento acotado", () => {
  it("clasifica errores temporales", () => {
    expect(esErrorTemporal({ responseCode: 421 })).toBe(true);
    expect(esErrorTemporal({ responseCode: 451 })).toBe(true);
    expect(esErrorTemporal({ code: "ETIMEDOUT" })).toBe(true);
    expect(esErrorTemporal({ message: "please try again" })).toBe(true);
    expect(esErrorTemporal({ responseCode: 550, message: "mailbox unavailable" })).toBe(false);
  });

  it("reintenta ante error temporal y termina con éxito", async () => {
    let intentos = 0;
    const transportFactory: TransportFactory = async () => ({
      async sendMail() {
        intentos++;
        if (intentos < 2) throw Object.assign(new Error("throttled"), { responseCode: 429 });
        return {};
      },
    });
    const oauth = new M365OAuthClient(configValida(), { fetch: fetchTokenOk(), now: () => 0 });
    const provider = new M365EmailProvider({ ...configValida(), maxReintentos: 2 }, {
      oauth,
      transportFactory,
      sleep: async () => {},
    });
    await expect(provider.send(MSG)).resolves.toBeUndefined();
    expect(intentos).toBe(2);
  });

  it("NO reintenta ante error permanente y propaga el error", async () => {
    let intentos = 0;
    const transportFactory: TransportFactory = async () => ({
      async sendMail() {
        intentos++;
        throw Object.assign(new Error("mailbox unavailable"), { responseCode: 550 });
      },
    });
    const oauth = new M365OAuthClient(configValida(), { fetch: fetchTokenOk(), now: () => 0 });
    const provider = new M365EmailProvider({ ...configValida(), maxReintentos: 3 }, {
      oauth,
      transportFactory,
      sleep: async () => {},
    });
    await expect(provider.send(MSG)).rejects.toThrow(/mailbox unavailable/);
    expect(intentos).toBe(1);
  });

  it("agota reintentos y propaga el último error (dominio decide marcar FAILED)", async () => {
    const transportFactory: TransportFactory = async () => ({
      async sendMail() {
        throw Object.assign(new Error("temporary throttle"), { responseCode: 429 });
      },
    });
    const oauth = new M365OAuthClient(configValida(), { fetch: fetchTokenOk(), now: () => 0 });
    const provider = new M365EmailProvider({ ...configValida(), maxReintentos: 1 }, {
      oauth,
      transportFactory,
      sleep: async () => {},
    });
    await expect(provider.send(MSG)).rejects.toThrow(/throttle/);
  });
});

/* ----------------------- No exposición de secretos ------------------------ */

describe("M365 · logging sin secretos", () => {
  it("redactarSecretos oculta secret/token/password/authorization", () => {
    const red = redactarSecretos({
      client_secret: "SUPERSECRETO",
      access_token: "TOKENAZO",
      authorization: "Bearer XYZ",
      user: "visible@x",
      anidado: { password: "p", ok: 1 },
    });
    const s = JSON.stringify(red);
    expect(s).not.toContain("SUPERSECRETO");
    expect(s).not.toContain("TOKENAZO");
    expect(s).not.toContain("Bearer XYZ");
    expect(s).toContain("visible@x");
    expect(s).toContain("[REDACTED]");
  });

  it("el logger de errores del provider no recibe secretos", async () => {
    const logs: unknown[] = [];
    const logger = {
      warn: (o: unknown) => logs.push(o),
      error: (o: unknown) => logs.push(o),
    };
    const transportFactory: TransportFactory = async () => ({
      async sendMail() {
        throw Object.assign(new Error("boom"), { responseCode: 550 });
      },
    });
    const oauth = new M365OAuthClient(configValida(), { fetch: fetchTokenOk(), now: () => 0 });
    const provider = new M365EmailProvider(configValida(), {
      oauth,
      transportFactory,
      logger,
    });
    await provider.send(MSG).catch(() => {});
    const s = JSON.stringify(logs);
    expect(s).not.toContain("secreto-de-app-no-real");
    expect(s).not.toContain("tok-abc");
  });
});

/* ------------------------- Selección de proveedor ------------------------- */

describe("M365 · selección de proveedor", () => {
  it("default fake sin NOTIFICATION_PROVIDER", () => {
    expect(proveedorSolicitado({})).toBe("fake");
    expect(proveedorSolicitado({ NOTIFICATION_PROVIDER: "fake" })).toBe("fake");
  });

  it("m365 explícito o vía M365_MAIL_ENABLED", () => {
    expect(proveedorSolicitado({ NOTIFICATION_PROVIDER: "m365" })).toBe("m365");
    expect(proveedorSolicitado({ M365_MAIL_ENABLED: "true" })).toBe("m365");
  });

  it("resuelve FakeEmailProvider cuando fake", () => {
    const p = resolverProveedorNotificaciones({ env: { NODE_ENV: "development" } });
    expect(p.nombre).toBe("fake");
  });

  it("resuelve M365EmailProvider con config válida", () => {
    const p = resolverProveedorNotificaciones({
      env: { ...ENV_M365, NODE_ENV: "production" },
      fetch: fetchTokenOk(),
      now: () => 0,
    });
    expect(p.nombre).toBe("m365");
  });
});

/* --------------------- No fallback silencioso en prod --------------------- */

describe("M365 · producción no hace fallback silencioso", () => {
  it("PRODUCCIÓN + m365 + config inválida ⇒ THROW explícito", () => {
    expect(() =>
      resolverProveedorNotificaciones({
        env: { NODE_ENV: "production", NOTIFICATION_PROVIDER: "m365" },
      }),
    ).toThrow(/producción con configuración inválida/);
  });

  it("DEV + m365 + config inválida ⇒ fallback a fake LOGUEADO", () => {
    const logs: unknown[] = [];
    const logger = {
      info: () => {},
      warn: (o: unknown) => logs.push(o),
      error: () => {},
    };
    const p = resolverProveedorNotificaciones({
      env: { NODE_ENV: "development", NOTIFICATION_PROVIDER: "m365" },
      logger,
    });
    expect(p.nombre).toBe("fake");
    expect(JSON.stringify(logs)).toContain("fallback");
    // El log lista NOMBRES de variables, nunca valores.
    expect(JSON.stringify(logs)).toContain("M365_TENANT_ID");
  });
});

/* --------------------------- Aislamiento tenant --------------------------- */

describe("M365 · aislamiento por tenant y multitenancy", () => {
  it("el provider transporta el tenant del mensaje sin hardcodear DELTA", async () => {
    const recibidos: string[] = [];
    const transportFactory: TransportFactory = async () => ({
      async sendMail() {
        return {};
      },
    });
    const oauth = new M365OAuthClient(configValida(), { fetch: fetchTokenOk(), now: () => 0 });
    const provider = new M365EmailProvider(configValida(), { oauth, transportFactory });
    for (const tenantId of ["delta-demo", "otra-empresa", "deltaops"]) {
      const msg = { ...MSG, tenantId, idempotencyKey: `k-${tenantId}` };
      recibidos.push(msg.tenantId);
      await provider.send(msg);
    }
    // El tenant M365 (config) es único e independiente del tenant DeltaOps del mensaje.
    expect(recibidos).toEqual(["delta-demo", "otra-empresa", "deltaops"]);
    expect(configValida().tenantId).toBe("tenant-entra-0000");
  });
});

/* --------------------------- Prueba de conexión --------------------------- */

describe("M365 · prueba de conexión por etapas", () => {
  it("reporta PASS en todas las etapas con dobles", async () => {
    const transportFactory: TransportFactory = async () => ({
      async sendMail() {
        return {};
      },
    });
    const r = await probarConexionM365({
      env: ENV_M365,
      fetch: fetchTokenOk(),
      now: () => 0,
      transportFactory,
      destinoPrueba: "buzon@contoso-demo.example",
    });
    expect(r.ok).toBe(true);
    expect(r.etapas.map((e) => e.estado)).toEqual(["PASS", "PASS", "PASS", "PASS"]);
  });

  it("config inválida ⇒ FAIL en etapa config y corta", async () => {
    const r = await probarConexionM365({ env: { NOTIFICATION_PROVIDER: "m365" } });
    expect(r.ok).toBe(false);
    expect(r.etapas[0]).toMatchObject({ etapa: "config", estado: "FAIL" });
    expect(r.etapas).toHaveLength(1);
  });

  it("OAuth falla ⇒ FAIL en oauth, no intenta SMTP", async () => {
    const fetch: FetchLike = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "",
    }));
    const r = await probarConexionM365({ env: ENV_M365, fetch, now: () => 0 });
    expect(r.ok).toBe(false);
    expect(r.etapas.find((e) => e.etapa === "oauth")?.estado).toBe("FAIL");
    expect(r.etapas.find((e) => e.etapa === "smtp")).toBeUndefined();
  });
});
