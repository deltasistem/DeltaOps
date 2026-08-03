# 07 — Decision Registry

> **DeltaOps — ESI-010 · v1.0** · El registro de decisiones: todos los ADR del corpus en un libro único con estados, sucesión explícita y búsqueda por tema.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

El proceso de decisiones ya existe (ESI-002/27); cada serie citó sus ADR por documento. Este registro consolida **el libro**: dónde viven todas las decisiones, cómo se encuentran y cómo se relacionan — la respuesta a "¿por qué es así?" con ruta (doc 04 §2.3).

## 2. Reglas del registro

1. **Una decisión, una entrada**: identificador estable, título por tema, estado (propuesta / decidida / vigente / reemplazada), la norma o series que la citan, y su contexto-decisión-consecuencias según la plantilla del proceso (ESI-002/27).
2. **La sucesión es explícita**: la decisión reemplazada apunta a su sucesora y viceversa; nunca se edita una decisión vigente para "actualizarla" — se decide de nuevo con memoria (el patrón N/N-1 aplicado al decidir).
3. **El registro indexa por tema, no por cronología**: quien pregunta "¿por qué trunk-based?" llega por tema a la decisión y de ahí a ESI-009/02; la arqueología cronológica es secundaria.
4. **Toda decisión nueva entra al registro al nacer** como paso del proceso — la decisión fuera del libro no existe (la versión de gobierno del "lo que no está en el repositorio no existe", ESI-009/02 §2.6).
5. **Las decisiones citan su evidencia**: las de proceso, su medición (ESI-009/28); las de arquitectura, sus casos; el registro expone las decisiones sin evidencia como candidatas a revisión (doc 22).
6. **La decisión local también se registra**: las calibraciones de DGP (umbrales, cadencias) llevan rastro en su DGP con referencia aquí cuando cambian una postura de la casa; la línea entre calibrar y decidir ya está normada (ESI-009/28 §2.4).

## 3. Lo que el registro no es

- No es el lugar de deliberación (eso es el proceso ESI-002/27).
- No es un archivo muerto: las normas citan decisiones y las decisiones citan normas — el grafo (doc 26) los enlaza.
- No sustituye a las series: la decisión resume el porqué; el cómo vive en la norma.

## Impacto sobre la implementación

El libro se materializa en el repositorio (versionado, con el mismo flujo de PR); las series existentes ya citaron sus ADR — la consolidación es indexación, no reescritura.

## Dependencias

ESI-002/27 (el proceso); ESI-009/02, /28; docs 04, 22, 26.

## Riesgos

- Decisiones tomadas en conversaciones y nunca registradas; mitigación: la regla §2.4 cosida al proceso, y la revisión de cambios normativos exige la cita del ADR — sin entrada, no hay merge.

## Decisiones habilitadas

- Memoria institucional consultable: por qué es así, desde cuándo, qué reemplazó.
- Revisión periódica de decisiones sin evidencia o envejecidas.

## Decisiones bloqueadas

- Prohibidas decisiones normativas fuera del libro.
- Prohibido editar decisiones vigentes en vez de suceder.
- Prohibido deliberar en el registro (el proceso vive en ESI-002/27).

## Reusable Pattern

Libro único + estados con sucesión + indexado por tema + entrada obligatoria al nacer: la memoria de decisiones como registro gobernado — decidir con memoria en vez de redecidir por olvido.

## Anti-Patterns

- La decisión que vive en un hilo de chat.
- Redebatir lo decidido porque nadie encontró el ADR.
- El ADR-novela que duplica la norma entera.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-002/27 (proceso y plantilla); los ADR citados por ESI-001…009.
- **DGP que originará**: ninguno; las calibraciones de DGP referencian el libro cuando corresponde.
- **ADR relacionados**: la entrada fundacional del propio registro.
- **Módulos que reutilizarán este patrón**: todas las decisiones de todos los dominios entran al mismo libro.
