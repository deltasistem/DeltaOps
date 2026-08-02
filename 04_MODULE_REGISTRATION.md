# 04 — Registro del Módulo

> **DeltaOps — ESI-005 · v1.0** · Cómo un módulo de negocio se declara ante la plataforma: el contrato de registro, sin excepciones.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El contrato

El registro sigue el contrato declarativo de ESI-003/06, demostrado por ESI-004/03. Todo módulo declara, de forma completa y verificada al arranque:

| Bloque | Contenido |
|---|---|
| Identidad | Código estable del módulo, nombre, contexto delimitado de ETS-003 al que corresponde |
| Capacidades | Las capacidades que ofrece (doc 05), del catálogo ETS-005 |
| Permisos | Su árbol `MODULO.RECURSO.ACCION` (doc 16) |
| Comandos y consultas | Inventario de piezas expuestas con sus rutas |
| Eventos | Tipos que emite y tipos que consume, con versión (doc 08) |
| Auditoría | Hechos auditados (ESI-004/17) |
| Configuración | Parámetros por tenant que define (doc 14) |
| Indicadores | KPIs que publica (doc 13) |
| Migraciones y seed | Sus capítulos propios |

## 2. Reglas específicas de módulos de negocio

1. **El código del módulo sale de ETS-003**: `activos`, `ordenes_trabajo`, `inventario`, `compras`, `combustible`, `sst`. Estable para siempre; renombrar es un cambio de arquitectura.
2. **Catálogo primero** (secuencia de ESI-004/03): permisos, capacidades, tipos de evento y errores se catalogan por el ciclo de producto antes de referenciarse en código; el arranque falla ante referencias no catalogadas.
3. **Los consumos cruzados se declaran**: si Inventario consume "Orden de Trabajo Cerrada", esa suscripción está en su declaración — el grafo de dependencias por eventos entre módulos es derivable mecánicamente de las declaraciones, y es la única dependencia inter-módulo legal.
4. **Simetría declaración ↔ estructura**: todo lo declarado existe y todo lo expuesto está declarado; la puerta lo verifica (ESI-004/03 §3.2).
5. **A diferencia del ejemplar**, los módulos de negocio no son catálogo cerrado por diseño: crecen. Cada pieza nueva amplía la declaración en el mismo PR.

## Impacto sobre la implementación

El grafo de suscripciones §2.3 se convierte en artefacto derivado del arranque, consultable para análisis de impacto entre módulos.

## Dependencias

ESI-003/06 y /12; ESI-004/03; ETS-003 (códigos), ETS-005 (capacidades), ETS-008 (contratos).

## Riesgos

- Declaraciones enormes en módulos grandes volviéndose ruido; mitigación: la declaración se organiza por agregado (espejo de la anatomía, doc 02) y la verifica la máquina, no la vista humana.

## Decisiones habilitadas

- Análisis de impacto inter-módulo mecánico (quién consume qué evento).
- Documentación de superficie del módulo generada desde la declaración.

## Decisiones bloqueadas

- Prohibido exponer piezas no declaradas o declarar piezas inexistentes.
- Prohibidas dependencias inter-módulo fuera de eventos declarados.
- Prohibido inventar códigos de módulo fuera de ETS-003.

## Reusable Pattern

La tabla §1 es el formulario de registro que todo DGP rellena como entregable temprano; las reglas §2 se citan tal cual.

## Anti-Patterns

- Registrar el módulo al final, tras construir las piezas (arranques rotos en cadena).
- Suscripciones a eventos hechas "por fuera" de la declaración.
- Declaraciones copiadas de otro módulo sin depurar (capacidades fantasma).

## Knowledge Graph

- **ETS que consume**: ETS-003, ETS-005, ETS-008.
- **ESI que consume**: ESI-003/06 y /12; ESI-004/03.
- **DGP que originará**: la tarea "declaración del módulo" de cada DGP-módulo, previa a toda pieza.
- **ADR relacionados**: ADR de plataforma declarativa (ESI-003/06).
- **Módulos que reutilizarán este patrón**: todos; el contrato de registro es único.
