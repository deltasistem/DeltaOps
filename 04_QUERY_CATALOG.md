# 04_QUERY_CATALOG.md

> **DeltaOps — ETS-008 · v1.0** · Catálogo completo de consultas (queries) por módulo.
> Toda consulta sirve un read model (ETS-006/12) con frescura declarada, recortada por el contexto activo y los permisos del actor.
> Documento de diseño. No implementa nada.

---

## 0. Atributos comunes (aplican a TODAS las consultas; no se repiten)

- **Ámbito implícito:** el contexto activo y las membresías recortan todo resultado; los filtros explícitos refinan dentro de lo permitido. Lo que el actor no puede ver, no existe en la respuesta (ni en conteos).
- **Paginación:** por cursor, tamaño máximo por contrato (`01` §14). Se omite abajo salvo particularidad.
- **Frescura:** declarada en la respuesta (`X-Frescura`); las de tiempo real razonable (bandejas) proyectan en segundos; las analíticas declaran su corte (ETS-006/05).
- **Cache:** según `11_CACHE_ARCHITECTURE.md` (ETS-007); se indica solo la política particular.
- **Tiempo:** los rangos de fecha filtran por **tiempo de negocio** salvo que se indique lo contrario.

Formato: **Propósito · Filtros · Orden · Read model · Permisos · Particularidades (drill-down, cache)**.

---

## 1. Assets

| Consulta | Definición |
|---|---|
| **ConsultarActivos** | Listado/búsqueda de activos del ámbito. · Filtros: tipo, estado, contexto asignado, atributos dinámicos indexados, texto · Orden: código (def.), tipo, fecha de alta · RM: ficha-resumen de activos · Ver Activos · Cache corto por evento |
| **ConsultarFichaActivo** | Ficha completa con atributos dinámicos, componentes, medidores, asignación vigente. · — · — · RM: ficha de activo · Ver Activos · ETag por versión |
| **ConsultarHojaVida** | **Hoja de vida cronológica** (proyección estrella, ETS-003): OTs, checklists, tanqueos, lecturas, traslados, componentes. · Filtros: tipo de hecho, rango de fechas · Orden: cronológico desc. (def.) · RM: hoja de vida · Ver Activos (los costos solo con permiso de costos) · **Drill-down:** cada entrada enlaza a su expediente (OT, checklist…) ≤3 clics (U-04) |
| **ConsultarAsignaciones** | Historia de asignaciones del activo o del contexto. · Filtros: activo, contexto, vigencia (a una fecha), estado · Orden: vigencia desc. · RM: asignaciones · Ver Activos · "¿Dónde estaba este activo el 12 de marzo?" — consulta a fecha |
| **ConsultarLecturas** | Serie de lecturas de medidores. · Filtros: activo, medidor, rango · Orden: cronológico · RM: serie de lecturas · Ver Activos · Base del drill-down de rendimientos |
| **ConsultarComponentes** | Componentes montados/disponibles y su historia. · Filtros: activo padre, estado, tipo · Orden: fecha de montaje · RM: componentes · Ver Activos · — |

## 2. Maintenance

| Consulta | Definición |
|---|---|
| **ConsultarSolicitudes** | Bandeja de solicitudes (del coordinador o "mis reportes" del operador). · Filtros: estado, criticidad, activo, reportante, rango · Orden: criticidad+antigüedad (def.) · RM: bandeja de solicitudes · Coordinador: su ámbito; Operador: las propias (U-38) · Tiempo casi real |
| **ConsultarHallazgos** | Hallazgos abiertos/históricos. · Filtros: estado, criticidad, activo, origen (checklist/directo) · Orden: criticidad+fecha · RM: hallazgos · Ver mantenimiento del ámbito · Drill-down al checklist origen |
| **ConsultarPlanesPreventivos** | Planes y su vinculación a activos, próximas ejecuciones proyectadas. · Filtros: plan, activo, vencimiento proyectado · Orden: próxima ejecución · RM: proyección de preventivos · Planeador · Base del D-0x de cumplimiento preventivo |
| **ConsultarChecklists** | Checklists realizados. · Filtros: activo, plantilla, ejecutor, resultado, rango · Orden: fecha desc. · RM: checklists · Supervisor/Coordinador del ámbito; ejecutor ve los propios · Drill-down: ítem por ítem con evidencias |
| **ConsultarCumplimientoChecklists** | Cumplimiento esperado vs. realizado (D-0x). · Filtros: contexto, plantilla, periodo · Orden: % cumplimiento · RM: agregado de cumplimiento · Supervisor+ · Analítica: corte declarado |

## 3. Work Orders

