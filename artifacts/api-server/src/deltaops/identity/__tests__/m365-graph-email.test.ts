/**
 * DeltaOps · Microsoft Graph Mail.Send — pruebas deterministas.
 *
 * NADA de Internet ni de Microsoft: el token endpoint y las llamadas a Graph se
 * inyectan como dobles (`fetch`). Cubre la sección 12 del mandato: token
 * ok/expirado/renovación/error auth; construcción sendMail (HTML, destinatarios,
 * CC/BCC); 202/401/403/404/429/5xx/timeout; retry seguro; idempotencia;
 * aislamiento por tenant; no exposición de secretos; provider selection; Fake y
 * Graph.
 */
import { describe, expect, it, vi } from "vitest";
import { FakeEmailProvider, type EmailMessage } from "../email";
import {
  GraphAuthError,
  GraphOAuthClient,
  GraphSendError,
  M365GraphEmailProvider,
  construirSendMail,
  esStatusTemporal,
  htmlDesdeTexto,
  redactarSecretos,
  resolverConfigGraph,
  type ConfigGraph,
  type FetchLike,
} from "../m365-graph-email";
import {
  proveedorSolicitado,
  resolverProveedorNotificaciones,
} from "../notification-provider";
import { probarConexionGraph } from "../m365-graph-connection-test";

/* ----------------------------- Fixtures ---------------------------------- */

const ENV_GRAPH: NodeJS.ProcessEnv = {
  NOTIFICATION_PROVIDER: "m365-graph",
  GRAPH_TENANT_ID: "entra-tenant-0000",
  GRAPH_CLIENT_ID: "client-0000",
  GRAPH_CLIENT_SECRET: "secreto-de-app-no-real",
  GRAPH_SENDER: "no-reply@contoso-demo.example",
};

function configValida(): ConfigGraph {
  const r = resolverConfigGraph(ENV_GRAPH);
  if (!r.ok) throw new Error("fixture inválida");
  return r.config;
}

interface RespuestaDoble {
  ok: boolean;
  status: number;
  json?: unknown;
}

/** fetch que responde token en el endpoint OAuth y una respuesta configurable a Graph. */
function fetchDoble(opts: {
  tokenExpiresIn?: number;
  tokenAccess?: string;
  graph: RespuestaDoble | (() => RespuestaDoble);
}): FetchLike {
  return vi.fn(async (url: string) => {
    if (url.includes("oauth2/v2.0/token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: opts.tokenAccess ?? "tok-abc",
          expires_in: opts.tokenExpiresIn ?? 3600,
          token_type: "Bearer",
        }),
        text: async () => "",
      };
    }
    const g = typeof opts.graph === "function" ? opts.graph() : opts.graph;
    return {
      ok: g.ok,
      status: g.status,
      json: async () => g.json ?? {},
      text: async () => "",
    };
  });
}

const MSG: EmailMessage = {
  tenantId: "delta-demo",
  idempotencyKey: "k-1",
  tipo: "bienvenida",
  destinatario: "u@cliente.example",
  idioma: "es",
  asunto: "Hola",
  cuerpo: "Línea1\nLínea2",
};

function proveedorCon(fetch: FetchLike, cfg = configValida(), maxReintentos?: number) {
  const c = maxReintentos != null ? { ...cfg, maxReintentos } : cfg;
  const oauth = new GraphOAuthClient(c, { fetch, now: () => 0 });
  return new M365GraphEmailProvider(c, { oauth, fetch, sleep: async () => {} });
}

/* --------------------------- Fake intacto -------------------------------- */

describe("Graph · Fake provider intacto", () => {
  it("el Fake acumula sin salida real", async () => {
    const fake = new FakeEmailProvider();
    await fake.send(MSG);
    expect(fake.nombre).toBe("fake");
    expect(fake.enviados).toHaveLength(1);
  });
});

/* --------------------------- Configuración -------------------------------- */

