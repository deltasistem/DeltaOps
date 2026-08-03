# 23 — Project Readiness

> **DeltaOps — ESI-010 · v1.0** · La preparación del proyecto: los criterios PR-01…PR-10 que declaran a DeltaOps listo para construir — el corpus completo convertido en compuerta de arranque.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

Antes de la primera línea de producto, el proyecto declara su preparación contra criterios verificables — la instancia de arranque del patrón contrato-precede. "Listo para construir" es un estado demostrable, no una sensación de suficiencia documental.

## 2. Criterios (PR-01…PR-10)

| # | Criterio | Verificación |
|---|---|---|
| **PR-01** | Corpus normativo completo y congelado: ETS-001…012, Charter, ESI-001…010 — sin huecos declarados abiertos | Índice (doc 04) sin rutas rotas |
| **PR-02** | Jerarquía normativa y mapa de decisión operativos (doc 19); proceso de decisiones ensayado con decisiones reales registradas (doc 07) | Registro con entradas |
| **PR-03** | Plataforma de entrega mínima operativa: repositorio protegido, puertas, plantillas, pipeline de PR (ESI-009/27 §3.1) | Compuertas funcionando |
| **PR-04** | DGP de arranque escritos: plataforma técnica, entrega, y el del módulo de referencia (las series /27 definen el orden) | DGP existentes y revisados |
| **PR-05** | Registros inicializados: capacidades, módulos planificados, contratos, patrones, checklists, scores (docs 06-13) | Registros con contenido real |
| **PR-06** | Equipos con dueños asignados: módulo de referencia, plataforma, transversales — cada pieza del arranque con persona responsable | Sin propiedad difusa |
| **PR-07** | Flujo asistido por IA configurado: corpus como contexto, guías de encuadre, compuertas ciegas al autor (doc 16) | Guías operativas listas |
| **PR-08** | Onboarding ejecutable: la ruta de entrada por el índice probada con las primeras personas (docs 04, 17) | Onboarding realizado |
| **PR-09** | Cadencia y medición arrancadas: ciclo definido, métricas derivándose, scores con línea base (ESI-009/18-20) | Primer tablero con datos |
| **PR-10** | Secuencia de construcción clara: hoja de ruta oficial adoptada (doc 27) con su primer hito acotado | Hoja de ruta vigente |

## 3. Reglas de aplicación

1. **PR es una compuerta, no un ideal**: se pasa una vez, con evidencia por criterio; el criterio en rojo tiene plan con dueño antes de arrancar — arrancar "mientras se termina de preparar" es la deuda fundacional clásica.
2. **Preparado no significa completo**: la plataforma de entrega madura por hitos (ESI-009/27 §3), los marcos de experiencia llegan por demanda (ESI-008/27) — PR verifica el mínimo para construir bien el primer tramo, no la maquinaria total.
3. **La preparación se re-verifica en los hitos mayores** (doc 24): antes del primer tenant productivo y antes de escalar olas, los criterios pertinentes se revisitan con la vara más alta que el hito exige.

## Impacto sobre la implementación

PR-01…10 se verifican al arranque del proyecto con evidencia enlazada; el resultado es la primera entrada del tablero (doc 25).

## Dependencias

Todo el corpus; ESI-008/27; ESI-009/18-20, /27; docs 04, 06-13, 16-17, 19, 24-25, 27.

## Riesgos

- La preparación eterna (pulir el sistema sin construir producto); mitigación: PR-03/PR-04 exigen el mínimo definido por las series /27 — la vara es "suficiente para el primer tramo", y PR-10 obliga a un primer hito acotado.

## Decisiones habilitadas

- Arranque de construcción con fundamento demostrado, no supuesto.
- Detección temprana de huecos de preparación con dueño y plan.

## Decisiones bloqueadas

- Prohibido arrancar la construcción con criterios en rojo sin plan.
- Prohibido inflar PR hasta la preparación eterna.
- Prohibido el arranque con propiedad difusa de las piezas.

## Reusable Pattern

Compuerta de arranque con criterios verificables + mínimo suficiente + re-verificación por hitos: el contrato-precede aplicado al proyecto entero.

## Anti-Patterns

- Empezar a codear "mientras se escriben los DGP".
- El checklist de arranque marcado en verde sin evidencia.
- Confundir corpus completo con maquinaria completa.

## Knowledge Graph

- **ETS que consume**: ETS-012 (el mercado que espera; la vara de "suficiente").
- **ESI que consume**: las series /27 (órdenes de arranque); ESI-009/18-20.
- **DGP que originará**: ninguno; PR verifica los DGP de arranque ya normados.
- **ADR relacionados**: ADR de compuerta de arranque PR-01…10.
- **Módulos que reutilizarán este patrón**: el arranque de cada módulo hereda la lógica (su DGP como compuerta).
