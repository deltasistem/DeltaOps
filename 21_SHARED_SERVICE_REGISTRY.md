# 21 — Shared Service Registry

> **DeltaOps — ESI-006 · v1.0** · El registro de servicios compartidos: la declaración legible por máquina de cada servicio y su verdad operativa.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

Análogo al registro de módulos (ESI-005/04), el registro de servicios es la fuente única de qué servicios existen, qué publican y quién los consume. Toda pieza del estrato está registrada o no existe para la plataforma.

| Sección de la declaración | Contenido |
|---|---|
| Identidad | Código estable (doc 02), nombre, propósito, dueño de ingeniería |
| Los siete rubros | Capacidades, eventos (con marcas que define, doc 18), contratos, configuración (con niveles, doc 20), KPIs propios, permisos (con patrón, doc 19), consumidores |
| Dependencias | Servicios que consume (adjuntos ← usado por exportes/reportes), piezas de plataforma; el grafo del estrato se deriva de aquí |
| Estado | Madurez (doc 23), versión, salud publicada |

## 2. Reglas

1. **Declaración como contrato verificable**: la puerta de calidad (ESI-002/17) valida coherencia declaración↔realidad, igual que con módulos (ESI-005/04 §2.2): permisos usados no declarados, eventos publicados fuera del catálogo o marcas consumidas sin registro rompen la construcción.
2. **El grafo completo es derivable**: módulos (su registro) + servicios (este) + marcas (doc 18) permiten derivar el mapa total de dependencias del sistema; el mapa vivo de ESI-004/21 lo consume.
3. **Consumidores por evidencia**: la sección de consumidores se reconcilia contra la matriz observada (doc 22) — la declaración dice el diseño, la telemetría dice la verdad, y las divergencias son hallazgos de revisión.
4. **Versionado del registro**: cambios de declaración siguen expandir-migrar-contraer y N/N-1 donde tocan contratos publicados (ESI-005/28, aplicable por herencia).

## Impacto sobre la implementación

Extiende el mecanismo de registro de ESI-005/04 con el tipo "servicio compartido" y las secciones propias (marcas, niveles, patrones de permiso); las validaciones de puerta se amplían declarativamente.

## Dependencias

ESI-005/04; ESI-002/17; docs 02 y 17-20; doc 22 (matriz).

## Riesgos

- Declaraciones desactualizadas que mienten sobre el estrato; mitigación: las validaciones §2.1 son bloqueantes y la reconciliación §2.3 es parte del ritual de revisión periódica (doc 25).

## Decisiones habilitadas

- Mapa total del sistema (módulos + servicios + flujos) derivado, no dibujado.
- Alta de servicios nuevos con el mismo rigor que módulos.

## Decisiones bloqueadas

- Prohibidos servicios en producción sin declaración registrada.
- Prohibidas dependencias servicio→servicio no declaradas.
- Prohibido divergir declaración y realidad sin romper la construcción.

## Reusable Pattern

Declaración con siete rubros + validación de coherencia + reconciliación contra telemetría: el formulario de identidad de toda pieza del estrato.

## Anti-Patterns

- El registro como documentación decorativa sin validación.
- Servicios "provisionales" fuera del registro.
- Grafos de arquitectura dibujados a mano compitiendo con el derivado.

## Knowledge Graph

- **ETS que consume**: ETS-008 (catálogos de contratos).
- **ESI que consume**: ESI-002/17; ESI-004/21; ESI-005/04.
- **DGP que originará**: la extensión del registro (DGP de plataforma); la declaración en cada DGP-servicio.
- **ADR relacionados**: ADR de declaración verificable (ESI-005/04 §2.2, extendida).
- **Módulos que reutilizarán este patrón**: todos consultan el registro para descubrir contratos de servicios; ninguno integra servicios no registrados.
