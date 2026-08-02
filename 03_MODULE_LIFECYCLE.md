# 03 — Ciclo de Vida del Módulo

> **DeltaOps — ESI-005 · v1.0** · Los estados por los que pasa un módulo de negocio desde su concepción hasta su retiro.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los estados

| Estado | Significado | Entrada | Salida |
|---|---|---|---|
| **Propuesto** | Contexto identificado en ETS-003, DGP en redacción | Decisión de producto | DGP aprobado |
| **En construcción** | DGP en ejecución; el módulo existe en el repo pero no se ofrece a tenants | Primer PR del DGP | Checklist doc 25 completo |
| **Disponible** | Terminado; sus capacidades pueden habilitarse por tenant | Aceptación (doc 25) | — |
| **Adoptado** | Al menos un tenant productivo con capacidades activas | Primera habilitación real | — |
| **En evolución** | Cambios funcionales sobre módulo disponible/adoptado | Cualquier PR posterior | Continuo |
| **En retirada** | Decisión de retiro; capacidades cerradas a nuevas habilitaciones | Decisión de arquitectura | Datos migrados/archivados |
| **Retirado** | Código eliminado; datos bajo política de retención (ETS-009) | Último tenant migrado | Terminal |

## 2. Reglas del ciclo

1. **"Disponible" es binario**: se alcanza pasando el checklist de implementación (doc 25) completo; no existen módulos "disponibles en beta" — lo incompleto se gobierna con capacidades deshabilitadas, no con estados intermedios.
2. **La habilitación es por tenant y por capacidad** (doc 05): el ciclo del módulo y la adopción por tenant son ejes independientes; un módulo disponible puede tener cero adopciones sin que eso sea un problema.
3. **La construcción es incremental pero invisible**: mientras está "en construcción", el módulo se mergea a `main` continuamente (ESI-002/04) con sus capacidades sin sembrar para ningún tenant; el sistema arranca con él sin exponerlo.
4. **La retirada nunca es borrado directo**: capacidades cerradas → migración/archivado de datos por tenant → contracción de esquema (expandir-migrar-contraer, ETS-010) → eliminación del código. Los eventos históricos del módulo permanecen bajo retención.
5. **El estado del módulo es visible**: el catálogo de módulos (ESI-003/06) refleja el estado; el inventario es consultable, no folclore.

## Impacto sobre la implementación

Añade el campo de estado al catálogo de módulos y las reglas de transición al gobierno de arquitectura; los DGP nacen ligados a un estado ("llevar el módulo X a Disponible").

## Dependencias

ETS-009/010; ESI-002/04 y /27; ESI-004/21 y /25; doc 05 (capacidades).

## Riesgos

- Módulos eternamente "en construcción" acumulando medio-funcionalidades; mitigación: el DGP tiene alcance cerrado y el estado se revisa en el ciclo de gobierno (ESI-002/28).

## Decisiones habilitadas

- Ofrecer módulos por tenant sin ramas ni despliegues especiales.
- Retiradas ordenadas con datos gobernados.

## Decisiones bloqueadas

- Prohibido habilitar capacidades de módulos no Disponibles a tenants productivos.
- Prohibido retirar módulos sin plan de datos aprobado.
- Prohibidos estados intermedios no catalogados ("beta", "preview") como sustituto de capacidades.

## Reusable Pattern

La tabla de estados §1 y las cinco reglas §2 aplican idénticas a todo módulo; el DGP cita el estado objetivo y las transiciones que ejecuta.

## Anti-Patterns

- "Soft-launch" por rama larga en lugar de capacidad deshabilitada.
- Retiro por abandono (módulo muerto sin decisión ni plan de datos).
- Estados de módulo gestionados en hojas de cálculo fuera del catálogo.

## Knowledge Graph

- **ETS que consume**: ETS-009 (retención), ETS-010 (evolución de esquema).
- **ESI que consume**: ESI-002/04, /27-28; ESI-003/06; ESI-004/21 y /25.
- **DGP que originará**: cada DGP-módulo declara transición de estado como objetivo; DGP de retirada cuando aplique.
- **ADR relacionados**: ADR de habilitación por capacidades (ETS-005/ESI-003/12).
- **Módulos que reutilizarán este patrón**: todos; el ciclo es único.
