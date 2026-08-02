# 26 — Convenciones Backend

> **DeltaOps — ESI-003 · v1.0** · Las convenciones específicas del backend que complementan el mapa general de ESI-002/24.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Alcance

ESI-002/24 fija las convenciones transversales (nombres por tipo de pieza, español, sin abreviaturas inventadas, booleanos afirmativos). Aquí se norman las convenciones **propias del runtime backend** que esta serie introduce.

## 2. Convenciones normativas

### Nombres de piezas de plataforma
1. Los puertos del Kernel se nombran por **capacidad de negocio o técnica en español** (repositorio de X, despachador de eventos, almacén de sesiones), nunca por tecnología (nada de "cliente SQLAlchemy").
2. Los adaptadores se nombran **puerto + tecnología** para que la implementación sea evidente y la dependencia tecnológica quede confinada al nombre del adaptador.

### Errores
3. Los códigos de error siguen el patrón `MODULO.CONCEPTO.PROBLEMA` en mayúsculas y español, estables entre versiones (doc 15). Los de plataforma usan el pseudo-módulo `PLATAFORMA`.

### Métricas y telemetría
4. Métricas en español con prefijo por runtime (`borde_`, `uow_`, `eventos_`, `trabajos_`, `archivos_`, `integraciones_`), unidades explícitas en el nombre y cardinalidad controlada (doc 17).

### Eventos y bandejas
5. Tipos de evento en pasado según ETS-003/008; bandejas nombradas `consumidor × módulo`; los nombres de trabajos programados en infinitivo con dominio (`podar_sesiones`, `relevar_outbox`).

### Rutas HTTP
6. Rutas bajo el prefijo del módulo en español, sustantivos en plural para colecciones, y verbos solo en operaciones de negocio explícitas según el diseño de API de ETS-008. La versión de API viaja según ETS-008; los módulos no inventan esquemas de versionado propios.

### Claves de configuración
7. Claves del plano plataforma con prefijo por runtime, espejo de las métricas (regla 4), para que parámetro y efecto se encuentren mutuamente.

### Transacciones y contexto
8. Toda pieza de aplicación recibe el contexto como primer elemento conceptual de su contrato (doc 09); las piezas que no lo usan igualmente lo reciben — la uniformidad vale más que la economía local.

### Pruebas
9. Nombres de prueba en español describiendo comportamiento ("rechaza duplicado de clave de idempotencia"), organizadas en espejo (ESI-002/03); toda regla normativa de esta serie que sea mecanizable debe tener su verificación en la puerta (ESI-002/14) — la lista de verificaciones mecánicas se mantiene junto a las reglas (ESI-002/25).

## 3. Gobierno

Estas convenciones se cambian por el proceso único de cambio de reglas (ESI-002/27). Ante conflicto entre este documento y ESI-002/24, gana ESI-002/24 y se corrige aquí.

## Impacto sobre la implementación

Las plantillas T01-T15 y los generadores (ESI-002/18-19) codifican estas convenciones; el desarrollador las recibe hechas, no las memoriza.

## Dependencias

ESI-002/24 (convenciones generales), /18-19 (plantillas y generadores), /14 (puerta); docs 09, 15, 17 de esta serie; ETS-003/008.

## Riesgos

- Convenciones que viven solo en este documento y no en las plantillas; mitigación: regla de ESI-002/18 — plantilla, generador y ejemplo cambian juntos; la convención sin plantilla no existe en la práctica.
- Conflictos no detectados con ETS-008 en nombres de API; mitigación: ETS-008 es superior en jerarquía; la revisión de contratos lo aplica.

## Decisiones habilitadas

- Generadores deterministas que producen nombres correctos sin decisión humana.
- Búsqueda cruzada parámetro ↔ métrica ↔ runtime por prefijo común.

## Decisiones bloqueadas

- Prohibido nombrar puertos por tecnología.
- Prohibidos esquemas de versionado de API por módulo.
- Prohibido introducir convenciones nuevas fuera del proceso de cambio de reglas.
