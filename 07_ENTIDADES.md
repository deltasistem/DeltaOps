# 07_ENTIDADES.md

> **DeltaOps — ETS-003 · v1.0** · Ficha de cada entidad del dominio.
> Formato por entidad: **Definición · Responsabilidad · Ciclo de vida · Estados · Relaciones · Eventos · Restricciones · Reglas · Indicadores · Riesgos.**
> Documento de diseño. No implementa nada. (AR = también es Aggregate Root, ver `05_AGGREGATES.md`.)

---

## BC-01 · Organización

### Empresa (AR)
- **Definición:** unidad legal que agrupa toda la operación; es el tenant raíz.
- **Responsabilidad:** delimitar datos, configuración, moneda/idioma por defecto.
- **Ciclo de vida:** creada → activa → desactivada.
- **Estados:** activa, desactivada.
- **Relaciones:** 1─n Sedes, Ubicaciones, Usuarios (membresías), catálogos propios.
- **Eventos:** EmpresaCreada/Modificada/Desactivada.
- **Restricciones:** identificación tributaria única.
- **Reglas:** no se desactiva con operaciones activas.
- **Indicadores:** activos totales, costo total, disponibilidad global.
- **Riesgos:** fuga de datos entre tenants si el scoping falla.

### Sede
- **Definición:** planta o instalación física de una empresa.
- **Responsabilidad:** anclar operaciones y ubicaciones físicas.
- **Ciclo de vida / Estados:** creada → activa → desactivada.
- **Relaciones:** n─1 Empresa; 1─n Operaciones, Ubicaciones.
- **Eventos:** SedeCreada/Modificada/Desactivada.
- **Reglas:** no se desactiva con operaciones activas.
- **Riesgos:** activos "huérfanos" si se desactiva sin reasignar.

### Operación (AR)
- **Definición:** línea de negocio en una sede (fertilizantes, carbón, portuaria, industrial…).
- **Responsabilidad:** agrupar proyectos y su actividad.
- **Ciclo de vida:** creada → activa → cerrada.
- **Relaciones:** n─1 Sede; 1─n Proyectos.
- **Eventos:** OperacionCreada/Cerrada.
- **Reglas:** no cierra con proyectos activos.
- **Indicadores:** costos, disponibilidad y cumplimiento por operación.

### Proyecto (AR)
- **Definición:** contrato o iniciativa con vigencia dentro de una operación.
- **Responsabilidad:** ser el destino temporal de activos y costos.
- **Ciclo de vida:** creado → activo → finalizado.
- **Relaciones:** n─1 Operación; 1─n CentrosDeCosto; activos asignados con vigencia.
- **Eventos:** ProyectoCreado/Finalizado.
- **Reglas:** al finalizar, exige reasignar activos vigentes (Motor de Asignaciones).
- **Riesgos:** costos imputados a proyectos vencidos.

### CentroDeCosto (AR)
- **Definición:** unidad contable a la que se imputan costos, con jerarquía.
- **Responsabilidad:** consolidar costos; destino temporal de activos.
- **Ciclo de vida:** creado → activo → cerrado.
- **Relaciones:** n─1 Proyecto (o empresa); jerarquía padre/hijos; asignaciones de activos.
- **Eventos:** CentroDeCostoCreado/Reasignado/Cerrado.
- **Restricciones:** código único por empresa; sin ciclos jerárquicos.
- **Reglas:** **un activo nunca le pertenece permanentemente**; no cierra con asignaciones vigentes.
- **Indicadores:** costo por centro, comparativo presupuesto/real.

### Ubicación (AR)
- **Definición:** lugar físico o lógico jerárquico (planta → área → zona).
- **Responsabilidad:** localizar activos e inventario.
- **Ciclo de vida:** creada → activa → desactivada.
- **Relaciones:** jerarquía propia; asignaciones de activos; almacenes.
- **Eventos:** UbicacionCreada/Movida/Desactivada.
- **Reglas:** sin ciclos; moverla no altera el historial de asignaciones pasadas.

## BC-02 · Seguridad

### Usuario (AR)
- **Definición:** persona que accede a DeltaOps.
- **Responsabilidad:** actuar dentro de sus membresías y contexto activo.
- **Ciclo de vida:** creado → activo ⇄ desactivado.
- **Relaciones:** n─m organizaciones (membresías con vigencia); n─m Roles por contexto; 0─1 Técnico.
- **Eventos:** UsuarioCreado/Desactivado, UsuarioAsignadoAOrganizacion, ContextoActivoCambiado, SesionIniciada.
- **Restricciones:** correo único.
- **Reglas:** denegado por defecto; sin membresía vigente no ve datos.
- **Riesgos:** acumulación de permisos (revisar periódicamente).

