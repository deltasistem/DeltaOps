# 25 — Release Checklist

> **DeltaOps — ESI-009 · v1.0** · El checklist de liberación: criterios RC-01…RC-10 sobre la versión camino a producción — la lista que hace de la promoción una decisión con evidencia.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

Este checklist opera sobre **la versión** (doc 24 opera sobre el cambio). Es la lista de la promoción a producción (doc 10 §2.5): mayormente automática, corta por diseño — la liberación frecuente exige un checklist que se completa en minutos, no en tardes.

## 2. Criterios (RC-01…RC-10)

| # | Criterio | Verificación |
|---|---|---|
| **RC-01** | La versión candidata está etiquetada e inmutable, construida una sola vez por el pipeline (docs 09 §2.4, 11 §2.3) | Mecánica |
| **RC-02** | Todos los cambios incluidos integraron con QC en verde (doc 24); ninguno entró por fuera del flujo | Mecánica |
| **RC-03** | Verificación de integración y preproducción completa: suites, E2E críticos, baterías de aislamiento intocables (docs 08, 10 §2.3) | Mecánica |
| **RC-04** | Migraciones ensayadas en preproducción con resultado registrado; todas en fase compatible con N-1 (doc 10 §2.4) | Mecánica + registro |
| **RC-05** | Reversa viable verificada: la etiqueta N-1 puede redesplegarse contra el esquema resultante (doc 14 §3.2) | Mecánica |
| **RC-06** | Estado de toggles revisado: los nuevos nacen apagados; el plan de encendido de la versión está registrado (docs 12 §3.6, 13 §2.3) | Registro |
| **RC-07** | Notas de liberación generadas: cambios, migraciones, toggles, rupturas declaradas (doc 10 §2.6) | Mecánica |
| **RC-08** | Señales de observabilidad de los cambios significativos identificadas y con línea base para comparar (doc 10 §2.7) | Registro |
| **RC-09** | Sin incidentes S1/S2 abiertos que la liberación pueda agravar; si los hay, decisión explícita del conductor (doc 15) | Revisión |
| **RC-10** | Decisión de promoción registrada: quién promueve, qué versión, cuándo (doc 10 §2.5) | Registro |

## 3. Reglas de aplicación

1. **Verde total o decisión registrada**: el criterio en rojo bloquea la promoción salvo decisión explícita con dueño (jamás silenciosa) — y esa decisión aparece en la retrospectiva si algo sale mal.
2. **El circuito de hotfix usa la misma lista** en modo acelerado (doc 16 §2.4): se acortan esperas, no criterios; RC-05 es innegociable también ahí.
3. **La lista se mantiene corta por diseño**: criterios nuevos entran por evidencia de incidente o retrospectiva (doc 15 §2.8) y desplazan o automatizan otros; la lista que crece sin podarse mata la frecuencia de liberación que protege.

## Impacto sobre la implementación

RC se materializa como compuerta del pipeline de liberación; los criterios de registro se integran a la decisión de promoción en la plataforma.

## Dependencias

Docs 08-16, 24; ESI-003 (la base estructural de RC-04/05).

## Riesgos

- El checklist automatizado generando falsa confianza ("verde, promovamos" sin mirar contexto); mitigación: RC-09/RC-10 son juicio humano deliberado — la promoción es decisión con evidencia, no reflejo.

## Decisiones habilitadas

- Promociones diarias con evidencia uniforme y auditable.
- Hotfix con la misma disciplina a mayor velocidad.

## Decisiones bloqueadas

- Prohibida la promoción con criterios en rojo sin decisión registrada.
- Prohibido acortar criterios (vs. esperas) en el circuito acelerado.
- Prohibido crecer la lista sin evidencia y sin poda.

## Reusable Pattern

Checklist de versión corto, mecánico y con decisión registrada: la promoción como acto gobernado que cabe en la rutina diaria.

## Anti-Patterns

- La reunión de "go/no-go" de dos horas para cada liberación rutinaria.
- Promover con RC-05 en rojo "porque seguro no habrá que revertir".
- La lista de cincuenta puntos que nadie completa de verdad.

## Knowledge Graph

- **ETS que consume**: ETS-012 (la frecuencia que la lista corta protege).
- **ESI que consume**: ESI-003 (expandir-migrar-contraer tras RC-04/05).
- **DGP que originará**: la compuerta RC en el pipeline de liberación del DGP de entrega.
- **ADR relacionados**: ADR de checklist de liberación corto y mecánico.
- **Módulos que reutilizarán este patrón**: todos liberan por la misma compuerta; ninguno tiene lista propia.