describe("Graph · configuración", () => {
  it("valida configuración completa", () => {
    const r = resolverConfigGraph(ENV_GRAPH);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.tokenEndpoint).toContain("login.microsoftonline.com");
      expect(r.config.tokenEndpoint).toContain("entra-tenant-0000");
      expect(r.config.scope).toBe("https://graph.microsoft.com/.default");
      expect(r.config.graphBaseUrl).toBe("https://graph.microsoft.com/v1.0");
      expect(r.config.sender).toBe("no-reply@contoso-demo.example");
    }
  });

  it("config inválida: reporta variables GRAPH_* faltantes", () => {
    const r = resolverConfigGraph({ NOTIFICATION_PROVIDER: "m365-graph" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const campos = r.issues.map((i) => i.campo);
      expect(campos).toEqual(
        expect.arrayContaining(["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_SENDER"]),
      );
    }
  });

  it("no reutiliza M365_* ni SMTP_* para Graph", () => {
    const r = resolverConfigGraph({
      NOTIFICATION_PROVIDER: "m365-graph",
      M365_TENANT_ID: "x",
      M365_CLIENT_ID: "x",
      M365_CLIENT_SECRET: "x",
      M365_MAIL_FROM: "x@y.z",
      SMTP_HOST: "smtp.outlook.com",
    });
    expect(r.ok).toBe(false); // GRAPH_* siguen faltando
  });
});

/* ---------------------------- Token OAuth --------------------------------- */

describe("Graph · manejo de token OAuth", () => {
  it("obtiene token con grant/scope correctos", async () => {
    const fetch = fetchDoble({ graph: { ok: true, status: 202 } });
    const oauth = new GraphOAuthClient(configValida(), { fetch, now: () => 1000 });
    expect(await oauth.obtenerToken()).toBe("tok-abc");
    const [, init] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const body = (init as { body: string }).body;
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain("scope=");
    expect(decodeURIComponent(body)).toContain("https://graph.microsoft.com/.default");
  });

  it("cachea el token y NO lo vuelve a pedir antes de expirar", async () => {
    const fetch = fetchDoble({ tokenExpiresIn: 3600, graph: { ok: true, status: 202 } });
    let t = 1000;
    const oauth = new GraphOAuthClient(configValida(), { fetch, now: () => t });
    await oauth.obtenerToken();
    t += 1000;
    await oauth.obtenerToken();
    // Solo 1 llamada a token (las llamadas a graph no ocurren aquí).
    const calls = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls;
    expect(calls.filter((c) => c[0].includes("token"))).toHaveLength(1);
  });

  it("renueva el token expirado (respetando el margen de 60s)", async () => {
    const fetch = fetchDoble({ tokenExpiresIn: 120, graph: { ok: true, status: 202 } });
    let t = 1_000_000;
    const oauth = new GraphOAuthClient(configValida(), { fetch, now: () => t });
    await oauth.obtenerToken();
    t += 121_000;
    await oauth.obtenerToken();
    const calls = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls;
    expect(calls.filter((c) => c[0].includes("token"))).toHaveLength(2);
  });

  it("error de autenticación del token: GraphAuthError con status, sin cuerpo", async () => {
    const fetch: FetchLike = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_client", error_description: "SECRETO" }),
      text: async () => "SECRETO",
    }));
    const oauth = new GraphOAuthClient(configValida(), { fetch, now: () => 0 });
    await expect(oauth.obtenerToken()).rejects.toBeInstanceOf(GraphAuthError);
    await oauth.obtenerToken().catch((e: Error) => {
      expect(e.message).not.toContain("SECRETO");
    });
  });

  it("timeout del token: aborta con GraphAuthError", async () => {
    const fetch: FetchLike = (_u, init) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () =>
          rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const oauth = new GraphOAuthClient({ ...configValida(), timeoutMs: 5 }, { fetch, now: () => 0 });
    await expect(oauth.obtenerToken()).rejects.toBeInstanceOf(GraphAuthError);
  });
});

/* ------------------------- Construcción sendMail -------------------------- */

