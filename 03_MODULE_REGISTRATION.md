# 03 — Registro del Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · La declaración completa del módulo `referencia`, ejemplar del contrato de registro.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La declaración, campo a campo

El contrato de registro está congelado en ESI-003/06. El módulo de referencia lo instancia así:

| Campo del contrato | Valor en `referencia` |
|---|---|
| **Identidad** | Código `referencia`, registrado en el catálogo de módulos como módulo técnico-patrón (única excepción admitida al catálogo de negocio ETS-002, aprobada por arquitectura) |
| **Capacidades** | `capacidad_de_referencia` (doc 04) |
| **Casos de uso** | Activar Elemento de Referencia — exige permiso `REFERENCIA.ELEMENTO.ACTIVAR` |
| **Consultas** | Listar Elementos de Referencia — exige permiso `REFERENCIA.ELEMENTO.LISTAR` |
| **Rutas** | Bajo el prefijo del módulo, dos rutas exactas (doc 05/06), contratos ETS-008 |
| **Suscripciones** | El consumidor de resumen se suscribe a Elemento de Referencia Activado (docs 14/15) |
| **Piezas y necesidades** | Declara sus adaptadores y necesita: UoW, dispatcher, base de repositorio, lector base, reloj, observabilidad |
| **Migraciones** | Capítulo `referencia` con las tablas del agregado y del modelo de lectura (ETS-010) |
| **Seed** | Capítulo `referencia`: elementos en los tres estados, en los dos tenants del seed (ESI-002/12) |

## 2. Qué demuestra el registro

1. **Validación al arranque**: si el permiso `REFERENCIA.ELEMENTO.ACTIVAR` no existiera en el catálogo, el arranque aborta — la demostración canónica de la regla ESI-003/06 §2.
2. **Registro completo o nada**: la declaración cubre el 100% de la superficie del módulo; nada montado "por fuera".
3. **Simetría**: cada entrada de la declaración corresponde a una pieza física del doc 02 y viceversa.
4. **Neutralidad del orden**: `referencia` funciona igual registrado primero o último en la lista del arranque.

## 3. Reglas normativas

1. La declaración es la **primera pieza que se escribe** al crear un módulo (el generador T09 la produce junto al esqueleto) y la última que se toca al añadir piezas — siempre en el mismo PR que la pieza.
2. Los permisos del módulo entran al catálogo por el ciclo de producto (ESI-003/12) **antes** de que la declaración los referencie.

## Impacto sobre la implementación

El DGP del módulo de referencia comienza por esta declaración; su validación exitosa al arranque es el primer criterio de aceptación (doc 25).

## Dependencias

ESI-003/02, /06 y /12; doc 02 (anatomía), doc 04 (capacidad); ETS-002 (catálogo de módulos).

## Riesgos

- Que la excepción "módulo técnico-patrón" en el catálogo se use como precedente para otros módulos técnicos; mitigación: la excepción queda documentada como única y cerrada; la plataforma no se registra como módulo (ESI-003/06).

## Decisiones habilitadas

- Validar el contrato de registro real con un módulo real antes del primer módulo de negocio.
- Fijar el patrón de "declaración primero" en el generador.

## Decisiones bloqueadas

- Prohibido montar cualquier pieza de `referencia` fuera de su declaración.
- Prohibido referenciar permisos o capacidades aún no catalogados.
- Prohibido replicar la excepción de catálogo para futuros módulos técnicos.

## Reusable Pattern

Los DGP futuros copian la tabla §1 completa, sustituyendo valores: es el formulario canónico de declaración. También la secuencia "catálogo → declaración → piezas" del §3.

## Anti-Patterns

- Declaraciones incompletas "que se completarán luego".
- Rutas o consumidores montados directamente en el arranque, saltándose la declaración.
- Permisos inventados en la declaración sin pasar por el catálogo.
