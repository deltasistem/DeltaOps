# DELTAOPS FINAL-01 — Auditoría de Cobertura Funcional, Datos, Informes y BI

**Fecha:** 15 de agosto de 2026 · **Tipo:** Discovery/Auditoría (cero implementación) · **Fuentes:** código actual (HEAD `d848ac4`), base de datos de desarrollo en solo lectura (tenant `delta-demo`), 6 archivos Excel reales de Dirección (exportes de Microsoft Forms usados en LITE-09), documentación DGP/LITE completa.

**Convención de honestidad (§3):** 🟢 VERIFICADO · 🟡 PARCIAL · 🔵 EXISTE PERO NO EXPUESTO · 🟠 EXISTE DATO PERO FALTA CAPACIDAD · 🔴 FALTA · ⚪ NO VERIFICABLE CON LA INFORMACIÓN DISPONIBLE.

---

## 1. Resumen ejecutivo

DeltaOps Lite **ya captura, almacena y consulta** el núcleo operacional que hoy viaja por Microsoft Forms + Excel: preoperacionales con veredicto sellado, combustible, lecturas de horómetro, mantenimientos (OT correctivas y rutinas), y el histórico completo importado (5.816 hechos históricos + 6.564 lecturas + 807 tanqueos en el tenant demo, verificados en BD). La hoja de vida por equipo responde con datos reales las preguntas operacionales clave.

Los **tres huecos estructurales** confirmados por código y datos son:

1. **Exportación: 🔴 no existe** ninguna capacidad de exportar (Excel/CSV/PDF/impresión) en frontend ni API — hoy Excel/Power BI no pueden alimentarse desde DeltaOps.
2. **Informes transversales filtrables: 🟡 parciales** — las consultas existen por activo o por módulo, pero no hay un "informe de mantenimiento/combustible/horas hombre" consolidado con filtros de fecha/equipo/técnico/estado en una sola pantalla.
3. **Vínculo horómetro→rutina ("faltan X horas", vencido) : 🔵** — el backend lo calcula (semáforo visible por activo en la ficha), pero no existe una vista de flota "rutinas próximas/vencidas" agregada.

Los KPIs de conteo/costo/consumo son confiables; **MTTR/MTBF/disponibilidad NO son calculables** con los datos reales (insumos manuales casi todos nulos: 1 de 7 eventos correctivos con insumo en BD; los históricos no traen tiempos de reparación).

**Recomendación de arquitectura: Opción C** — DeltaOps como sistema operacional + informes internos básicos con exportación, y Power BI conservado para análisis gerencial avanzado alimentado por exportes/lectura de DeltaOps. **Fases adicionales recomendadas antes de producción: 1** (informes + exportación + vista de flota de rutinas, agrupadas). Detalle en §28–§30.

---

## 2. Fuentes actuales del proceso (Delta hoy, sin DeltaOps)

El flujo actual verificado por los propios archivos (todos son exportes de Microsoft Forms — columnas `Id`, `Hora de inicio`, `Hora de finalización`, `Correo electrónico` son la firma del formato Forms):

```
Microsoft Forms (5 formularios identificados)
  ↓ export automático
Excel en SharePoint/OneDrive (los 6 archivos auditados)
  ↓ consolidación manual
Power BI (⚪ sin evidencia directa en el repo: ni .pbix, ni fórmulas, ni capturas)
```

- **Forms identificados por sus exportes:** Checklist preoperacional de cargador; Checklist preoperacional de montacargas; Control de combustible Riverport; Cargue de horas hombre; Plan de mantenimiento preventivo cargadores V3; Plan de mantenimiento preventivo montacargas V2.
- **Power BI:** ⚪ NO VERIFICABLE — no existe en el repositorio ningún artefacto de Power BI (confirmado también en LITE-06 §Excel/Forms/Power BI: «cero evidencia en el repo»). Todo lo que se afirme sobre dashboards actuales se marca ⚪.

## 3. Inventario Excel (§4)

Matriz verificada leyendo cada archivo (una hoja `Sheet1` por archivo; sin archivos duplicados entre sí; los sufijos `(1)…(5)` son versiones de descarga, no contenidos distintos):

