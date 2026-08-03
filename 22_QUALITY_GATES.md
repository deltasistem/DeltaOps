# 22 — Quality Gates

> **DeltaOps — DGP-000 · v1.0** · Las compuertas de calidad del programa QG-1…QG-4: los cuatro puntos donde el avance del DGP se verifica — todas compuestas de instrumentos congelados.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

Las barreras de calidad existen (ESI-009: puertas, QC, revisión, RC; consolidadas en ESI-010/20). Las QG del programa **las agrupan en cuatro puntos de verificación del ciclo del DGP** (doc 03) — no añaden criterios nuevos: empaquetan los existentes por etapa.

## 2. Las compuertas

**QG-1 — Especificación aprobada** (cierra la etapa 2)
| Verifica | Instrumento |
|---|---|
| Anatomía completa del DGP (los doce rubros) | Plantilla oficial (doc 10) |
| Fidelidad: referencias exactas a ETS/ESI resolubles; sin re-arquitectura | CP-01; índice ESI-010/04 |
| Tamaño: capacidad completa pero mínima | Doc 10 §3.1 |
| Dependencias contra la matriz (doc 16); contratos tocados declarados | Registro (doc 12) |
| Criterios de aceptación verificables con caminos tristes | ESI-009/23 |
| Nivel de apalancamiento de IA declarado | Doc 20 §3 (riesgo de mapa invertido) |

**QG-2 — Contratos publicados** (cierra la etapa 3)
- Esquemas, contratos de API/eventos y contratos de pantalla declarados y registrados (CP-02; ESI-010/13; ESI-008/05); pruebas de aceptación esqueletizadas; el paralelismo del DGP queda habilitado (doc 09 §2, eje de capas).

**QG-3 — Construcción integrada** (cierra la etapa 4)
- Todos los PR del DGP integrados con el régimen completo: puertas mecánicas verdes, QC, revisión DR aprobada, deuda registrada (ESI-009/06-07, /16, /24) — QG-3 no re-verifica: constata que ningún cambio del DGP entró por fuera.

**QG-4 — Verificación completa** (cierra la etapa 5)
- Cadena de entornos recorrida; pruebas de aceptación en verde contra los criterios del DGP; migraciones ensayadas; RC formado y aprobado (ESI-009/08-09, /25); baterías intocables verdes (CP-09).

## 3. Reglas normativas

1. **Las QG son puntos de constatación, no re-trabajo**: verifican que los instrumentos congelados operaron — la QG que re-audita todo duplica lo que las puertas ya hicieron; la QG que no constata nada es teatro.
2. **QG en rojo detiene la etapa, visible en el registro**: el DGP no avanza de etapa con su QG pendiente (doc 11 §3.1 — el estado deriva de compuertas).
3. **Quien constata no es quien construyó** (la separación de ESI-009/06): QG-1 la revisa un par calificado; QG-3/QG-4 derivan mecánicamente donde se puede, con constatación humana del dueño de la etapa siguiente.
4. **Los waivers siguen su régimen congelado** (ESI-007/18): temporales, con dueño y plan; lo no-waiveable no se discute — las QG no crean un régimen de excepciones nuevo.

## Impacto sobre la implementación

Las QG se materializan como listas de constatación en la plantilla de DGP y estados derivados en el registro; los instrumentos subyacentes ya existen.

## Dependencias

ESI-007/18; ESI-008/05; ESI-009/06-09, /16, /23-25; ESI-010/04, /13, /20; docs 03, 09-12, 16, 20.

## Riesgos

- Las QG degradadas a checkboxes marcados en lote; mitigación: derivación mecánica donde se puede y constatación con nombre donde no — el que marca responde (la regla de un criterio, un verificador; ESI-010/08).

## Decisiones habilitadas

- Avance de DGP verificable en cuatro puntos uniformes.
- Estados de programa derivados de compuertas con evidencia.

## Decisiones bloqueadas

- Prohibido avanzar de etapa con QG pendiente.
- Prohibidas QG que dupliquen criterios de instrumentos congelados.
- Prohibido que el constructor constate su propia QG-1.

## Reusable Pattern

QG = empaquetado por etapa de instrumentos congelados + constatación separada + estado derivado: la calidad del programa sin burocracia nueva.

## Anti-Patterns

- La QG-1 aprobada "de palabra" para no frenar el arranque.
- Re-auditar en QG-3 lo que las puertas ya verificaron.
- El DGP "en verificación" con QG-3 pendiente.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-009 (los instrumentos empaquetados); ESI-010/08, /20 (registro y gobierno de calidad).
- **DGP que originará**: todos atraviesan QG-1…4.
- **ADR relacionados**: ADR de compuertas de calidad por etapa del DGP.
- **Módulos que reutilizarán este patrón**: cada capacidad suya pasa las mismas cuatro QG.
