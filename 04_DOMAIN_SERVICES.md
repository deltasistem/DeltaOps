# 04_DOMAIN_SERVICES.md

> **DeltaOps — ETS-003 · v1.0** · Domain Services (motores de dominio).
> Un Domain Service encapsula lógica de negocio que **no pertenece a un solo aggregate**: coordina varios agregados, aplica reglas transversales o construye proyecciones. No tiene estado propio de negocio; opera sobre agregados y eventos.
> Documento de diseño. No implementa nada.

---

## Motores del núcleo

### 1. Motor de Asignaciones (BC-03)
- **Responsabilidad:** gobernar toda pertenencia temporal: activo → (empresa, sede, operación, proyecto, centro de costo, ubicación, responsable).
- **Reglas:**
  - Nunca sobrescribe: cierra la asignación vigente (fecha fin) y abre una nueva.
  - Valida que el destino organizacional exista, esté vigente y pertenezca al mismo tenant.
  - No permite dos asignaciones vigentes del mismo tipo para el mismo activo.
  - Reacciona a `ProyectoFinalizado` / `CentroDeCostoCerrado`: exige reasignación de activos vigentes.
- **Emite:** ActivoAsignado, ActivoTrasladado, ResponsableDeActivoCambiado.

### 2. Motor de Preventivos (BC-04)
- **Responsabilidad:** programar mantenimientos por tiempo (calendario) y por uso (horómetro/kilometraje) y generar las OT correspondientes.
- **Reglas:**
  - Escucha `LecturaDeMedidorRegistrada` y el calendario para disparar planes.
  - No genera OT duplicada para el mismo plan/ventana.
  - Marca `PreventivoVencido` si la OT no se ejecuta en la ventana de tolerancia.
  - Suspende planes de activos retirados o en baja.
- **Emite:** MantenimientoPreventivoProgramado, OTPreventivaGenerada, PreventivoVencido.

### 3. Motor de Checklist (BC-05)
- **Responsabilidad:** gestionar plantillas versionadas, validar ejecuciones y derivar hallazgos.
- **Reglas:**
  - Una inspección se ejecuta siempre contra una **versión** de plantilla; versionar no altera inspecciones pasadas.
  - Ítems críticos reprobados → `ChecklistRechazado` (activo no apto para operar).
  - Todo hallazgo puede escalarse a SolicitudDeServicio con trazabilidad completa.
- **Emite:** ChecklistRealizado, ChecklistRechazado, HallazgoRegistrado, HallazgoEscaladoASolicitud.

### 4. Motor de Combustible (BC-05)
- **Responsabilidad:** registrar tanqueos multicombustible y calcular rendimientos.
- **Reglas:**
  - Solo acepta combustibles asociados al activo (ACPM, gasolina, gas, GLP, GNV, eléctrico, biodiesel, hidrógeno, otros).
  - Calcula rendimiento cruzando tanqueos con lecturas de medidor.
  - Detecta consumos fuera de rango → `ConsumoAnomaloDetectado`.
- **Emite:** CombustibleRegistrado, ConsumoAnomaloDetectado.

### 5. Motor de Inventario (BC-06)
- **Responsabilidad:** garantizar que el stock solo cambie por movimientos atómicos y coordinar reservas para OT.
- **Reglas:**
  - Traslado = salida + entrada en una sola operación de negocio.
  - No permite salidas que dejen stock negativo (salvo política explícita por tenant).
  - Ajustes por conteo requieren permiso y quedan auditados.
- **Emite:** StockActualizado, RepuestoReservadoParaOT, ReservaLiberada.

## Motores transversales

### 6. Motor de Costos (BC-09)
- **Responsabilidad:** consolidar costos (repuestos, horas hombre, servicios, combustible) por activo, OT, centro de costo, proyecto y operación.
- **Reglas:** todo costo lleva moneda (VO Dinero); conversión con tasa vigente a la fecha del hecho; nunca modifica los hechos origen.
- **Emite:** CostoConsolidado, PresupuestoExcedido.

