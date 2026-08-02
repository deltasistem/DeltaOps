# 23 — Anti-Patterns: el Catálogo Consolidado

> **DeltaOps — ESI-004 · v1.0** · Las prácticas prohibidas del desarrollo de módulos, reunidas y numeradas para citarse en revisión.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

Cada documento de esta serie cierra con sus anti-patterns locales. Este documento consolida los **transversales** — los que más daño hacen y más se repiten en la industria — como catálogo citable: en una revisión basta "AP-07" para nombrar el problema.

## 2. El catálogo

| # | Anti-pattern | Por qué está prohibido | Norma que lo prohíbe |
|---|---|---|---|
| AP-01 | **Dominio anémico**: datos sin conducta, lógica regada en "servicios" | Las reglas se vuelven duplicables e inauditables | ETS-003, docs 10/11 |
| AP-02 | **Lógica en el borde**: validación de negocio o decisiones en rutas | El mismo negocio por dos entradas da dos resultados | Docs 02/07 |
| AP-03 | **Saltarse la UoW**: sesiones propias, confirmaciones parciales, outbox manual | Rompe atomicidad estado+evento e idempotencia | Doc 13, ESI-003/20 |
| AP-04 | **Tenant manual**: filtros de tenant escritos a mano, tenant del payload | Neutraliza las dos murallas; fuga entre tenants | ESI-003/09, ETS-009 |
| AP-05 | **Módulos acoplados**: imports entre módulos, llamadas directas | Convierte el sistema modular en monolito enredado | Doc 02, ESI-003/01 |
| AP-06 | **Eventos-orden**: eventos que son llamadas disfrazadas a un consumidor concreto | Falso desacoplamiento; el emisor conoce al receptor | Doc 14 |
| AP-07 | **Chequeos de acceso manuales**: capacidad/permiso verificados en código | Diverge de la declaración; agujeros silenciosos | Docs 04/05, ESI-003/12 |
| AP-08 | **Regla duplicada en dos niveles**: la misma validación en borde y dominio | Las copias divergen y una miente | Doc 08 |
| AP-09 | **Proyección sin reconstrucción**: modelos de lectura irreproducibles | La divergencia se vuelve permanente | Doc 15 |
| AP-10 | **Mocks artesanales**: dobles por pieza en vez de fakes de contrato | Las pruebas afirman conversaciones, no comportamiento | Docs 12/19 |
| AP-11 | **Log-auditoría**: cumplir auditoría con logs operativos | Sin garantías transaccionales ni retención | Docs 16/17 |
| AP-12 | **Camino artesanal**: piezas generables creadas a mano | Deriva estructural; plantillas que mienten | Doc 22, ESI-002/19 |
| AP-13 | **Fallback silencioso**: ante fallo, inventar defaults y seguir | Corrupción de datos y fallos indetectables | ESI-003/15, doc 09 |
| AP-14 | **Excepción normalizada**: "solo esta vez" repetido hasta ser costumbre | La regla muere sin decisión explícita | Doc 22, ESI-002/27 |

## 3. Uso normativo

1. Las revisiones citan por código (AP-nn); el debate se acorta porque el porqué ya está escrito.
2. Encontrar un anti-pattern en `main` no abre debate sobre si es aceptable: abre un arreglo o un proceso de cambio de regla (ESI-002/27). Nunca convivencia.
3. El catálogo crece solo por el proceso único de cambio de reglas, con evidencia de daño.

## Impacto sobre la implementación

Material directo de revisión de PR y de formación (ESI-002/06). Los DGP lo citan en sus criterios de aceptación negativos.

## Dependencias

Todos los documentos de esta serie; ESI-002/19, /25 y /27; ESI-003/09, /12, /15 y /20; ETS-003/009.

## Riesgos

- Catálogo usado como arma de revisión sin juicio; mitigación: citar un AP exige señalar dónde ocurre; el código decide, no la sospecha.

## Decisiones habilitadas

- Revisiones más cortas y menos personales: se discute contra el catálogo.
- Métricas de recurrencia de AP como señal de plataforma (ESI-002/28).

## Decisiones bloqueadas

- Prohibido aceptar cualquier AP-nn como "deuda consciente" sin proceso de cambio de regla.
- Prohibido ampliar el catálogo fuera del proceso único.

## Reusable Pattern

Los DGP futuros incluyen el catálogo por referencia en sus criterios de aceptación: "ningún AP-01…AP-14 presente". Los códigos son estables y citables desde cualquier documento.

## Anti-Patterns

- Tratar este catálogo como sugerencias de estilo.
- Renumerar o redefinir códigos existentes (romperían las citas históricas).
- Coleccionar anti-patterns teóricos sin evidencia de daño real.
