/**
 * DeltaOps · DGP-017 — Plataforma centralizada de notificaciones por correo.
 *
 * NotificationPort / EmailNotificationPort: abstracción desacoplada del
 * proveedor. Ningún módulo de negocio se acopla al proveedor concreto; encolan
 * a través de `enqueueEmail`, que persiste en `deltaops.ntf_email_outbox` con
 * IDEMPOTENCIA (idempotency_key único por tenant → sin duplicados) y luego se
 * entrega vía el puerto configurado.
 *
 * - Plantillas en ES con separación contenido/presentación/branding/idioma.
 * - Placeholders `{{var}}` escapados (sin HTML arbitrario de usuarios).
 * - i18n preparado (columna idioma; catálogo por clave+idioma).
 * - Proveedor Fake (tests) + proveedor Microsoft Graph real (por Secrets GRAPH_*).
 *
 * Tipos mínimos: bienvenida, invitacion, recuperacion, cambio-password,
 * cuenta-deshabilitada, cuenta-habilitada, seguridad. El CONTRATO admite tipos
 * de negocio futuros (ot-asignada, sla-riesgo, stock-bajo…) SIN implementarlos.
 */
import { withTenant } from "./db-helpers";

/* ------------------------------- Contratos -------------------------------- */

export type TipoNotificacion =
  | "bienvenida"
  | "invitacion"
  | "recuperacion"
  | "cambio-password"
  | "cuenta-deshabilitada"
  | "cuenta-habilitada"
  | "seguridad"
  // Contrato preparado para negocio futuro (NO implementado en DGP-017):
  | "ot-asignada"
  | "ot-por-vencer"
  | "sla-riesgo"
  | "aprobacion-pendiente"
  | "stock-bajo"
  | "transferencia-pendiente"
  | "alerta-operacional";

export interface EmailBranding {
  nombreApp?: string;
  nombreEmpresa?: string;
  logoUrl?: string;
  colorPrimario?: string;
  colorSecundario?: string;
}

export interface EmailMessage {
  tenantId: string;
  idempotencyKey: string;
  tipo: TipoNotificacion;
  destinatario: string;
  idioma?: string;
  asunto: string;
  cuerpo: string;
  branding?: EmailBranding;
  metadata?: Record<string, unknown>;
}

/** Puerto de entrega de correo (proveedor). */
export interface EmailNotificationPort {
  readonly nombre: string;
  send(message: EmailMessage): Promise<void>;
}

/* ------------------------------ Proveedores ------------------------------- */

/** Proveedor Fake para pruebas: acumula en memoria, sin salida real. */
export class FakeEmailProvider implements EmailNotificationPort {
  readonly nombre = "fake";
  readonly enviados: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.enviados.push(message);
  }
}

// El adaptador concreto de producción es Microsoft Graph
// (`M365GraphEmailProvider`), resuelto por `notification-provider.ts` e
// instalado al arrancar (`app.ts`). Ya NO existe proveedor SMTP/nodemailer.

let providerSingleton: EmailNotificationPort | null = null;
export function emailProvider(): EmailNotificationPort {
  // Default perezoso: FakeEmailProvider. El proveedor real (Graph) se instala
  // explícitamente en el arranque vía `instalarProveedorNotificaciones`.
  if (!providerSingleton) providerSingleton = new FakeEmailProvider();
  return providerSingleton;
}
/** Inyecta un proveedor (usado por tests para el Fake). */
export function setEmailProvider(p: EmailNotificationPort): void {
  providerSingleton = p;
}

/* ------------------------------- Plantillas ------------------------------- */

interface Plantilla {
  asunto: string;
  cuerpo: string;
}

/**
 * Catálogo de plantillas ES. Contenido separado de branding/idioma. Los
 * placeholders `{{var}}` se sustituyen con datos escapados. Sin HTML de usuario.
 */