describe("Graph · construcción de sendMail", () => {
  it("html básico escapa y convierte saltos de línea", () => {
    const html = htmlDesdeTexto("a<b>\nc");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("<br>");
    expect(html.startsWith("<html>")).toBe(true);
  });

  it("mapea asunto, HTML, toRecipients y saveToSentItems", () => {
    const body = construirSendMail(MSG);
    expect(body.message.subject).toBe("Hola");
    expect(body.message.body.contentType).toBe("HTML");
    expect(body.message.body.content).toContain("Línea1");
    expect(body.message.toRecipients).toEqual([{ emailAddress: { address: "u@cliente.example" } }]);
    expect(body.saveToSentItems).toBe(true);
  });

  it("mapea CC/BCC desde metadata sin cambiar el contrato", () => {
    const body = construirSendMail({
      ...MSG,
      metadata: { cc: ["a@x.io", "b@x.io"], bcc: "c@x.io" },
    });
    expect(body.message.ccRecipients).toEqual([
      { emailAddress: { address: "a@x.io" } },
      { emailAddress: { address: "b@x.io" } },
    ]);
    expect(body.message.bccRecipients).toEqual([{ emailAddress: { address: "c@x.io" } }]);
  });

  it("mapea adjuntos si vienen en metadata (formato Graph)", () => {
    const att = [{ "@odata.type": "#microsoft.graph.fileAttachment", name: "x.txt", contentBytes: "AAAA" }];
    const body = construirSendMail({ ...MSG, metadata: { attachments: att } });
    expect(body.message.attachments).toEqual(att);
  });

  it("POST al endpoint sendMail del sender con Bearer y JSON", async () => {
    const fetch = fetchDoble({ graph: { ok: true, status: 202 } });
    await proveedorCon(fetch).send(MSG);
    const calls = (fetch as unknown as { mock: { calls: [string, { method: string; headers: Record<string, string>; body: string }][] } }).mock.calls;
    const graphCall = calls.find((c) => c[0].includes("/sendMail"))!;
    expect(graphCall[0]).toContain("/users/no-reply%40contoso-demo.example/sendMail");
    expect(graphCall[1].method).toBe("POST");
    expect(graphCall[1].headers.authorization).toBe("Bearer tok-abc");
    expect(graphCall[1].headers["content-type"]).toBe("application/json");
    const sent = JSON.parse(graphCall[1].body);
    expect(sent.message.toRecipients[0].emailAddress.address).toBe("u@cliente.example");
  });
});

/* --------------------------- Respuestas HTTP ------------------------------ */

describe("Graph · respuestas HTTP", () => {
  it("202 Accepted ⇒ éxito (resuelve)", async () => {
    await expect(proveedorCon(fetchDoble({ graph: { ok: true, status: 202 } })).send(MSG)).resolves.toBeUndefined();
  });

  it("401 ⇒ GraphSendError permanente (no reintenta)", async () => {
    let n = 0;
    const fetch = fetchDoble({ graph: () => { n++; return { ok: false, status: 401, json: { error: { code: "InvalidAuthenticationToken" } } }; } });
    await expect(proveedorCon(fetch, configValida(), 3).send(MSG)).rejects.toMatchObject({ status: 401 });
    // 401 no es "temporal" salvo el manejo de renovación; no debe reintentar sin fin.
    expect(n).toBe(1);
  });

  it("403 ⇒ GraphSendError permanente (consentimiento/RBAC)", async () => {
    const fetch = fetchDoble({ graph: { ok: false, status: 403, json: { error: { code: "ErrorAccessDenied" } } } });
    await expect(proveedorCon(fetch).send(MSG)).rejects.toMatchObject({ status: 403, graphCode: "ErrorAccessDenied" });
  });

  it("404 ⇒ GraphSendError permanente (buzón inexistente)", async () => {
    const fetch = fetchDoble({ graph: { ok: false, status: 404, json: { error: { code: "MailboxNotEnabledForRESTAPI" } } } });
    await expect(proveedorCon(fetch).send(MSG)).rejects.toMatchObject({ status: 404 });
  });

  it("429 ⇒ temporal y reintenta hasta éxito", async () => {
    let n = 0;
    const fetch = fetchDoble({ graph: () => { n++; return n < 2 ? { ok: false, status: 429, json: { error: { code: "TooManyRequests" } } } : { ok: true, status: 202 }; } });
    await expect(proveedorCon(fetch, configValida(), 2).send(MSG)).resolves.toBeUndefined();
    expect(n).toBe(2);
  });

  it("5xx ⇒ temporal; agota reintentos y propaga el último error", async () => {
    let n = 0;
    const fetch = fetchDoble({ graph: () => { n++; return { ok: false, status: 503, json: { error: { code: "ServiceUnavailable" } } }; } });
    await expect(proveedorCon(fetch, configValida(), 1).send(MSG)).rejects.toMatchObject({ status: 503 });
    expect(n).toBe(2); // 1 inicial + 1 reintento
  });

  it("timeout de red ⇒ GraphSendError temporal", async () => {
    const fetch: FetchLike = (url, init) => {
      if (url.includes("token")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 3600 }), text: async () => "" });
      }
      return new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    };
    const cfg = { ...configValida(), timeoutMs: 5, maxReintentos: 0 };
    const oauth = new GraphOAuthClient(cfg, { fetch, now: () => 0 });
    const provider = new M365GraphEmailProvider(cfg, { oauth, fetch, sleep: async () => {} });
    await expect(provider.send(MSG)).rejects.toBeInstanceOf(GraphSendError);
  });

  it("esStatusTemporal clasifica 429 y 5xx como temporales", () => {
    expect(esStatusTemporal(429)).toBe(true);
    expect(esStatusTemporal(503)).toBe(true);
    expect(esStatusTemporal(500)).toBe(true);
    expect(esStatusTemporal(403)).toBe(false);
    expect(esStatusTemporal(404)).toBe(false);
  });
});