| Archivo | Hoja | Propósito | Registros | Campos relevantes | Período (hora inicio) | Fuente |
|---|---|---|---:|---|---|---|
| CHECKLIST_PRE_OPERACIONAL_DE_CARGADOR (4) | Sheet1 | Preoperacional cargadores | 1.457 | Equipo, Horómetro, 20+ ítems CUMPLE/NO CUMPLE, Observaciones | 2025-08-12 → 2026-08-13 | Forms |
| CHECKLIST_PRE_OPERACIONAL_DE_MONTACARGAS (5) | Sheet1 | Preoperacional montacargas | 2.388 | Montacarga, Horómetro, ítems CUMPLE/NO CUMPLE | 2025-09-05 → 2026-08-13 | Forms |
| CONTROL_DE__COMBUSTIBLE_RIVERPORT (2) | Sheet1 | Tanqueos | 1.155 | CARGADOR, PROVEEDOR, CANTIDAD DE GALONES, HORÓMETRO ACTUAL, RESPONSABLES, ticket (URL SharePoint) | 2025-08-05 → 2026-08-05 | Forms |
| Formulario_para_el_cargue_de_Horas_Hombre (1) | Sheet1 | Jornadas/horas hombre | 2.042 | Fecha, Cliente, Operación, Material, Cargador, Propio/Tercerizado, Horómetro inicial/final, Turno, Supervisor | 2025-10-14 → 2026-07-27 | Forms |
| PLAN_DE_MANTENIMIENTO_PREVENTIVO_CARGADORES_V3 | Sheet1 | Rutinas + correctivos cargadores | 75 | Cargador, Horómetro, Estado, Técnicos, RUTINA/CORRECTIVO, Rutina (300 hrs…), ~140 ítems | 2026-01-14 → 2026-08-03 | Forms |
| PLAN_DE_MANTENIMIENTO_PREVENTIVO_MONTACARGAS_V2 | Sheet1 | Rutinas + correctivos montacargas | 34 | Montacargas, ídem, ~180 ítems | 2026-02-17 → 2026-07-28 | Forms |

**No se asumió formato uniforme** — verificado: el checklist de cargador tiene columnas `Fecha`/`Hora inicial` 100% vacías que el de montacargas no tiene; horas hombre usa dos formatos de fecha distintos en la misma columna (`14/10/2025 2:37 p. m.` y ISO); los planes V2/V3 difieren en ítems y numeración (columnas duplicadas con sufijos `1`,`2`,`3` — artefacto del versionado de Forms).

## 4. Inventario Forms (§6)

Cadena FORM → CAMPO → EXCEL → POWER BI → DELTAOPS por formulario:

| Formulario | Quién | Frecuencia real (datos) | Proceso que inicia | Dónde termina | Equivalente DeltaOps | Información que se pierde hoy en Forms |
|---|---|---|---|---|---|---|
| Preoperacional cargador/montacargas | Operador (anónimo — **sin identidad**) | Diaria por equipo (~3.845 en 12 meses) | Ninguno automático: NO CUMPLE no genera acción | Excel → ⚪ BI | Módulo Preoperacional (veredicto sellado + hallazgo→OT) 🟢 | Identidad del operador; seguimiento del NO CUMPLE; evidencia foto opcional |
| Control combustible | Responsable identificado (correo) | ~3/día | Ninguno | Excel → ⚪ BI | Utilización/tanqueos 🟢 (ticket adjunto 🔴 en flujo) | Validación de horómetro; consumo/hora no se calcula en el Excel |
| Horas hombre | Operador (anónimo) | ~6/día | Ninguno | Excel → ⚪ BI | Importado como `historico.jornada`; captura operativa equivalente 🟡 (sesiones de trabajo existen ligadas a OT, no a jornada operativa comercial) | Cliente/operación/material no tienen entidad en DeltaOps (viven como payload histórico) |
| Plan preventivo V2/V3 | Técnico (anónimo) | ~10/mes | Ninguno: la "rutina a realizar" es texto | Excel → ⚪ BI | Correctivo + Preventivo/Planes 🟢 | Enlace rutina↔horómetro; repuestos usados; costo |

**Conclusión Forms:** los 4 procesos capturan sin identidad confiable (mayoría "anónimo"), sin validación de datos (horómetros con retrocesos), y sin iniciar ningún proceso. DeltaOps ya supera esto en los cuatro casos en captura y trazabilidad.

## 5. Inventario Power BI (§7)

⚪ **NO VERIFICABLE en su totalidad.** No hay en el repositorio ni en attached_assets ningún archivo, captura o especificación de los dashboards actuales de Power BI. Por regla de honestidad no se inventan indicadores ni fórmulas. La matriz §16 se construye por inferencia de qué *puede* alimentar Power BI (los Excel auditados) — cualquier validación fina requiere que Dirección aporte los .pbix o capturas.

| Dashboard | Indicador | Fuente | Fórmula/criterio | DeltaOps equivalente | Estado |
|---|---|---|---|---|---|
| ⚪ desconocido | ⚪ | Excel auditados | ⚪ no disponible | ver §12–§13 | ⚪ NO VERIFICABLE |

