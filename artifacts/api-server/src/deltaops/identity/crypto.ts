/**
 * DeltaOps · DGP-017 — Utilidades criptográficas de identidad.
 * - Hash de contraseñas con bcrypt (ya presente en el stack; NUNCA texto plano).
 * - Generación de tokens seguros (recuperación / invitación) y su hash SHA-256
 *   para almacenamiento (el token en claro solo viaja al destinatario, jamás se
 *   persiste en claro).
 */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** ¿El hash almacenado es un hash bcrypt válido (y no texto plano)? */
export function esHashBcrypt(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash);
}

/** Genera un token opaco seguro (URL-safe) para enlaces de un solo uso. */
export function generarToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Hash SHA-256 (hex) para persistir tokens sin exponerlos en claro. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