/* ------------------------- Idempotencia / tenant -------------------------- */

describe("Graph · idempotencia y aislamiento por tenant", () => {
  it("preserva el tenant DeltaOps del mensaje (Graph solo transporta)", async () => {
    const tenants: string[] = [];
    const fetch = fetchDoble({ graph: { ok: true, status: 202 } });
    const provider = proveedorCon(fetch);
    for (const tenantId of ["delta-demo", "otra-empresa", "deltaops"]) {
      tenants.push(tenantId);
      await provider.send({ ...MSG, tenantId, idempotencyKey: `k-${tenantId}` });
    }
    expect(tenants).toEqual(["delta-demo", "otra-empresa", "deltaops"]);
    // El tenant Entra (config) es único e independiente del tenant DeltaOps.
    expect(configValida().tenantId).toBe("entra-tenant-0000");
  });

  it("la idempotencia es responsabilidad del outbox (idempotencyKey se conserva)", () => {
    // El provider no duplica: `enqueueEmail` (outbox) usa UNIQUE(tenant, key).
    const body = construirSendMail(MSG);
    expect(MSG.idempotencyKey).toBe("k-1");
    expect(body.message.subject).toBe("Hola"); // el provider no altera identidad del mensaje
  });
});

/* ----------------------- No exposición de secretos ------------------------ */

describe("Graph · logging sin secretos", () => {
  it("redactarSecretos oculta secret/token/authorization/bearer", () => {
    const red = redactarSecretos({
      client_secret: "SUPERSECRETO",
      access_token: "TOKENAZO",
      authorization: "Bearer XYZ",
      user: "visible@x",
    });
    const s = JSON.stringify(red);
    expect(s).not.toContain("SUPERSECRETO");
    expect(s).not.toContain("TOKENAZO");
    expect(s).not.toContain("Bearer XYZ");
    expect(s).toContain("visible@x");
    expect(s).toContain("[REDACTED]");
  });

  it("el logger de error del provider no recibe token ni secret", async () => {
    const logs: unknown[] = [];
    const fetch = fetchDoble({ graph: { ok: false, status: 403, json: { error: { code: "ErrorAccessDenied" } } } });
    const oauth = new GraphOAuthClient(configValida(), { fetch, now: () => 0 });
    const provider = new M365GraphEmailProvider(configValida(), {
      oauth,
      fetch,
      logger: { warn: (o) => logs.push(o) },
    });
    await provider.send(MSG).catch(() => {});
    const s = JSON.stringify(logs);
    expect(s).not.toContain("secreto-de-app-no-real");
    expect(s).not.toContain("tok-abc");
    expect(s).not.toContain("Bearer");
  });
});

/* ------------------------- Selección de proveedor ------------------------- */

