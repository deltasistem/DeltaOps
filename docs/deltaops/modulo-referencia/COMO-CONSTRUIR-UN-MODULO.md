# Cómo construir un módulo DeltaOps (patrón oficial DGP-004)

Guía canónica. Todo módulo futuro (Activos, Inventario, OT, …) DEBE seguir
exactamente este molde; el Módulo de Referencia es el ejemplo ejecutable.

## 1. Paquete

`lib/module-<nombre>` con `@workspace/kernel` + `@workspace/platform` como
dependencias y la misma estructura:

```
src/
  domain/        ← aggregate puro, eventos, policies, invariantes (sin IO)
  infrastructure/← puertos + adaptadores Pg y Fake (RLS: set_config SIEMPRE)
  module.ts      ← PlatformServiceDefinition (capa aplicación)
  runtime.ts     ← createXRuntime({ pool? }) → createPlatformRuntime({ extraServices })
  __tests__/     ← suite Fake + suite PG
```

## 2. Reglas obligatorias

1. **Registro único**: el módulo se registra SOLO vía `extraServices` de
   `createPlatformRuntime`. Prohibido escribir en registries a mano.
2. **Tablas propias** con migración SQL aditiva en `lib/db/migrations/deltaops/`
   + espejo Drizzle en `lib/db/src/schema/`. RLS por `app.tenant_id` y
   `set_config('app.tenant_id', $1, true)` en cada escritura del adaptador PG.
   Los módulos **no** usan `platform_records`.
3. **Dominio puro**: máquina de estados y invariantes sin dependencias.
   Policies del dominio → `deps.runtime.policyEngine.register()` dentro de las
   factorías de comandos (una sola vez).
4. **Comandos**: schema Zod + `authorization.permissions`; escritura vía
   repositorio con el `uow` del comando; auditoría con `audit(...)`; eventos
   con `uow.registerEvent(createDomainEvent(...))` (outbox transaccional).
5. **Offline**: `crear` acepta id de cliente (uuid) y es idempotente;
   mutaciones exigen `expectedVersion` (concurrencia optimista, conflicto =
   `KRN-CFL-001`); ofrecer comando de reproyección del read model.
6. **CQRS**: consultas leen solo el read model; proyección por event handlers
   idempotentes (`last_event_id`).
7. **Shared services**: consumir por comandos de plataforma
   (`platform.search.indexDocument`, `platform.notification.queue`,
   `platform.kpi.snapshot`, `platform.integration.webhook.dispatch`,
   `platform.ai.infer`) con contexto de sistema en handlers de eventos, y
   comentarios/adjuntos/timeline por `entityRef = <prefijo>:<id>`.
8. **Configuración**: SIEMPRE por `deps.tenantConfig.get(tenant, "<modulo>.<clave>")`
   con defaults en el descriptor.
9. **API**: router Express fino (HTTP → command/query), sesión obligatoria,
   principal derivado del rol; mapear códigos KRN → HTTP (AUTH→403, NF→404,
   CFL→409, VAL→400).
10. **Frontend**: reutilizar el shell/tokens de DeltaOps; sin diseñar
    componentes nuevos.
11. **Pruebas**: dos suites (Fake y PG) cubriendo dominio, policies,
    permisos, multitenancy/RLS, auditoría, outbox, proyección, offline,
    concurrencia y rollback; registrar en CI.
12. **Salud**: `healthCheck` del descriptor debe sondear los adaptadores.

## 3. Checklist de cierre

- [ ] `pnpm --filter @workspace/module-<nombre> run test` verde (Fake + PG)
- [ ] `pnpm run typecheck` verde en la raíz
- [ ] Migración aplicada y espejo Drizzle exportado
- [ ] CI actualizado
- [ ] Revisión de arquitectura ejecutada y hallazgos corregidos
