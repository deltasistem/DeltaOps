# 27 — Relación con DGP

> **DeltaOps — ESI-005 · v1.0** · Cómo esta serie se traduce en DeltaOps Generation Packages de módulos de negocio: el mapa documento → formulario → tarea.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La cadena completa

ESI-004/24 fijó cómo se consume el patrón; esta serie añade el estándar de negocio. Un DGP-módulo se compone entonces de tres fuentes: el **patrón** (ESI-004, citado), el **estándar** (esta serie, citada y con formularios rellenos) y el **dominio** (los ETS del negocio, instanciados).

## 2. El mapa documento → entregable del DGP

| Documento de esta serie | Entregable en el DGP |
|---|---|
| 01-03 (concepto, anatomía, ciclo) | Cabecera: módulo, contexto, estado objetivo, nivel de madurez objetivo |
| 04 (registro) | Formulario de declaración |
| 05 (capacidades) | Mapa de capacidades |
| 06-07 (comandos, consultas) | Inventarios con formularios por pieza |
| 08 (eventos) | Catálogo publicados/consumidos + dependencias con otros DGP |
| 09-10 (Policies, servicios) | Inventario de reglas clasificadas con justificaciones |
| 11 (agregados) | **Mapa de agregados — el entregable de diseño central** |
| 12 (read models) | Inventario de proyecciones |
| 13-14 (KPIs, configuración) | Catálogos con dueños |
| 15-17 (seguridad, permisos, tenant) | Clasificación de datos + árbol de permisos |
| 18-20 (offline, integraciones, IA) | Tablas de aptitud/inventarios, o "ninguno" |
| 21-22 (documentación, testing) | Expediente + plan de pruebas derivado |
| 25 (checklist) | Sección de cierre |

## 3. Reglas de composición de DGP

1. **Orden de redacción**: mapa de agregados primero; de él se derivan comandos, eventos y repositorios; capacidades y permisos después; el resto en paralelo. Un DGP que empieza por endpoints está al revés.
2. **Dependencias entre DGP por catálogos de eventos** (doc 08): los DGP se declaran dependientes solo sobre contratos publicados, permitiendo construcción paralela con fakes.
3. **Secuencia sugerida del portafolio** (por dependencias de dominio de ETS-002/003): Activos (maestro raíz) → OT e Inventario (paralelo, con contrato de eventos pactado) → Compras y Combustible → SST. La secuencia final la decide producto; las dependencias técnicas son las declaradas.
4. **Tamaño**: un DGP por módulo como norma; módulos grandes (OT) pueden partirse en DGP por capacidad, siempre entregando M1 del núcleo primero.
5. **Ningún DGP-módulo arranca** sin el módulo de referencia aceptado (ESI-004/25) y sin sus formularios de diseño §2 completos.

## Impacto sobre la implementación

Este mapa es la plantilla estructural de todo DGP-módulo: redactarlo es rellenar la tabla §2 en el orden §3.1.

## Dependencias

ESI-004/24-25; ESI-002/20; docs 01-25 de esta serie; ETS-002/003 (secuencia de dominio).

## Riesgos

- DGP redactados como prosa libre ignorando los formularios; mitigación: la estructura §2 es obligatoria y su completitud es revisable mecánicamente.

## Decisiones habilitadas

- Redacción de los primeros DGP de negocio (Activos primero) con estructura cerrada.
- Paralelización de módulos con contratos pactados por adelantado.

## Decisiones bloqueadas

- Prohibidos DGP-módulo sin mapa de agregados como base.
- Prohibido arrancar DGP de negocio antes de la aceptación del módulo de referencia.
- Prohibidas dependencias entre DGP fuera de catálogos de eventos publicados.

## Reusable Pattern

La tabla §2 y el orden §3.1 son la plantilla de todo DGP-módulo; la partición por capacidad §3.4 es el mecanismo estándar para módulos grandes.

## Anti-Patterns

- DGP "big bang" del portafolio entero.
- Pactar contratos de eventos al final, serializando módulos innecesariamente.
- DGP que re-explican el estándar en vez de citarlo (ESI-004/24 §3.2).

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (dominios y dependencias del negocio).
- **ESI que consume**: ESI-002/20; ESI-004/24-25; toda esta serie.
- **DGP que originará**: directamente todos los DGP-módulo (DGP-Activos, DGP-OT, DGP-Inventario, DGP-Compras, DGP-Combustible, DGP-SST) y su secuencia.
- **ADR relacionados**: ADR de construcción por DGP gobernados (ESI-002/20).
- **Módulos que reutilizarán este patrón**: todos; este documento ES el molde de sus DGP.
