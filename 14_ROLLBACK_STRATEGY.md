# 14 — Rollback Strategy

> **DeltaOps — ESI-009 · v1.0** · La estrategia de reversa: la escalera de reversión, el dato como límite sagrado y la reversa ensayada antes de necesitarse.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La reversa es la materialización del principio "reversible por diseño" (doc 01 §2.5). No es un plan de emergencia guardado en un cajón: es una capacidad ordinaria, declarada por cada cambio (rubro Rollback, doc 05) y ensayada por el proceso.

## 2. La escalera de reversión

De menor a mayor costo; se usa el peldaño más bajo que resuelva:

| Peldaño | Acción | Cuándo |
|---|---|---|
| **1. Apagar toggle** | Ocultar la funcionalidad defectuosa | El defecto está tras toggle (doc 12) — segundos, sin despliegue |
| **2. Revert del cambio** | Commit de reversión (doc 04 §2.7) por el flujo normal acelerado | Defecto localizado, la versión en general está sana |
| **3. Reversa de versión** | Redesplegar la etiqueta N-1 (doc 11 §2.3) | La versión está comprometida en conjunto |
| **4. Reversa con datos** | Peldaño 3 + intervención sobre datos | Solo si el cambio corrompió datos — el peldaño que nunca debería pisarse |

## 3. Reglas normativas

1. **Todo cambio declara su peldaño**: el rubro Rollback dice cuál aplica y por qué; el cambio que solo admite el peldaño 4 requiere decisión explícita previa (doc 05 §2.6) — descubrirlo durante el incidente es la falla del proceso, no del incidente.
2. **La reversa de versión es siempre posible** por construcción: migraciones expandidas sin contraer prematuramente (doc 10 §2.4) + contratos N/N-1 (doc 11) garantizan que N-1 corre contra el estado actual; la contracción que rompería la reversa espera su ventana.
3. **El dato no se revierte alegremente**: los datos escritos por la versión nueva son datos reales de tenants; la reversa de versión los conserva (la compatibilidad del doc 11 §2.5 los hace legibles por N-1). La restauración desde respaldo es la última herramienta, con su pérdida acotada y comunicada — jamás un botón rutinario.
4. **Revertir no exige diagnóstico completo**: con señales degradadas y sospecha razonable, se revierte primero y se diagnostica después en calma (doc 15); el sistema sano vale más que el orgullo del cambio. Revertir es neutro: el estigma de la reversa produce héroes que "lo arreglan en caliente" — el verdadero riesgo.
5. **La reversa se ensaya**: la mecánica de los peldaños 1-3 se ejercita periódicamente (el DGP fija cadencia), incluida la reversa de versión en preproducción con migraciones expandidas reales; la reversa jamás ensayada es una hipótesis, no una capacidad.
6. **Toda reversa deja rastro**: qué se revirtió, por qué, qué señales lo motivaron — alimenta métricas (doc 18) y la retrospectiva (doc 15 §2.7); revertir mucho no es el problema: no aprender de las reversas sí.

## Impacto sobre la implementación

Los mecanismos por peldaño y la cadencia de ensayo se definen en el DGP de entrega; las precondiciones estructurales ya están congeladas por ESI-003 y los docs 10-12.

## Dependencias

Docs 01, 04-05, 10-13, 15, 18; ESI-003.

## Riesgos

- La confianza en una reversa jamás ejercitada; mitigación: el ensayo periódico obligatorio (§3.5) con evidencia — la reversa es una prueba más que debe pasar.

## Decisiones habilitadas

- Liberar con frecuencia porque deshacer es barato y conocido.
- Decisiones de incidente rápidas sin diagnóstico completo previo.

## Decisiones bloqueadas

- Prohibido integrar cambios sin peldaño de reversa declarado.
- Prohibida la contracción de esquema que rompa la reversa antes de su ventana.
- Prohibido el "arreglo en caliente" en producción como alternativa a revertir.

## Reusable Pattern

Escalera de peldaños + N-1 garantizado por construcción + ensayo periódico: la reversa como capacidad ordinaria, no como heroísmo.

## Anti-Patterns

- "Ya que estamos, mejor lo arreglamos hacia adelante" con producción degradada.
- La migración que contrae en la misma versión que expande.
- El runbook de reversa desactualizado desde hace un año.

## Knowledge Graph

- **ETS que consume**: ninguno directo; protege las promesas de servicio de ETS-012.
- **ESI que consume**: ESI-003 (expandir-migrar-contraer como base estructural).
- **DGP que originará**: mecanismos por peldaño y cadencia de ensayo en el DGP de entrega.
- **ADR relacionados**: ADR de revertir-primero-diagnosticar-después; ADR de escalera de reversión.
- **Módulos que reutilizarán este patrón**: todos declaran peldaño por cambio; ninguno improvisa su reversa.
