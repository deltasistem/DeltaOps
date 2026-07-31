# 01_API_PHILOSOPHY.md

> **DeltaOps — ETS-008 · v1.0** · Filosofía de la API: los principios que gobiernan todo contrato público.
> Coherente con ETS-003 (dominio), ETS-004 (experiencia), ETS-005 (configuración), ETS-006 (datos) y ETS-007 (técnica).
> Documento de diseño. No implementa nada.

---

## 1. API First

La API **es el producto**: todo lo que DeltaOps puede hacer se expone por contrato público — la aplicación web, la móvil, el SDK, las integraciones y la IA son **clientes iguales** de la misma API (ETS-007/08 §2). No existen superficies "solo internas" con privilegios: un ERP, un dispositivo y un humano producen los mismos comandos con las mismas validaciones, permisos y auditoría.

Consecuencias:
- Ninguna funcionalidad se diseña "para la pantalla": se diseña el contrato y la pantalla lo consume.
- Ninguna regla de negocio vive en un cliente: los clientes validan por cortesía (UX), el contrato valida por autoridad.
- La API se versiona, se documenta y se gobierna como producto (`17_API_GOVERNANCE.md`).

## 2. Contract First

El contrato precede a la implementación (práctica que SGMA ya sigue — ETS-001 — elevada a norma): primero se define la especificación (recurso, comando, esquema, errores), se revisa contra este documento, y solo entonces se implementa. La especificación publicada (`16_OPENAPI_GUIDELINES.md`) es la fuente de verdad: los clientes y SDKs se generan contra ella; una discrepancia implementación↔contrato es un defecto de la implementación.

## 3. Compatibilidad hacia atrás

**Regla N/N-1 universal** (ETS-007 NT-07): toda versión publicada convive con la anterior.

- **Evolución aditiva permitida sin nueva versión:** campos opcionales nuevos, valores nuevos en catálogos abiertos, endpoints nuevos, errores nuevos.
- **Cambios incompatibles = versión nueva conviviendo:** eliminar/renombrar campos, cambiar tipos o semántica, endurecer validaciones, cambiar valores por defecto observables.
- **Tolerancia del lector obligatoria:** todo consumidor ignora campos desconocidos y jamás depende de campos no documentados.

## 4. Versionado

- **Versión mayor en la ruta** (`/api/v1/...`): visible, cacheable, inequívoca.
- Las versiones menores no existen para el cliente: dentro de v1 todo cambio es aditivo.
- Retiro de versiones con calendario anunciado y telemetría de uso (`17`).
- Los eventos y el protocolo de sincronización móvil versionan aparte, con la misma regla N/N-1 (`09`, `12`).

## 5. Idempotencia

**Todo comando es idempotente** (U-19, ETS-006/10):

- El cliente envía una **clave de idempotencia** (obligatoria en comandos, `02_API_STANDARDS.md`); reintentar con la misma clave devuelve el resultado original, jamás duplica.
- En móvil offline, la clave nace en el dispositivo (dispositivo+secuencia, ETS-007/06) — la garantía es extremo a extremo.
- Las consultas son idempotentes por naturaleza (sin efectos).

## 6. Consistencia

La API dice la verdad sobre la frescura (ETS-006):

- **Comandos:** consistencia fuerte dentro del agregado; la respuesta confirma el hecho aceptado (folio, versión).
- **Consultas:** sirven read models con **frescura declarada** en la respuesta (`06`); jamás fingen actualidad.
- **Leer-lo-que-escribí:** tras un comando, la respuesta incluye la representación resultante del agregado — el cliente no necesita re-consultar una proyección que quizá aún no proyectó.

## 7. Errores

- **En lenguaje de negocio, con código estable** (`07_ERROR_CATALOG.md`): un código nunca cambia de significado; los textos se localizan, los códigos no.
- Un error dice: qué falló, por qué (regla de negocio), y qué puede hacer el actor — nunca jerga interna ni trazas técnicas.
- **El silencio es el único fallo inaceptable** (ETS-007 NT-15/§2): toda falla es explícita.

## 8. Convención de nombres

- **Español, lenguaje ubicuo de ETS-003:** los contratos hablan el idioma del negocio (`activos`, `ordenes-trabajo`, `tanqueos`), no jerga técnica.
- Comandos como **verbos de intención**: `CrearActivo`, `CerrarOT` — nunca "updateEntity" genérico (ETS-007/02 §5).
- Eventos en **pasado**: `ActivoAsignado`, `OTCerrada` (catálogo ETS-003).
- Campos descriptivos y consistentes entre módulos: la misma cosa se llama igual en toda la API (diccionario de negocio ETS-003/08 como autoridad).

## 9. Nombres de recursos

- Sustantivos en plural, en minúsculas, palabras separadas por guion: `/activos`, `/ordenes-trabajo`, `/centros-costo`.
- Jerarquía solo cuando la subordinación es real: `/activos/{id}/hoja-vida` (la hoja de vida no existe sin el activo); relaciones laterales por filtros, no por anidación artificial.
- Identificadores opacos y estables en la ruta; los folios legibles (`OT-2026-00431`) son datos, no rutas.

