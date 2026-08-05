# Permisos, capacidades y multitenancy

## Permisos del servicio `modulo.ordenes`

- `modulo.ordenes.read` — lectura (read models: detalle, listado, agenda, etc. y opciones de catálogo).
  El read-side ampliado (listar, bitácora, dashboard) llega en DGP-009.2.
- `modulo.ordenes.write` — crear/editar/asignar/registrar ejecución/asociar/evidencia.
- `modulo.ordenes.operar` — transiciones operativas del ciclo (abrir…enviar a validación, pausar/reanudar, cancelar).
- `modulo.ordenes.validar` — transiciones de validación y aprobación/rechazo de cierre.
- `modulo.ordenes.admin` — administración (catálogos, configuración).

Además, el módulo depende de los permisos del Workflow Engine montado
(`modulo.ordenes.workflow.read/operar/disenar`) y del motor de formularios
(`modulo.formularios.*`).

## Capacidades

`gestionar-ordenes`, `ejecutar-ordenes`, `validar-ordenes`,
`administrar-ordenes` agrupan permisos para su asignación a roles.

## Policies de dominio

`policiesDelModulo()` expone reglas evaluables:
`puede-crear/editar/asignar/ejecutar/asociar-formulario/asociar-checklist/agregar-evidencia/transicionar`.
Reglas destacadas:

- Estados finales (`CERRADA`/`CANCELADA`) son inmutables.
- Edición **solo en borrador** configurable (`edicion-solo-borrador`).
- Ejecución solo en estados operativos.

## Multitenancy

El `tenantId` se extrae del `ExecutionContext` (`tenantOf`). Toda operación sin
tenant **falla** (probado). El aislamiento por tenant se hereda del Record Store
(RLS + `service`/`tenantId` en cada `PlatformRecord`), de modo que un tenant no
observa las OT de otro (probado).

## Dependencias declaradas (`dependsOn`)

`modulo.ordenes.workflow`, `modulo.formularios`, `platform.attachment`,
`platform.search`, `platform.timeline`, `platform.notification`,
`platform.config`. Todas resuelven en el runtime compuesto.
