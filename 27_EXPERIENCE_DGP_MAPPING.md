# 27 — Relación con DGP (Experiencia)

> **DeltaOps — ESI-008 · v1.0** · Cómo la plataforma de experiencia se materializa en DGP: un DGP propio, la sección de experiencia en todos los demás y el orden en el portafolio.
> Documento de diseño técnico. Sin código, sin implementación.

*(Nota de serie: `27_DGP_MAPPING.md` pertenece a ESI-005 y está congelado; este documento cumple el rol equivalente para ESI-008 con nombre desambiguado.)*

## 1. El DGP de Plataforma de Experiencia

| Bloque de entrega | Contenido | Documentos fuente |
|---|---|---|
| Fundamento | Catálogo de tokens (tres capas, temas), catálogo de contenido/textos, validaciones de puerta (valores sueltos, contraste, semántica) | 08, 10 |
| Chasis | Shell con regiones, selector de contexto y fronteras, registro de navegación, catálogo de workspaces | 02-04, 06 |
| Marcos | Layouts L1-L6, controles de formulario, tabla, diálogos, asistentes, widgets de tablero, superficies de búsqueda, patrones offline/carga/error/vacío, marca y formas de IA, bandeja de notificaciones | 07, 11-22 |
| Gobierno | Colector de telemetría de experiencia, tablero del score, EC/XR en puertas y plantillas | 24-25 |

## 2. La sección de experiencia de todo DGP de módulo

Cada DGP de módulo declara, citando esta serie:

1. **Inventario de pantallas** con su **contrato de ocho rubros** completo (doc 05) — el formulario central.
2. **Layout por pantalla** del catálogo (doc 07) y prioridad esencial/secundario/análisis (doc 09 §2.3).
3. **Entradas de navegación** (workspace, área, orden, visibilidad — doc 03) y a qué workspaces aporta (doc 04).
4. **Campo primero**: las pantallas de ejecución presentadas en su diseño de campo con presupuesto de interacción (doc 23).
5. **Catálogos de superficie**: tipos de notificación con severidad justificada (doc 15), textos de vacíos por causa (doc 14), mensajes de error operativos (doc 13), tableros estándar que aporta (doc 18).
6. **EC-01…EC-12 en la definición de terminado** y XR activadas en revisión (doc 25).

## 3. Orden y encaje

1. **El fundamento y el chasis preceden a la primera pantalla de módulo**: tokens, shell, navegación y los marcos que el módulo de referencia necesite (ESI-004) están antes — el módulo de referencia valida también la plataforma de experiencia.
2. **Los marcos se entregan por demanda de las olas** (ESI-006/26): con Ola 1 los universales (tabla, formulario, diálogos, offline, errores); los especializados (asistentes complejos, IA) llegan con los módulos que los estrenan — sin construir marcos que nadie instancia.
3. **El DGP de experiencia es hermano de los tres de seguridad** (ESI-007/25): la identidad y sesiones (que el shell consume) preceden; el gobierno crece en paralelo.
4. **Cita, no repetición**: los DGP citan esta serie como norma; su contenido nuevo es lo específico (contratos rellenos, textos, catálogos).

## Impacto sobre la implementación

El portafolio queda: Kernel + plataforma compartida + seguridad (suelo) → **DGP de experiencia (fundamento+chasis)** → módulo de referencia validando todo → olas con marcos por demanda.

## Dependencias

Docs 01-25; ESI-004 (módulo de referencia); ESI-005/27; ESI-006/26; ESI-007/25; ESI-002 (proceso).

## Riesgos

- El DGP de experiencia hinchándose hasta bloquear las olas (construir los veinte marcos antes de la primera pantalla); mitigación: la entrega por demanda §3.2 — solo lo que la ola siguiente instancia.

## Decisiones habilitadas

- Plan de construcción de superficie completo y secuenciado con el portafolio existente.
- DGP de módulos con sección de experiencia formularizada (rellenar, no inventar).

## Decisiones bloqueadas

- Prohibidas pantallas de módulo antes del fundamento y chasis.
- Prohibidos DGP de módulo sin la sección de experiencia §2 completa.
- Prohibido construir marcos sin instancia demandante en la ola.

## Reusable Pattern

Un DGP propio (fundamento→chasis→marcos por demanda→gobierno) + sección transversal en todos: el mismo encaje que seguridad (ESI-007/25) — los programas transversales ya tienen molde.

## Anti-Patterns

- El "design system big bang" de un año sin pantallas reales.
- Módulos construyendo pantallas mientras el chasis "se termina".
- La sección de experiencia del DGP redactada tras construir las pantallas.

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (los módulos que ordenan la demanda de marcos).
- **ESI que consume**: ESI-004; ESI-005/27; ESI-006/26; ESI-007/25; ESI-002.
- **DGP que originará**: el DGP de plataforma de experiencia; la sección §2 en todos los DGP de módulo.
- **ADR relacionados**: ADR de marcos-por-demanda; ADR de experiencia-como-suelo-de-superficie.
- **Módulos que reutilizarán este patrón**: todos incorporan la sección §2; ninguno construye superficie fuera de ella.
