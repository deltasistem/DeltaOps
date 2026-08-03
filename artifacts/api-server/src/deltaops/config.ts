import { z } from "zod/v4";

/**
 * DeltaOps · DGP-001 — Configuración por ambientes.
 * Toda variable de entorno que consume la plataforma DeltaOps se declara y
 * valida aquí. Fallo explícito al arrancar si falta algo (sin fallbacks
 * silenciosos), conforme al corpus de ingeniería.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET es obligatoria"),
  LOG_LEVEL: z.string().optional(),
});

export type DeltaopsEnv = z.infer<typeof envSchema>;

export function loadDeltaopsConfig(
  env: NodeJS.ProcessEnv = process.env,
): DeltaopsEnv {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Configuración DeltaOps inválida: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

export const DELTAOPS_PLATFORM = {
  name: "DeltaOps",
  version: "0.1.0-dgp001",
} as const;
