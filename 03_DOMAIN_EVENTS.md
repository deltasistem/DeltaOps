# 03_DOMAIN_EVENTS.md

> **DeltaOps — ETS-003 · v1.0** · Catálogo completo de Domain Events.
> Un Domain Event es un **hecho de negocio ya ocurrido**: se nombra en pasado, es inmutable y siempre lleva: quién, cuándo, en qué contexto organizacional y sobre qué agregado.
> Documento de diseño. No implementa nada.

---

## Convenciones

- Nombre en pasado: `ActivoAsignado`, no "AsignarActivo".
- Todo evento se registra en Auditoría (BC-11) y puede disparar Notificaciones (BC-12), Indicadores (BC-09) e IA (BC-10).
- **Suscriptores transversales implícitos:** Auditoría, Historial, Notificaciones, Indicadores. Solo se listan suscriptores adicionales relevantes.

## BC-01 · Organización

| Evento | Lo emite | Significado / suscriptores adicionales |
|---|---|---|
| EmpresaCreada / EmpresaModificada / EmpresaDesactivada | Empresa | Alta/cambio/retiro de un tenant |
| SedeCreada / SedeModificada / SedeDesactivada | Empresa | |
| OperacionCreada / OperacionCerrada | Operación | Cierre exige no tener proyectos activos |
| ProyectoCreado / ProyectoFinalizado | Proyecto | Motor de Asignaciones (reasignar activos vigentes) |
| CentroDeCostoCreado / CentroDeCostoReasignado / CentroDeCostoCerrado | CentroDeCosto | Costos (recomposición de jerarquía) |
| UbicacionCreada / UbicacionMovida / UbicacionDesactivada | Ubicación | |

## BC-02 · Seguridad y Acceso

| Evento | Lo emite | Significado |
|---|---|---|
| UsuarioCreado / UsuarioDesactivado / UsuarioReactivado | Usuario | |
| UsuarioAsignadoAOrganizacion / UsuarioRetiradoDeOrganizacion | Usuario | Cambia alcance del tenant |
| RolCreado / RolModificado | Rol | |
| PermisoConcedido / PermisoRevocado | Rol/Usuario | Auditoría de seguridad |
| SesionIniciada / SesionCerrada / IntentoDeAccesoDenegado | Usuario | Seguridad y anomalías (IA) |
| ContextoActivoCambiado | Usuario | Trazabilidad de operaciones |

## BC-03 · Activos

| Evento | Lo emite | Significado / suscriptores |
|---|---|---|
| ActivoCreado | Activo | Nace en estado según ciclo de vida |
| ActivoModificado | Activo | Cambio de datos/atributos dinámicos |
| **ActivoAsignado** | Activo | Nueva asignación vigente (org/centro/ubicación/responsable). Historial |
| **ActivoTrasladado** | Activo | Cierra asignación previa y abre nueva |
| ResponsableDeActivoCambiado | Activo | Personas |
| ActivoPuestoEnMantenimiento / ActivoReactivado | Activo | Disponibilidad (Indicadores) |
| **ActivoRetirado** (dado de baja) | Activo | Motor de Asignaciones cierra vigencias; Preventivos suspende planes |
| ComponenteInstalado / ComponenteRetirado / ComponenteReemplazado | Activo | Hoja de vida |
| CombustibleAsociadoAActivo / CombustibleRetiradoDeActivo | Activo | Motor de Combustible |
| DocumentoAdjuntadoAActivo | Activo | Hoja de vida |
| TipoDeActivoCreado / TipoDeActivoModificado | TipoDeActivo | Atributos dinámicos |
| FabricanteCreado / ModeloCreado / ModeloDescontinuado | Fabricante | |

## BC-04 · Mantenimiento

| Evento | Lo emite | Significado / suscriptores |
|---|---|---|
| SolicitudDeServicioCreada / Aprobada / Rechazada | Solicitud | |
| SolicitudConvertidaEnOT | Solicitud | Trazabilidad hallazgo→OT |
| **OTCreada** | OT | Correctiva, preventiva o predictiva (origen trazado) |
| **OTAsignada** | OT | Técnico(s) asignado(s); valida competencias |
| OTIniciada / OTPausada / OTReanudada | OT | Indicadores (MTTR) |
| DiagnosticoRegistrado / CausaRaizRegistrada | OT | IA (aprendizaje) |
| RepuestoSolicitadoParaOT | OT | Inventario (reserva) |
| RepuestoConsumidoEnOT | OT | Inventario (salida), Costos |
| HorasHombreImputadasAOT | OT | Costos, Personas |
| CostoImputadoAOT | OT | Motor de Costos |
| **OTCerrada** | OT | Cierra intervención; Hoja de vida; MTTR/MTBF |
| OTCancelada / OTReabierta | OT | Reabrir exige permiso especial y queda auditado |
| PlanPreventivoCreado / Modificado / Suspendido / Reactivado | PlanPreventivo | |
| MantenimientoPreventivoProgramado | Motor de Preventivos | Calendario |
| OTPreventivaGenerada | Motor de Preventivos | Vinculada al plan |
| PreventivoVencido (no ejecutado a tiempo) | Motor de Preventivos | Alerta de cumplimiento |
| AlertaPredictivaGenerada | Motor de IA | Propuesta; puede derivar en OT |
| AlertaPredictivaConvertidaEnOT / Descartada | OT / usuario | Feedback a IA |