### Rol (AR)
- **Definición:** conjunto nombrado de permisos.
- **Ciclo de vida:** creado → activo → retirado.
- **Relaciones:** n─m Usuarios (por contexto); n─m Permisos.
- **Eventos:** RolCreado/Modificado, PermisoConcedido/Revocado.
- **Reglas:** cambios siempre auditados.

### Permiso
- **Definición:** autorización granular módulo → pantalla → acción.
- **Responsabilidad:** unidad mínima de decisión de acceso.
- **Relaciones:** n─m Roles.
- **Reglas:** lo no concedido está denegado.

## BC-03 · Activos

### Activo (AR) ⭐
- **Definición:** bien físico gestionado (equipo, vehículo, maquinaria, herramienta…), de cualquiera de los 17+ tipos.
- **Responsabilidad:** custodiar su identidad, atributos, componentes, combustibles y **todo su historial de asignaciones**.
- **Ciclo de vida:** creado → operativo ⇄ en mantenimiento ⇄ inactivo → retirado (baja).
- **Estados:** operativo, en mantenimiento, inactivo/standby, no apto (checklist), retirado.
- **Relaciones:** n─1 TipoDeActivo, Modelo; 1─n Componentes, Asignaciones, OTs, registros de campo; n─m Combustibles.
- **Eventos:** ActivoCreado/Modificado/Asignado/Trasladado/Retirado, ActivoPuestoEnMantenimiento/Reactivado.
- **Restricciones:** código único por tenant; una asignación vigente por dimensión.
- **Reglas:** nunca pertenece permanentemente a un nodo organizacional; no se retira con OT abiertas; ningún comportamiento depende del tipo.
- **Indicadores:** disponibilidad, MTTR, MTBF, costo total de propiedad, rendimiento de combustible.
- **Riesgos:** historial incompleto = hoja de vida inservible; duplicidad de códigos.

### Asignación
- **Definición:** vínculo **con vigencia** entre un activo y un destino (nodo organizacional, ubicación o responsable).
- **Responsabilidad:** ser la única forma de pertenencia.
- **Ciclo de vida:** abierta (vigente) → cerrada (histórica). Nunca se borra.
- **Relaciones:** dentro del agregado Activo; referencia destino por identidad.
- **Eventos:** ActivoAsignado, ActivoTrasladado, ResponsableDeActivoCambiado.
- **Reglas:** cerrar-y-abrir, nunca sobrescribir; fechas coherentes (sin solapamiento por dimensión).
- **Riesgos:** solapamientos de vigencia; destinos inexistentes.

### Componente
- **Definición:** parte significativa de un activo (motor, bomba, llanta…).
- **Ciclo de vida:** instalado → retirado / reemplazado.
- **Relaciones:** dentro del agregado Activo; puede tener serial propio.
- **Eventos:** ComponenteInstalado/Retirado/Reemplazado.
- **Reglas:** solo se manipula a través del Activo; su historial alimenta la hoja de vida.

### TipoDeActivo (AR)
- **Definición:** categoría parametrizable que define atributos dinámicos y requisitos (17+ tipos, extensible).
- **Ciclo de vida:** creado → activo → descontinuado.
- **Eventos:** TipoDeActivoCreado/Modificado.
- **Reglas:** agregar tipos no requiere cambios estructurales; definición versionada.
- **Riesgos:** proliferación de tipos duplicados (gobernanza de catálogo).

### Fabricante (AR) y Modelo
- **Definición:** marca constructora y su modelo específico.
- **Relaciones:** Fabricante 1─n Modelos; Modelo 1─n Activos.
- **Eventos:** FabricanteCreado, ModeloCreado/Descontinuado.
- **Reglas:** descontinuar no afecta activos existentes.

### HojaDeVida (proyección)
- **Definición:** consolidado cronológico del activo: intervenciones, costos, combustible, horas, componentes, documentos.
- **Reglas:** **no es entidad transaccional**: se deriva de eventos; siempre reconstruible.

## BC-04 · Mantenimiento

