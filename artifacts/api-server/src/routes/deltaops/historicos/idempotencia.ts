/**
 * DELTAOPS LITE-09 · Claves deterministas de idempotencia para la importación.
 *
 * `id`/`opId` se derivan por UUIDv5 (RFC 4122, SHA-1) sobre una tupla estable:
 *   (tenant, archivo fuente, tipo de registro, Id de Forms | hash de fila).
 * JAMÁS se usan timestamps actuales en las claves ⇒ una segunda importación
 * converge a los mismos ids (0 duplicados) por el claim de opId de cada comando.
 *
 * Se implementa UUIDv5 con `node:crypto` (sin dependencia extra): namespace del
 * programa fijo, `SHA-1(namespace ++ name)`, con los bits de versión/variante.
 */
import { createHash } from "node:crypto";

/** Namespace UUID fijo del programa DeltaOps LITE-09 (constante, no aleatorio). */
export const NS_DELTAOPS_LITE09 = "6f9c2e70-1a3b-5d84-9c11-deltaops0lite09".replace(
  /[^0-9a-f]/g,
  "0",
);

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  return Buffer.from(hex, "hex");
}

function bytesToUuid(buf: Buffer): string {
  const h = buf.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** UUIDv5 determinista: SHA-1(namespace ++ name), versión 5 + variante RFC 4122. */
export function uuidv5(name: string, namespace: string = NS_DELTAOPS_LITE09): string {
  const nsBytes = uuidToBytes(namespace);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1").update(Buffer.concat([nsBytes, nameBytes])).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  return bytesToUuid(bytes);
}

/**
 * Clave determinista de un registro importado. `filaId` es el `Id` de Forms
 * cuando existe; si no, se pasa un hash del contenido de la fila (ver `hashFila`).
 */
export function claveRegistro(
  tenant: string,
  archivo: string,
  tipo: string,
  filaId: string,
): { id: string; opId: string } {
  const base = `${tenant}|${archivo}|${tipo}|${filaId}`;
  return {
    id: uuidv5(`id:${base}`),
    opId: uuidv5(`op:${base}`),
  };
}

/** Hash estable del contenido de una fila (para filas sin `Id` de Forms). */
export function hashFila(valores: ReadonlyArray<unknown>): string {
  const norm = valores.map((v) => (v == null ? "" : String(v))).join("\u0001");
  return createHash("sha1").update(norm, "utf8").digest("hex");
}
