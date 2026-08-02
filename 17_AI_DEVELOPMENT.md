# 17_AI_DEVELOPMENT.md

> **DeltaOps — ESI-002 · v1.0** · Ingeniería asistida por IA: los agentes son desarrolladores bajo las mismas reglas.
> Sin código.

---

## 1. Postura oficial

DeltaOps se construirá con participación intensiva de agentes de IA (el propio programa DGP lo presupone). La postura es simple: **la IA es un desarrollador más** — mismo entorno (05), mismos comandos (16), mismas plantillas (18), misma puerta (ESI-001/10), misma prohibición de atajos. Lo que cambia son tres refuerzos: trazabilidad, revisión humana y límites explícitos.

## 2. Reglas de trazabilidad

1. **Todo cambio con autoría o co-autoría de IA se marca**: en el PR (campo de la plantilla) y, cuando el cambio produce registros del producto, con el marcador `asistido_ia` que el Kernel ya contempla (ETS-011). La marca es información, no estigma: permite auditar patrones de defectos por origen.
2. **El prompt relevante es parte del contexto del PR** cuando condicionó decisiones no obvias: el revisor debe poder saber QUÉ se le pidió al agente.
3. La marca jamás se usa para relajar la revisión ("lo hizo la IA, apruébalo rápido") ni para endurecerla ritualmente — el criterio de revisión es el mismo checklist (25).

## 3. Reglas de operación de agentes

1. **Revisión humana obligatoria e indelegable**: ningún cambio de IA se mergea sin aprobación de un humano que lo LEYÓ (04 §3.4); el humano que aprueba responde por la pieza como si fuera suya.
2. **La IA lee las mismas fuentes de verdad**: Charter → ETS → ESI → guías (jerarquía de 01 §4); el contexto de un agente para una pieza es la plantilla de esa pieza (18) + los documentos que la plantilla cita — no el corpus entero ni su memoria de entrenamiento sobre "cómo se suele hacer".
3. **Prohibido a los agentes**: tocar secretos (08), modificar documentos congelados (ETS/ESI aprobados), inventar dependencias fuera del proceso (13), editar `packages/contracts` a mano (03 §regla 5), mergear, y desactivar verificaciones para "hacer pasar" la puerta.
4. **La pieza de IA se termina igual**: código + prueba + documentación (Definition of Done, Charter §9); el agente que entrega sin pruebas entrega trabajo incompleto.
5. **Generadores primero también para la IA** (19): el agente crea piezas con `generar`, no tecleando estructuras de memoria — la deriva de IA es la misma deriva humana, multiplicada por velocidad.

## 4. División del trabajo sana

| Tarea | Ajuste para IA |
|---|---|
| Piezas dentro de plantilla (casos de uso, consultas, pantallas, pruebas) | terreno ideal: patrón fijo, verificación mecánica densa |
| Refactors mecánicos amplios | bien, con suite verde antes y después (ETS-012/26) |
| Decisiones de arquitectura, contratos nuevos, ADRs | el humano decide; la IA propone y documenta |
| Seguridad, tenancy, migraciones destructivas | doble revisión humana obligatoria |

## 5. Mejora continua

Los defectos que lleguen a revisión o producción desde cambios asistidos alimentan retro (27): la respuesta correcta suele ser endurecer una plantilla o una verificación (que protege también a humanos), no prohibir la asistencia.

---

## Impacto sobre la implementación
Los DGP podrán dirigir agentes con seguridad: plantillas como contexto, comandos como interfaz, puerta como juez y revisión humana como responsabilidad final.

## Dependencias
18/19 (plantillas y generadores como contexto/vía) · 04 (PRs y revisión) · 08 (secretos) · 25 (checklist único) · ETS-011 (`asistido_ia`).

## Riesgos
- Volumen de PRs de IA saturando la revisión humana → PRs chicos (04) + terreno de plantilla (verificación mecánica hace la revisión rápida); el cuello se gestiona en 27.
- Agentes citando "prácticas comunes" contra los ETS → regla 2 del §3: el contexto oficial manda; la revisión rechaza lo no trazable a documentos.

## Decisiones habilitadas
Uso de agentes en los DGP desde el Sprint 1, métricas de calidad por origen, evolución de plantillas guiada por defectos.

## Decisiones bloqueadas
Elección de herramientas/agentes concretos de IA — operativa, mientras respeten este marco; permisos de agentes sobre entornos QA+ — denegados hasta ADR.
