/**
 * DELTAOPS LITE-11 §11/§12 (S-1 / I-03) — comportamiento FAIL-FAST de la
 * resolución de la cadena de conexión de runtime. Función PURA: no crea pools.
 */
import { describe, expect, it } from "vitest";
import {
  resolveRuntimeConnectionString,
  type EntornoConexion,
} from "../runtime-connection";

const base: EntornoConexion = {
  PGHOST: "db.internal",
  PGPORT: "5432",
  PGDATABASE: "heliumdb",
  DATABASE_URL: "postgres://admin:secreto@db.internal:5432/heliumdb",
};

describe("resolveRuntimeConnectionString · runtime deltaops_app y FAIL-FAST", () => {
  it("compone la conexión del rol de mínimo privilegio cuando hay DELTAOPS_APP_PASSWORD", () => {
    const url = resolveRuntimeConnectionString({
      ...base,
      DELTAOPS_APP_PASSWORD: "app-pass",
    });
    expect(url).toBe("postgres://deltaops_app:app-pass@db.internal:5432/heliumdb");
    // NUNCA cae al admin de DATABASE_URL cuando hay password de app.
    expect(url).not.toContain("admin");
  });

  it("usa el rol owner solo cuando se pide EXPLÍCITAMENTE (migración)", () => {
    const url = resolveRuntimeConnectionString({
      ...base,
      DELTAOPS_DB_ROLE: "owner",
      DELTAOPS_OWNER_PASSWORD: "owner-pass",
    });
    expect(url).toBe("postgres://deltaops_owner:owner-pass@db.internal:5432/heliumdb");
  });

  it("LANZA en producción si falta DELTAOPS_APP_PASSWORD y no es owner (no fallback silencioso)", () => {
    expect(() =>
      resolveRuntimeConnectionString({
        ...base,
        NODE_ENV: "production",
        // sin DELTAOPS_APP_PASSWORD, sin DELTAOPS_DB_ROLE=owner
      }),
    ).toThrow(/FAIL-FAST .*DELTAOPS_APP_PASSWORD.*producción/i);
  });

  it("el mensaje de error NO expone secretos ni la cadena admin", () => {
    let msg = "";
    try {
      resolveRuntimeConnectionString({ ...base, NODE_ENV: "production" });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).not.toContain("secreto");
    expect(msg).not.toContain(base.DATABASE_URL as string);
  });

  it("en producción con DELTAOPS_DB_ROLE=owner explícito, permite el camino owner/migración", () => {
    const url = resolveRuntimeConnectionString({
      ...base,
      NODE_ENV: "production",
      DELTAOPS_DB_ROLE: "owner",
      DELTAOPS_OWNER_PASSWORD: "owner-pass",
    });
    expect(url).toBe("postgres://deltaops_owner:owner-pass@db.internal:5432/heliumdb");
  });

  it("fuera de producción, sin DELTAOPS_APP_PASSWORD, hace fallback a DATABASE_URL (rollback documentado)", () => {
    const url = resolveRuntimeConnectionString({ ...base, NODE_ENV: "development" });
    expect(url).toBe(base.DATABASE_URL);
  });

  it("LANZA en producción con DELTAOPS_DB_ROLE=owner pero SIN DELTAOPS_OWNER_PASSWORD (MENOR-1: no fallback admin)", () => {
    // Se pidió el rol owner EXPLÍCITAMENTE pero falta su password: NO debe caer
    // al fallback silencioso a DATABASE_URL (superusuario). Debe lanzar.
    expect(() =>
      resolveRuntimeConnectionString({
        ...base,
        NODE_ENV: "production",
        DELTAOPS_DB_ROLE: "owner",
        // sin DELTAOPS_OWNER_PASSWORD
      }),
    ).toThrow(/FAIL-FAST .*MENOR-1|DELTAOPS_OWNER_PASSWORD/i);
  });

  it("el fail-fast de owner en producción NO expone la cadena admin de DATABASE_URL", () => {
    let msg = "";
    try {
      resolveRuntimeConnectionString({
        ...base,
        NODE_ENV: "production",
        DELTAOPS_DB_ROLE: "owner",
      });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).not.toContain(base.DATABASE_URL as string);
  });
});
