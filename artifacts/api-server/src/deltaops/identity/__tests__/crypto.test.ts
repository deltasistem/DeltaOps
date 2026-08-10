/**
 * DGP-017 · Criptografía de identidad — hash de contraseñas y tokens.
 */
import { describe, expect, it } from "vitest";
import { esHashBcrypt, generarToken, hashPassword, hashToken, verifyPassword } from "../crypto";

describe("Crypto · contraseñas y tokens", () => {
  it("hashea y verifica contraseñas (bcrypt, nunca texto plano)", async () => {
    const hash = await hashPassword("Secreto123!");
    expect(hash).not.toBe("Secreto123!");
    expect(esHashBcrypt(hash)).toBe(true);
    expect(await verifyPassword("Secreto123!", hash)).toBe(true);
    expect(await verifyPassword("otra", hash)).toBe(false);
  });

  it("detecta hashes no-bcrypt (texto plano inseguro)", () => {
    expect(esHashBcrypt("plano")).toBe(false);
  });

  it("genera tokens únicos y su hash SHA-256 estable", () => {
    const a = generarToken();
    const b = generarToken();
    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
