# 11 — DGP States

> **DeltaOps — DGP-000 · v1.0** · Los estados oficiales del DGP: el catálogo cerrado de nueve estados, sus transiciones legales y las reglas que los hacen honestos.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. El catálogo cerrado

| Estado | Significado | Entra por |
|---|---|---|
| **Identificado** | Existe como entregable mapeado, sin especificar | Derivación del programa (doc 06) |
| **Autorizado** | Dependencias satisfechas, equipo asignado, luz verde para especificar | Cadencia contra docs 07/16 |
| **En especificación** | El documento DGP se está escribiendo | Dueño asignado |
| **Aprobado** | QG-1 superado; listo para ejecutar | Revisión (doc 22) |
| **En ejecución** | Etapas 3-6 del ciclo en curso | Arranque registrado |
| **Bloqueado** | Detenido por dependencia, ADR pendiente o hallazgo; causa registrada | Desde cualquier estado activo |
| **En verificación** | Construcción integrada; cadena de entornos y RC en curso | QG-3 superado |
| **Cerrado** | AG-1/AG-2 superados; evidencia completa archivada | Compuertas de aceptación (doc 23) |
| **Cancelado** | Terminado sin completar, por decisión registrada con disposición de lo construido | Decisión (ESI-010/07) |

## 2. Transiciones legales

```
Identificado → Autorizado → En especificación → Aprobado → En ejecución
                                                              ↕ Bloqueado
                                              En ejecución → En verificación → Cerrado
        (cualquier estado activo) → Cancelado [solo por decisión registrada]
```

Retrocesos legales: En verificación → En ejecución (hallazgo de RC); Aprobado → En especificación (re-aprobación por cambio material, doc 10 §3.3). Todo retroceso registra causa.

## 3. Reglas normativas

1. **El estado se deriva de compuertas, no se declara**: Aprobado existe porque QG-1 pasó; Cerrado porque AG-2 pasó — el estado editado a mano contra la evidencia es la mentira estructural del programa (la regla del tablero, ESI-010/25 §3.1).
2. **Bloqueado es un estado de primera clase**: tiene causa, dueño del desbloqueo y edad visible; el DGP crítico bloqueado escala primero (doc 08 §2.3). El bloqueo vergonzante disfrazado de "en ejecución lenta" es el defecto de honestidad número uno.
3. **Cancelado no es fracaso sin rastro**: la decisión registra qué se aprendió y qué se hace con lo parcialmente construido (integrar tras cierre parcial, revertir, o registrar como deuda) — el código huérfano de DGP cancelado es un zombi (ESI-009/16).
4. **Los estados alimentan el tablero y las métricas**: distribución por estado, edad por estado y tasa de bloqueo son las señales de salud del programa (doc 25); un programa con muchos "En ejecución" viejos no está construyendo — está acumulando.
5. **Un DGP, un estado**: sin estados híbridos ni "casi cerrado"; la granularidad fina vive dentro de las etapas del ciclo (doc 03), no en el catálogo.

## Impacto sobre la implementación

El registro de construcción (doc 12) implementa el catálogo y valida transiciones; el tablero deriva sus vistas de estos estados.

## Dependencias

Docs 03, 06-08, 10, 12, 22-23, 25; ESI-009/16; ESI-010/07, /25.

## Riesgos

- La inflación de estados (subestados, etiquetas paralelas) hasta perder legibilidad; mitigación: catálogo cerrado — la necesidad de un estado nuevo es una decisión sobre este documento (doc 28), con la vara de radio máximo.

## Decisiones habilitadas

- Lectura instantánea y honesta del avance del programa completo.
- Escalada de bloqueos con edad y causa como datos.

## Decisiones bloqueadas

- Prohibidos estados declarados contra la evidencia de compuertas.
- Prohibidos estados fuera del catálogo cerrado.
- Prohibida la cancelación sin decisión y disposición de lo construido.

## Reusable Pattern

Catálogo cerrado de estados + derivación por compuertas + bloqueo de primera clase: el avance como hecho verificable — la versión de programa del "estado visible" de todo artefacto (ESI-010/03).

## Anti-Patterns

- El DGP "al 90%" durante seis semanas.
- El semáforo del programa editado la víspera del comité.
- Cancelar borrando, sin decisión ni disposición del código parcial.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-010/03 (vida gobernada del artefacto); ESI-010/25 (derivación total).
- **DGP que originará**: todos viven en exactamente un estado del catálogo.
- **ADR relacionados**: ADR de catálogo cerrado de estados de DGP.
- **Módulos que reutilizarán este patrón**: sus DGP se leen con los mismos nueve estados.
