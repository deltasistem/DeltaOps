/**
 * DGP-008.3 · Servido de URLs firmadas de adjuntos (platform.attachment).
 *
 * La plataforma emite URLs firmadas (HMAC + TTL) que apuntan a
 * `/api/deltaops/platform/attachments/:id`. Este handler VERIFICA la firma y la
 * expiración SIN sesión (la firma ES la autorización) y, como la plataforma es
 * REFERENCIA-ONLY (nunca almacena binarios), devuelve los METADATOS del adjunto
 * más la referencia — nunca contenido binario. Debe montarse ANTES del router
 * de la consola de plataforma para no quedar tras su middleware de admin.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { createExecutionContext, SYSTEM_PRINCIPAL } from "@workspace/kernel";
import { resolverSecretoAdjuntos } from "@workspace/platform";
import { activosRuntime } from "./activos-runtime";

const router: IRouter = Router();

/** HMAC-SHA256 idéntico al de platform.attachment.signedUrl. */
function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function firmaValida(esperada: string, recibida: string): boolean {
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recibida, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

router.get("/deltaops/platform/attachments/:id", async (req, res): Promise<void> => {
  const id = req.params.id;
  const tenant = typeof req.query.tenant === "string" ? req.query.tenant : "";
  const expires = typeof req.query.expires === "string" ? Number(req.query.expires) : NaN;
  const signature = typeof req.query.signature === "string" ? req.query.signature : "";

  if (!tenant || !Number.isFinite(expires) || !signature) {
    res.status(400).json({ error: "URL firmada incompleta", code: "KRN-VAL-001" });
    return;
  }
  // LITE-11 §10 (S-2) — misma resolución que al firmar: ATTACHMENT_URL_SECRET
  // (dedicada) con fallback a SESSION_SECRET.
  const secret = resolverSecretoAdjuntos();
  if (!secret) {
    res.status(500).json({
      error: "Ni ATTACHMENT_URL_SECRET ni SESSION_SECRET configurados",
      code: "KRN-INF-001",
    });
    return;
  }
  // Verificación HMAC (payload = tenant:id:expires) — la firma es la autorización.
  const esperada = sign(secret, `${tenant}:${id}:${expires}`);
  if (!firmaValida(esperada, signature)) {
    res.status(403).json({ error: "Firma inválida", code: "KRN-AUTH-001" });
    return;
  }
  // TTL: URL expirada ⇒ 403.
  if (Date.now() > expires) {
    res.status(403).json({ error: "URL firmada expirada", code: "KRN-AUTH-002" });
    return;
  }

  // Metadatos del adjunto (tenant-scoped) — nunca binarios (referencia-only).
  const sys = createExecutionContext({
    principal: SYSTEM_PRINCIPAL,
    metadata: { tenantId: tenant },
  });
  const meta = await activosRuntime().platform.kernel.queries.execute(sys, "platform.attachment.get", { id });
  if (!meta.ok) {
    res.status(500).json({ error: meta.error.message, code: meta.error.code });
    return;
  }
  const rec = meta.value as { data?: Record<string, unknown> } | null;
  if (!rec) {
    res.status(404).json({ error: "Adjunto no encontrado", code: "KRN-NF-001" });
    return;
  }
  res.json({
    attachmentId: id,
    almacenamiento: "referencia",
    nota: "La plataforma es referencia-only: no almacena binarios. Se devuelven metadatos + referencia (hash) para que el cliente resuelva el contenido en el origen indicado.",
    nombreArchivo: rec.data?.["nombreArchivo"] ?? null,
    mimeType: rec.data?.["mimeType"] ?? null,
    tamanoBytes: rec.data?.["tamanoBytes"] ?? null,
    hashSha256: rec.data?.["hashSha256"] ?? null,
    fileVersion: rec.data?.["fileVersion"] ?? null,
    entityRef: rec.data?.["entityRef"] ?? null,
  });
});

export default router;
