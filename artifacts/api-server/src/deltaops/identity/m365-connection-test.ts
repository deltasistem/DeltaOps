/**
 * DeltaOps · Prueba de conexión/envío controlada de Microsoft 365.
 *
 * Diagnóstico por ETAPAS que NUNCA expone secretos. Reutilizado por:
 *   - endpoint SUPER_ADMIN de estado de notificaciones (platform-console).
 *   - CLI/script de smoke test (`scripts/m365-smoke.ts`).
 *
 * Etapas: configuración válida → OAuth → conexión/entrega SMTP → correo de
 * prueba. Cada etapa devuelve PASS/FAIL + detalle textual redactado.
 */
import type { EmailMessage } from "./email";
import {
  M365EmailProvider,
  resolverConfigM365,
  redactarSecretos,
  type FetchLike,
  type RelojMs,
  type TransportFactory,
} from "./m365-email";
import { construirProveedorM365 } from "./notification-provider";

export type EstadoEtapa = "PASS" | "FAIL" | "SKIP";

export interface EtapaResultado {
  etapa: "config" | "oauth" | "smtp" | "test-email";
  estado: EstadoEtapa;
  detalle: string;
}

export interface ResultadoPruebaM365 {
  proveedor: "m365";
  etapas: EtapaResultado[];
  ok: boolean;
}

export interface PruebaM365Deps {
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  now?: RelojMs;
  transportFactory?: TransportFactory;
  /** Si se indica, se intenta un envío de prueba a esta dirección. */
  destinoPrueba?: string;
}

/**
 * Ejecuta la prueba de conexión M365 por etapas. No lanza: siempre devuelve el
 * reporte con PASS/FAIL. Si no hay `destinoPrueba`, la etapa test-email = SKIP
 * salvo que se use el `M365_MAIL_FROM` como destino explícito.
 */
export async function probarConexionM365(
  deps: PruebaM365Deps = {},
): Promise<ResultadoPruebaM365> {
  const env = deps.env ?? process.env;
  const etapas: EtapaResultado[] = [];

  // Etapa 1: configuración.
  const cfg = resolverConfigM365(env);
  if (!cfg.ok) {
    etapas.push({
      etapa: "config",
      estado: "FAIL",
      detalle: `Config inválida: ${cfg.issues.map((i) => `${i.campo} (${i.motivo})`).join("; ")}`,
    });
    return { proveedor: "m365", etapas, ok: false };
  }
  etapas.push({
    etapa: "config",
    estado: "PASS",
    detalle: `SMTP ${cfg.config.smtpHost}:${cfg.config.smtpPort} secure=${cfg.config.smtpSecure}`,
  });

  const { oauth } = construirProveedorM365(cfg.config, {
    env,
    fetch: deps.fetch,
    now: deps.now,
  });

  // Etapa 2: OAuth.
  try {
    await oauth.obtenerToken();
    etapas.push({ etapa: "oauth", estado: "PASS", detalle: "Token OAuth obtenido" });
  } catch (err) {
    etapas.push({
      etapa: "oauth",
      estado: "FAIL",
      detalle: `OAuth falló: ${(err as Error).message}`,
    });
    return { proveedor: "m365", etapas, ok: false };
  }

  // Etapa 3 + 4: SMTP y correo de prueba (un único envío verifica ambas).
  const destino = deps.destinoPrueba ?? cfg.config.from;
  const provider = new M365EmailProvider(cfg.config, {
    oauth,
    transportFactory: deps.transportFactory,
  });
  const mensaje: EmailMessage = {
    tenantId: "diagnostico",
    idempotencyKey: `m365-selftest-${destino}`,
    tipo: "seguridad",
    destinatario: destino,
    idioma: "es",
    asunto: "DeltaOps · Prueba de conexión Microsoft 365",
    cuerpo:
      "Este es un correo de prueba automático generado por la verificación de " +
      "conexión de DeltaOps con Microsoft 365. Si lo recibe, el canal funciona.",
  };
  try {
    await provider.send(mensaje);
    etapas.push({ etapa: "smtp", estado: "PASS", detalle: "Conexión/entrega SMTP OK" });
    etapas.push({
      etapa: "test-email",
      estado: "PASS",
      detalle: `Correo de prueba entregado a ${destino}`,
    });
  } catch (err) {
    etapas.push({
      etapa: "smtp",
      estado: "FAIL",
      detalle: `SMTP/entrega falló: ${(err as Error).message}`,
    });
    etapas.push({ etapa: "test-email", estado: "FAIL", detalle: "No se envió el correo de prueba" });
    return { proveedor: "m365", etapas, ok: false };
  }

  return {
    proveedor: "m365",
    etapas,
    ok: etapas.every((e) => e.estado !== "FAIL"),
  };
}

/** Serialización segura del reporte para respuestas HTTP/logs (sin secretos). */
export function reporteSeguro(r: ResultadoPruebaM365): ResultadoPruebaM365 {
  return redactarSecretos(r);
}
