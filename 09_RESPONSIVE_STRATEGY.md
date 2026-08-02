# 09 — Responsive Strategy

> **DeltaOps — ESI-008 · v1.0** · La estrategia responsiva: tres posturas, no infinitos anchos — el comportamiento adaptativo vive en los marcos, no en cada pantalla.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Las tres posturas

La adaptación no es por píxeles, es por **postura de uso** (ETS-011):

| Postura | Contexto real | Características normadas |
|---|---|---|
| **Campo** (móvil) | Técnico con una mano, guantes a veces, sol, prisa | Una columna, objetivos táctiles grandes, acciones al alcance del pulgar, offline primero (doc 11) |
| **Planta** (tableta/terminal compartida) | Dispositivo compartido, distancia, luz industrial | Densidad media, alta legibilidad (tema, doc 08 §2.4), sesión compartida con PIN (ESI-007/05) |
| **Oficina** (escritorio) | Análisis, comparación, múltiples tareas | Densidad alta disponible, atajos de teclado, multi-panel donde el layout lo prevé |

Los umbrales que separan posturas son **tokens** (doc 08) — decisión única del sistema, no de cada pantalla.

## 2. Reglas

1. **La adaptación es del marco, no de la pantalla**: los layouts (doc 07) y marcos (tablas, formularios, diálogos) declaran su comportamiento por postura una vez; la pantalla instancia y hereda. La pantalla con lógica responsiva propia es hallazgo de revisión.
2. **Mismo contrato en toda postura**: la pantalla declara un solo contrato (doc 05); la postura cambia presentación y priorización, jamás capacidades ni datos disponibles — lo que se puede hacer no depende del tamaño del cristal (la aptitud offline sí es rubro aparte, doc 11).
3. **Priorización declarada**: cada pantalla declara qué es esencial (visible en campo), qué es secundario (colapsable) y qué es de análisis (puede quedar en oficina tras "ver más"); esta priorización es parte del contrato, no improvisación del que implemente.
4. **Campo primero como orden de diseño** (doc 23): la versión de campo se diseña antes; oficina enriquece. Lo inverso (recortar un escritorio hasta que quepa) produce los móviles inutilizables que ETS-011 documenta.
5. **Probado por postura, no por navegador**: el checklist (doc 25) verifica las tres posturas como estados de primera clase; "se ve bien en mi pantalla" no es verificación.

## 3. Declaración (los ocho rubros)

- **Commands/Queries/Capacidades/Servicios/Permisos/KPIs/IA**: no aplican — la estrategia es transversal; los rubros son de las pantallas.
- **Offline**: la postura de campo asume intermitencia por defecto; su estrategia está en el doc 11.

## Impacto sobre la implementación

Los comportamientos por postura entran a la definición de cada layout y marco en el DGP de experiencia; la priorización esencial/secundario/análisis se añade al formulario de contrato (doc 27).

## Dependencias

Docs 05, 07-08, 11, 23, 25; ETS-011; ESI-007/05.

## Riesgos

- La postura de planta descuidada por ser la minoritaria en los equipos de diseño (que viven en oficina); mitigación: el checklist la exige explícitamente y el score separa métricas por postura (doc 24).

## Decisiones habilitadas

- Un solo producto sirviendo campo, planta y oficina sin forks.
- Pantallas nuevas responsivas por herencia, sin trabajo adaptativo propio.

## Decisiones bloqueadas

- Prohibidas pantallas con lógica responsiva propia fuera de los marcos.
- Prohibido recortar capacidades por postura (presentación ≠ alcance).
- Prohibidos umbrales de adaptación fuera de tokens.

## Reusable Pattern

Posturas semánticas + adaptación en marcos + priorización declarada: responsive como contrato heredable, no como esfuerzo por pantalla.

## Anti-Patterns

- El sitio de escritorio "que también se abre en el móvil".
- Ocultar en móvil la acción que el técnico más necesita.
- Media queries artesanales por pantalla recreando el caos.

## Knowledge Graph

- **ETS que consume**: ETS-011 (las tres realidades de uso).
- **ESI que consume**: ESI-007/05 (sesiones de dispositivo compartido).
- **DGP que originará**: comportamientos por postura en cada marco del DGP de experiencia.
- **ADR relacionados**: ADR de posturas sobre breakpoints.
- **Módulos que reutilizarán este patrón**: todos heredan; la priorización por pantalla es su única tarea responsiva.