## 6. Inventario DeltaOps (qué existe hoy, verificado)

- **Módulos activos** (BD + código): Activos, Preoperacional, Dynamic Forms, Órdenes, Correctivo, Preventivo, Planes, Utilización (lecturas+tanqueos), Mano de obra, Inventario, Abastecimiento, Costos, Analytics, Hallazgos, plataforma (timeline, QR, adjuntos, notificaciones, búsqueda).
- **Datos reales (tenant `delta-demo`, solo lectura):** 38 activos (28 OPERATIVO, 10 BORRADOR); 6.564 lecturas (31 activos, 2025-08-05→2026-08-15); 807 tanqueos (13 activos); 5.816 hechos históricos (3.736 preop + 1.971 jornadas + 48 rutinas + 61 correctivos); 23 OTs vivas; 8 planes; 3 programas preventivos; 9 dashboards Analytics sembrados; 13 ítems de inventario.
- **Pantallas:** ~107 páginas (LITE-06), operación real en ~25; navegación por rol ya recompuesta (LITE-10).

## 7. Mapa Excel → DeltaOps (§5)

Solo equivalencias demostradas por código+datos (importador LITE-09):

| Campo Excel | Equivalente DeltaOps | Módulo | Estado | Transformación |
|---|---|---|---|---|
| Equipo/Montacarga/CARGADOR | `act_activos_read` (alias resueltos, p. ej. C11→"C11 SIGAR" un solo activo) | Activos | 🟢 | Normalización NFKC + alias data-driven |
| Horómetro / HORÓMETRO ACTUAL | `utl_lecturas_read.valor` | Utilización | 🟢 | Numérico; flag `inconsistente` en retrocesos |
| CANTIDAD DE GALONES | `utl_tanqueos_read` (litros) | Utilización | 🟢 | ×3,785411784; original conservado en procedencia |
| Ítems CUMPLE/NO CUMPLE | respuestas ancladas a plantilla versionada | Preoperacional/Forms | 🟢 | Texto verbatim conservado en contexto sellado |
| RUTINA/CORRECTIVO + "Rutina a Realizar" | `historico.mantenimiento.rutina/correctivo` | Timeline | 🟢 | Snapshot con fecha operacional del hecho |
| Fecha / FECHA / Fecha PMP | `occurredAt`/fechaOperacional | Timeline | 🟢 | Fecha del hecho, no de importación |
| Horómetro inicial/final (horas hombre) | payload `historico.jornada` | Timeline | 🟢 | Diferencia calculada; crudos conservados |
| Cliente/Operación/Material/Turno | payload `historico.jornada` | Timeline | 🔵 | Sin entidad propia; consultable solo como histórico |
| PROVEEDOR DE GASOLINA | `proveedorId` en tanqueo | Utilización | 🟢 | Snapshot de proveedor |
| ADJUNTAR TICKET (URL SharePoint) | — | — | 🔴 | Referencia externa no importada (URLs viven en el Excel) |
| RESPONSABLES DEL CARGUE / Técnicos | texto en payload histórico | Timeline | 🟡 | Sin vínculo a identidad (los Forms son anónimos) |

## 8. Mapa Forms → DeltaOps (§17)

| Formulario actual | Proceso equivalente DeltaOps | ¿Ya reemplazado? |
|---|---|---|
| Checklist preoperacional (2 forms) | Preoperacional con plantilla versionada, veredicto APTO/APTO C.O./NO APTO sellado por servidor, hallazgo→OT | 🟢 SÍ — puede dejar de usarse tras el piloto |
| Control de combustible | Registro de tanqueo (equipo, litros, horómetro enlazado, proveedor, observación) | 🟡 SÍ salvo el ticket-foto (adjunto no está en el flujo de tanqueo) |
| Horas hombre | Sesiones de trabajo existen pero ligadas a OT; la jornada operativa comercial (cliente/material/turno) no tiene captura | 🔴 NO — este Forms sigue siendo necesario, o se decide si esa captura pertenece a DeltaOps (es operación comercial, no mantenimiento) |
| Plan preventivo V2/V3 | Rutinas por checklist Dynamic Forms + OT + programas preventivos | 🟢 SÍ — puede dejar de usarse tras el piloto |

## 9. Mapa Power BI → DeltaOps (§16)

Ver §5: sin evidencia de los dashboards, la matriz se limita a capacidades genéricas de BI sobre los Excel:

| Capacidad actual (inferida de las fuentes) | DeltaOps | ¿Puede reemplazarlo? | Observación |
|---|---|---|---|
| Conteos de preoperacionales / cumplimiento | Datos 🟢, agregado de flota 🟠 | Parcial | Existe por activo; no hay KPI agregado de cumplimiento |
| Consumo de combustible por equipo/hora | 🟢 en ficha operacional | Sí (operación diaria) | Consumo/hora requiere horómetro consistente |
| Horas hombre por período/cliente | 🔵 datos históricos consultables; sin informe | No aún | Requiere informe+export |
| Estado de rutinas | 🟡 semáforo por activo | Parcial | Falta vista de flota |
| Análisis gerencial multi-período libre | 🔴 no es el rol de DeltaOps | No | Se mantiene Power BI (Opción C) |

## 10. Cobertura operacional — Dashboard (§12)

Con datos reales del tenant demo:

| Elemento | Estado | Evidencia |
|---|---|---|
| Total de equipos | 🟢 | consola/listado Activos (38) |
| Equipos activos/inactivos | 🟢 | estados OPERATIVO/BORRADOR/RETIRADO en read model y UI |
| Preoperacionales + APTO/APTO C.O./NO APTO | 🟡 | ejecución y veredicto por activo 🟢; conteo agregado de flota por veredicto 🔴 |
| Hallazgos pendientes | 🟡 | flujo hallazgo→OT existe; sin contador agregado |
| OT abiertas / cerradas / por tipo | 🟢 | KPI `ot-abiertas` + dashboards Analytics sembrados; cerradas por activo 🟡 (sin KPI declarativo) |
| Mantenimientos (historial) | 🟢 | timeline por activo con 109 históricos + vivos |
| Rutinas vencidas / próximas | 🔵 | semáforo calculado por activo en ficha; vista agregada de flota 🔴 |
| Combustible / consumo | 🟢 | tanqueos + consumo 30 días y consumo/hora-km en ficha |
| Horas hombre | 🔵 | sesiones y históricos consultables; sin tarjeta/informe |
| Repuestos/insumos | 🟡 | captura en OT 🟢 (con costo/proveedor); agregado solo vía inventario/costos |
| Costos | 🟡 | pantalla /costos + composición por OT/activo 🟢; datos reales casi vacíos (1 hecho de costo) — "cuando existan datos" |

## 11. Cobertura de datos (§8) — resumen por dominio

Detalle campo a campo verificado en código (alta real de la UI):

- **Equipos:** código/nombre/tipo/marca/modelo/serie/centro de costos/ubicación/responsable 🟢 se capturan; estado operacional 🟢; **placa 🔴, condición física 🔴, tenencia propio/tercero/alquilado 🔴** (hoy la distinción C11 SIGAR vive en alias/atributos, no como campo tenencia).
- **Horómetro:** valor/fecha/tipo medidor/observación 🟢; usuario 🔵 (sesión); inconsistencias 🟢 (flag en read model, 4.048/6.564 marcadas — ver §16); **próxima rutina/faltan X en la superficie de lecturas 🔵** (existe en ficha del activo, no en lecturas).
- **Preoperacional:** plantilla+versión, respuestas, veredicto sellado, hallazgos, evidencia por respuesta, histórico 🟢 completo.
- **Mantenimiento (OT):** OT/tipo/equipo/fecha/descripción/hallazgo/técnico(asignación)/estado/ejecución/validación/cierre 🟢 (workflow completo con gates).
- **Mano de obra:** técnico=identidad de sesión, OT, inicio/fin, duración calculada, valoración 🟢 por diseño; datos reales aún mínimos (1 sesión, 1 valoración).
- **Combustible:** equipo/fecha/cantidad/proveedor/observación 🟢; unidad 🔵 (canónico litros, original en procedencia); horómetro 🔵 (enlace a lectura, no captura directa); **ticket/adjunto 🔴 en el flujo**.
- **Repuestos/insumos:** descripción/cantidad/costo/proveedor/referencia/unidad 🟢 en recursos de OT.
- **Hoja de vida:** ver §26.

## 12. Cobertura de indicadores (§13)

Catálogo declarativo de 28+ indicadores en Analytics (module-analytics). Clasificación con datos reales:

| Indicador | Estado | Nota |
|---|---|---|
| Consumo por equipo / por hora / por km | 🟢 | Calculado y visible en ficha operacional (litros/Δhoras; litros×100/Δkm) |
| Costo mantenimiento / por hora / por km | 🟡 | Motor y pantalla /costos existen; datos reales de costos casi vacíos → mostrará "sin datos" honesto |
| Horas hombre | 🔵 | Consultable por OT/activo; sin KPI ni informe |
| Frecuencia de mantenimiento | 🟠 | Motor de frecuencias en planes; sin KPI agregado |
| OT abiertas / vencidas / críticas | 🟢 | KPI declarativo + dashboard operativo |
| OT cerradas | 🟠 | Tarjeta por activo; sin KPI declarativo |
| Cumplimiento de rutinas | 🟠 | Semáforo por activo; sin KPI agregado |
| Cumplimiento de preoperacionales | 🟠 | Flujo completo; sin dataset agregado |
| Fallas / reincidencias | 🟢 | KPIs `fallas-por-activo`, `fallas-por-tipo`, `reincidencias` |
| **MTTR / MTBF / Disponibilidad** | 🟠 | Definiciones y widgets existen, pero dependen de `insumosKpi` manuales: **en BD real 1 de 7 eventos correctivos tiene tiempo de reparación**; los 61+48 históricos de mantenimiento no traen tiempos. **NO calculables de forma confiable hoy.** La propia ficha dice «Sin fuente de disponibilidad en el dominio actual». |
| Utilización | 🟢 | Calculada y visible; KPI declarativo |

## 13. Cobertura de informes (§14)

| Informe | ¿Existe? | Datos | ¿Consultar? | ¿Filtrar? | ¿Exportar? | ¿Falta? |
|---|---|---|---|---|---|---|
| Mantenimiento | 🟡 | OTs+historial | Sí (listados por vista) | estado/tipo/activo/prioridad/responsable; **fecha/técnico/centro transversal 🔴** | 🔴 | Informe consolidado filtrable |
| Combustible | 🟡 | 807 tanqueos | Sí | activo, fechas | 🔴 | Export + totales por período |
| Horómetro | 🟢 | 6.564 lecturas | Sí | activo, medidor, desde/hasta, paginado | 🔴 | Solo export |
| Preoperacionales | 🟡 | 3.740 ejecuciones | Sí (por activo) | activo/plantilla/estado; **transversal por fecha/veredicto 🔴** | 🔴 | Informe consolidado |
| OT | 🟡 | 23 vivas + históricos | Sí | por vista | 🔴 | ídem mantenimiento |
| Horas hombre | 🔴 | históricos+sesiones | Solo por OT/activo | — | 🔴 | Pantalla no existe |
| Costos | 🟡 | motor completo, datos escasos | Sí | período/desde-hasta | 🔴 | Export |
| Hoja de vida | 🟢 | timeline completo | Sí, paginado | por activo | 🔴 | Filtro por tipo/fecha y export/impresión |

## 14. Exportaciones (§15)

**🔴 NO EXISTE** ninguna: sin botones, sin endpoints de descarga, sin librerías xlsx/csv/pdf en los package.json (verificación exhaustiva). El único "export" es JSON interno de plantillas. El permiso `exportar-analytics` citado en LITE-06 **no existe como literal hoy**; Analytics declara capacidad conceptual `export` por rol sin endpoint.
**Necesarias para la operación (juicio basado en el flujo actual):** CSV/Excel de mantenimientos, combustible, horómetro, preoperacionales (para alimentar Power BI y reportes a clientes) y hoja de vida imprimible/PDF. No se implementó nada en esta fase.

## 15. Histórico (§19) — preguntas de Dirección, respondidas contra BD real

| Pregunta | ¿Responde hoy? | Cómo |
|---|---|---|
| ¿Qué mantenimiento ha tenido este equipo? | 🟢 | Timeline de ficha (109 históricos + OTs vivas) |
| ¿Cuándo fue su último preoperacional? | 🟢 | Timeline + módulo preoperacional (3.736 históricos) |
| ¿Qué horómetro tenía? | 🟢 | Última lectura + historial paginado |
| ¿Cuánto combustible consumió? | 🟢 | Tanqueos + consumo 30 días/total en ficha |
| ¿Quién realizó la actividad? | 🟡 | En históricos: texto del Excel (Forms anónimos ⇒ a menudo sin identidad); en lo vivo: identidad de sesión 🟢 |
| ¿Cuántas horas hombre se registraron? | 🟡 | 1.971 jornadas históricas consultables por timeline; sin agregado por período |
| ¿Qué OT tuvo? | 🟢 | Timeline + listados de órdenes |
| ¿Qué ocurrió durante un período? | 🟡 | Timeline paginado cronológico; sin filtro UI por rango de fechas |

## 16. Calidad de datos (§21) — solo reporte, nada corregido