| Consulta | Definición |
|---|---|
| **ConsultarOTs** | Listado/bandeja de OTs del ámbito. · Filtros: estado, tipo (correctiva/preventiva), criticidad, activo, técnico, SLA (en riesgo/vencido), rango · Orden: criticidad+SLA (def.), antigüedad · RM: bandeja de OTs · Ver OTs del ámbito · Tiempo casi real |
| **ConsultarOT / ConsultarExpedienteOT** | **Expediente completo:** historia de estados, diagnósticos, horas, repuestos con costos, evidencias, firmas, aprobaciones, origen (solicitud/hallazgo/plan). · — · — · RM: expediente de OT (compuesto) · Ver OTs; costos con permiso de costos · Drill-down: activo, solicitud origen, despachos |
| **ConsultarMisOTs** | Bandeja del técnico (la que baja al móvil). · Filtros: estado, día programado · Orden: programación · RM: paquete del técnico · Técnico: solo las suyas · Es la fuente del paquete offline (`12`) |
| **ConsultarBacklog** | Backlog priorizado (D-0x del coordinador). · Filtros: tipo, criticidad, antigüedad, activo · Orden: prioridad calculada · RM: backlog · Coordinador+ · Drill-down a cada OT |
| **ConsultarSLAs** | Estado de SLAs de OTs (en riesgo, vencidos, cumplidos). · Filtros: estado SLA, periodo, contexto · Orden: riesgo · RM: SLAs de workflow · Supervisor+ · Alimenta alertas de escalamiento |

## 4. Inventory / Warehouse

| Consulta | Definición |
|---|---|
| **ConsultarInventario** | Existencias por bodega/ítem con disponible vs. reservado. · Filtros: bodega, ítem, categoría, bajo mínimo, texto · Orden: ítem (def.), disponibilidad · RM: existencias (proyección de movimientos) · Almacenista/Planeador del ámbito · Frescura casi real |
| **ConsultarKardex** | Movimientos históricos de un ítem/bodega (entradas, salidas, ajustes, saldos). · Filtros: ítem, bodega, tipo de movimiento, rango · Orden: cronológico · RM: kardex · Almacenista+; costos con permiso · Cada movimiento enlaza su documento (OC, OT, ajuste) |
| **ConsultarReservas** | Reservas vigentes y su destino. · Filtros: bodega, OT, estado · Orden: antigüedad · RM: reservas · Almacenista · — |
| **ConsultarPendientesBodega** | Bandeja operativa: recepciones esperadas (OCs en camino) y despachos pendientes. · Filtros: tipo, antigüedad · Orden: prioridad · RM: pendientes de bodega · Almacenista · Tiempo casi real |
| **ConsultarConteos** | Ciclos de conteo y diferencias. · Filtros: ciclo, bodega, con diferencia · Orden: fecha · RM: conteos · Almacenista/Auditor · — |

## 5. Fuel & Energy

| Consulta | Definición |
|---|---|
| **ConsultarConsumo** | Consumos por activo/flota/contexto y tipo de energía (incl. kWh). · Filtros: activo, tipo de energía, contexto, rango, fuente (manual/IoT) · Orden: fecha desc. · RM: consumos · Ver combustible del ámbito · Drill-down: del total → activo → tanqueo individual (≤3 clics) |
| **ConsultarRendimientos** | Rendimiento por activo vs. su tipo/flota (galones-hora, km/galón, kWh equivalente). · Filtros: activo, tipo, periodo · Orden: desviación (def.) · RM: rendimientos · Supervisor/Planeador · Marca anomalías vigiladas; corte declarado |
| **ConsultarExistenciasCombustible** | Saldos de tanques/estaciones propias y conciliación. · Filtros: tanque, tipo, periodo de conciliación · Orden: tanque · RM: existencias de combustible · Almacenista de combustible · — |

## 6. Purchasing

| Consulta | Definición |
|---|---|
| **ConsultarNecesidades** | Bandeja de necesidades de compra. · Filtros: estado, origen (manual/mínimos/OT), ítem · Orden: antigüedad+criticidad · RM: necesidades · Comprador · — |
| **ConsultarOCs** | OCs y su estado en la cadena de aprobación. · Filtros: estado, proveedor, monto, pendientes-de-mí · Orden: fecha (def.), monto · RM: OCs · Comprador; aprobador ve su cola; costos con permiso · "Pendientes de mí" es la bandeja de aprobación |
| **ConsultarProveedores** | Proveedores con calificación e historial. · Filtros: estado, categoría, calificación · Orden: nombre (def.), calificación · RM: proveedores · Comprador+ · Drill-down: entregas y calificaciones |
| **ConsultarContratos** | Contratos con vigencias y alertas de vencimiento. · Filtros: proveedor, estado, por-vencer (horizonte) · Orden: vencimiento · RM: contratos · Comprador/Admin · Alimenta `ContratoPorVencer` |

