# 06_PORTS.md

> **DeltaOps — ETS-011 · v1.0** · Puertos: las fronteras hexagonales del Core — todo lo externo, nombrado y contratado desde adentro.
> Documento de diseño. Sin código, sin clases.

---

## 1. Principio

Un puerto es **un contrato definido por la capa de aplicación en su vocabulario**, que la infraestructura implementa (07). El Core nombra lo que necesita ("repositorio de órdenes de trabajo", "almacén de binarios"), jamás lo que existe ("PostgreSQL", "S3"). La Regla de Dependencia se sostiene aquí o no se sostiene.

## 2. Catálogo de puertos de salida

| Puerto | Contrato (esencia) | Respaldo físico previsto |
|---|---|---|
| **Repositorio de agregado** (uno por agregado raíz) | cargar por id · guardar estado+eventos con control de versión optimista | Esquema del módulo (ETS-010/03) |
| **Outbox** | anexar eventos en la transacción del comando | `outbox_<modulo>` (ETS-009/07) |
| **Almacén de resultados de idempotencia** | obtener/registrar resultado por clave | `resultado_comando` y equivalentes (ETS-010/18) |
| **Lector de read model** (uno por consulta del catálogo) | la consulta con su forma de respuesta y frescura | `lectura_*`, `marts` (ETS-010/10) |
| **Resolutor de configuración** | configuración resuelta por tenant/contexto/fecha, con versiones | `configuracion` + `configuracion_resuelta` (ETS-009/05) |
| **Reloj** | instante actual | — (determinismo en pruebas) |
| **Generador de identidad** | UUIDv7 | — |
| **Asignador de folios** | siguiente folio por tenant/tipo, a prueba de concurrencia | secuencias por tenant (ETS-010/05 §3) |
| **Almacén de binarios** | planear subida · URL firmada · verificar huella | objetos (ETS-010/17) |
| **Publicador de flujo** | entregar eventos despachados a consumidores | mensajería (ETS-007/08) |
| **Cursor de consumidor** | leer/avanzar posición por consumidor | `mensajeria.cursor_consumidor` |
| **Canal de notificación** (por canal) | entregar mensaje renderizado | correo/push/webhook (16) |
| **Índice de búsqueda** | indexar/consultar documentos de búsqueda | `lectura_busqueda` hoy, motor futuro (ETS-010/21) |
| **Proveedor de IA** (por capacidad) | evaluar con entrada/salida contratada y versión de capacidad | ETS-007/09 |
| **Conector de integración** (por conector) | intercambio según mapeo versionado | `integracion` (ETS-008/13) |
| **Telemetría** | métricas/trazas/registros del Core | observabilidad (27) |

Los puertos de **entrada** son los casos de uso mismos (03): la API, el sync móvil y los jobs son adaptadores que los invocan.

## 3. Reglas normativas

1. **Un puerto por necesidad, no por tecnología**: nada de "puerto SQL genérico" — eso re-filtra la infraestructura hacia adentro.
2. **Contratos en vocabulario de dominio**, con los sobres del Kernel; sin tipos del motor de BD ni del proveedor.
3. **Repositorios solo para agregados** y solo con las operaciones del comando (cargar/guardar); las preguntas son de los lectores de read model — CQRS también en los puertos.
4. **Errores de puerto normalizados**: cada puerto declara sus fallas posibles (no disponible, conflicto de versión, no encontrado) en el catálogo del Kernel; los adaptadores traducen lo físico a ese vocabulario (26).
5. **Todo puerto tiene doble implementación garantizada**: la real (07) y la falsa en memoria (25) — un puerto sin fake es un puerto mal contratado.

---

## Impacto sobre la implementación
El inventario del §2 es la lista de interfaces a definir por módulo antes que cualquier adaptador; la revisión rechaza dependencias del Core hacia tecnología concreta.

## ETS relacionados
ETS-007 (08 mensajería, 09 IA) · ETS-009/010 (los respaldos físicos de cada puerto) · ETS-011 (07 adaptadores, 25 fakes, 26 errores).

## Riesgos
- Contratos de puerto que filtran tecnología (paginación estilo SQL, tipos del proveedor) → revisión de vocabulario.
- Proliferación de puertos triviales → un puerto por necesidad real; consolidar cuando dos contratos son la misma necesidad.

## Decisiones habilitadas
Definición de interfaces por módulo, fakes de prueba, adaptadores (07), plan de implementación por capas.

## Decisiones bloqueadas
Firmas concretas y granularidad final por lenguaje — implementación.
