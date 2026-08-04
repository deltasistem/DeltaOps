# API REST del módulo Activos — Contract-First (DGP-008.2)

## Fuente de verdad del contrato

El pipeline oficial de la plataforma es
`lib/api-spec/openapi.yaml` → **orval** → `lib/api-zod/src/generated/api.ts`.
`lib/api-spec` está **congelado** en esta entrega y sus entradas `/assets` son un
contrato genérico heredado (ids enteros) ajeno al módulo DGP.

Para un contrato **verificable** y *contract-first*, este módulo genera su
**OpenAPI 3** desde los esquemas del propio módulo:

- Generador determinista y autosuficiente:
  `lib/module-activos/src/openapi/spec.ts` (`construirOpenApi` /
  `serializarOpenApi`).
- Script de emisión: `pnpm --filter @workspace/module-activos generar-openapi`
  (`node --experimental-strip-types scripts/generar-openapi.ts`), que escribe
  **`lib/module-activos/openapi/activos.openapi.json`**.
- El contrato cubre **todas** las rutas (CRUD, transiciones, medidores,
  relaciones, históricos, timeline con filtros, colaboración, sync, consola,
  catálogos, reproyección) con esquemas de request/response y el mapeo de
  errores kernel→HTTP.
- Un **test de deriva** (`src/__tests__/openapi.test.ts`) verifica que el JSON
  comprometido está **sincronizado** (regenerar == comprometido) y que **cada**
  comando/consulta del módulo tiene su `operationId` en el contrato.

La validación en tiempo de ejecución sigue rigiéndose por los `inputSchema` Zod
de `lib/module-activos/src/module.ts`.

Base: `/deltaops/activos`. Autenticación por sesión; tenant vía contexto.
Errores mapeados: `KRN-AUTH-*`→403, `KRN-NF-*`→404, `KRN-CFL-*`→409,
`KRN-VAL-*`→400.

## Comandos (POST/DELETE)

| Método y ruta | Comando | Esquema de entrada (Zod) |
|---|---|---|
| `POST /deltaops/activos` | `crear` | `CrearInput` |
| `PUT /deltaops/activos/:id` | `editar` | `EditarInput` |
| `POST /deltaops/activos/:id/ubicacion` | `cambiar-ubicacion` | `CambiarUbicacionInput` |
| `POST /deltaops/activos/:id/responsable` | `asignar-responsable` | `AsignarResponsableInput` |
| `POST /deltaops/activos/:id/horometro` | `actualizar-horometro` | `MedicionInput` |
| `POST /deltaops/activos/:id/odometro` | `actualizar-odometro` | `MedicionInput` |
| `POST /deltaops/activos/:id/:accion` | `registrar\|operar\|mantener\|fuera-servicio\|retirar` | `TransicionInput` |
| `POST /deltaops/activos/:id/relaciones` | `crear-relacion` | `CrearRelacionInput` |
| `DELETE /deltaops/activos/relaciones/:relId` | `eliminar-relacion` | `EliminarRelacionInput` |
| `POST /deltaops/activos/catalogos` | `catalogo.upsert` | `CatalogoUpsertInput` |
| `POST /deltaops/activos/catalogos/habilitar` | `catalogo.habilitar` | `CatalogoHabilitarInput` |
| `POST /deltaops/activos/:id/comentarios` | `comentar` | `{ texto, parentId?, opId? }` |
| `PUT /deltaops/activos/comentarios/:comentarioId` | `editar-comentario` | `{ expectedVersion, texto, opId? }` |
| `DELETE /deltaops/activos/comentarios/:comentarioId` | `borrar-comentario` | `{ opId? }` |
| `POST /deltaops/activos/:id/documentacion` | `adjuntar` | `AdjuntarInput` |
| `POST /deltaops/activos/reproyectar` | `reproyectar` | `{}` (admin) |
| `POST /deltaops/activos/sync` | cola offline | `ColaSyncSchema` |

## Consultas (GET)

| Ruta | Query |
|---|---|
| `GET /deltaops/activos` | `listar` |
| `GET /deltaops/activos/:id` | `detalle` |
| `GET /deltaops/activos/:id/relacionados?categoria=` | `relacionados` |
| `GET /deltaops/activos/:id/arbol` | `arbol` |
| `GET /deltaops/activos/:id/componentes` | `componentes` |
| `GET /deltaops/activos/:id/historial/ubicaciones` | `historial-ubicaciones` |
| `GET /deltaops/activos/:id/historial/responsables` | `historial-responsables` |
| `GET /deltaops/activos/:id/historial` | `historial` (read model interno) |
| `GET /deltaops/activos/:id/timeline?actor=&estado=&entidadRelacionada=&desde=&hasta=` | `timeline` (Shared Timeline de plataforma, con filtros) |
| `GET /deltaops/activos/:id/comentarios` | `comentarios` |
| `GET /deltaops/activos/:id/documentacion` | `documentacion` |
| `GET /deltaops/activos/catalogos/:catalogo` | `catalogo.opciones` |
| `GET /deltaops/activos/consola` | `consola` (admin → 403 si no) |

## Esquemas relevantes

- **CrearRelacionInput**: `{ tipo: enum(NOMBRES_TIPO_RELACION), origenId: string,
  destinoId: string, id?: string, opId?: string }`. Los tipos válidos por tenant
  se resuelven contra el catálogo `tiposRelacion` (vacío ⇒ los 8 canónicos; ver
  `relaciones.md`).
- **EliminarRelacionInput**: `{ id: string, opId?: string }`.
- **AdjuntarInput**: `{ categoria: enum(CATEGORIAS_DOCUMENTACION),
  nombreArchivo, mimeType, tamanoBytes, hashSha256(64), attachmentId?, opId? }`.
- El resto de esquemas se corresponden 1:1 con los `inputSchema` de
  `src/module.ts`; ver `dominio.md`, `catalogos.md`, `colaboracion.md`,
  `timeline.md` y `maquina-estados.md`.
- El contrato completo y verificable está en
  `lib/module-activos/openapi/activos.openapi.json`.
