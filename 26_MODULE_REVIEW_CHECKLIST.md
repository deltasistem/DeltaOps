# 26 — Checklist de Revisión de Módulos de Negocio

> **DeltaOps — ESI-005 · v1.0** · Lo que el revisor verifica en PRs de módulos de negocio: el checklist del patrón, ampliado con el juicio de dominio.
> Documento de diseño técnico. Sin código, sin implementación.

> Nota de serie: el nombre de archivo previsto (`26_REVIEW_CHECKLIST.md`) pertenece a ESI-004, congelada; esta pieza vive como `26_MODULE_REVIEW_CHECKLIST.md` sin cambio de contenido ni numeración.

## 1. Norma base

Aplica íntegro el checklist del revisor del patrón (ESI-004/26, R-01…R-08): ubicación de lógica, fronteras, declaratividad, contratos, pruebas en su nivel, datos con disciplina, expediente, tamaño. Este documento lo amplía con los hallazgos propios de dominios reales.

## 2. Los puntos adicionales (RN — revisión de negocio)

### RN-01 — Fidelidad al dominio
Los nombres y conceptos del PR existen en el glosario del contexto (doc 21); las transiciones nuevas están en la máquina de estados del agregado, no improvisadas en el caso de uso. Pregunta operativa: ¿un experto del negocio reconocería este vocabulario?

### RN-02 — Frontera de agregado respetada
Ningún comando toca dos agregados transaccionalmente sin ADR local (doc 06 §2.2); las referencias entre agregados son por identidad; la consistencia cruzada viaja por eventos.

### RN-03 — Clasificación correcta de la regla
¿La regla nueva varía por tenant? → debe ser Policy con parámetro declarado, no un `if` con valores en duro (docs 09/14). ¿Es fija de un agregado? → invariante, no Policy.

### RN-04 — Contratos entre módulos cuidados
Eventos publicados nuevos o cambiados: ¿audiencia correcta (interno vs publicado), versión, carga mínima, N/N-1? Consumos nuevos: ¿declarados, idempotentes, enriquecen por consulta?

### RN-05 — Superficie de producto coherente
Piezas nuevas asignadas a la capacidad correcta; permisos con la granularidad estándar; parámetros con dueño y default; KPIs tocados sin bifurcar fórmulas (docs 05, 13-14, 16).

### RN-06 — Sensibilidad y aislamiento
Datos nuevos clasificados si son sensibles; sin fugas por los cuatro canales (doc 15 §2.3); nada de lógica de tenant (doc 17).

### RN-07 — Offline e integraciones dentro del estándar
Comandos declarados aptos-offline cumplen los tres criterios y su resolución de conflicto (doc 18); adaptadores externos dentro de los cuatro patrones con su fake (doc 19).

## 3. Reglas

1. Hallazgos R-nn y RN-nn bloquean; se citan con código y ubicación (disciplina de ESI-004/26 §3).
2. El material de contraste crece: además del módulo de referencia, los módulos M4 (doc 23) sirven de ejemplo comparado.
3. PRs `asistido_ia`: atención extra a RN-01 y RN-03 — los agentes tienden al CRUD y a los `if` con literales.

## Impacto sobre la implementación

La plantilla de PR enlaza ambos checklists (patrón + negocio); la formación de revisores incorpora los RN con ejemplos del dominio.

## Dependencias

ESI-004/26; docs 04-21 de esta serie; ESI-002/17.

## Riesgos

- Revisión doble percibida como burocracia; mitigación: RN-nn son siete preguntas de juicio, no formularios; la mayoría de PRs tocan dos o tres.

## Decisiones habilitadas

- Revisión uniforme de dominios distintos con criterios comunes.
- Detección temprana de las derivas típicas (CRUD, literales por tenant, eventos gordos).

## Decisiones bloqueadas

- Prohibido aprobar con RN-nn abiertos.
- Prohibido revisar módulos de negocio solo con el checklist del patrón.

## Reusable Pattern

Los RN-01…RN-07 aplican idénticos a todo módulo de negocio; solo el material de contraste y los ejemplos son por dominio.

## Anti-Patterns

- Delegar RN-01 a "producto lo verá después" — el vocabulario incorrecto fosiliza en contratos.
- Revisar la pieza sin abrir el formulario del DGP que la definió.
- Convertir los RN en debates de gusto: cada uno cita su documento normativo.

## Knowledge Graph

- **ETS que consume**: ETS-003 (lenguaje), ETS-005 (variabilidad), ETS-009 (sensibilidad).
- **ESI que consume**: ESI-004/26; ESI-002/17.
- **DGP que originará**: ninguno propio; se adopta en la plantilla de PR desde el primer DGP-módulo.
- **ADR relacionados**: ADR de revisión humana indelegable (ESI-002/17).
- **Módulos que reutilizarán este patrón**: todos; los RN son transversales.