### OrdenDeTrabajo (AR) ⭐
- **Definición:** unidad de intervención sobre un activo (correctiva, preventiva o predictiva).
- **Responsabilidad:** trazar el trabajo completo: diagnóstico → causa raíz → solución → costos.
- **Ciclo de vida / Estados:** creada → asignada → en ejecución ⇄ pausada → cerrada; cancelada; reabierta (excepcional).
- **Relaciones:** n─1 Activo, Solicitud/Plan/Alerta origen; n─m Técnicos; 1─n consumos, horas, costos.
- **Eventos:** OTCreada/Asignada/Iniciada/Pausada/Cerrada/Cancelada/Reabierta y de imputación.
- **Restricciones:** folio único por tenant; contexto organizacional congelado al crearla.
- **Reglas:** no cierra sin diagnóstico y solución; imputaciones solo abierta; reapertura auditada.
- **Indicadores:** MTTR, backlog, costo por OT, % por tipo.
- **Riesgos:** OTs eternamente abiertas (backlog fantasma); cierres sin información real.

### PlanPreventivo (AR)
- **Definición:** programa de mantenimiento por tiempo y/o uso.
- **Ciclo de vida:** creado → activo ⇄ suspendido → retirado.
- **Eventos:** PlanPreventivoCreado/Modificado/Suspendido, OTPreventivaGenerada, PreventivoVencido.
- **Reglas:** al menos un disparador; sin OTs duplicadas por ventana.
- **Indicadores:** cumplimiento preventivo, preventivos vencidos.

### SolicitudDeServicio (AR)
- **Definición:** reporte de falla o necesidad que puede derivar en OT.
- **Ciclo de vida / Estados:** creada → aprobada → convertida en OT; rechazada.
- **Eventos:** SolicitudDeServicioCreada/Aprobada/Rechazada, SolicitudConvertidaEnOT.
- **Reglas:** conversión única; conserva vínculo al hallazgo si nació de checklist.

## BC-05 · Operación en Campo

### PlantillaChecklist (AR)
- **Definición:** formulario versionado de inspección preoperacional por tipo de uso.
- **Ciclo de vida:** borrador → publicada (inmutable) → nueva versión → desactivada.
- **Eventos:** PlantillaChecklistCreada/Versionada/Desactivada.
- **Reglas:** versionar nunca altera inspecciones pasadas.

### InspeccionChecklist (AR)
- **Definición:** ejecución firmada de una plantilla sobre un activo.
- **Ciclo de vida:** en diligenciamiento → firmada (inmutable).
- **Estados (resultado):** apto, no apto, con observaciones.
- **Relaciones:** n─1 Plantilla (versión exacta), Activo, operador; 1─n Hallazgos.
- **Eventos:** ChecklistRealizado/Rechazado, HallazgoRegistrado.
- **Reglas:** ítem crítico reprobado ⇒ no apto ⇒ activo bloqueado para operar.
- **Riesgos:** diligenciamiento mecánico sin inspección real (mitigar con evidencia/foto/GPS).

### Hallazgo
- **Definición:** anomalía detectada en una inspección.
- **Ciclo de vida:** registrado → escalado a solicitud / cerrado.
- **Eventos:** HallazgoRegistrado/EscaladoASolicitud/Cerrado.
- **Reglas:** trazabilidad completa hallazgo → solicitud → OT.

### RegistroDeCombustible (AR)
- **Definición:** tanqueo/carga de energía de un activo (cualquier combustible).
- **Ciclo de vida:** registrado (inmutable).
- **Relaciones:** n─1 Activo, combustible del catálogo, proveedor opcional.
- **Eventos:** CombustibleRegistrado, ConsumoAnomaloDetectado.
- **Reglas:** combustible ∈ los asociados al activo; correcciones por evento compensatorio.
- **Indicadores:** rendimiento, costo energético por activo/centro.
- **Riesgos:** hurto de combustible (detección de anomalías).

### RegistroHorasHombre (AR)
- **Definición:** horas de trabajo de un técnico sobre un activo u OT.
- **Reglas:** rango horario válido; inmutable tras cierre; alimenta costos de mano de obra.

### LecturaDeMedidor (AR)
- **Definición:** captura de horómetro o kilometraje.
- **Reglas:** monotónica; retroceso solo con justificación auditada (cambio de medidor).
- **Riesgos:** lecturas falsas que distorsionan preventivos por uso.

## BC-06 · Inventario

### Repuesto (AR)
- **Definición:** ítem de inventario para mantenimiento (repuesto/insumo).
- **Ciclo de vida:** creado → activo → descontinuado.
- **Eventos:** RepuestoCreado/Modificado/Descontinuado, StockBajoDetectado.
- **Reglas:** código único por tenant; mínimos/máximos por almacén.
- **Indicadores:** rotación, stock valorizado, quiebres de stock.