## 10. Commands y Queries (CQRS en la superficie)

La separación CQRS (ETS-006/11) es visible en el contrato:

| | Commands | Queries |
|---|---|---|
| Semántica | Intención de cambiar el mundo | Pregunta sin efectos |
| Naturaleza | Un agregado, una transacción | Read models con frescura declarada |
| Resultado | Hecho aceptado (folio) o rechazo con motivo | Representación + metadatos |
| Catálogo | `03_COMMAND_CATALOG.md` | `04_QUERY_CATALOG.md` |

## 11. REST (el estilo)

REST pragmático al servicio del dominio:

- Recursos y métodos estándar donde el mapeo es natural (`GET /activos/{id}`, `POST /activos`).
- **Las intenciones de negocio no se disfrazan de PATCH:** transiciones y operaciones de dominio se expresan como sub-recursos de acción (`POST /ordenes-trabajo/{id}/cierre`) que ejecutan el comando nombrado — el contrato conserva la intención (`CerrarOT`), no una edición genérica de campos.
- Sin métodos exóticos ni sobrecarga semántica: previsibilidad sobre pureza doctrinal.

## 12. Eventos

Los eventos del catálogo ETS-003 son contrato público de primera clase (`09_EVENT_CONTRACTS.md`): los consumen las proyecciones internas, las reglas, los webhooks (`10`) y las integraciones — con el mismo sobre, versionado aditivo y tolerancia del lector. La API REST cuenta el estado; los eventos cuentan la historia.

## 13. Sincronía y asincronía

- **Síncrono:** comandos de captura y consultas — respuesta inmediata con el hecho aceptado o el rechazo (presupuestos de ETS-004/11).
- **Asíncrono declarado:** operaciones largas (exportaciones, reportes, replays, importaciones) devuelven de inmediato un **recurso de operación** consultable (`operaciones/{id}`: estado, avance, resultado o error) y opcionalmente notifican al terminar — jamás una conexión colgada esperando minutos.
- Las reacciones (notificaciones, proyecciones, reglas) son asíncronas por diseño: el comando no espera a sus consecuencias (ETS-007/04).

## 14. Paginación

- **Por cursor, siempre** (ETS-007/08 §2): estable ante inserciones, apta para volúmenes enterprise; el cliente recibe el cursor siguiente opaco y lo devuelve tal cual.
- Tamaño de página con máximo por contrato; los totales exactos solo cuando el read model los tiene precalculados (contarlo todo no es gratis y se declara).

## 15. Filtros

- Declarados por consulta (`04`): cada query documenta sus filtros soportados — no existe un "filtro genérico por cualquier campo" que acople clientes al almacenamiento.
- Filtros por ámbito organizacional **siempre presentes e implícitos**: el contexto activo recorta todo resultado (ETS-007/05); los filtros explícitos refinan dentro de lo permitido.
- Rangos de tiempo con la semántica de tiempo doble explícita (¿tiempo de negocio o de registro? — cada consulta lo declara, ETS-006).

## 16. Ordenamiento

- Opciones de orden declaradas por consulta, con orden por defecto documentado y estable (empates resueltos por identificador — paginación determinista).
- El orden es del read model (precalculable), no una promesa de ordenar por cualquier cosa.

## 17. Búsqueda

- La búsqueda global (Search, ETS-007/03) es una consulta propia: texto + contexto → resultados tipados con permisos precalculados y sinónimos del tenant (ETS-006/12).
- Las búsquedas dentro de un recurso (`?buscar=` en `/activos`) son filtros de texto simples del read model; lo semántico y transversal pertenece al buscador.

## 18. Batch

- **Lotes de comandos homogéneos** donde el negocio lo pide (sincronización móvil `12`, ingesta IoT `13`): el lote es transporte, **la atomicidad es por comando** — cada elemento se acepta o rechaza individualmente con su clave de idempotencia (ETS-007/06 §3).
- Sin "transacciones de lote": un lote todo-o-nada cruzaría agregados (prohibido, ETS-007 NT-03).

## 19. Operaciones masivas (bulk)

- Las operaciones masivas legítimas del negocio (importar catálogo, reasignar activos de un frente, cierre masivo supervisado) son **operaciones asíncronas** (§13) con: validación previa completa (informe de qué pasará), ejecución como comandos individuales auditados, y reporte final por elemento.
- Jamás un "UPDATE masivo" opaco: cada cambio del mundo es un hecho con autor y evento (ETS-006).

## 20. Offline

El contrato asume la desconexión como estado normal (ETS-004/06, ETS-007/06):

- La API de sincronización (`12_SYNC_API.md`) es un contrato de primera clase: bitácoras idempotentes, paquetes por alcance, deltas por cursor, conflictos resueltos por dominio.
- Todo comando capturable en campo declara su comportamiento offline en el catálogo (`03`): capturable sin señal / requiere línea.
- El tiempo de negocio viaja siempre: los hechos valen cuando ocurrieron, no cuando llegaron.
