# 18 — Collaboration Model

> **DeltaOps — ESI-010 · v1.0** · El modelo de colaboración: cómo trabajan juntos equipos, humanos e IA — asincronía por defecto, artefactos como medio y las interfaces de la casa como idioma común.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La colaboración en DeltaOps no se organiza por reuniones sino por **artefactos gobernados e interfaces normadas**: el PR, el contrato, el registro, la decisión, el tablero. Este documento integra cómo los actores — equipos de módulo, plataforma, transversales, y la IA asistente — cooperan sin fricción ceremonial.

## 2. Reglas normativas

1. **Asincronía por defecto, sincronía con propósito**: el estado vive en tableros y registros (docs 04-13, 25), el debate técnico en PR y propuestas de decisión; la reunión se reserva para lo que la asincronía resuelve mal — decisión con matices, diseño exploratorio, retrospectiva (ESI-009/20 §2.4).
2. **La colaboración entre equipos pasa por contratos**: el equipo que necesita algo de otro módulo consume su contrato (doc 13) o propone su extensión por el flujo — jamás "un favorcito directo a la base de datos"; la frontera técnica (ESI-005/04) es también la frontera organizacional (la inversa de Conway aplicada con intención).
3. **Las dependencias entre equipos se declaran donde las de PR** (ESI-009/05 §2.5): el trabajo bloqueado por otro equipo es visible en la cadencia sincronizada (ESI-009/20 §2.1) — la dependencia susurrada en un pasillo no existe para el sistema.
4. **Los transversales gobiernan por régimen, no por cuello de botella**: seguridad, experiencia y entrega operan vía normas, puertas y revisiones reforzadas (sus series); el equipo transversal que aprueba todo a mano es el anti-patrón que sus propios regímenes eliminan.
5. **El conocimiento se comparte por el corpus**: lo aprendido que vale se escribe (promociones, decisiones, docs 22); la revisión cruzada circula contexto (ESI-009/06); el experto cuyo saber vive solo en su cabeza es un riesgo registrable como deuda.
6. **La IA es un colaborador con reglas propias** (doc 16): amplifica a cada actor bajo el mismo flujo; los artefactos que produce entran al mismo circuito de colaboración — el PR asistido se revisa igual, se discute igual.
7. **El desacuerdo entre equipos escala por el canal**: contratos en disputa, prioridades cruzadas y conflictos de norma van al proceso de decisión (doc 07) con propuesta escrita — la escalada es un mecanismo sano, no una falla diplomática.

## Impacto sobre la implementación

Sin mecanismo nuevo: los medios de colaboración son los instrumentos ya normados; las cadencias sincronizadas ya existen (ESI-009/20).

## Dependencias

ESI-005/04; ESI-009/05-06, /20; docs 04-13, 16-17, 22, 25.

## Riesgos

- La asincronía degenerando en silencio (nadie responde, todo se estanca); mitigación: plazos con métrica donde importa (primera revisión, ESI-009/06 §2.6) y las dependencias visibles en cadencia — el estancamiento se ve y se gobierna.

## Decisiones habilitadas

- Escalado de equipos sin explosión de reuniones de coordinación.
- Colaboración humano-IA dentro del mismo circuito de artefactos.

## Decisiones bloqueadas

- Prohibida la cooperación entre módulos por fuera de contratos.
- Prohibidas dependencias entre equipos no declaradas.
- Prohibido el transversal como aprobador manual universal.

## Reusable Pattern

Colaborar por artefactos gobernados + fronteras técnicas como fronteras de equipo + escalada por canal: la organización alineada con la arquitectura que ya decidió.

## Anti-Patterns

- La reunión semanal de sincronización de ocho equipos.
- El acceso directo "temporal" a las tablas de otro módulo.
- Resolver el conflicto de contrato por jerarquía de gritos.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-005/04 (fronteras); ESI-009/05-06, /20 (los medios).
- **DGP que originará**: ninguno; usa los instrumentos existentes.
- **ADR relacionados**: ADR de colaboración por artefactos y contratos.
- **Módulos que reutilizarán este patrón**: todos los equipos colaboran por este modelo.
