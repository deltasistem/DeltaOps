# 10 — Modelo de Domain Services

> **DeltaOps — ESI-005 · v1.0** · El estándar de servicios de dominio en módulos de negocio: la pieza excepcional, con su carga de justificación.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

ESI-004/11 completa: el servicio de dominio es la ubicación de reglas fijas que necesitan datos de varios agregados o cálculos que no pertenecen a ninguno; puro, sin infraestructura inyectada, sin estado. **El default de todo módulo es no tener ninguno.**

## 2. Lo que añade el estándar para dominios reales

1. **Candidatos legítimos por dominio** (para calibrar el juicio, no para copiarlos sin necesidad): cálculo de disponibilidad de un activo a partir de sus paradas; valoración de inventario (costo promedio) sobre movimientos; conciliación de consumo de combustible contra horómetros. Todos comparten la firma: regla fija del negocio + datos de más de un agregado + resultado determinista.
2. **La taxonomía se aplica antes de crear**: ¿la regla vive en un agregado? → invariante. ¿Varía por tenant? → Policy. ¿Fija y multi-dato? → servicio de dominio. Todo servicio de dominio nuevo lleva en el PR la justificación de por qué no es ninguna de las otras dos (ESI-004/11 §carga de justificación).
3. **Los datos entran por parámetros**: el caso de uso carga (vía repositorios) y el servicio calcula; un servicio que "busca lo que le falta" es un caso de uso disfrazado.
4. **Cálculos con historia larga** (valoraciones sobre miles de movimientos) no convierten el servicio en impuro: si el volumen exige precálculo, la respuesta es una proyección (doc 12) mantenida por eventos, y el servicio opera sobre el precalculado.

## Impacto sobre la implementación

Pocos servicios, muy probados: pruebas de tabla exhaustivas en nivel dominio, cero infraestructura. El DGP los lista con su justificación o declara explícitamente "ninguno".

## Dependencias

ESI-004/10-11; docs 09, 11 y 12; ETS-002 (cálculos del negocio).

## Riesgos

- El servicio de dominio como cajón para lógica sin hogar, resucitando el dominio anémico; mitigación: la justificación obligatoria §2.2 y la revisión R-01 (doc 26).

## Decisiones habilitadas

- Hogar legítimo y probado para los cálculos multi-agregado reales del negocio.
- Reutilización del cálculo desde varios casos de uso sin duplicarlo.

## Decisiones bloqueadas

- Prohibidos servicios de dominio con puertos o repositorios inyectados.
- Prohibido crear servicios sin justificación de taxonomía en el PR.
- Prohibidos "servicios de aplicación de dominio" híbridos.

## Reusable Pattern

La firma de candidato legítimo §2.1 (regla fija + multi-dato + determinista) y la justificación de taxonomía como campo obligatorio del formulario de piezas del DGP.

## Anti-Patterns

- `XxxManager`/`XxxHelper` con métodos variados sin invariante común.
- Servicios que llaman repositorios "solo esta vez".
- Mover invariantes del agregado al servicio "para testear más fácil".

## Knowledge Graph

- **ETS que consume**: ETS-002 (cálculos de negocio), ETS-003 (lenguaje).
- **ESI que consume**: ESI-004/10-11.
- **DGP que originará**: la lista justificada de servicios de dominio (o su ausencia declarada) en cada DGP-módulo.
- **ADR relacionados**: la taxonomía de decisión (ESI-004/11) como ADR de ubicación de reglas.
- **Módulos que reutilizarán este patrón**: Inventario (valoración) y Combustible (conciliación) son los usuarios probables; el resto declara "ninguno" sin vergüenza.
