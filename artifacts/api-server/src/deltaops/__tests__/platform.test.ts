import { describe, expect, it } from "vitest";
import { loadDeltaopsConfig, DELTAOPS_PLATFORM } from "../config";
import { getDeltaopsMetrics } from "../metrics";
import { DeltaopsHttpError } from "../errors";

/**
 * DeltaOps · DGP-001 — Testing base.
 * Pruebas unitarias de la fábrica: configuración, métricas y errores.
 * Incluye caminos tristes (configuración inválida) conforme a ESI-009/23.
 */
describe("configuración por ambientes", () => {
  it("acepta un entorno válido", () => {
    const config = loadDeltaopsConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://localhost/test",
      SESSION_SECRET: "secreto-de-prueba",
    } as NodeJS.ProcessEnv);
    expect(config.NODE_ENV).toBe("test");
    expect(config.DATABASE_URL).toContain("postgres://");
  });

  it("falla explícitamente si falta DATABASE_URL (camino triste)", () => {
    expect(() =>
      loadDeltaopsConfig({
        NODE_ENV: "test",
        SESSION_SECRET: "x",
      } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });

  it("en producción exige NEON_DATABASE_URL y no DATABASE_URL", () => {
    const config = loadDeltaopsConfig({
      NODE_ENV: "production",
      NEON_DATABASE_URL:
        "postgresql://deltaops_app:x@ep-example.neon.tech/neondb?sslmode=require",
      DELTAOPS_APP_PASSWORD: "password-productivo",
      SESSION_SECRET: "x",
    } as NodeJS.ProcessEnv);
    expect(config.NEON_DATABASE_URL).toContain("neondb");
    expect(config.DATABASE_URL).toBeUndefined();
  });

  it("falla explícitamente si falta NEON_DATABASE_URL en producción", () => {
    expect(() =>
      loadDeltaopsConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://localhost/heliumdb",
        DELTAOPS_APP_PASSWORD: "password-productivo",
        SESSION_SECRET: "x",
      } as NodeJS.ProcessEnv),
    ).toThrow(/NEON_DATABASE_URL/);
  });

  it("falla explícitamente si falta DELTAOPS_APP_PASSWORD en producción", () => {
    expect(() =>
      loadDeltaopsConfig({
        NODE_ENV: "production",
        NEON_DATABASE_URL:
          "postgresql://deltaops_app@ep-example.neon.tech/neondb?sslmode=require",
        SESSION_SECRET: "x",
      } as NodeJS.ProcessEnv),
    ).toThrow(/DELTAOPS_APP_PASSWORD/);
  });

  it("falla explícitamente si falta SESSION_SECRET (camino triste)", () => {
    expect(() =>
      loadDeltaopsConfig({
        NODE_ENV: "test",
        DATABASE_URL: "postgres://localhost/test",
      } as NodeJS.ProcessEnv),
    ).toThrow(/SESSION_SECRET/);
  });

  it("rechaza NODE_ENV desconocido (camino triste)", () => {
    expect(() =>
      loadDeltaopsConfig({
        NODE_ENV: "staging-inventado",
        DATABASE_URL: "postgres://localhost/test",
        SESSION_SECRET: "x",
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });
});

describe("observabilidad mínima", () => {
  it("expone contadores derivados con la forma del contrato", () => {
    const m = getDeltaopsMetrics();
    expect(m.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(m.requestCount)).toBe(true);
    expect(Number.isInteger(m.errorCount)).toBe(true);
  });
});

describe("manejo centralizado de errores", () => {
  it("DeltaopsHttpError transporta el status", () => {
    const err = new DeltaopsHttpError(404, "No encontrado");
    expect(err.status).toBe(404);
    expect(err.message).toBe("No encontrado");
  });
});

describe("identidad de la plataforma", () => {
  it("versión DGP-001", () => {
    expect(DELTAOPS_PLATFORM.name).toBe("DeltaOps");
    expect(DELTAOPS_PLATFORM.version).toContain("dgp001");
  });
});
