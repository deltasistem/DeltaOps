# 27 — Knowledge Graph de la Serie ESI-006

> **DeltaOps — ESI-006 · v1.0** · El grafo de conocimiento consolidado del estrato compartido: qué consume esta serie, qué origina y cómo se navega.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

Cada documento de la serie cierra con su Knowledge Graph local; este documento consolida el grafo de la serie completa para navegación y análisis de impacto documental.

## 2. Lo que ESI-006 consume

| Fuente | Uso principal |
|---|---|
| ETS-002/003 | Necesidades transversales y fronteras de dominio (docs 01-02, 22) |
| ETS-004/005/006 | Maestros etiquetables, capacidades/configuración, disciplina de fechas (docs 12, 17, 20; 09-10, 16) |
| ETS-007/008/009 | Ruta analítica (16), catálogos de contratos (08, 21), gobierno de datos y aislamiento (04, 08-09, 13, 19) |
| ETS-010/011/012 | Calidad exigible (24-25), fronteras/adaptadores (13-14), operación de campo (07, 12) |
| ENGINEERING_CHARTER | Principios rectores heredados por toda la serie |
| ESI-002 | Puerta de calidad (17→21, 24), proceso de decisiones (27→02, 23, 25), seed asimétrico (12→17, 20) |
| ESI-003 | Kernel: bandejas (21→03, 14), trabajos (22→09-11), evaluación de capacidades/permisos (12→17, 19), anticorrupción (24→14) |
| ESI-004 | Patrón de pieza: proyecciones reconstruibles (15→06, 08), eventos (14→18), auditoría (17→06), operabilidad (19-20→24), mapa vivo (21→21-22), revisión (26→25) |
| ESI-005 | Estándar de módulos: los docs espejo (05→17, 08→18, 16→19, 14→20, 04→21, 23→23, 25→24, 27-28→26) y las normas funcionales (07, 13, 15, 17-20) |

## 3. Lo que ESI-006 origina

- **Conceptos nuevos**: estrato de servicios compartidos (01), referencia de entidad y patrón satélite (04), suscripción por marcas (18), tres patrones de autorización con doble llave (19), niveles de configuración (20), matriz diseño/observada (22), escala CS/RS (24-25), olas de servicios (26).
- **DGP**: extensiones de plataforma + hasta 14 DGP-Servicio + secciones de consumo en DGP-módulo (26).
- **ADR citables**: estratificación (01), catálogo cerrado (02), acoplamiento unidireccional (01/03), etiqueta-como-identidad (12), contratos-no-prompts (13), chasis-sin-semántica (14), puerta única de KPIs (16), declaración inversa (18), barrera M2 (23).

## 4. Reglas de navegación

1. **"Citar, no repetir"** (ESI-002): los documentos citan norma por código (doc NN §M, ESI-00X/YY); este grafo resuelve las rutas.
2. **Impacto documental**: cambiar una norma citada exige recorrer sus citantes (este grafo hacia atrás) — el análisis N/N-1 documental.
3. **El grafo es congelable**: al cerrar la serie, este documento fija la versión v1.0 del grafo; series futuras lo extienden sin reescribirlo.

## Impacto sobre la implementación

Ninguna pieza de software: instrumento documental para navegación, onboarding y análisis de impacto de cambios normativos.

## Dependencias

Todos los documentos de la serie (01-28) y las series citadas en §2.

## Riesgos

- Grafo desactualizado tras cambios de serie; mitigación: el cambio normativo (ESI-002/27) incluye actualizar el grafo consolidado como paso del proceso.

## Decisiones habilitadas

- Análisis de impacto documental mecánico (quién cita qué).
- Onboarding guiado por el grafo en vez de lectura lineal.

## Decisiones bloqueadas

- Prohibido modificar normas citadas sin recorrer citantes.
- Prohibidas citas sin código resoluble ("como se dijo antes").
- Prohibido duplicar normas en vez de citarlas.

## Reusable Pattern

El grafo consolidado por serie (consume/origina/ADR + reglas de navegación) es el cierre estándar: ESI-005/27 lo hizo para módulos, este para servicios; toda serie futura lo replica.

## Anti-Patterns

- Grafos dibujados sin correspondencia con las citas reales.
- Series nuevas que citan documentos por título en vez de código.
- Tratar el grafo como documentación opcional.

## Knowledge Graph

- **ETS que consume**: los doce, según el mapa §2.
- **ESI que consume**: ESI-002, ESI-003, ESI-004, ESI-005 completos, según el mapa §2.
- **DGP que originará**: ninguno directo; es el índice de los DGP del doc 26.
- **ADR relacionados**: el catálogo consolidado §3.
- **Módulos que reutilizarán este patrón**: todos los equipos lo usan para navegar la norma; las series futuras replican el cierre.
