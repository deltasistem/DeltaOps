/**
 * DELTAOPS LITE-11 §11/§12 (S-1 / I-03) — comportamiento FAIL-FAST de la
 * resolución de la cadena de conexión de runtime. Función PURA: no crea pools.
 */
import { describe, expect, it } from "vitest";
import {
  resolveRuntimeConnectionString,
  validateNeonProductionConnectionString,
  type EntornoConexion,
} from "../runtime-connection";

const base: EntornoConexion = {
  PGHOST: "db.internal",
  PGPORT: "5432",
  PGDATABASE: "heliumdb",
  DATABASE_URL: "postgres://admin:secreto@db.internal:5432/heliumdb",
};

const neonUrl =
  "postgresql://deltaops_app:app-pass@ep-example.neon.tech/neondb?sslmode=require";

describe("resolveRuntimeConnectionString · runtime deltaops_app y FAIL-FAST", () => {
  it("compone la conexión del rol de mínimo privilegio cuando hay DELTAOPS_APP_PASSWORD", () => {
    const url = resolveRuntimeConnectionString({
      ...base,
      DELTAOPS_APP_PASSWORD: "app-pass",
    });
    expect(url).toBe(
      "postgres://deltaops_app:app-pass@db.internal:5432/heliumdb",
    );
    // NUNCA cae al admin de DATABASE_URL cuando hay password de app.
    expect(url).not.toContain("admin");
  });

  it("usa el rol owner solo cuando se pide EXPLÍCITAMENTE (migración)", () => {
    const url = resolveRuntimeConnectionString({
      ...base,
      DELTAOPS_DB_ROLE: "owner",
      DELTAOPS_OWNER_PASSWORD: "owner-pass",
    });
    expect(url).toBe(
      "postgres://deltaops_owner:owner-pass@db.internal:5432/heliumdb",
    );
  });

  it("en producción selecciona exclusivamente NEON_DATABASE_URL", () => {
    const url = resolveRuntimeConnectionString({
      ...base,
      NODE_ENV: "production",
      DELTAOPS_APP_PASSWORD: "password-helium-que-debe-ignorarse",
      NEON_DATABASE_URL: neonUrl,
    });
    expect(url).toBe(neonUrl);
    expect(url).not.toContain("db.internal");
    expect(url).not.toContain("heliumdb");
  });

  it("LANZA en producción si falta NEON_DATABASE_URL (no fallback a heliumdb)", () => {
    expect(() =>
      resolveRuntimeConnectionString({
        ...base,
        NODE_ENV: "production",
        DELTAOPS_APP_PASSWORD: "app-pass",
        // sin NEON_DATABASE_URL, sin DELTAOPS_DB_ROLE=owner
      }),
    ).toThrow(/FAIL-FAST.*NEON_DATABASE_URL.*producción/i);
  });

  it("los errores de validación Neon NO exponen secretos ni la URL", () => {
    const invalida =
      "postgresql://deltaops_owner:secreto-neon@ep-example.neon.tech/neondb?sslmode=require";
    let msg = "";
    try {
      validateNeonProductionConnectionString(invalida);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).not.toContain("secreto-neon");
    expect(msg).not.toContain(invalida);
  });

  it("en producción con DELTAOPS_DB_ROLE=owner explícito, permite el camino owner/migración", () => {
    const url = resolveRuntimeConnectionString({
      ...base,
      NODE_ENV: "production",
      DELTAOPS_DB_ROLE: "owner",
      DELTAOPS_OWNER_PASSWORD: "owner-pass",
    });
    expect(url).toBe(
      "postgres://deltaops_owner:owner-pass@db.internal:5432/heliumdb",
    );
  });

  it("fuera de producción, sin DELTAOPS_APP_PASSWORD, hace fallback a DATABASE_URL (rollback documentado)", () => {
    const url = resolveRuntimeConnectionString({
      ...base,
      NODE_ENV: "development",
    });
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

  it("rechaza un usuario productivo diferente de deltaops_app", () => {
    expect(() =>
      validateNeonProductionConnectionString(
        "postgresql://deltaops_owner:x@ep-example.neon.tech/neondb?sslmode=require",
      ),
    ).toThrow(/deltaops_app.*owner\/admin/i);
  });

  it("rechaza una base productiva diferente de neondb", () => {
    expect(() =>
      validateNeonProductionConnectionString(
        "postgresql://deltaops_app:x@ep-example.neon.tech/heliumdb?sslmode=require",
      ),
    ).toThrow(/neondb/i);
  });

  it.each([
    "postgresql://deltaops_app:x@ep-example.neon.tech/neondb",
    "postgresql://deltaops_app:x@ep-example.neon.tech/neondb?sslmode=disable",
    "postgresql://deltaops_app:x@ep-example.neon.tech/neondb?sslmode=prefer",
  ])("rechaza Neon sin un sslmode seguro", (url) => {
    expect(() => validateNeonProductionConnectionString(url)).toThrow(
      /sslmode=require.*disable/i,
    );
  });
});
