/**
 * DeltaOps Kernel · Configuration Resolver.
 * Resolución de configuración por capas con precedencia explícita
 * (la primera fuente que responde gana). Tipado y con fallo explícito
 * para claves obligatorias ausentes.
 */
import type { ConfigSourcePort } from "./ports";
import { KernelErrors } from "./errors";
import { fail, ok, type Result } from "./result";

export class MapConfigSource implements ConfigSourcePort {
  constructor(
    public readonly name: string,
    private readonly values: Record<string, string>,
  ) {}
  get(key: string): string | undefined {
    return this.values[key];
  }
}

export class EnvConfigSource implements ConfigSourcePort {
  public readonly name = "env";
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  get(key: string): string | undefined {
    return this.env[key];
  }
}

export class ConfigurationResolver {
  /** Las fuentes se consultan en orden: la primera con valor gana. */
  constructor(private readonly sources: readonly ConfigSourcePort[]) {}

  get(key: string): Result<string> {
    for (const source of this.sources) {
      const value = source.get(key);
      if (value !== undefined) return ok(value);
    }
    return fail(
      KernelErrors.validation(`Configuración ausente: ${key}`, { key }),
    );
  }

  getOrDefault(key: string, defaultValue: string): string {
    const r = this.get(key);
    return r.ok ? r.value : defaultValue;
  }

  getNumber(key: string): Result<number> {
    const r = this.get(key);
    if (!r.ok) return r;
    const n = Number(r.value);
    if (Number.isNaN(n)) {
      return fail(
        KernelErrors.validation(`Configuración no numérica: ${key}`, {
          key,
          value: r.value,
        }),
      );
    }
    return ok(n);
  }

  getBoolean(key: string): Result<boolean> {
    const r = this.get(key);
    if (!r.ok) return r;
    if (r.value === "true" || r.value === "1") return ok(true);
    if (r.value === "false" || r.value === "0") return ok(false);
    return fail(
      KernelErrors.validation(`Configuración no booleana: ${key}`, {
        key,
        value: r.value,
      }),
    );
  }
}