- **Lecturas inconsistentes:** 4.048 de 6.564 (62%) marcadas `inconsistente` en el tenant demo. Causa dominante: los horómetros de los Forms reales traen retrocesos y equipos con contador reiniciado (existe flag `es_reinicio`); el sistema los conserva y marca en vez de rechazarlos — comportamiento honesto, pero la cifra confirma que **consumo/hora y "faltan X horas" solo son confiables por tramos consistentes**.
- **Excel:** columnas 100% vacías (`Nombre` en todos — Forms anónimo; `Fecha`/`Hora inicial` del checklist cargador; `Cliente`, `Proveedor`, `Área` en horas hombre); 6 Ids duplicados en combustible y 2 en horas hombre (filas re-enviadas); formatos de fecha mixtos en horas hombre; encabezados con duplicados numerados en planes V2/V3; identificadores de equipo heterogéneos (`C11`/`C11 SIGAR`, `SEM 5 GPR`/`SEM05` — ya unificados por alias en la importación).
- **BD:** `centroCosto` vacío en **38/38 activos** y responsable vacío en 38/38 del tenant demo (consistente con LITE-06: multicentro solo estructural); proveedor vacío en 15/807 tanqueos; costos con 1 solo hecho (sin datos históricos de dinero — regla §22 respetada: no se inventaron).
- **Usuarios:** los históricos no tienen identidad real (herencia de Forms anónimos); lo capturado en vivo sí.

## 17. Multicentro (§10)

Dimensiones que **existen de verdad**: tenant/empresa 🟢 (RLS + selector), centro de costos 🟡 (catálogo + campo en alta de activo, pero vacío en todos los datos reales, sin filtrado ni segregación), ubicación 🟢 (por activo, con historial), responsable 🟢 (campo + historial, vacío en datos reales), activo 🟢. **No existen:** centro de trabajo 🔴, equipo/grupo de mantenimiento 🔴. No se inventan jerarquías: la segregación real hoy es tenant + asignación de OT. Una misma persona puede ejercer varias capacidades (capas LITE-02/03 sobre RBAC) — compatible con centros sin coordinador.

## 18. Terceros/alquilados (§11) — caso C11 SIGAR

🟢 **La regla de negocio se cumple en los datos:** C11/C11 SIGAR es un solo activo (alias data-driven), con 195 tanqueos históricos de combustible y 26 preoperacionales, y **cero mantenimientos internos inventados** (re-verificado en PDC-01 §20). Limitación honesta: la condición "tercero/alquilado" no es un campo estructurado (🔴 tenencia, §11 de cobertura) — hoy es conocimiento operacional en atributos/título, no filtrable.

## 19. Horómetro (§8) — veredicto específico

Captura, historial, fecha, usuario (sesión), inconsistencias: 🟢. **Próxima rutina/faltan X horas: 🔵** — el backend calcula el semáforo de rutinas por activo y la ficha lo muestra; LITE-07 ya había verificado que «faltan X h» existe en backend sin exponerse como cifra; no hay vista de flota ni aviso en la pantalla de lecturas.

## 20. Rutinas (§9)

- Periodicidad por horas 🟢 (motor de planes/preventivo); por kilómetros 🟡 (odómetro existe como medidor; programas reales solo por horas); por ciclos 🔴.
- Última ejecución 🟢 (timeline/generaciones); próxima ejecución y "faltan X" 🔵 (calculado, expuesto solo como semáforo por activo); vencido 🔵 ídem; histórico 🟢 (48 rutinas históricas + generaciones vivas).
- Decisión vigente respetada: la rutina **notifica y permite generar mantenimiento manualmente**; no hay (ni debe haber) generación automática de OT.

## 21. Preoperacional (§8) — 🟢 dominio más completo

Plantilla versionada inmutable, respuestas ancladas a versión, veredicto sellado por servidor, criticidad declarada en plantilla, hallazgos con flujo a OT (gates congelados), evidencia por respuesta, histórico 3.736+3.740. Supera funcionalmente al Forms actual en todo salvo costumbre.

## 22. Mantenimiento (§8)

OT con ciclo completo gobernado por workflow (borrador→…→validación→cierre), correctivo con solicitudes/diagnóstico/intervenciones, preventivo con programas/generaciones. Datos vivos aún pocos (23 OTs, mayoría BORRADOR de pruebas). Los 109 mantenimientos históricos están en hoja de vida. Gap honesto: informe transversal y export (§13, §14).

## 23. Combustible (§8)

🟢 operacional (807 tanqueos reales, 13 activos), consumo calculado, proveedor snapshot. Gaps: ticket/adjunto en el flujo 🔴; unidad visible (galones originales) solo en procedencia 🔵.

## 24. Mano de obra (§8)