### Almacén (AR) y Existencia
- **Definición:** bodega con existencias por repuesto.
- **Relaciones:** n─1 Ubicación; 1─n Existencias.
- **Eventos:** StockActualizado, RepuestoReservadoParaOT.
- **Reglas:** stock solo cambia por movimientos; reservas ≤ disponible.

### Movimiento (AR)
- **Definición:** hecho inmutable que altera existencias (entrada/salida/traslado/ajuste).
- **Eventos:** Entrada/Salida/Traslado/Ajuste registrados.
- **Reglas:** traslado atómico; ajuste con permiso y auditoría.
- **Riesgos:** ajustes usados para ocultar pérdidas (control por auditoría).

## BC-07 · Compras

### Proveedor (AR)
- **Definición:** tercero que suministra bienes o servicios.
- **Ciclo de vida:** creado → activo → desactivado.
- **Eventos:** ProveedorCreado/Calificado/Desactivado.
- **Reglas:** calificación histórica, nunca sobrescrita.
- **Indicadores:** ranking, cumplimiento de entregas.

### OrdenDeCompra (AR)
- **Definición:** pedido formal a un proveedor.
- **Ciclo de vida / Estados:** creada → aprobada → enviada → recibida (parcial/total) / cancelada.
- **Eventos:** OrdenDeCompraCreada/Aprobada/Enviada, RecepcionDeCompraRegistrada.
- **Reglas:** no recibir más de lo ordenado; recepción genera entradas de inventario vía evento.

### Contrato (AR)
- **Definición:** acuerdo de servicios/suministro con vigencia.
- **Ciclo de vida:** creado → vigente → renovado / vencido / terminado.
- **Eventos:** ContratoCreado/Renovado/Vencido/Terminado.
- **Reglas:** alerta previa al vencimiento; renovación crea nueva vigencia (historial).

## BC-08 · Personas

### Técnico (AR)
- **Definición:** persona que ejecuta mantenimiento u opera activos.
- **Ciclo de vida:** creado → activo → desactivado (historial intacto).
- **Relaciones:** 0─1 Usuario; 1─n Competencias; n─m OTs.
- **Eventos:** TecnicoCreado/Desactivado, CompetenciaCertificada/Vencida.
- **Reglas:** no asignable a OT que exija competencia vencida.

### Competencia
- **Definición:** habilidad o certificación con vencimiento.
- **Ciclo de vida:** certificada → vigente → vencida → renovada.
- **Reglas:** alerta previa al vencimiento (Motor de Reglas).

### Responsable
- **Definición:** rol de custodia de un activo, materializado como Asignación de responsable con vigencia e historial (no es entidad independiente).

## BC-09 · Costos

### Presupuesto (AR)
- **Definición:** partidas planificadas por periodo y nodo organizacional.
- **Ciclo de vida:** definido → vigente → cerrado.
- **Eventos:** PresupuestoDefinido/Excedido.
- **Reglas:** moneda obligatoria; el excedente alerta, no bloquea silenciosamente.

### Costo (proyección)
- **Definición:** consolidación de costos reales (repuestos, horas, servicios, combustible) por activo/OT/centro/proyecto.
- **Reglas:** derivado de eventos; nunca digitado.

## BC-11/12/13 · Transversales

### EventoDeAuditoria
- **Definición:** registro inmutable de un hecho (actor, fecha, contexto, agregado, datos).
- **Reglas:** append-only; nadie edita ni borra.

### Notificación
- **Definición:** aviso dirigido a un usuario por un canal.
- **Ciclo de vida:** emitida → leída / expirada.
- **Reglas:** respeta scoping del tenant.

### Catálogo y ValorDeCatalogo
- **Definición:** listas maestras parametrizables (estados, prioridades, unidades, combustibles, tipos).
- **Reglas:** un valor usado nunca se borra: se desactiva; sin strings mágicos en el dominio.

### ParametroDeConfiguracion
- **Definición:** ajuste por empresa o sistema (tolerancias, políticas, umbrales).
- **Reglas:** todo cambio auditado.

### Documento
- **Definición:** archivo adjunto (manual, certificado, foto, evidencia) vinculado a cualquier entidad.
- **Reglas:** el vínculo es histórico; borrar el vínculo no borra la evidencia auditada.
