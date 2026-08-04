/**
 * DGP-008.3 · Cálculo de hash SHA-256 en cliente (SubtleCrypto).
 * Usado para registrar la referencia de un adjunto (metadatos + hash), sin
 * subir el binario (el módulo sólo almacena metadatos + hash).
 */

/** Calcula el SHA-256 (hex, 64 chars) de un ArrayBuffer/Blob. */
export async function sha256Hex(datos: ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Calcula el SHA-256 de un File. */
export async function hashArchivo(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return sha256Hex(buf);
}