Diseño completo (sesiones, duración server-side, tarifas, valoraciones string-only), pero **casi sin datos vivos** (1 sesión, 1 valoración, 1 recurso) y sin pantalla de informe. Las 1.971 jornadas históricas son de operación comercial (cliente/material), no de mano de obra de mantenimiento — no deben confundirse.

## 25. Repuestos/insumos (§8)

Captura en OT 🟢 (descripción, cantidad, costo, proveedor, SKU, unidad) + inventario formal (13 ítems demo) con movimientos/reservas. Sin datos históricos de repuestos (los Excel no los traen — nada que inventar).

## 26. Hoja de vida (§8)

Eventos que **ya aparecen** en el timeline del activo (verificado): históricos (preoperacional, jornada, rutina, correctivo), lecturas/tanqueos, eventos de módulos vivos (OTs, hallazgos, cambios de estado, ubicación/responsable), comentarios y adjuntos, QR. Paginación estable verificada (PDC-01). Gaps: filtro por tipo/período en UI y versión imprimible.

## 27. Power BI futuro (§16, §26)

- **Operación diaria** → DeltaOps (ya la cubre o la cubrirá con la fase de informes).
- **Análisis gerencial** (tendencias multi-año, cruces comerciales cliente/material, presentaciones a gerencia) → **continúa en Power BI**, alimentado por las exportaciones de DeltaOps (fase propuesta) — no por Forms/Excel manuales.
- **Datos fuente** → DeltaOps pasa a ser la fuente operacional única; los Excel quedan como archivo histórico (ya importado).
- Power BI **no debe desaparecer**: sustituirlo por dashboards internos avanzados inflaría DeltaOps Lite sin beneficio proporcional (regla §28).

## 28. Gaps (§20 trazabilidad — dónde se rompe la cadena)

| # | Gap | Cadena rota en | Clasificación |
|---|---|---|---|
| G1 | Exportación Excel/CSV/PDF inexistente | CONSULTA→INFORME | 🔴 |
| G2 | Informes transversales filtrables (mantenimiento, combustible, preoperacional, horas hombre) | CONSULTA→VISUALIZACIÓN | 🟡 (las consultas existen por módulo/activo; el consolidado transversal 🔴) |
| G3 | Vista de flota de rutinas (próximas/vencidas, "faltan X") | PERSISTENCIA→VISUALIZACIÓN | 🔵 |
| G4 | Conteo agregado de preoperacionales por veredicto / cumplimiento | PERSISTENCIA→INDICADOR | 🟠 |
| G5 | Ticket/adjunto en flujo de tanqueo | CAPTURA | 🔴 |
| G6 | Campo tenencia (propio/tercero/alquilado) + placa | CAPTURA | 🔴 |
| G7 | Horas hombre operativas (cliente/material/turno) sin captura viva | FUENTE→CAPTURA | 🔴 (decisión de alcance) |
| G8 | MTTR/MTBF/disponibilidad sin insumos | FUENTE (datos) | 🟠 — no es un gap de software |
| G9 | centroCosto/responsable vacíos en datos reales | FUENTE (datos) | 🟠 — tarea de datos, no de código |
| G10 | Filtro por tipo/fecha + impresión en hoja de vida | VISUALIZACIÓN | 🟡 |

## 29. Priorización (§25)

- **A — BLOQUEANTE PARA PRODUCCIÓN:** *ninguno.* DeltaOps ya captura y consulta mejor que el proceso actual; nada de lo faltante impide operar. (Regla «no inflar la A» aplicada.)
- **B — IMPORTANTE ANTES DE PRODUCCIÓN (una sola fase agrupada):** G1+G2+G3+G10 — exportación CSV/Excel sobre los read models existentes, informes consolidados filtrables (composición pura, sin API nueva donde las queries ya existen), vista de flota de rutinas y filtros de hoja de vida. G4 puede sumarse si cabe (dataset agregado de preoperacionales).
- **C — IMPORTANTE POSTERIOR:** G5 (ticket de tanqueo — el adjunto genérico ya existe, es cableado), G6 (tenencia/placa — extensión aditiva de Activos), G9 (poblar centroCosto/responsable con el importador o edición masiva — tarea de datos).
- **D — MEJORA:** PDF/impresión estética de hoja de vida; KPI agregados adicionales; periodicidad por km/ciclos cuando existan programas reales.
- **E — NO HACER:** dashboards gerenciales avanzados dentro de DeltaOps (los cubre Power BI); MTTR/MTBF/disponibilidad "forzados" sin insumos (violaría §22); módulo de operación comercial (G7) salvo decisión expresa de Dirección — es otro dominio de negocio; generación automática de OT desde rutinas (contradice decisión vigente).

