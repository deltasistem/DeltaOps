# 05 — Comment Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de comentarios: conversación contextual sobre entidades de negocio, con menciones y trazabilidad.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

Conversación ligada a una **referencia de entidad** (patrón del doc 04): coordinación sobre una OT, aclaraciones sobre una solicitud de compra, seguimiento de un incidente SST. El comentario es comunicación humana registrada — **no** es el canal de decisiones de negocio (aprobar se hace con el comando de aprobación, no comentando "aprobado").

| Concepto | Definición |
|---|---|
| **Comentario** | Texto + autor + fecha + referencia de entidad; hilos de un nivel (respuestas a comentario raíz); adjuntos ligeros vía servicio de adjuntos |
| **Mención** | Referencia a un usuario del tenant dentro del texto; dispara tipo de notificación estándar (doc 03) |
| **Edición/borrado** | Ventana de edición configurable con historial conservado; borrado lógico visible ("comentario eliminado"); nada desaparece sin rastro |

## 2. Reglas

1. **Acceso derivado de la entidad** (patrón doc 04 §1): quien lee la entidad lee su conversación; comentar exige además el permiso propio.
2. **Neutralidad**: el servicio no interpreta el contenido; las reglas tipo "no cerrar con preguntas abiertas" serían del módulo (y se desaconsejan: los comentarios no portan estado de negocio).
3. **Inmutabilidad práctica**: historial de ediciones conservado y auditable; la ventana de edición existe para erratas, no para reescribir la historia.
4. **Las menciones no son asignaciones**: mencionar avisa; asignar trabajo es del servicio de tareas (doc 07) o del módulo. La frontera evita el "trabajo invisible en comentarios".

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `comentarios` (única; por tenant).
- **Eventos**: "Comentario Publicado", "Usuario Mencionado" (v1) — cronología y notificaciones.
- **Contratos**: publicar/responder/editar/eliminar comentario sobre referencia; listar por entidad (cursor); las entidades comentables las declara cada módulo.
- **Configuración**: ventana de edición, longitud máxima, habilitación de adjuntos en comentarios, por tenant.
- **KPIs**: comentarios por entidad/módulo, tiempo a primera respuesta de menciones, volumen por tenant.
- **Permisos**: `COMENTARIOS.PUBLICAR`, `COMENTARIOS.MODERAR` (eliminar ajenos, rol administrador del tenant); lectura derivada de la entidad.
- **Consumidores**: OT (coordinación de ejecución), Compras (aclaraciones de aprobación), SST (seguimiento de investigación), Activos (notas de historial).

## Impacto sobre la implementación

DGP propio pequeño (hereda el patrón de referencia de entidad del doc 04); los módulos solo declaran qué tipos de entidad son comentables.

## Dependencias

Docs 03-04 y 06; ESI-005/15-17; ETS-009 (retención de comunicaciones).

## Riesgos

- Decisiones de negocio migrando a comentarios ("apruebo por aquí") y perdiéndose del flujo formal; mitigación: regla §2.4 y diseño de producto — los comandos formales visibles donde está la conversación.

## Decisiones habilitadas

- Colaboración contextual uniforme en todo el producto.
- Historial de comunicación auditable junto a la entidad.

## Decisiones bloqueadas

- Prohibido usar comentarios como portador de estado o aprobaciones.
- Prohibido el borrado físico sin rastro.
- Prohibidas implementaciones de comentarios por módulo.

## Reusable Pattern

Referencia de entidad + acceso derivado + permiso propio de escritura: la instancia conversacional del patrón satélite del doc 04.

## Anti-Patterns

- Parsear comentarios buscando comandos ("#aprobar").
- Menciones como mecanismo de asignación de trabajo.
- Hilos infinitos anidados (un nivel basta y mantiene legible la conversación).

## Knowledge Graph

- **ETS que consume**: ETS-002 (colaboración), ETS-009 (retención).
- **ESI que consume**: ESI-005/15-17; docs 03-04 de esta serie.
- **DGP que originará**: DGP-Comentarios; declaración de entidades comentables en DGP-módulo.
- **ADR relacionados**: ADR de patrón satélite (doc 04); ADR de comentarios sin estado de negocio (§2.4).
- **Módulos que reutilizarán este patrón**: OT, Compras, SST y Activos en v1; extensible por declaración.
