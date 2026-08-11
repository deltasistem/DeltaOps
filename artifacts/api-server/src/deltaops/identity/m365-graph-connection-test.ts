/**
 * DeltaOps · Prueba de conexión/envío controlada de Microsoft Graph.
 *
 * Diagnóstico por ETAPAS que NUNCA expone secretos. Reutilizado por el
 * smoke test (`scripts/m365-graph-smoke.ts`).
 *
 * Etapas: configuración → token (OAuth) → conexión Graph → Mail.Send → correo
 * de prueba. En fallo reporta etapa, HTTP status y código de error Graph
 * (redactado), nunca token/secret.
 */
import type { EmailMessage } from "./email";
import {
  GraphSendError,
  M365GraphEmailProvider,
  resolverConfigGraph,
  type FetchLike,
  type RelojMs,
} from "./m365-graph-email";
import { construirProveedorGraph } from "./notification-provider";

export type EstadoEtapa = "PASS" | "FAIL" | "ACCEPTED";

export interface EtapaResultado {
  etapa: "config" | "oauth" | "graph-connection" | "mail-send" | "test-email";
  estado: EstadoEtapa;
  detalle: string;
  httpStatus?: number;
  graphCode?: string;
}

export interface ResultadoPruebaGraph {
  proveedor: "m365-graph";
  etapas: EtapaResultado[];
  ok: boolean;
}

export interface PruebaGraphDeps {
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  now?: RelojMs;
  /** Destinatario del correo de prueba (default GRAPH_SENDER). */
  destinoPrueba?: string;
}

/**
 * Ejecuta la prueba Graph por etapas. No lanza: siempre devuelve el reporte.
 */
export async function probarConexionGraph(
  deps: PruebaGraphDeps = {},
): Promise<ResultadoPruebaGraph> {
  const env = deps.env ?? process.env;
  const etapas: EtapaResultado[] = [];

  // Etapa 1: configuración.
  const cfg = resolverConfigGraph(env);
  if (!cfg.ok) {
    etapas.push({
      etapa: "config",
      estado: "FAIL",
      detalle: `Config inválida: ${cfg.issues.map((i) => `${i.campo} (${i.motivo})`).join("; ")}`,
    });
    return { proveedor: "m365-graph", etapas, ok: false };
  }
  etapas.push({
    etapa: "config",
    estado: "PASS",
    detalle: `Graph ${cfg.config.graphBaseUrl} · sender configurado`,
  });

  const { provider, oauth } = construirProveedorGraph(cfg.config, {
    env,
    fetch: deps.fetch,
    now: deps.now,
  });

  // Etapa 2: OAuth (token).
  try {
    await oauth.obtenerToken();
    etapas.push({ etapa: "oauth", estado: "PASS", detalle: "Token OAuth obtenido y válido" });
    // La conexión Graph se valida efectivamente en el envío; se marca PASS si el
    // token existe (no hacemos llamadas de lectura para respetar mínimo privilegio).
    etapas.push({
      etapa: "graph-connection",
      estado: "PASS",
      detalle: "Endpoint Graph configurado (sin llamadas de lectura, mínimo privilegio)",
    });
  } catch (err) {
    etapas.push({
      etapa: "oauth",
      estado: "FAIL",
      detalle: `OAuth falló: ${(err as Error).message}`,
    });
    return { proveedor: "m365-graph", etapas, ok: false };
  }

  // Etapa 3 y 4: Mail.Send + correo de prueba (un envío verifica ambas).
  const destino = deps.destinoPrueba ?? cfg.config.sender;
  const mensaje: EmailMessage = {
    tenantId: "diagnostico",
    idempotencyKey: `graph-selftest-${destino}`,
    tipo: "seguridad",
    destinatario: destino,
    idioma: "es",
    asunto: "DeltaOps · Prueba de conexión Microsoft Graph",
    cuerpo:
      "Este es un correo de prueba automático de la verificación de conexión de " +
      "DeltaOps con Microsoft Graph. Si lo recibe, el canal funciona.",
  };
  try {
    await provider.send(mensaje);
    etapas.push({ etapa: "mail-send", estado: "PASS", detalle: "Mail.Send aceptado por Graph" });
    etapas.push({
      etapa: "test-email",
      estado: "ACCEPTED",
      detalle: `Correo de prueba ACEPTADO (202) para ${destino}`,
    });
  } catch (err) {
    const status = err instanceof GraphSendError ? err.status : undefined;
    const graphCode = err instanceof GraphSendError ? err.graphCode : undefined;
    etapas.push({
      etapa: "mail-send",
      estado: "FAIL",
      detalle: `Mail.Send falló: ${(err as Error).message}`,
      httpStatus: status,
      graphCode,
    });
    etapas.push({ etapa: "test-email", estado: "FAIL", detalle: "No se envió el correo de prueba" });
    return { proveedor: "m365-graph", etapas, ok: false };
  }

  return { proveedor: "m365-graph", etapas, ok: etapas.every((e) => e.estado !== "FAIL") };
}
