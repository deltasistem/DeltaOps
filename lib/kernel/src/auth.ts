/**
 * DeltaOps Kernel · Authorization Runtime.
 * Permisos (acciones atómicas), capacidades (agrupaciones funcionales) y
 * políticas (reglas contextuales). El pipeline consulta este runtime antes
 * de ejecutar cualquier comando o consulta que declare requisitos.
 */
import type { ExecutionContext, Principal } from "./context";
import { KernelErrors, type KernelError } from "./errors";
import { fail, ok, type Result } from "./result";

/* --------------------------- Permission Resolver ------------------------- */

export class PermissionResolver {
  /** rol → permisos otorgados. El comodín "*" concede todo. */
  constructor(private readonly rolePermissions: Record<string, readonly string[]> = {}) {}

  permissionsFor(principal: Principal): readonly string[] {
    const fromRole = this.rolePermissions[principal.rol] ?? [];
    return [...new Set([...principal.permisos, ...fromRole])];
  }

  hasPermission(principal: Principal, permission: string): boolean {
    const permisos = this.permissionsFor(principal);
    return permisos.includes("*") || permisos.includes(permission);
  }
}

/* --------------------------- Capability Resolver ------------------------- */

export class CapabilityResolver {
  /** capacidad → permisos que la componen. */
  constructor(private readonly capabilityMap: Record<string, readonly string[]> = {}) {}

  expand(capability: string): readonly string[] {
    return this.capabilityMap[capability] ?? [];
  }

  hasCapability(
    principal: Principal,
    capability: string,
    permissions: PermissionResolver,
  ): boolean {
    if (principal.capacidades.includes("*")) return true;
    if (principal.capacidades.includes(capability)) return true;
    const required = this.expand(capability);
    return (
      required.length > 0 &&
      required.every((p) => permissions.hasPermission(principal, p))
    );
  }
}

/* ------------------------------ Policy Engine ---------------------------- */

export type PolicyDecision = { allow: true } | { allow: false; reason: string };

export interface Policy {
  readonly name: string;
  evaluate(ctx: ExecutionContext, subject: Record<string, unknown>): PolicyDecision;
}

export class PolicyEngine {
  private readonly policies = new Map<string, Policy>();

  register(policy: Policy): this {
    this.policies.set(policy.name, policy);
    return this;
  }

  evaluate(
    name: string,
    ctx: ExecutionContext,
    subject: Record<string, unknown> = {},
  ): Result<void, KernelError> {
    const policy = this.policies.get(name);
    if (!policy) {
      return fail(
        KernelErrors.internal(`Política no registrada: ${name}`),
      );
    }
    const decision = policy.evaluate(ctx, subject);
    if (!decision.allow) {
      return fail(KernelErrors.forbidden(`${name}: ${decision.reason}`));
    }
    return ok(undefined);
  }
}

/* -------------------------- Authorization Runtime ------------------------ */

export interface AuthorizationRequirements {
  readonly permissions?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly policies?: readonly { name: string; subject?: Record<string, unknown> }[];
}

export class AuthorizationRuntime {
  constructor(
    private readonly permissions: PermissionResolver,
    private readonly capabilities: CapabilityResolver,
    private readonly policyEngine: PolicyEngine,
  ) {}

  authorize(
    ctx: ExecutionContext,
    requirements: AuthorizationRequirements,
  ): Result<void, KernelError> {
    if (ctx.principal.id === "anonymous" && this.requiresSomething(requirements)) {
      return fail(KernelErrors.unauthorized());
    }
    for (const permission of requirements.permissions ?? []) {
      if (!this.permissions.hasPermission(ctx.principal, permission)) {
        return fail(KernelErrors.forbidden(permission));
      }
    }
    for (const capability of requirements.capabilities ?? []) {
      if (!this.capabilities.hasCapability(ctx.principal, capability, this.permissions)) {
        return fail(KernelErrors.forbidden(`capability:${capability}`));
      }
    }
    for (const { name, subject } of requirements.policies ?? []) {
      const r = this.policyEngine.evaluate(name, ctx, subject ?? {});
      if (!r.ok) return r;
    }
    return ok(undefined);
  }

  private requiresSomething(req: AuthorizationRequirements): boolean {
    return (
      (req.permissions?.length ?? 0) > 0 ||
      (req.capabilities?.length ?? 0) > 0 ||
      (req.policies?.length ?? 0) > 0
    );
  }
}
