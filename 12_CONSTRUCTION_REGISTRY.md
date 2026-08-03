# 12 — Construction Registry

> **DeltaOps — DGP-000 · v1.0** · El registro de construcción: el libro único del programa — todos los DGP con identidad, ola, estado, dependencias, contratos tocados y evidencia.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Propósito

El registro es la fuente de verdad del programa: **qué DGP existen, en qué estado, con qué relaciones**. Es a la construcción lo que el libro de decisiones (ESI-010/07) a las normas: lo que no está registrado no existe para el programa. Se inicializa en W0 (doc 06) y vive hasta el cierre del programa.

## 2. Contenido por entrada

1. **Identidad**: `DGP-NNN` secuencial, título, dueño humano único.
2. **Origen**: ola (doc 04) y entregable padre (doc 06) — la derivación obligatoria hecha dato.
3. **Estado**: uno del catálogo cerrado (doc 11), derivado de compuertas, con fecha de entrada al estado.
4. **Criticidad**: si pertenece al camino crítico (doc 08).
5. **Dependencias**: de otros DGP (con tipo, doc 07) — la matriz fina (doc 16) se deriva de aquí.
6. **Contratos tocados**: qué contratos publica o modifica (ESI-010/13) — el dato anti-colisión del paralelismo (doc 09 §3.4).
7. **Compuertas**: QG/AG superadas con fecha y enlace a evidencia.
8. **Sucesión**: DGP predecesores y sucesores; deuda originada (ESI-009/16).

## 3. Reglas normativas

1. **Derivado donde se pueda, disciplinado donde no**: estados y compuertas derivan de evidencia mecánica; origen, dependencias y contratos se declaran en la especificación y se validan en QG-1 — la entrada desactualizada es un hallazgo de la cadencia.
2. **El registro es la agenda de la cadencia**: la revisión del programa (doc 24) recorre el registro — bloqueados por edad, críticos primero, cerrables pendientes de evidencia; la reunión sin registro abierto es la reunión de impresiones.
3. **Nadie construye fuera del libro**: el PR cuyo elemento de trabajo no remonta a un DGP registrado y activo no tiene vía — la trazabilidad cambio→DGP→entregable→ola es la columna del programa (ESI-010/14 extendida a construcción).
4. **El registro alimenta sin duplicar**: capacidades, módulos y contratos actualizan sus registros propios (ESI-010/10-13) al cierre de cada DGP (AG-2 lo verifica); el registro de construcción enlaza, no copia.
5. **La historia se conserva**: los DGP cerrados y cancelados permanecen con su evidencia — el registro es también la memoria auditable de cómo se construyó DeltaOps.

## Impacto sobre la implementación

Se materializa en W0 con la herramienta que el DGP de plataforma de entrega elija; el modelo de datos conceptual es este documento.

## Dependencias

Docs 04, 06-11, 16, 22-24; ESI-009/16; ESI-010/07, /10-14.

## Riesgos

- El registro como burocracia paralela al trabajo real; mitigación: es la agenda de la cadencia y la validación de vía de los PR — usarlo no es un paso extra sino el camino mismo.

## Decisiones habilitadas

- Estado del programa completo consultable en un solo lugar.
- Auditoría histórica de la construcción con evidencia enlazada.

## Decisiones bloqueadas

- Prohibida la construcción sin DGP registrado y activo.
- Prohibida la duplicación de contenido de otros registros.
- Prohibido purgar la historia de DGP cerrados o cancelados.

## Reusable Pattern

Libro único del programa + estados derivados + agenda de cadencia + validación de vía: el registro que gobierna porque es el camino, no un reporte del camino.

## Anti-Patterns

- La hoja de cálculo sombra del jefe de proyecto.
- El PR huérfano "de mejora general" sin DGP.
- Actualizar el registro el día antes de la revisión.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-010/07 (el molde del libro único); ESI-010/10-14 (registros enlazados).
- **DGP que originará**: todos viven en el registro de la cuna al archivo.
- **ADR relacionados**: ADR de registro de construcción como libro único.
- **Módulos que reutilizarán este patrón**: toda su construcción queda registrada y auditable.