const PLANTILLAS_ES: Partial<Record<TipoNotificacion, Plantilla>> = {
  bienvenida: {
    asunto: "Bienvenido(a) a {{nombreApp}}",
    cuerpo:
      "Hola {{nombre}},\n\nSu cuenta en {{nombreEmpresa}} ha sido creada.\n" +
      "Ya puede iniciar sesión en {{nombreApp}}.\n\n— Equipo {{nombreApp}}",
  },
  invitacion: {
    asunto: "Invitación a {{nombreEmpresa}} en {{nombreApp}}",
    cuerpo:
      "Hola,\n\nHa sido invitado(a) a unirse a {{nombreEmpresa}} con el rol {{rol}}.\n" +
      "Acepte la invitación aquí: {{enlace}}\n\n" +
      "Este enlace es de un solo uso y expira el {{expira}}.\n\n— {{nombreApp}}",
  },
  recuperacion: {
    asunto: "Recuperación de acceso — {{nombreApp}}",
    cuerpo:
      "Hola {{nombre}},\n\nRecibimos una solicitud para restablecer su contraseña.\n" +
      "Restablézcala aquí: {{enlace}}\n\n" +
      "Si no fue usted, ignore este mensaje. El enlace es de un solo uso y expira el {{expira}}.\n\n— {{nombreApp}}",
  },
  "cambio-password": {
    asunto: "Su contraseña fue actualizada — {{nombreApp}}",
    cuerpo:
      "Hola {{nombre}},\n\nSu contraseña en {{nombreEmpresa}} fue actualizada correctamente.\n" +
      "Si no reconoce esta acción, contacte a su administrador.\n\n— {{nombreApp}}",
  },
  "cuenta-deshabilitada": {
    asunto: "Su cuenta fue deshabilitada — {{nombreApp}}",
    cuerpo:
      "Hola {{nombre}},\n\nSu acceso a {{nombreEmpresa}} ha sido deshabilitado.\n" +
      "Si cree que es un error, contacte a su administrador.\n\n— {{nombreApp}}",
  },
  "cuenta-habilitada": {
    asunto: "Su cuenta fue habilitada — {{nombreApp}}",
    cuerpo:
      "Hola {{nombre}},\n\nSu acceso a {{nombreEmpresa}} ha sido habilitado nuevamente.\n\n— {{nombreApp}}",
  },
  seguridad: {
    asunto: "Alerta de seguridad — {{nombreApp}}",
    cuerpo:
      "Hola {{nombre}},\n\nDetectamos un evento de seguridad relevante en su cuenta:\n{{detalle}}\n\n— {{nombreApp}}",
  },
};

/** Escapa un valor para evitar inyección de contenido en el cuerpo/asunto. */
function escapar(v: unknown): string {
  return String(v ?? "")
    .replace(/[<>]/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function render(plantilla: string, datos: Record<string, unknown>): string {
  return plantilla.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, k: string) =>
    escapar(datos[k]),
  );
}

export interface RenderInput {
  tipo: TipoNotificacion;
  datos: Record<string, unknown>;
  branding?: EmailBranding;
  idioma?: string;
}

/** Renderiza asunto+cuerpo de una plantilla con branding e idioma. */
export function renderPlantilla(input: RenderInput): { asunto: string; cuerpo: string } {
  const plantilla = PLANTILLAS_ES[input.tipo];
  if (!plantilla) {
    throw new Error(`Plantilla de correo no definida para tipo: ${input.tipo}`);
  }
  const datos = {
    nombreApp: input.branding?.nombreApp ?? "DeltaOps",
    nombreEmpresa: input.branding?.nombreEmpresa ?? "DeltaOps",
    ...input.datos,
  };
  return {
    asunto: render(plantilla.asunto, datos),
    cuerpo: render(plantilla.cuerpo, datos),
  };
}

/* ----------------------------- Cola de correo ----------------------------- */

export interface EnqueueInput {
  tenantId: string;
  tipo: TipoNotificacion;
  destinatario: string;
  idempotencyKey: string;
  datos: Record<string, unknown>;
  branding?: EmailBranding;
  idioma?: string;
  metadata?: Record<string, unknown>;
}

