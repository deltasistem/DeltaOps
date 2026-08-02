# 25 — Checklist de Implementación

> **DeltaOps — ESI-005 · v1.0** · La lista cerrada que decide si un módulo de negocio está completo y conforme: la condición de "Disponible".
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Naturaleza

Este checklist extiende el de completitud del patrón (ESI-004/21) con lo específico de módulos de negocio (docs 05-20 de esta serie). Se responde con **evidencia enlazada**; N/A solo con porqué. Completarlo es la condición para pasar a "Disponible" (doc 03) y declarar M1 (doc 23).

## 2. El checklist

### A — Base del patrón
- [ ] ESI-004/21 completo (bloques A-E del patrón: estructura, dominio, datos, operación, verificación).

### B — Diseño de dominio
- [ ] Mapa de agregados con invariantes, fronteras justificadas y máquinas de estado exhaustivas (doc 11).
- [ ] Inventario de comandos derivado de transiciones, sin CRUD genérico (doc 06).
- [ ] Inventario de consultas con consumidor declarado y presupuesto (doc 07).
- [ ] Reglas clasificadas por taxonomía: invariante/Policy/servicio, con justificación donde toca (docs 09-10).
- [ ] Nombres conformes al glosario del contexto (doc 21 §3.1).

### C — Contratos y colaboración
- [ ] Catálogo de eventos con distinción interno/publicado y versión (doc 08).
- [ ] Suscripciones cruzadas declaradas; grafo de dependencias sin ciclos no justificados (doc 04).
- [ ] Proyecciones con razón declarada, reconstrucción y horizonte (doc 12).
- [ ] Integraciones externas con patrón, fake y comportamiento ante caída (doc 19).

### D — Producto y tenant
- [ ] Mapa de capacidades con dependencias y seed asimétrico (doc 05).
- [ ] Árbol de permisos con granularidad estándar, alcances y segregaciones (doc 16).
- [ ] Catálogo de parámetros con defaults, dueños y seed diferenciado (doc 14).
- [ ] Catálogo de KPIs con fórmula, ruta y dueño (doc 13).
- [ ] Tabla de aptitud offline con resoluciones de conflicto, o "ninguno" (doc 18).
- [ ] Funciones de IA conforme al catálogo permitido, o "ninguna" (doc 20).

### E — Seguridad y aislamiento
- [ ] Clasificación de datos y revisión de los cuatro canales de fuga (doc 15).
- [ ] Prueba E2E de aislamiento extendida a canales propios (doc 17).

### F — Verificación y expediente
- [ ] Plan de pruebas derivado: baterías por pieza, tablas de transición, E2E nombrados, cruzados por pareja (doc 22).
- [ ] Expediente ampliado completo (doc 21 §2).
- [ ] Bitácora del Golden Path (ESI-004/22): ninguna pieza generable creada a mano.

## Impacto sobre la implementación

Es la sección de cierre de todo DGP-módulo (sustituye a la genérica de ESI-004/21, que queda embebida como bloque A) y la compuerta del estado "Disponible".

## Dependencias

ESI-004/21-22 y /25; docs 03-22 de esta serie; ESI-002/14; Charter §9.

## Riesgos

- Checklist respondido al final en vez de mantenido; mitigación: los DGP referencian los bloques desde sus tareas — cada formulario de diseño rellena por adelantado su punto.

## Decisiones habilitadas

- Definición única y verificable de "módulo de negocio terminado".
- Transición a "Disponible" sin juicio ad-hoc.

## Decisiones bloqueadas

- Prohibido "Disponible" con puntos en rojo sin N/A justificado.
- Prohibida evidencia declarativa ("hecho") sin enlace verificable.

## Reusable Pattern

Los bloques A-F son fijos; los DGP los incluyen íntegros y solo instancian los contenidos. El bloque D es la aportación distintiva de módulos de negocio frente al patrón.

## Anti-Patterns

- Duplicar el checklist del patrón con redacciones divergentes (por eso el bloque A embebe, no copia).
- N/A en cascada para bloques incómodos (offline, IA) sin análisis real.
- Tratar el checklist como trámite del final del DGP.

## Knowledge Graph

- **ETS que consume**: transitivamente todos los citados por docs 03-22.
- **ESI que consume**: ESI-004/21-22 y /25; ESI-002/14.
- **DGP que originará**: la sección de cierre de todo DGP-módulo.
- **ADR relacionados**: ADR de evidencia enlazada (ESI-004/21 §3.1).
- **Módulos que reutilizarán este patrón**: todos; es la compuerta común a "Disponible".
