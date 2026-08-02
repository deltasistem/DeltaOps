# 18 — Modelo Offline

> **DeltaOps — ESI-005 · v1.0** · Cómo un módulo de negocio declara y soporta operación sin conexión, sobre la mecánica offline de la plataforma.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Reparto de responsabilidades

La mecánica offline (cola local de comandos en el cliente, sincronización, reintentos, detección de conflictos) es plataforma/cliente (ETS-012, ESI-001). Lo que este estándar fija es **la parte del módulo**: qué operaciones declara aptas para offline y cómo sus piezas se comportan ante la sincronización tardía.

## 2. Reglas

1. **Apto-para-offline es una declaración por comando**: cada comando del módulo se declara `solo_en_linea` (default) u `apto_offline`. La aptitud no es técnica sino de dominio: registrar una carga de combustible en campo, sí; aprobar una compra contra topes vigentes, no.
2. **Los comandos aptos ya están preparados por el patrón**: la `clave_idempotencia` (generada en el cliente al capturar) absorbe reintentos de sincronización; la **fechaNegocio** captura el momento real del hecho; la concurrencia optimista detecta el mundo cambiado. Offline no añade piezas al comando: restringe cuáles califican.
3. **Criterios de aptitud** (los tres deben cumplirse): (a) el hecho es primario de campo — registra algo que ocurrió físicamente, no una decisión contra estado del servidor; (b) la validación con estado que requiere es tolerable en diferido — la denegación tardía tiene un camino de resolución definido; (c) no depende de resultado inmediato de otro comando.
4. **Conflictos: resolución de dominio declarada**: para cada comando apto, el DGP declara qué pasa si al sincronizar el estado cambió (la OT ya se cerró y llega un avance de campo): rechazo con bandeja de resolución para el usuario, o acomodación definida por el dominio. **Nunca** "gana el último" silencioso.
5. **Las consultas offline son instantáneas locales**: el cliente trabaja sobre datos descargados, marcados con su frescura; el módulo declara qué consultas participan del paquete descargable y su alcance (mis OT asignadas, activos de mi área).
6. **Lo no declarado no existe offline**: sin declaración, la operación exige conexión. El offline es opt-in explícito, comando a comando.

## Impacto sobre la implementación

El DGP entrega la tabla de aptitud offline (comando → apto/no → criterio → resolución de conflicto) y el alcance del paquete descargable; la mecánica la pone la plataforma cliente.

## Dependencias

ETS-006 (fechaNegocio), ETS-012; ESI-001 (estrategia móvil/offline); ESI-004/05 y /13; docs 06-07.

## Riesgos

- Declarar apto lo que decide contra estado del servidor, generando conflictos irresolubles; mitigación: los tres criterios §2.3 son bloqueantes en revisión.

## Decisiones habilitadas

- Operación de campo (combustible, avances de OT, inspecciones SST) sin conectividad.
- Conflictos de sincronización con semántica de negocio, no técnica.

## Decisiones bloqueadas

- Prohibido el offline implícito o universal.
- Prohibida la resolución "gana el último" silenciosa.
- Prohibidas colas de sincronización propias por módulo.

## Reusable Pattern

La tabla de aptitud offline con sus tres criterios y su resolución de conflictos declarada: sección fija de todo DGP-módulo con operación de campo.

## Anti-Patterns

- "Modo offline" como fork del flujo normal con validaciones recortadas.
- Timestamps de sincronización usados como fechaNegocio.
- Resolver conflictos en el servidor con heurísticas no declaradas.

## Knowledge Graph

- **ETS que consume**: ETS-006 (fechas), ETS-012 (requisitos de operación en campo).
- **ESI que consume**: ESI-001 (estrategia); ESI-004/05 y /13.
- **DGP que originará**: la sección "tabla de aptitud offline" de los DGP con trabajo de campo; el DGP del cliente móvil consume estas declaraciones.
- **ADR relacionados**: ADR de idempotencia por clave de cliente (ESI-003/20).
- **Módulos que reutilizarán este patrón**: Combustible, OT (avances en campo) y SST (inspecciones) son los usuarios primarios; Compras es típicamente solo-en-línea.
