/**
 * DeltaOps Plataforma · AI Platform Service.
 * SOLO infraestructura (DGP-003): registries de conversaciones, prompts,
 * modelos, proveedores, costos, evaluaciones e inferencias + Provider
 * Interface con Fake Provider. NO integra OpenAI ni ningún proveedor real.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { audit } from "../core/audit";
import { crudCommands, storeHealthCheck } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.ai";

/* ----------------------------- Provider Interface ------------------------- */

export interface AiInferenceRequest {
  readonly model: string;
  readonly prompt: string;
  readonly options?: Record<string, unknown>;
}

export interface AiInferenceResponse {
  readonly output: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface AiProviderPort {
  readonly name: string;
  infer(request: AiInferenceRequest): Promise<Result<AiInferenceResponse, KernelError>>;
}

/** Proveedor Fake oficial: determinista, sin red, sin costos reales. */
export class FakeAiProvider implements AiProviderPort {
  readonly name = "fake";
  async infer(request: AiInferenceRequest): Promise<Result<AiInferenceResponse, KernelError>> {
    if (!request.prompt.trim()) {
      return fail(KernelErrors.validation("Prompt vacío"));
    }
    const inputTokens = Math.ceil(request.prompt.length / 4);
    const output = `[fake:${request.model}] eco: ${request.prompt.slice(0, 200)}`;
    return ok({
      output,
      inputTokens,
      outputTokens: Math.ceil(output.length / 4),
      costUsd: 0,
    });
  }
}

/** Registro en memoria de proveedores disponibles (interfaz + fake). */
const providers = new Map<string, AiProviderPort>([["fake", new FakeAiProvider()]]);
export function registerAiProvider(provider: AiProviderPort): void {
  if (providers.has(provider.name)) {
    throw new Error(`Proveedor IA duplicado: ${provider.name}`);
  }
  providers.set(provider.name, provider);
}

/* ------------------------------- Registries ------------------------------- */

const prompts = crudCommands({
  service: SERVICE,
  recordType: "prompt",
  resource: "prompt",
  dataSchema: z.object({
    nombre: z.string().min(1),
    texto: z.string().min(1),
    promptVersion: z.number().int().positive().default(1),
  }).passthrough(),
  createPermission: "platform.ai.manage",
  readPermission: "platform.ai.read",
});

const models = crudCommands({
  service: SERVICE,
  recordType: "model",
  resource: "model",
  dataSchema: z.object({
    nombre: z.string().min(1),
    proveedor: z.string().min(1),
    costoEntradaUsdPorMTok: z.number().nonnegative().default(0),
    costoSalidaUsdPorMTok: z.number().nonnegative().default(0),
  }).passthrough(),
  createPermission: "platform.ai.manage",
  readPermission: "platform.ai.read",
});

const evaluations = crudCommands({
  service: SERVICE,
  recordType: "evaluation",
  resource: "evaluation",
  dataSchema: z.object({
    inferenceId: z.string(),
    puntuacion: z.number().min(0).max(10),
    criterios: z.record(z.string(), z.unknown()).default({}),
  }).passthrough(),
  createPermission: "platform.ai.manage",
  readPermission: "platform.ai.read",
});

export function aiPlatformService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Infraestructura de IA: registries + Provider Interface con Fake Provider",
    capabilities: [
      {
        name: "gestionar-ia",
        permissions: ["platform.ai.manage"],
        description: "Administrar prompts, modelos y evaluaciones",
      },
      {
        name: "inferir",
        permissions: ["platform.ai.infer", "platform.ai.read"],
        description: "Ejecutar inferencias (proveedor fake)",
      },
    ],
    permissions: ["platform.ai.manage", "platform.ai.infer", "platform.ai.read"],
    dependsOn: ["platform.config"],
    events: [],
    recordTypes: ["conversation", "prompt", "model", "provider", "inference", "evaluation", "cost"],
    configDefaults: { "proveedor-defecto": "fake" },
    commands: [
      prompts.create, prompts.update, prompts.remove,
      models.create, models.update, models.remove,
      evaluations.create,
      // Conversation Registry
      (deps) => ({
        name: `${SERVICE}.conversation.start`,
        inputSchema: z.object({ titulo: z.string().min(1), contexto: z.record(z.string(), z.unknown()).default({}) }),
        authorization: { permissions: ["platform.ai.infer"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "conversation",
            status: "open",
            data: { titulo: input.titulo, contexto: input.contexto, mensajes: [] },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "conversation.start", id, {});
          if (!audited.ok) return audited;
          return ok({ id });
        },
      }),
      // Inference Registry + Cost Registry (con Fake Provider)
      (deps) => ({
        name: `${SERVICE}.infer`,
        inputSchema: z.object({
          conversationId: z.string().optional(),
          modelo: z.string().min(1),
          proveedor: z.string().default("fake"),
          prompt: z.string().min(1),
        }),
        authorization: { permissions: ["platform.ai.infer"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const provider = providers.get(input.proveedor);
          if (!provider) return fail(KernelErrors.notFound("ai-provider", input.proveedor));

          const inference = await provider.infer({ model: input.modelo, prompt: input.prompt });
          if (!inference.ok) return inference;

          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "inference",
            status: "completed",
            data: {
              conversationId: input.conversationId ?? null,
              proveedor: input.proveedor,
              modelo: input.modelo,
              prompt: input.prompt,
              output: inference.value.output,
              inputTokens: inference.value.inputTokens,
              outputTokens: inference.value.outputTokens,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;

          // Cost Registry: entrada de costo por inferencia
          const cost = await deps.store.insert(uow, {
            id: `cost:${id}`,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "cost",
            status: "recorded",
            data: {
              inferenceId: id,
              proveedor: input.proveedor,
              modelo: input.modelo,
              costUsd: inference.value.costUsd,
            },
            createdBy: ctx.principal.id,
          });
          if (!cost.ok) return cost;

          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "infer", id, {
            proveedor: input.proveedor,
            modelo: input.modelo,
          });
          if (!audited.ok) return audited;
          return ok({ id, output: inference.value.output, costUsd: inference.value.costUsd });
        },
      }),
    ],
    queries: [
      prompts.get, prompts.list, models.get, models.list, evaluations.list,
      (deps) => ({
        name: `${SERVICE}.providers`,
        inputSchema: z.object({}),
        authorization: { permissions: ["platform.ai.read"] },
        async handle() {
          return ok([...providers.keys()].map((name) => ({ name })));
        },
      }),
      (deps) => ({
        name: `${SERVICE}.inferences`,
        inputSchema: z.object({ conversationId: z.string().optional() }),
        authorization: { permissions: ["platform.ai.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rows = await deps.store.list(tenant.value, { service: SERVICE, recordType: "inference", limit: 200 });
          if (!rows.ok) return rows;
          return ok(
            input.conversationId
              ? rows.value.filter((r) => r.data["conversationId"] === input.conversationId)
              : rows.value,
          );
        },
      }),
      (deps) => ({
        name: `${SERVICE}.costs`,
        inputSchema: z.object({}),
        authorization: { permissions: ["platform.ai.read"] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.store.list(tenant.value, { service: SERVICE, recordType: "cost", limit: 500 });
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