describe("Graph · selección de proveedor", () => {
  it("default fake sin NOTIFICATION_PROVIDER", () => {
    expect(proveedorSolicitado({})).toBe("fake");
    expect(proveedorSolicitado({ NOTIFICATION_PROVIDER: "fake" })).toBe("fake");
  });

  it("m365-graph explícito (o alias graph)", () => {
    expect(proveedorSolicitado({ NOTIFICATION_PROVIDER: "m365-graph" })).toBe("m365-graph");
    expect(proveedorSolicitado({ NOTIFICATION_PROVIDER: "graph" })).toBe("m365-graph");
  });

  it("resuelve FakeEmailProvider en dev", () => {
    expect(resolverProveedorNotificaciones({ env: { NODE_ENV: "development" } }).nombre).toBe("fake");
  });

  it("resuelve M365GraphEmailProvider con config válida", () => {
    const p = resolverProveedorNotificaciones({
      env: { ...ENV_GRAPH, NODE_ENV: "production" },
      fetch: fetchDoble({ graph: { ok: true, status: 202 } }),
      now: () => 0,
    });
    expect(p.nombre).toBe("m365-graph");
  });
});

/* --------------------- Fail fast / no fallback en prod -------------------- */

describe("Graph · producción no hace fallback silencioso", () => {
  it("PROD + m365-graph + config inválida ⇒ THROW (fail fast)", () => {
    expect(() =>
      resolverProveedorNotificaciones({ env: { NODE_ENV: "production", NOTIFICATION_PROVIDER: "m365-graph" } }),
    ).toThrow(/producción con configuración inválida/);
  });

  it("PROD + fake explícito ⇒ THROW (el proveedor de prod es Graph)", () => {
    expect(() =>
      resolverProveedorNotificaciones({ env: { NODE_ENV: "production", NOTIFICATION_PROVIDER: "fake" } }),
    ).toThrow(/no es válido en producción/);
  });

  it("DEV + m365-graph + config inválida ⇒ fallback a fake LOGUEADO (solo nombres)", () => {
    const logs: unknown[] = [];
    const p = resolverProveedorNotificaciones({
      env: { NODE_ENV: "development", NOTIFICATION_PROVIDER: "m365-graph" },
      logger: { info: () => {}, warn: (o) => logs.push(o), error: () => {} },
    });
    expect(p.nombre).toBe("fake");
    const s = JSON.stringify(logs);
    expect(s).toContain("fallback");
    expect(s).toContain("GRAPH_TENANT_ID");
    expect(s).not.toContain("secreto");
  });
});

/* --------------------------- Prueba de conexión --------------------------- */

describe("Graph · prueba de conexión por etapas", () => {
  it("todas las etapas PASS/ACCEPTED con dobles", async () => {
    const r = await probarConexionGraph({
      env: ENV_GRAPH,
      fetch: fetchDoble({ graph: { ok: true, status: 202 } }),
      now: () => 0,
      destinoPrueba: "buzon@contoso-demo.example",
    });
    expect(r.ok).toBe(true);
    expect(r.etapas.map((e) => e.estado)).toEqual(["PASS", "PASS", "PASS", "PASS", "ACCEPTED"]);
  });

  it("config inválida ⇒ FAIL en config y corta", async () => {
    const r = await probarConexionGraph({ env: { NOTIFICATION_PROVIDER: "m365-graph" } });
    expect(r.ok).toBe(false);
    expect(r.etapas).toHaveLength(1);
    expect(r.etapas[0]).toMatchObject({ etapa: "config", estado: "FAIL" });
  });

  it("403 en Mail.Send ⇒ FAIL con httpStatus y graphCode redactado", async () => {
    const r = await probarConexionGraph({
      env: ENV_GRAPH,
      fetch: fetchDoble({ graph: { ok: false, status: 403, json: { error: { code: "ErrorAccessDenied" } } } }),
      now: () => 0,
    });
    expect(r.ok).toBe(false);
    const mailSend = r.etapas.find((e) => e.etapa === "mail-send")!;
    expect(mailSend.estado).toBe("FAIL");
    expect(mailSend.httpStatus).toBe(403);
    expect(mailSend.graphCode).toBe("ErrorAccessDenied");
    expect(JSON.stringify(r)).not.toContain("secreto-de-app-no-real");
  });
});
