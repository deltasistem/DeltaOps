# API HTTP y contrato OpenAPI — DGP-009.2

## Montaje

El módulo se expone en el **api-server** (`artifacts/api-server`) bajo el prefijo
`/api/deltaops/ordenes`. El router (`routes/deltaops/ordenes-module.ts`) es **fino**:
traduce HTTP → comando/consulta del kernel y mapea errores kernel→HTTP
(AUTH→403, NF→404, CFL→409, VAL→400, INF→500). El runtime
(`ordenes-runtime.ts`) es un singleton con adaptadores PostgreSQL reales
(`crearOrdenesRuntime({ pool })`) y deriva el `Principal` del rol de sesión.

## Superficies principales

- **CRUD / ciclo de vida**: `GET/POST /`, `GET/PUT /{id}`, `POST /{id}/transicionar`,
  `/{id}/aprobar-cierre`, `/{id}/asignar`, `/{id}/ejecucion`.
- **Documentación**: `POST /{id}/formulario`, `/{id}/checklist`, `/{id}/evidencias`;
  `GET /{id}/documentacion|formularios|checklists`.
- **Planificación**: `POST /{id}/planificar`; `GET /agenda`, `/calendario`.
- **Asignaciones / recursos**: `POST /{id}/asignar-recurso-humano`, `/{id}/recursos`;
  `GET /{id}/asignaciones`, `/{id}/responsables`.
- **SLA**: `POST /{id}/sla`.
- **Relaciones**: `POST /{id}/relaciones`; `GET /{id}/relaciones`,
  `/{id}/activos-relacionados`, `/{id}/dependencias`.
- **Bitácora / historial**: `POST /{id}/bitacora`; `GET /{id}/bitacora`, `/{id}/historial`.
- **Catálogos**: `GET /catalogos/{catalogo}`, `POST /catalogos`, `/catalogos/habilitar`.
- **Administración**: `POST /reproyectar`, `POST /sync`, `GET /consola`.

## Contract-First + drift test

El contrato OpenAPI 3 se genera de forma **determinista** desde
`src/openapi/spec.ts` (contract-first, alineado con los esquemas del módulo) y se
compromete en `openapi/ordenes.openapi.json` (regenerable con
`node --experimental-strip-types scripts/generar-openapi.ts`).

La prueba `src/__tests__/openapi.test.ts` verifica:

1. **Sin drift**: regenerar == JSON comprometido.
2. Es OpenAPI 3 con rutas y esquemas.
3. **Cobertura total**: cada comando/consulta declarado en `module.ts`
   (`modulo.ordenes.<suf>`) tiene su `operationId` `ordenes.<suf>` en el contrato.
