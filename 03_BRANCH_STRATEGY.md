# 03 — Branch Strategy

> **DeltaOps — ESI-009 · v1.0** · La estrategia de ramas: un catálogo cerrado de tipos, nomenclatura declarativa y vida máxima con consecuencias.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Catálogo de tipos

Como los layouts (ESI-008/07), los tipos de rama forman catálogo cerrado:

| Tipo | Propósito | Nace de | Vuelve a | Vida objetivo |
|---|---|---|---|---|
| **Trabajo** | Un cambio (feature, fix, refactor, docs) | Principal | Principal | Días |
| **Release** | Estabilización breve de una versión candidata (doc 10 §2.3) | Principal | — (etiqueta y muere) | Horas-días |
| **Hotfix** | Corrección urgente sobre versión liberada (doc 16) | Etiqueta liberada | Principal + etiqueta | Horas |
| **Experimento** | Exploración descartable, jamás se libera | Principal | — (se descarta) | Días |

No existen otros tipos; un tipo nuevo entra por el proceso de evolución (doc 28) con ≥3 casos reales — la regla de generalización de la casa.

## 2. Reglas normativas

1. **Nomenclatura declarativa**: `tipo/modulo-descripcion-breve` con referencia al elemento de trabajo; el nombre dice qué es y de qué módulo, como los permisos `MODULO.RECURSO.ACCION` dicen qué protegen. Ramas sin dueño identificable son huérfanas y se podan.
2. **Una rama, un cambio**: la rama que acumula cambios no relacionados se parte antes del PR; la unidad de revisión es la unidad de intención (doc 05 §2.1).
3. **Vida máxima con consecuencia**: la rama de trabajo que supera el umbral definido en el DGP (días, no semanas) aparece en el tablero de higiene (doc 18) y su dueño la re-integra, la parte o la descarta; la rama zombi no es un estado neutro.
4. **La rama no es lugar de almacenamiento**: trabajo pausado se integra apagado tras toggle (doc 12) o se descarta y se rehace; "lo tengo en una rama" no es progreso, es riesgo.
5. **Las ramas de experimento están marcadas y aisladas**: pueden violar convenciones internas para explorar, pero jamás generan PR hacia la principal; su aprendizaje se rehace como rama de trabajo limpia.
6. **Ramas efímeras también en documentos**: los cambios normativos (ESI-002/27) viajan por el mismo flujo — rama, PR, revisión — porque el repositorio es la única fuente (doc 02 §2.6).

## Impacto sobre la implementación

Los umbrales de vida y el tablero de higiene se definen en el DGP de entrega; la nomenclatura se verifica mecánicamente al abrir PR.

## Dependencias

Docs 02, 05, 10, 12, 16, 18, 28; ESI-002/27.

## Riesgos

- La partición forzada de cambios genera PR interdependientes mal secuenciados; mitigación: la cadena de PR se declara en el contrato (doc 05 §2.5) y expandir-migrar-contraer ordena las dependencias.

## Decisiones habilitadas

- Higiene del repositorio medible y automatizable.
- Lectura inmediata del estado del trabajo en curso desde los nombres.

## Decisiones bloqueadas

- Prohibidos tipos de rama fuera del catálogo.
- Prohibidas ramas de trabajo más allá del umbral sin acción.
- Prohibido liberar desde ramas de experimento.

## Reusable Pattern

Catálogo cerrado + nomenclatura declarativa + vida máxima con consecuencia: el mismo régimen de los catálogos de la casa, aplicado a las ramas.

## Anti-Patterns

- La rama `wip-cosas-varias` de tres meses.
- Ramas personales permanentes como espacio de trabajo.
- El experimento que "ya casi está" y se libera sin rehacerse.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-002/27 (cambios normativos por el mismo flujo); ESI-008/07 (patrón de catálogo cerrado).
- **DGP que originará**: umbrales de vida y tablero de higiene en el DGP de entrega.
- **ADR relacionados**: ADR de catálogo de ramas cerrado.
- **Módulos que reutilizarán este patrón**: todos los equipos nombran y podan igual.
