# 20 — Quality Governance

> **DeltaOps — ESI-010 · v1.0** · El gobierno de la calidad: la calidad como propiedad del sistema — barreras en capas, responsabilidad del que construye y mejora por promoción.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La calidad en DeltaOps no es un departamento ni una fase: es la propiedad emergente de las barreras ya congeladas operando en capas. Este documento consolida el modelo — quién es responsable, cómo se defiende en profundidad y cómo mejora.

## 2. Las capas de defensa (consolidación)

| Capa | Barrera | Fuente |
|---|---|---|
| **Antes de construir** | DoR, criterios con caminos tristes, encuadre contra registros | ESI-009/21, /23; doc 02 |
| **Al construir** | Patrones establecidos, contratos-precede, pruebas con el código | Doc 06; ESI-009/08 |
| **Al integrar** | Puertas estáticas, QC, revisión DR con listas de dominio | ESI-009/06-07, /24; doc 08 |
| **Al liberar** | Verificación creciente por entorno, RC, migraciones ensayadas | ESI-009/10, /25 |
| **En producción** | Señales confirmadas, exposición gradual, reversa lista | ESI-009/10, /13-14 |
| **Después** | Retrospectivas, promoción de hallazgos, scores | ESI-009/15, /18-19; doc 09 |

## 3. Reglas normativas

1. **La calidad es del que construye**: no existe un equipo de QA que "atrapa" al final; las barreras son del flujo y el dueño del cambio responde por su calidad — el modelo ya implícito en ESI-009 hecho explícito.
2. **Defensa en profundidad deliberada**: ninguna capa pretende atrapar todo; el defecto que cruza una capa debe chocar con la siguiente — el análisis de todo escape pregunta qué capa faltó y la refuerza (ESI-009/15 §2.8), no busca la capa perfecta.
3. **El costo del defecto crece por capa**: atraparlo en DoR cuesta minutos; en producción, incidentes — la inversión sigue ese gradiente: las capas tempranas se alimentan primero (la economía de la pirámide de pruebas generalizada).
4. **La calidad se mide por el sistema, no por héroes**: la tasa de fallo de cambio, escapes por capa y tiempo de restauración (ESI-009/18) miden las barreras; el equipo que depende de la vigilancia extraordinaria de una persona tiene una barrera sin construir.
5. **Los estándares de dominio son la vara**: qué es "bueno" ya está definido — anatomía (ESI-004), servicios (ESI-006), seguridad (ESI-007), experiencia (ESI-008); la calidad no es gusto: es conformidad + juicio en lo que las normas dejan abierto.
6. **La mejora entra por promoción, no por campaña**: el hallazgo repetido se vuelve puerta o prueba (el motor común, doc 08 §2.3); las "iniciativas de calidad" episódicas quedan sustituidas por el mecanismo permanente.

## Impacto sobre la implementación

Sin órgano nuevo: el gobierno de calidad es la operación disciplinada de las capas existentes, medida por los scores ya normados.

## Dependencias

ESI-004; ESI-006; ESI-007; ESI-008; ESI-009/06-08, /10, /13-15, /18-19, /21, /23-25; docs 02, 06, 08-09.

## Riesgos

- La responsabilidad difusa ("la calidad es de todos" = de nadie); mitigación: el dueño del cambio responde (§3.1) y cada barrera tiene dueño de mantenimiento en su DGP — responsabilidad concreta en cada punto.

## Decisiones habilitadas

- Inversión en calidad dirigida por evidencia de escapes por capa.
- Conversaciones de calidad ancladas a barreras concretas, no a virtud.

## Decisiones bloqueadas

- Prohibido el QA-fase-final como sustituto de las capas.
- Prohibido debilitar capas tempranas para "ir más rápido".
- Prohibidas campañas de calidad como sustituto de la promoción permanente.

## Reusable Pattern

Calidad = capas de defensa con dueño + costo creciente por capa + mejora por promoción: el gobierno que hace la calidad estructural, no heroica.

## Anti-Patterns

- El "hardening sprint" antes de cada release.
- Culpar al último que tocó en vez de a la barrera que faltó.
- La métrica de calidad que cuenta bugs por persona.

## Knowledge Graph

- **ETS que consume**: ETS-012 (la calidad como promesa comercial sostenida).
- **ESI que consume**: las barreras de ESI-004…009 (tabla §2).
- **DGP que originará**: ninguno; los dueños de barreras viven en los DGP existentes.
- **ADR relacionados**: ADR de calidad por capas con responsabilidad del constructor.
- **Módulos que reutilizarán este patrón**: todos operan las mismas capas.