## BC-05 · Operación en Campo

| Evento | Lo emite | Significado / suscriptores |
|---|---|---|
| PlantillaChecklistCreada / Versionada / Desactivada | Plantilla | Versionar nunca altera inspecciones pasadas |
| **ChecklistRealizado** | Inspección | Ejecución completa firmada |
| ChecklistRechazado (activo no apto) | Inspección | Bloquea operación del activo; Notificaciones |
| **HallazgoRegistrado** | Inspección | Puede originar SolicitudDeServicio |
| HallazgoEscaladoASolicitud | Inspección | Mantenimiento |
| HallazgoCerrado | Inspección | |
| **CombustibleRegistrado** (tanqueo) | RegistroDeCombustible | Motor de Combustible (rendimiento), Costos |
| ConsumoAnomaloDetectado | Motor de Combustible / IA | Investigación |
| HorasHombreRegistradas | RegistroHorasHombre | Costos |
| LecturaDeMedidorRegistrada (horómetro/km) | LecturaDeMedidor | Motor de Preventivos (por uso) |
| LecturaInconsistenteDetectada (retroceso) | LecturaDeMedidor | Requiere justificación auditada |

## BC-06 · Inventario

| Evento | Lo emite | Significado / suscriptores |
|---|---|---|
| RepuestoCreado / RepuestoModificado / RepuestoDescontinuado | Repuesto | |
| AlmacenCreado / AlmacenDesactivado | Almacén | |
| EntradaDeInventarioRegistrada | Movimiento | Compra, devolución |
| SalidaDeInventarioRegistrada | Movimiento | Consumo en OT u otro destino |
| TrasladoEntreAlmacenesRegistrado | Movimiento | Atómico: salida+entrada |
| **StockActualizado** | Almacén | Proyección de existencias |
| StockBajoDetectado | Motor de Reglas | Notificación + sugerencia de compra |
| InventarioAjustadoPorConteo | Movimiento (ajuste) | Solo con permiso; siempre auditado |
| RepuestoReservadoParaOT / ReservaLiberada | Almacén | Mantenimiento |

## BC-07 · Compras y Proveedores

| Evento | Lo emite | Significado |
|---|---|---|
| ProveedorCreado / ProveedorModificado / ProveedorDesactivado | Proveedor | |
| **ProveedorCalificado** | Proveedor | Alimenta ranking de compras |
| OrdenDeCompraCreada / Aprobada / Rechazada / Cancelada | OrdenDeCompra | |
| OrdenDeCompraEnviada | OrdenDeCompra | |
| RecepcionDeCompraRegistrada (total/parcial) | OrdenDeCompra | **Inventario genera entradas** |
| ContratoCreado / ContratoRenovado / ContratoVencido / ContratoTerminado | Contrato | Alertas de vencimiento |

## BC-08 · Personas

| Evento | Lo emite | Significado |
|---|---|---|
| TecnicoCreado / TecnicoDesactivado | Técnico | |
| CompetenciaCertificada / CompetenciaVencida | Técnico | Bloquea asignación a OT que la exija |
| DisponibilidadDeTecnicoCambiada | Técnico | Programación |

## BC-09/10 · Costos, Indicadores, Analítica e IA

| Evento | Lo emite | Significado |
|---|---|---|
| CostoConsolidado (periodo/activo/centro) | Motor de Costos | Proyección |
| IndicadorRecalculado (MTTR, MTBF, disponibilidad, cumplimiento) | Motor de Indicadores | |
| PresupuestoDefinido / PresupuestoExcedido | Presupuesto | Alerta |
| PrediccionDeFallaGenerada | Motor de IA | → AlertaPredictiva |
| RecomendacionGenerada / RecomendacionAceptada / RecomendacionDescartada | Motor de IA | Feedback loop |
| AnomaliaDetectada (consumo, costo, comportamiento) | Motor de IA | Investigación |

## BC-11/12/13 · Auditoría, Notificaciones, Configuración

| Evento | Lo emite | Significado |
|---|---|---|
| EventoAuditado | Motor de Auditoría | Meta-registro append-only |
| NotificacionEmitida / NotificacionLeida | Notificaciones | |
| CatalogoCreado / ValorDeCatalogoAgregado / ValorDeCatalogoDesactivado | Catálogos | Nunca se borra un valor usado |
| ParametroDeConfiguracionCambiado | Configuración | Siempre auditado |
| MonedaConfigurada / TasaDeCambioActualizada | Configuración | Costos multimoneda |

---

## Reglas de los eventos

1. **Inmutables y en pasado:** un evento nunca se edita ni se elimina; los errores se corrigen con eventos compensatorios (p. ej. `InventarioAjustadoPorConteo`).
2. **Portadores de contexto:** todo evento lleva actor, fecha/hora con zona, contexto organizacional y agregado origen.
3. **Fuente de la historia:** la hoja de vida, la línea de tiempo, los indicadores y la IA se construyen leyendo eventos, nunca editando estado.
4. **Idempotencia de suscriptores:** procesar dos veces el mismo evento no puede duplicar efectos.
5. **Este catálogo es abierto:** nuevos módulos agregan eventos siguiendo estas convenciones.
