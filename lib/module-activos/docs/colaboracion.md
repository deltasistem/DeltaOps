# Colaboración: comentarios y documentación técnica — DGP-008.2

La colaboración sobre un activo se realiza **exclusivamente** delegando en los
comandos de plataforma, usando `entityRef = "activo:<id>"`. El módulo expone
comandos/consultas propios que **validan que el activo exista** y aplican la
autorización del módulo, pero **nunca** escriben directamente en las tablas de
comentarios/adjuntos (patrón *module-reference*). Todas las operaciones de
escritura son encaminables por la **cola de sincronización offline** (ver
`sync.md`) mediante la whitelist de comandos de colaboración.

## Comandos y consultas del módulo

| Módulo | Delegación en plataforma |
| --- | --- |
| `modulo.activos.comentar { id, texto, parentId?, opId? }` | `platform.comment.create` |
| `modulo.activos.editar-comentario { comentarioId, expectedVersion, texto, opId? }` | `platform.comment.edit` |
| `modulo.activos.borrar-comentario { comentarioId, opId? }` | `platform.comment.delete` (soft-delete) |
| `modulo.activos.adjuntar { id, categoria, nombreArchivo, mimeType, tamanoBytes, hashSha256, attachmentId?, opId? }` | `platform.attachment.register` |
| `modulo.activos.comentarios { id }` | `platform.comment.byEntity` |
| `modulo.activos.documentacion { id }` | `platform.attachment.byEntity` |

- `comentar` valida la existencia del activo (`cargar`) antes de delegar;
  soporta hilos por `parentId`.
- `editar-comentario` usa concurrencia optimista (`expectedVersion`).
- `adjuntar` valida la existencia del activo y registra el documento **por
  referencia**: los binarios **nunca** salen de plataforma.

## Metadata de documentación técnica

La **categoría** de documentación técnica —una de
`manual | certificado | garantia | diagrama | plano | procedimiento`
(`CATEGORIAS_DOCUMENTACION`)— se codifica como **prefijo del nombre lógico**
del adjunto: `"[<categoria>] <nombreArchivo>"`. Así viaja como metadato sin
tablas nuevas y sin tocar el binario; `documentacion` la interpreta al listar.

## Offline / sincronización

`sincronizacion.ts` declara `COMANDOS_COLABORACION`
(`comentar`, `editar-comentario`, `borrar-comentario`, `adjuntar`). En la cola
offline siguen el protocolo estándar **claim → ejecutar → finalizar** con
recibos durables por `opId`: un reenvío de la misma operación devuelve el recibo
original (`replay: true`) **sin re-ejecutar**, garantizando idempotencia (no se
duplican comentarios ni adjuntos). Como estas operaciones **no** son
reconciliables por versión/id de agregado, en la ruta de RECUPERACIÓN de un
recibo `pendiente` viejo se degradan a `reintentable` (nunca re-ejecución a
ciegas): una reclamación limpia posterior las procesa exactamente una vez.