export interface EnqueueResult {
  emailId: string;
  duplicado: boolean;
  entregado: boolean;
}

/**
 * Encola un correo (idempotente por (tenant, idempotencyKey)) y lo entrega con
 * el proveedor configurado. Si ya existía la clave, NO duplica ni reenvía.
 */
export async function enqueueEmail(input: EnqueueInput): Promise<EnqueueResult> {
  const { asunto, cuerpo } = renderPlantilla({
    tipo: input.tipo,
    datos: input.datos,
    branding: input.branding,
    idioma: input.idioma,
  });

  const inserted = await withTenant(input.tenantId, async (client) => {
    const r = await client.query<{ email_id: string }>(
      `INSERT INTO deltaops.ntf_email_outbox
         (tenant_id, idempotency_key, tipo, destinatario, idioma, asunto, cuerpo, branding, metadata, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'QUEUED')
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING email_id`,
      [
        input.tenantId,
        input.idempotencyKey,
        input.tipo,
        input.destinatario,
        input.idioma ?? "es",
        asunto,
        cuerpo,
        JSON.stringify(input.branding ?? {}),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return r.rows[0]?.email_id ?? null;
  });

  if (!inserted) {
    // Duplicado: recuperar el existente para devolver su id (sin reenviar).
    const existente = await withTenant(input.tenantId, async (client) => {
      const r = await client.query<{ email_id: string }>(
        `SELECT email_id FROM deltaops.ntf_email_outbox
         WHERE tenant_id=$1 AND idempotency_key=$2`,
        [input.tenantId, input.idempotencyKey],
      );
      return r.rows[0]?.email_id ?? "";
    });
    return { emailId: existente, duplicado: true, entregado: false };
  }

  // Entrega vía puerto configurado; marca estado.
  const message: EmailMessage = {
    tenantId: input.tenantId,
    idempotencyKey: input.idempotencyKey,
    tipo: input.tipo,
    destinatario: input.destinatario,
    idioma: input.idioma ?? "es",
    asunto,
    cuerpo,
    branding: input.branding,
    metadata: input.metadata,
  };
  try {
    await emailProvider().send(message);
    await withTenant(input.tenantId, async (client) => {
      await client.query(
        `UPDATE deltaops.ntf_email_outbox
           SET estado='SENT', sent_at=now(), intentos=intentos+1, updated_at=now()
         WHERE tenant_id=$1 AND email_id=$2`,
        [input.tenantId, inserted],
      );
    });
    return { emailId: inserted, duplicado: false, entregado: true };
  } catch (err) {
    await withTenant(input.tenantId, async (client) => {
      await client.query(
        `UPDATE deltaops.ntf_email_outbox
           SET estado='FAILED', intentos=intentos+1, error=$3, updated_at=now()
         WHERE tenant_id=$1 AND email_id=$2`,
        [input.tenantId, inserted, String((err as Error).message ?? err)],
      );
    });
    return { emailId: inserted, duplicado: false, entregado: false };
  }
}

/** Lista el estado de la cola de correo de un tenant (para SUPER_ADMIN/admin). */
export async function listarCorreos(
  tenantId: string,
  limit = 100,
): Promise<
  Array<{
    emailId: string;
    tipo: string;
    destinatario: string;
    asunto: string;
    estado: string;
    createdAt: string;
    sentAt: string | null;
  }>
> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT email_id, tipo, destinatario, asunto, estado, created_at, sent_at
       FROM deltaops.ntf_email_outbox
       WHERE tenant_id=$1
       ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit],
    );
    return r.rows.map((row: Record<string, any>) => ({
      emailId: row.email_id,
      tipo: row.tipo,
      destinatario: row.destinatario,
      asunto: row.asunto,
      estado: row.estado,
      createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
      sentAt: row.sent_at ? (row.sent_at.toISOString?.() ?? String(row.sent_at)) : null,
    }));
  });
}
