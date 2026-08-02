# 22 — Definition of Done

> **DeltaOps — ESI-009 · v1.0** · La definición de terminado: terminado es en producción, observado y sin colas ocultas — la compuerta de salida única de todo trabajo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

"Terminado" tiene una sola definición en DeltaOps y no admite grados privados ("terminado excepto pruebas"). El principio rector: **terminado es en producción — o listo para producción por decisión de exposición — con evidencia**. El "terminado al 90%" es la mentira más cara del oficio.

## 2. Criterios (DoD-01…DoD-10)

| # | Criterio |
|---|---|
| **DoD-01** | Criterios de aceptación (doc 23) verificados con evidencia |
| **DoD-02** | Integrado a la principal por el flujo completo: contrato de PR, puertas, revisión (docs 05-07) |
| **DoD-03** | Pruebas de los niveles declarados escritas y en verde (doc 08); sin cuarentenas nuevas propias |
| **DoD-04** | Checklists aplicables en verde: calidad (doc 24) y los de las series previas cuando toca su dominio (CA, CS, SC, EC) |
| **DoD-05** | Documentación afectada actualizada (normativa, DGP, operativa) — el documento desactualizado es deuda instantánea |
| **DoD-06** | Migraciones ensayadas en preproducción (doc 10 §2.3) cuando existen |
| **DoD-07** | Rollback declarado y viable (doc 14 §3.1) |
| **DoD-08** | Desplegado y, si la exposición es gradual, tras toggle registrado con plan de encendido (docs 12-13) |
| **DoD-09** | Señales de observabilidad confirmadas en producción en la ventana declarada (doc 10 §2.7) |
| **DoD-10** | Sin colas ocultas: nada de "quedó pendiente el caso raro" fuera del registro — lo pendiente real es deuda declarada (doc 17) o elemento nuevo |

## 3. Reglas normativas

1. **La definición es única y de la casa**: los equipos pueden añadir criterios propios, jamás quitar; la variante local relajada no existe.
2. **Terminado lo declara la evidencia, no el cansancio**: cada criterio es verificable; "yo creo que está" no es un estado.
3. **Lo no terminado no se demuestra como terminado**: en la revisión del ciclo (doc 20 §2.4) lo incompleto se muestra como incompleto — la demo de humo erosiona la única moneda del proceso: la confianza en "terminado".
4. **El trabajo que muere se cierra explícitamente**: lo descartado se registra como descartado con motivo; el limbo eterno no es un estado.

## Impacto sobre la implementación

DoD-01…10 se materializan como lista verificable en la herramienta de gestión, con enlaces a la evidencia (pipeline, PR, señales).

## Dependencias

Docs 05-08, 10, 12-14, 17, 20, 23-24; los checklists de series previas (ESI-004/25, ESI-006/24, ESI-007/22, ESI-008/25).

## Riesgos

- El DoD tratado como trámite final en vez de guía desde el inicio; mitigación: el contrato de PR (doc 05) adelanta la mayoría de los criterios al primer día — el DoD se cumple caminando, no al final corriendo.

## Decisiones habilitadas

- "Terminado" como palabra con significado uniforme en métricas, planes y conversaciones.
- Progreso real distinguible del progreso declarado.

## Decisiones bloqueadas

- Prohibidas definiciones de terminado relajadas por equipo.
- Prohibido declarar terminado sin evidencia por criterio.
- Prohibidas las colas ocultas fuera del registro.

## Reusable Pattern

Compuerta de salida única + evidencia por criterio + producción como meta: "terminado" convertido en un hecho verificable — no en una opinión.

## Anti-Patterns

- "Terminado, solo falta desplegarlo" (entonces no está terminado).
- La demo con datos trucados de lo que no funciona.
- Cerrar el elemento y abrir en silencio "el fix del fix".

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-004/25; ESI-006/24; ESI-007/22; ESI-008/25 (checklists que DoD-04 invoca).
- **DGP que originará**: la lista DoD con evidencia enlazada en la herramienta de gestión.
- **ADR relacionados**: ADR de terminado-es-en-producción.
- **Módulos que reutilizarán este patrón**: todos; una sola definición para todo el producto.