### 7. Motor de Indicadores (BC-09)
- **Responsabilidad:** calcular MTTR, MTBF, disponibilidad, cumplimiento de preventivos, rendimiento de combustible, rotación de inventario.
- **Reglas:** solo lee eventos; los indicadores se recalculan por proyección, jamás se digitan.
- **Emite:** IndicadorRecalculado.

### 8. Motor de Notificaciones (BC-12)
- **Responsabilidad:** convertir eventos en notificaciones según suscripciones, roles y canales.
- **Reglas:** sin lógica de negocio propia; respeta el scoping del tenant; idempotente.
- **Emite:** NotificacionEmitida.

### 9. Motor de Auditoría (BC-11)
- **Responsabilidad:** registrar todo evento con actor, fecha, contexto y agregado, en un log inmutable, y construir líneas de tiempo por entidad.
- **Reglas:** append-only; nadie (ni administradores) edita o borra; retención definida por política.
- **Emite:** EventoAuditado.

### 10. Motor de Reglas (BC-13)
- **Responsabilidad:** evaluar reglas parametrizables por tenant (stock mínimo, tolerancias de preventivo, umbrales de consumo, vencimientos de contratos y certificaciones).
- **Reglas:** las reglas son configuración, no código; todo cambio de regla queda auditado.
- **Emite:** StockBajoDetectado, ContratoVencido, CompetenciaVencida (alertas de umbral).

### 11. Motor de Permisos (BC-02)
- **Responsabilidad:** decidir, para cada acción, si el usuario puede ejecutarla en su contexto organizacional activo (RBAC/ABAC).
- **Reglas:** mínimo privilegio; denegado por defecto; decisión evaluable en cualquier capa; deniega y audita (`IntentoDeAccesoDenegado`).

### 12. Motor de IA (BC-10)
- **Responsabilidad:** predicción de fallas, recomendaciones, detección de anomalías y asistencia conversacional.
- **Reglas:**
  - **Propone, no dispone:** sus salidas son AlertaPredictiva / Recomendación; solo un usuario o regla explícita las convierte en OT o plan.
  - Aprende de diagnósticos, causas raíz y del feedback (aceptada/descartada).
  - Nunca accede a datos fuera del tenant.
- **Emite:** PrediccionDeFallaGenerada, RecomendacionGenerada, AnomaliaDetectada.

### 13. Motor de Folios (transversal)
- **Responsabilidad:** generar consecutivos de negocio (OT, órdenes de compra, solicitudes) únicos por tenant y a prueba de concurrencia.
- **Reglas:** unicidad garantizada por tenant; sin huecos exigidos (los folios anulados quedan trazados).

---

## Matriz servicio → agregados que coordina

| Motor | Agregados principales | Eventos que escucha |
|---|---|---|
| Asignaciones | Activo, nodos de Organización | ProyectoFinalizado, CentroDeCostoCerrado |
| Preventivos | PlanPreventivo, OT, Activo | LecturaDeMedidorRegistrada, OTCerrada |
| Checklist | Plantilla, Inspección, Solicitud | — |
| Combustible | RegistroDeCombustible, Activo | LecturaDeMedidorRegistrada |
| Inventario | Almacén, Movimiento, Repuesto, OT | RepuestoSolicitadoParaOT, RecepcionDeCompraRegistrada |
| Costos | OT, Movimiento, RegistroHorasHombre, RegistroDeCombustible | Repuesto/HorasHombre/Costo imputados, CombustibleRegistrado |
| Indicadores | (proyección) | OTCreada/Cerrada, ChecklistRealizado, StockActualizado… |
| Notificaciones | (proyección) | todos |
| Auditoría | (append-only) | todos |
| Reglas | Repuesto, Contrato, Técnico, PlanPreventivo | StockActualizado, fechas de vencimiento |
| Permisos | Usuario, Rol | — |
| IA | (proyección + propuestas) | eventos históricos del tenant |
| Folios | OT, OrdenDeCompra, Solicitud | — |