## 7. Analytics (indicadores, dashboards, costos)

| Consulta | Definición |
|---|---|
| **ConsultarDashboard** | Dashboard configurado (D-01…D-09 y del tenant, ETS-005/07): widgets con sus datos, cada uno con su frescura. · Filtros: los del dashboard (contexto, periodo) · — · RM: widgets precalculados · Los del rol (cada widget recorta por permiso propio) · Cache caliente por widget; carga ≤ presupuesto U-0x |
| **ConsultarIndicadores** | KPIs canónicos (MTTR, MTBF, disponibilidad, cumplimiento, costo por hora — fórmulas Core, ETS-006/05). · Filtros: KPI, contexto, periodo, comparativo (periodo anterior/meta) · Orden: — · RM: indicadores · Según matriz del KPI · **Drill-down ≤3 clics hasta los hechos** (U-05): KPI → dimensión → lista → expediente |
| **ConsultarCostos** | Costos consolidados por OT/activo/centro de costo/periodo (mano de obra, repuestos, combustible, terceros). · Filtros: dimensión, contexto, periodo, tipo de costo · Orden: monto · RM: costos consolidados · **Solo roles con permiso de costos** (ETS-004/10) · Drill-down al hecho que originó cada costo |
| **ConsultarTendencias** | Series históricas de KPIs con snapshots (ETS-006/05: la historia no se recalcula). · Filtros: KPI, granularidad, rango · Orden: cronológico · RM: snapshots · Según KPI · Los valores publicados son inmutables |
| **ConsultarAlertasKPI** | Umbrales superados vigentes (`UmbralKPISuperado`). · Filtros: KPI, severidad, contexto · Orden: severidad · RM: alertas de indicadores · Supervisor+ · — |

## 8. Transversales

| Consulta | Definición |
|---|---|
| **BuscarGlobal** | Búsqueda global tipada (Search): activos, OTs, solicitudes, ítems, documentos, proveedores. · Filtros: texto (con sinónimos del tenant), tipos, incluir-histórico · Orden: relevancia · RM: índice de búsqueda (permisos precalculados) · Todos (cada quien ve lo suyo) · Histórico marcado como tal (ETS-006/12) |
| **ConsultarLineaDeTiempo** | Línea de tiempo auditada de cualquier entidad (Audit): quién hizo qué, cuándo, en qué contexto, con qué correlación. · Filtros: entidad, tipo de evento, actor, rango (tiempo de negocio o de registro: se elige) · Orden: cronológico · RM: líneas de tiempo de auditoría · Auditor/Admin; roles de negocio ven la línea de sus entidades visibles · Cadena causal navegable (evento→regla→comando) |
| **ConsultarMisNotificaciones** | Bandeja personal de notificaciones. · Filtros: estado (no leída/acusada), severidad, tipo · Orden: fecha desc. · RM: bandeja de notificaciones · El propio usuario · Tiempo casi real |
| **ConsultarOperacion** | Estado de operación asíncrona (exportación, reporte, importación): estado, avance, resultado o error. · — · — · RM: operaciones · El solicitante (o Admin) · Sondeo o notificación al terminar |
| **ConsultarConfiguracionVigente** | Configuración resuelta por cascada para el contexto (con explicación de herencia: de qué nivel/versión salió cada pieza). · Filtros: tipo de objeto, contexto · — · RM: configuración resuelta · Usuarios: la aplicable; Admin de Configuración: con explicación completa · Cache por versión (ETS-007/11) |
| **ConsultarEstadoSync** | Estado de sincronización de dispositivos (del usuario o del ámbito para soporte). · Filtros: dispositivo, usuario, con-pendientes, con-errores · Orden: última sync · RM: estado de sincronización · Usuario: los suyos; Admin/Soporte: su ámbito · Base del panel de salud offline |
| **ConsultarSugerenciasIA** | Sugerencias IA vigentes e históricas con su trazabilidad (qué vio, qué propuso, quién decidió). · Filtros: capacidad, estado (vigente/aceptada/descartada), entidad · Orden: fecha desc. · RM: registro de sugerencias · El asistido y roles que verían los datos sustento (`09_AI_ARCHITECTURE` ETS-007) · Todo marcado como IA (U-40) |
| **ConsultarSalud Integraciones** | Panel de salud por integración: último intercambio, atraso, errores, bandeja. · Filtros: integración, estado · Orden: severidad · RM: salud de integraciones · Admin de Integraciones · ETS-005/10 |

---

**Cobertura:** estas consultas sirven los 9 dashboards (D-01…D-09), los 15 flujos (F-01…F-15) y los 28 casos de uso de ETS-004. Toda consulta nueva entra por `18_API_CHECKLIST.md`.
