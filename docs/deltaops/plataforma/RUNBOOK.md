# Runbook de la Plataforma (DGP-003)

## Diagnóstico rápido

1. **Salud**: `GET /api/deltaops/platform/services/health`
   - 200 + `healthy: true` → todo operativo.
   - 503 → revisar `detail` del servicio afectado (normalmente conexión PG).
2. **Colas**: `GET /api/deltaops/platform/queues`
   - `pending` creciente → el procesador de outbox no corre o falla.
   - `deadLetter > 0` → eventos agotaron reintentos; inspeccionar
     `deltaops.kernel_dead_letter` (payload + `failure_reason`) y reinyectar
     con el ReplayService del Kernel si procede.
3. **Auditoría**: `GET /api/deltaops/platform/logs` — últimas escrituras con
   tenant, actor y correlación.

## Incidentes comunes

### Un comando devuelve KRN-AUTH-002 (prohibido)
El principal no tiene el permiso `platform.<svc>.<acción>`. Verificar los
`permisos` del principal; los permisos por servicio están en la pestaña
Capacidades de la Consola.

### Conflicto de versión (concurrencia optimista)
Dos escrituras simultáneas sobre el mismo registro: la segunda falla por
diseño. Reintentar leyendo la versión actual. No es un error de plataforma.

### Timeline desincronizado
Ejecutar el comando `platform.timeline.rebuild` (permiso
`platform.timeline.rebuild`) en el tenant afectado: borra la proyección y
reproyecta desde la auditoría.

### Índice de búsqueda obsoleto
Ejecutar `platform.search.rebuild` por tenant.

### Importación con errores parciales
La sesión queda en `imported_with_errors`; `preview` muestra
`erroresEjecucion` por fila. Corregir datos y crear una nueva sesión (las
filas ya importadas no se duplican porque cada ejecución pasa por comandos
auditados).

### RLS bloquea consultas de la aplicación
La sesión PG debe fijar `SET app.tenant_id = '<tenant>'` o usar un rol con
BYPASSRLS (rol propietario en desarrollo). Verificar
`SELECT current_setting('app.tenant_id', true)`.

## Pruebas locales

```bash
pnpm --filter @workspace/platform run test        # 29 pruebas (Fake + PG)
pnpm --filter @workspace/platform run typecheck
```

Sin `DATABASE_URL`, las pruebas PG se omiten automáticamente (modo offline).