## 30. Recomendación final (§26, §27, §32)

**Arquitectura recomendada: OPCIÓN C** — DeltaOps Lite como sistema operacional único (captura + consulta + hoja de vida + informes internos básicos con exportación) y **Power BI conservado como capa de análisis gerencial** alimentada por exportes de DeltaOps. Argumentos: (a) la operación diaria exige lo que DeltaOps ya hace mejor que Forms (identidad, validación, veredictos sellados, trazabilidad); (b) el análisis gerencial multi-dimensión ya está resuelto en Power BI y reconstruirlo dentro de Lite viola la regla de no sobrecosto; (c) la opción A (reemplazo total) exigiría desarrollo BI interno desproporcionado; la B (sin informes internos) dejaría a la operación dependiendo de Power BI para preguntas del día a día.

### Respuestas del criterio de cierre (§32)

- **¿Funcionalmente listo para producción?** 🟡 SÍ para operar (capturar, consultar, hoja de vida): supera al proceso actual. NO para *reportar hacia afuera*: sin exportación ni informes consolidados, el equipo tendría que seguir alimentando Power BI a mano.
- **¿Qué ya cubre?** Preoperacionales (completo, superior a Forms), combustible (salvo ticket-foto), horómetro, mantenimientos correctivos y rutinas, hoja de vida con todo el histórico, hallazgo→OT, QR, costos/inventario/abastecimiento (motores listos, datos por llegar).
- **¿Qué falta?** Exportación (G1), informes transversales (G2), vista de flota de rutinas (G3), ticket de tanqueo (G5), tenencia/placa (G6); y datos: insumos KPI, centroCosto/responsable.
- **¿Qué informes entrega hoy?** Consultas por activo/módulo con filtros parciales (ver §13); ninguno exportable.
- **¿Qué dashboards entrega hoy?** Ficha operacional por activo (consumo, utilización, rutinas, OTs) 🟢; 8 dashboards Analytics sembrados (OTs, fallas, cargas) 🟢 con datos donde los hay; sin dashboard agregado de preoperacionales.
- **¿Qué históricos están disponibles?** 5.816 hechos (ago-2025→ago-2026) + 6.564 lecturas + 807 tanqueos, consultables por hoja de vida (respuestas en §15).
- **¿Qué reemplaza de Forms?** Los 2 preoperacionales y los 2 planes preventivos: inmediatamente tras el piloto. Combustible: tras resolver el ticket (o aceptar operar sin foto durante el piloto). Horas hombre: NO (decisión de alcance pendiente).
- **¿Qué reemplaza de Excel?** Todo el rol de "base de datos histórica" (ya importado) y de consolidación de captura. NO reemplaza aún el rol de "insumo para reportes" (falta export).
- **¿Qué reemplaza de Power BI?** La consulta operacional diaria por equipo. NO el análisis gerencial (y no debe, según Opción C).
- **¿Qué NO construir?** Lo listado en E (§29).
- **¿Cuántas fases adicionales?** **1 fase de desarrollo antes de producción** («Informes y Exportación»: G1+G2+G3+G10, composición sobre read models existentes — esfuerzo estimado prudente: una directiva del tamaño de LITE-08) **+ 1 fase de infraestructura** (la migración de despliegue GitHub→DigitalOcean→Neon anunciada en §0, que no es desarrollo funcional). Opcionalmente una fase C posterior al piloto (G5+G6+datos).

### Criterios para considerar Lite listo para el despliegue GitHub → DigitalOcean → Neon (§33.7)

1. Fase «Informes y Exportación» cerrada con revisión PASS.
2. Pendientes PDC-01 resueltos en el nuevo destino: secretos de producción propios, `CORS_ORIGINS` del dominio definitivo, health gate `/ready` cableado al orquestador del Droplet, roles PostgreSQL de mínimo privilegio recreados en Neon (equivalente a DGP-023.5), backup/PITR de Neon verificado con un ensayo de restore.
3. Repositorio en GitHub con historial limpio (sin secretos — ya auditado) y procedimiento de build/arranque documentado (manual técnico existente, ajustar destino).
4. Decisión de Dirección sobre demo-vs-producción (Opción C de PDC-01) y sobre G7 (horas hombre).
5. Piloto controlado ejecutado (guion de 15 pasos de PDC-01).

---

*Auditoría realizada en modo solo lectura. Ningún dato, esquema, contrato ni pantalla fue modificado. Cifras de BD tomadas del tenant `delta-demo` en la base de desarrollo el 2026-08-15.*
