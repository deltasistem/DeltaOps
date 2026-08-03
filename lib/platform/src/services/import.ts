/**
 * DeltaOps Plataforma · Import Service.
 * Sesiones de importación con validaciones, vista previa, errores y ejecución
 * EXCLUSIVAMENTE mediante comandos del pipeline: NUNCA escribe directamente
 * en la base de datos.
 */
import { z } from "zod";
import { childContext, fail, KernelErrors, KernelTokens, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { storeHealthCheck } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.import";

interface ImportRow {
  fila: number;
  datos: Record<string, unknown>;
  errores: string[];
}

export function importService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Sesiones de importación con validación, preview y ejecución vía comandos",
    capabilities: [
      {
        name: "importar",
        permissions: ["platform.import.write", "platform.import.read"],
        description: "Crear, validar y ejecutar importaciones",
      },
    ],
    permissions: ["platform.import.write", "platform.import.read"],
    dependsOn: [],
    events: [],
    recordTypes: ["session"],
    configDefaults: { "max-filas-sesion": "10000" },
    commands: [
      // Crear sesión con filas crudas y reglas de validación declarativas
      (deps) => ({
        name: `${SERVICE}.createSession`,
        inputSchema: z.object({
          targetCommand: z.string().min(1),
          camposRequeridos: z.array(z.string()).default([]),
          filas: z.array(z.record(z.string(), z.unknown())).min(1),
        }),
        authorization: { permissions: ["platform.import.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const filas: ImportRow[] = (input.filas as Record<string, unknown>[]).map(
            (datos: Record<string, unknown>, i: number) => {
            const errores = (input.camposRequeridos as string[])
              .filter((c: string) => datos[c] === undefined || datos[c] === null || datos[c] === "")
              .map((c: string) => `Campo requerido ausente: ${c}`);
            return { fila: i + 1, datos, errores };
          });
          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "session",
            status: "validated",
            data: {
              targetCommand: input.targetCommand,
              filas,
              validas: filas.filter((f) => f.errores.length === 0).length,
              invalidas: filas.filter((f) => f.errores.length > 0).length,
              importadas: 0,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "createSession", id, {
            filas: filas.length,
          });
          if (!audited.ok) return audited;
          return ok({ id, validas: filas.filter((f) => f.errores.length === 0).length });
        },
      }),
      // Ejecutar: cada fila válida se importa despachando el comando destino
      (deps) => ({
        name: `${SERVICE}.execute`,
        inputSchema: z.object({ sessionId: z.string() }),
        authorization: { permissions: ["platform.import.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const session = await deps.store.findById(tenant.value, input.sessionId);
          if (!session.ok) return session;
          if (!session.value) return fail(KernelErrors.notFound("import-session", input.sessionId));
          if (session.value.status !== "validated" && session.value.status !== "executing") {
            return fail(KernelErrors.conflict(`Sesión en estado ${session.value.status}: no ejecutable`));
          }
          const filas = session.value.data["filas"] as ImportRow[];
          const targetCommand = String(session.value.data["targetCommand"]);

          // Idempotencia por fila: las filas ya importadas quedan registradas
          // de forma durable (transacción propia por fila) para que un
          // reintento tras un fallo NO duplique efectos en el destino.
          const yaImportadas = new Set<number>(
            (session.value.data["filasImportadas"] as number[] | undefined) ?? [],
          );
          const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
          let currentVersion = session.value.version;

          // Marcar la sesión como "executing" en transacción propia: si el
          // comando externo falla a mitad, el estado durable refleja avance.
          const marked = await uowPort.execute(ctx, (sepUow) =>
            deps.store.update(sepUow, tenant.value, input.sessionId, currentVersion, {
              status: "executing",
              data: { ...session.value!.data, filasImportadas: [...yaImportadas] },
            }),
          );
          if (!marked.ok) return marked;
          currentVersion = marked.value.version;
          let currentData = marked.value.data;

          // Importación mediante comandos: cada fila pasa por el pipeline
          // (autorización + validación + UoW propia). Nada escribe directo.
          let importadas = yaImportadas.size;
          const erroresEjecucion: { fila: number; error: string }[] = [];
          for (const f of filas.filter((x) => x.errores.length === 0)) {
            if (yaImportadas.has(f.fila)) continue; // reintento: fila ya aplicada
            const r = await deps.runtime.commands.execute(childContext(ctx), targetCommand, f.datos);
            if (r.ok) {
              importadas += 1;
              yaImportadas.add(f.fila);
              // Persistir el avance por fila (durable, transacción propia).
              const progress = await uowPort.execute(ctx, (sepUow) =>
                deps.store.update(sepUow, tenant.value, input.sessionId, currentVersion, {
                  data: { ...currentData, filasImportadas: [...yaImportadas] },
                }),
              );
              if (!progress.ok) return progress;
              currentVersion = progress.value.version;
              currentData = progress.value.data;
            } else erroresEjecucion.push({ fila: f.fila, error: r.error.message });
          }

          const updated = await deps.store.update(uow, tenant.value, input.sessionId, currentVersion, {
            status: erroresEjecucion.length === 0 ? "imported" : "imported_with_errors",
            data: { ...currentData, importadas, erroresEjecucion, filasImportadas: [...yaImportadas] },
          });
          if (!updated.ok) return updated;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "execute", input.sessionId, {
            importadas,
            errores: erroresEjecucion.length,
          });
          if (!audited.ok) return audited;
          return ok({ importadas, errores: erroresEjecucion });
        },
      }),
    ],
    queries: [
      // Vista previa: filas, válidas/ inválidas y errores por fila
      (deps) => ({
        name: `${SERVICE}.preview`,
        inputSchema: z.object({ sessionId: z.string(), limit: z.number().int().positive().max(100).optional() }),
        authorization: { permissions: ["platform.import.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const session = await deps.store.findById(tenant.value, input.sessionId);
          if (!session.ok) return session;
          if (!session.value) return fail(KernelErrors.notFound("import-session", input.sessionId));
          const filas = session.value.data["filas"] as ImportRow[];
          return ok({
            status: session.value.status,
            validas: session.value.data["validas"],
            invalidas: session.value.data["invalidas"],
            muestra: filas.slice(0, input.limit ?? 20),
          });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.list`,
        inputSchema: z.object({}),
        authorization: { permissions: ["platform.import.read"] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.store.list(tenant.value, { service: SERVICE, recordType: "session" });
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
