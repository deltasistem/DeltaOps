# 24_NAMING_CONVENTIONS.md

> **DeltaOps — ETS-012 · v1.0** · Convenciones de nombres: el lenguaje ubicuo hasta en el nombre del archivo.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Principios de nombrado

1. **Español del dominio para el negocio**: agregados, motores, Policies, eventos, comandos y consultas se nombran en el lenguaje ubicuo de ETS-003 — el mismo español que habla el experto de mantenimiento. La infraestructura técnica de plataforma puede usar los términos técnicos consagrados (pipeline, outbox, cursor).
2. **El nombre dice qué ES la pieza**: el patrón de nombre identifica el género arquitectónico sin abrir el archivo.
3. **Sin abreviaturas inventadas**: `OrdenDeTrabajo`, no `OrdTrab`; las siglas admitidas son las del negocio (MTBF) y las del proyecto ya definidas (los catálogos NT/NP/U de ETS anteriores).

## 2. Patrones por género (obligatorios)

| Género | Patrón | Ejemplo |
|---|---|---|
| Comando | verbo infinitivo + objeto | `CerrarOrdenDeTrabajo` |
| Evento | objeto + verbo en pasado | `OrdenDeTrabajoCerrada` |
| Consulta | interrogativo de negocio | `OrdenesDeTrabajoPorNodo` |
| Caso de uso | igual que su operación de catálogo | 1:1 verificable (04) |
| Agregado | sustantivo del dominio | `OrdenDeTrabajo` |
| Motor | `MotorDe` + decisión | `MotorDeAsignaciones` (catálogo ETS-003) |
| Policy | `PoliticaDe` + pregunta | `PoliticaDeCierreSinEvidencia` |
| Puerto | la necesidad, sustantiva | `AlmacenDeBinarios`, `RelojDelSistema` |
| Adaptador | puerto + tecnología | (la tecnología aparece SOLO aquí) |
| Fake | `FakeDe` + puerto | `FakeDeAlmacenDeBinarios` |
| Read model | pantalla/uso que sirve | `TableroDeCumplimiento` |
| Consumidor | `ProyectorDe`/`ReactorA` + objeto | `ProyectorDeTableroDeCumplimiento` |
| Lector | `LectorDe` + read model | `LectorDeTableroDeCumplimiento` |
| Error de catálogo | código estable de ETS-008/07 | jamás renombrar códigos publicados |

## 3. Reglas transversales

1. **Los nombres del contrato y del código coinciden** (API First): la operación se llama igual en el catálogo ETS-008, en los metadatos, en el caso de uso y en la traza — la búsqueda por nombre atraviesa todas las capas.
2. **Los eventos jamás se renombran una vez publicados**: son historia (ETS-009/18); un mejor nombre llega con una versión nueva del evento, con traducción al leer.
3. **Las claves de configuración tienen espacio de nombres por módulo** (ETS-005): estables como los códigos de error — renombrarlas es migración gobernada.
4. **El tiempo doble se nombra siempre igual**: `fechaNegocio` / `fechaRegistro` en todo contrato, evento y columna (ETS-006) — jamás sinónimos locales (`fechaReal`, `timestamp`).
5. **Nada de nombres de tecnología fuera de adaptadores y arranque**: un archivo de dominio o aplicación cuyo nombre menciona un producto concreto es una violación de la Regla de Dependencia por el frente del vocabulario.
6. **La casing y separadores los fija la traducción oficial al stack** (una vez): estos patrones son semánticos y la sobreviven.

---

## Impacto sobre la implementación
El nombre correcto elimina la pregunta "¿qué es esto y dónde va?"; la trazabilidad catálogo→código→traza→auditoría funciona por coincidencia literal de nombres.

## ETS relacionados
ETS-003 (lenguaje ubicuo y motores) · ETS-008 (nombres de operaciones y códigos) · ETS-005 (claves) · ETS-011 (24) · ETS-012 (23).

## Riesgos
- Deriva bilingüe (mitad inglés técnico, mitad español de negocio) en piezas de negocio → la tabla del §2 es la norma; la revisión la aplica.
- Sinónimos acumulándose para el mismo concepto → el glosario de ETS-003 es la única fuente; ampliar vocabulario pasa por ahí.

## Decisiones habilitadas
Búsqueda transversal por nombre, generación de código con nombres correctos, revisión de PRs por patrón.

## Decisiones bloqueadas
Convenciones sintácticas del lenguaje (casing, sufijos de archivo) — primera traducción oficial.
