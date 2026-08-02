# 08 — Design Token Strategy

> **DeltaOps — ESI-008 · v1.0** · La estrategia de tokens de diseño: toda decisión visual es un token nombrado — el vocabulario visual único, versionado y sin valores sueltos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

Un **token** es una decisión visual nombrada (color, tipografía, espaciado, radio, sombra, duración, umbral responsivo) con significado semántico. La arquitectura de tres capas:

| Capa | Qué contiene | Ejemplo conceptual |
|---|---|---|
| **Primitivos** | La paleta cruda: escalas de color, tamaños, duraciones | "azul-600", "espacio-4" |
| **Semánticos** | El significado: para qué se usa | "color-accion-primaria", "fondo-critico", "espacio-entre-secciones" |
| **De componente/marco** | Decisiones de los marcos (tabla, formulario, diálogo) expresadas en semánticos | "tabla-altura-fila-densa" |

Las pantallas y marcos consumen **solo semánticos y de componente**; los primitivos son internos del sistema de tokens.

## 2. Reglas

1. **Cero valores sueltos**: ninguna pantalla ni marco declara un color, tamaño o duración literal; todo es token citado. La detección de valores sueltos es mecánica en la puerta (el análogo visual de la detección de secretos, ESI-007/11).
2. **La semántica es del sistema, no del módulo**: los estados universales (crítico, advertencia, éxito, informativo, neutro) y las jerarquías (primario, secundario, deshabilitado) se nombran una vez; un módulo jamás introduce su propio "rojo especial" — el significado de los colores es un contrato de producto (crítico se ve igual en OT que en inventario).
3. **Los tokens portan accesibilidad**: los pares fondo/texto semánticos garantizan contraste (doc 10) por construcción; usar pares declarados hace imposible el contraste ilegal.
4. **Temas como reasignación de primitivos**: modo claro/oscuro y el tema de alta legibilidad de planta (doc 23) reasignan primitivos bajo los mismos semánticos; las pantallas no saben de temas. La identidad de marca del tenant (logotipo, acento) entra por tokens designados como personalizables — el resto es invariable (sin "temas por cliente", ESI-007/27).
5. **El sistema de tokens se versiona N/N-1**: cambios de semánticos son cambio de contrato con migración; añadir es libre, renombrar/eliminar sigue expandir-migrar-contraer.

## 3. Declaración (los ocho rubros)

- **Commands/Queries/Capacidades/Permisos/KPIs/IA**: no aplican — los tokens son vocabulario, no pantalla.
- **Servicios**: configuración (ESI-006/20) para preferencia de tema por cuenta.
- **Offline**: los tokens viajan con la aplicación; ningún token se resuelve por red.

## Impacto sobre la implementación

El catálogo de tokens (primitivos + semánticos + de marco) es entregable temprano del DGP de experiencia; la validación de valores sueltos entra a la puerta de calidad.

## Dependencias

Docs 09-10, 23; ESI-002/17; ESI-006/20; ESI-007/27 (sin forks por cliente).

## Riesgos

- Explosión de semánticos ad-hoc ("color-boton-cancelar-de-ot") que recrea el caos con nombres; mitigación: el alta de semánticos es decisión del sistema de diseño con la regla de ≥3 usos reales, y el score cuenta semánticos huérfanos (doc 24).

## Decisiones habilitadas

- Temas (oscuro, alta legibilidad) sin tocar pantallas.
- Rebranding o ajuste visual global editando una capa.
- Contraste accesible garantizado por construcción.

## Decisiones bloqueadas

- Prohibidos valores visuales literales en pantallas y marcos.
- Prohibidos tokens semánticos por módulo.
- Prohibidos temas por cliente fuera de los tokens personalizables designados.

## Reusable Pattern

Tres capas (primitivo → semántico → marco) + detección mecánica + versionado N/N-1: el vocabulario visual como contrato — la misma disciplina de los contratos de API aplicada a lo visual.

## Anti-Patterns

- El token "temporal" con valor literal que se queda años.
- Semánticos usados por su valor ("uso fondo-critico porque ese rojo me gusta").
- Ajustar un primitivo para arreglar una pantalla (rompe todas las demás).

## Knowledge Graph

- **ETS que consume**: ETS-011 (condiciones visuales de planta).
- **ESI que consume**: ESI-002/17 (puerta); ESI-006/20; ESI-007/27.
- **DGP que originará**: el catálogo de tokens en el DGP de experiencia.
- **ADR relacionados**: ADR de tokens en tres capas; ADR de temas por reasignación.
- **Módulos que reutilizarán este patrón**: todos consumen semánticos; ninguno define visuales propios.
