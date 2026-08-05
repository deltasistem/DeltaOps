# Formularios, checklists y evidencias

## Dynamic Forms (DGP) como motor de plantillas

Los formularios y checklists de una OT se modelan como **referencias a plantillas
de Dynamic Forms** (`modulo.formularios`), no como estructuras propias. Cada
referencia se **ancla a una versión** concreta de la plantilla
(`ReferenciaPlantilla { servicio, clave, version }`) para garantizar
reproducibilidad histórica.

- `modulo.ordenes.asociarFormulario { id, expectedVersion, plantilla, respuestaId? }`
- `modulo.ordenes.asociarChecklist  { id, expectedVersion, plantilla, respuestaId? }`

`expectedVersion` aplica concurrencia optimista sobre el aggregate.

### Validación contra el runtime de Dynamic Forms (puerto `PlantillasPort`)

Asociar una plantilla **no** se limita a guardar la referencia del cliente: se
valida contra el motor de formularios a través del puerto `PlantillasPort`:

1. **Existencia**: la plantilla `clave:version` debe existir
   (`plantilla.obtener`); si no, error `notFound`.
2. **Clase correcta**: la definición debe ser de la clase esperada
   (`formulario` vs `checklist`), inferida de sus nodos; asociar una plantilla
   de clase incorrecta falla.
3. **Compatibilidad de versión (N/N-1)**: la versión referida debe ser la
   **activa** (N) o la **inmediatamente anterior** (N-1)
   (`plantilla.compatibilidad`); una versión más antigua es incompatible.

### Anclaje de la RESPUESTA a la versión exacta

Cuando se aporta `respuestaId`, el dominio verifica contra
`respuesta.obtener` que la respuesta existe y está **anclada a la versión
exacta** de la plantilla referida (coherencia respuesta↔plantilla). La
`ReferenciaPlantilla` almacena entonces el anclaje
`respuesta { respuestaId, version }`. Un anclaje a una versión que no coincide
se rechaza con `conflict`.

En 009.1 el módulo entrega **puertos + fakes**: `FakePlantillas` (catálogo en
memoria) para pruebas de dominio y `plantillasDesdeRuntime(...)` (adaptador de
prueba) que consulta el motor **real** montado en el harness. Los adaptadores
de producción llegan en DGP-009.2.

## Evidencias (referencia a `platform.attachment`)

Las evidencias **no** almacenan binarios: son **referencias** a adjuntos del
servicio `platform.attachment`, con metadatos e integridad:

`Evidencia { attachmentId, nombreArchivo, mimeType, tamanoBytes, hashSha256 }`

- `hashSha256` debe ser 64 hex (integridad verificable).
- `modulo.ordenes.agregarEvidencia { id, expectedVersion, evidencia }` es
  idempotente por `attachmentId` (no duplica).

Este diseño respeta la separación de responsabilidades: el almacenamiento de
archivos es infraestructura de la plataforma; el dominio solo referencia.
