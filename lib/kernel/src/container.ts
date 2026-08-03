/**
 * DeltaOps Kernel · Dependency Injection.
 * Contenedor mínimo, tipado y explícito: tokens simbólicos, ciclos de vida
 * singleton/transient, ámbitos derivables y detección de dependencias
 * circulares. Sin decoradores ni reflexión — todo cableado es visible.
 */
export interface Token<T> {
  readonly key: symbol;
  readonly description: string;
  readonly __type?: T;
}

export function token<T>(description: string): Token<T> {
  return { key: Symbol(description), description };
}

export type Lifetime = "singleton" | "transient";

type Factory<T> = (c: Container) => T;

interface Registration<T> {
  factory: Factory<T>;
  lifetime: Lifetime;
}

export class Container {
  private readonly registrations = new Map<symbol, Registration<unknown>>();
  private readonly singletons = new Map<symbol, unknown>();
  private readonly resolving = new Set<symbol>();

  constructor(private readonly parent?: Container) {}

  register<T>(
    tok: Token<T>,
    factory: Factory<T>,
    lifetime: Lifetime = "singleton",
  ): this {
    this.registrations.set(tok.key, { factory, lifetime });
    return this;
  }

  registerValue<T>(tok: Token<T>, value: T): this {
    return this.register(tok, () => value, "singleton");
  }

  has<T>(tok: Token<T>): boolean {
    return (
      this.registrations.has(tok.key) || (this.parent?.has(tok) ?? false)
    );
  }

  resolve<T>(tok: Token<T>): T {
    const reg = this.registrations.get(tok.key) as Registration<T> | undefined;
    if (!reg) {
      if (this.parent) return this.parent.resolve(tok);
      throw new Error(`DI: token no registrado: ${tok.description}`);
    }
    if (this.resolving.has(tok.key)) {
      throw new Error(`DI: dependencia circular detectada en: ${tok.description}`);
    }
    if (reg.lifetime === "singleton" && this.singletons.has(tok.key)) {
      return this.singletons.get(tok.key) as T;
    }
    this.resolving.add(tok.key);
    try {
      const instance = reg.factory(this);
      if (reg.lifetime === "singleton") {
        this.singletons.set(tok.key, instance);
      }
      return instance;
    } finally {
      this.resolving.delete(tok.key);
    }
  }

  /** Ámbito hijo: hereda registros, aísla singletons propios. */
  createScope(): Container {
    return new Container(this);
  }
}
