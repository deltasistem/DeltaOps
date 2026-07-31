# 03_USE_CASES.md

> **DeltaOps — ETS-004 · v1.0** · Casos de uso completos.
> Formato por caso: **Actor(es) · Precondiciones · Flujo principal · Flujos alternos/excepciones · Postcondiciones · Eventos emitidos** (consistentes con `03_DOMAIN_EVENTS.md` de ETS-003).
> Documento de diseño. No implementa nada.

---

## Acceso y contexto

### UC-01 · Inicio de sesión
- **Actor:** cualquier usuario.
- **Precondiciones:** usuario activo con membresía vigente.
- **Flujo:** abre la app → ingresa credenciales (o sesión persistente en móvil) → MFA si está habilitado → si tiene una sola membresía entra directo; si tiene varias, va a selección de contexto.
- **Alternos:** credenciales inválidas (mensaje genérico, sin revelar existencia del usuario); usuario desactivado → acceso denegado auditado; recuperación de contraseña.
- **Postcondición:** sesión activa con contexto definido.
- **Eventos:** SesionIniciada / IntentoDeAccesoDenegado.

### UC-02 · Cambio de contexto
- **Actor:** usuario con múltiples membresías.
- **Flujo:** abre el selector de contexto (siempre visible) → elige empresa/operación/proyecto → el sistema refiltra datos, menú y permisos **sin recargar**.
- **Alternos:** contexto sin permisos → no aparece en el selector.
- **Postcondición:** todo lo visible corresponde al nuevo contexto.
- **Eventos:** ContextoActivoCambiado.

## Activos

### UC-03 · Asignar activo
- **Actor:** administrador de empresa / director (según permiso).
- **Precondiciones:** activo existente sin asignación vigente en esa dimensión; destino vigente.
- **Flujo:** busca el activo → "Asignar" → elige destino (operación/proyecto/centro/ubicación) y/o responsable → define fecha de inicio → confirma.
- **Alternos:** destino no vigente → bloqueado; ya existe asignación vigente → el sistema ofrece **traslado** (UC-04) en lugar de asignación.
- **Postcondición:** asignación vigente creada; historial actualizado.
- **Eventos:** ActivoAsignado, ResponsableDeActivoCambiado.

### UC-04 · Trasladar activo
- **Actor:** director / coordinador (según permiso y umbral de aprobación).
- **Flujo:** desde el activo → "Trasladar" → destino nuevo → motivo → (aprobación si aplica) → el sistema **cierra** la asignación vigente y **abre** la nueva en un solo acto.
- **Alternos:** traslado masivo (selección múltiple, mismo destino); OTs abiertas → advertencia (los costos futuros irán al nuevo contexto); rechazo del aprobador → nada cambia, queda traza.
- **Postcondición:** historial íntegro: asignación anterior cerrada con fecha fin, nueva vigente.
- **Eventos:** ActivoTrasladado.

### UC-05 · Consultar hoja de vida
- **Actor:** cualquier rol con lectura del activo.
- **Flujo:** activo → "Hoja de vida" → línea de tiempo consolidada (asignaciones, OTs, tanqueos, horas, componentes, documentos) → filtros por periodo/tipo → exportar PDF.
- **Postcondición:** ninguna (lectura).

### UC-06 · Adjuntar documentos
- **Actor:** roles con edición sobre la entidad (activo, OT, inspección…).
- **Flujo:** entidad → "Adjuntar" → foto/archivo (cámara directa en móvil) → categoría (manual, certificado, evidencia) → guarda.
- **Alternos:** offline → se encola y sube al sincronizar.
- **Eventos:** DocumentoAdjuntadoAActivo (o equivalente).

## Operación en campo

### UC-07 · Crear checklist (plantilla)
- **Actor:** coordinador / planeador / SST.
- **Flujo:** Plantillas → nueva o nueva **versión** → secciones e ítems (tipo de respuesta, criticidad, foto obligatoria u opcional) → asocia a tipos de activo → publica.
- **Alternos:** editar plantilla publicada → prohibido: se crea versión nueva.
- **Postcondición:** versión publicada inmutable, vigente para próximas inspecciones.
- **Eventos:** PlantillaChecklistCreada/Versionada.

### UC-08 · Ejecutar checklist
- **Actor:** operador.
- **Precondiciones:** activo con plantilla aplicable; operador autorizado.
- **Flujo:** escanea QR del activo → el sistema trae la plantilla vigente → responde ítems (fotos donde exija) → registra hallazgos si hay → firma → envía → ve resultado (apto / no apto / con observaciones).
- **Alternos:** **offline:** todo local, sincroniza después; ítem crítico reprobado → resultado NO APTO, activo bloqueado, notificación inmediata al supervisor; checklist ya hecho en el turno → el sistema lo informa (evita duplicados).
- **Postcondición:** inspección firmada e inmutable; hallazgos registrados.
- **Eventos:** ChecklistRealizado / ChecklistRechazado / HallazgoRegistrado.

### UC-09 · Registrar combustible (tanqueo)
- **Actor:** operador / supervisor.
- **Flujo:** escanea QR → "Tanqueo" → combustible (solo los asociados al activo) → cantidad, costo (según política), lectura de medidor (prellenada con la última) → foto opcional → confirma.
- **Alternos:** combustible no asociado → bloqueado; lectura menor a la anterior → exige justificación; offline → encola.
- **Eventos:** CombustibleRegistrado; ConsumoAnomaloDetectado (si el motor lo detecta).

### UC-10 · Registrar carga eléctrica
- **Actor:** operador.
- **Flujo:** igual a UC-09 con combustible "eléctrico": unidad **kWh**, cargador/punto opcional, % batería inicial/final opcional.
- **Regla:** misma experiencia, mismo evento (CombustibleRegistrado): la energía es un combustible más del catálogo.

### UC-11 · Registrar horas hombre
- **Actor:** técnico (las suyas) / supervisor (su cuadrilla).
- **Flujo:** desde la OT o desde "Mi jornada" → actividad, activo/OT, hora inicio-fin (cronómetro o manual) → confirma. Supervisor: vista de aprobación masiva del turno.
- **Alternos:** solapamiento de horas del mismo técnico → advertencia; corrección posterior → evento compensatorio, no edición.
- **Eventos:** HorasHombreRegistradas / HorasHombreImputadasAOT.

### UC-12 · Registrar lectura de medidor
- **Actor:** operador / supervisor / técnico.
- **Flujo:** escanea QR → "Lectura" → horómetro y/o km (prellenado con última + foto del tablero opcional) → confirma.
- **Alternos:** retroceso → justificación obligatoria (cambio de medidor) auditada.
- **Eventos:** LecturaDeMedidorRegistrada / LecturaInconsistenteDetectada.

## Mantenimiento

### UC-13 · Crear solicitud de servicio
- **Actor:** supervisor / operador (reporte de falla) / sistema (desde hallazgo).
- **Flujo:** "Reportar falla" → activo (QR o desde hallazgo, prellenado) → descripción, criticidad, fotos → envía → coordinador la ve en bandeja.
- **Eventos:** SolicitudDeServicioCreada / HallazgoEscaladoASolicitud.

### UC-14 · Crear OT
- **Actor:** coordinador / jefe de taller; el sistema (preventiva/predictiva).
- **Flujo:** desde solicitud aprobada ("Convertir en OT", prellenada) o manual → tipo, prioridad, descripción, activo → folio automático → queda Creada.
- **Alternos:** preventiva: la genera el Motor de Preventivos; predictiva: desde alerta IA aceptada.
- **Eventos:** OTCreada / SolicitudConvertidaEnOT / OTPreventivaGenerada.

### UC-15 · Ejecutar OT
- **Actor:** técnico / contratista.
- **Precondiciones:** OT asignada al actor; competencias vigentes.
- **Flujo:** "Iniciar" → diagnóstico → causa raíz → solicitar/consumir repuestos (UC-17) → ejecutar → horas + fotos → "Lista para cierre".
- **Alternos:** pausa con motivo (espera repuesto, espera activo); reasignación por jefe de taller.
- **Eventos:** OTIniciada/Pausada/Reanudada, DiagnosticoRegistrado, CausaRaizRegistrada, RepuestoConsumidoEnOT, HorasHombreImputadasAOT.

### UC-16 · Cerrar OT
- **Actor:** técnico (solicita) + jefe de taller (aprueba, según política).
- **Precondiciones:** diagnóstico, solución y evidencias completas.
- **Flujo:** técnico "Cerrar" → validación de completitud → aprobación del jefe → OT Cerrada; hoja de vida e indicadores se actualizan.
- **Alternos:** rechazo con motivo → vuelve al técnico; reapertura → solo con permiso especial, auditada.
- **Eventos:** OTCerrada / OTReabierta.

## Inventario y compras

### UC-17 · Solicitar repuestos
- **Actor:** técnico / jefe de taller (desde una OT).
- **Flujo:** OT → "Repuestos" → busca (código/escáner) → ve disponibilidad por almacén → solicita cantidad → se crea **reserva** → almacenista despacha → consumo queda imputado a la OT.
- **Alternos:** sin stock → la solicitud pasa a necesidades de compra; liberación de reserva si la OT se cancela.
- **Eventos:** RepuestoSolicitadoParaOT, RepuestoReservadoParaOT, SalidaDeInventarioRegistrada, RepuestoConsumidoEnOT.

### UC-18 · Aprobar compra
- **Actor:** gerente / director (según umbral).
- **Flujo:** notificación de OC pendiente → revisa líneas, proveedor, presupuesto afectado → aprueba o rechaza con motivo (desde móvil incluido).
- **Eventos:** OrdenDeCompraAprobada / Rechazada.

### UC-19 · Recibir compra
- **Actor:** almacenista.
- **Flujo:** Recepciones esperadas → selecciona OC → registra cantidades recibidas (parcial o total) contra lo ordenado → el sistema genera las entradas de inventario.
- **Alternos:** exceso sobre lo ordenado → bloqueado; calidad rechazada → recepción parcial con nota.
- **Eventos:** RecepcionDeCompraRegistrada, EntradaDeInventarioRegistrada, StockActualizado.

### UC-20 · Realizar inventario (conteo)
- **Actor:** almacenista (+ aprobador de ajustes).
- **Flujo:** plan de conteo (cíclico o total) → cuenta escaneando → diferencias detectadas → ajuste con motivo y permiso → auditado.
- **Eventos:** InventarioAjustadoPorConteo, StockActualizado.

## Analítica y administración

### UC-21 · Consultar indicadores
- **Actor:** gerencia, dirección, planeación, coordinación.
- **Flujo:** Analítica → indicador (MTTR, MTBF, disponibilidad, cumplimiento) → filtra por contexto/periodo → **drill-down** hasta las OTs/eventos que lo componen → exporta.

### UC-22 · Consultar costos
- **Actor:** gerente / director / administrador.
- **Flujo:** Costos → dimensión (activo, centro, proyecto, operación) → periodo → comparación presupuesto vs. real → drill-down al hecho (OT, tanqueo, movimiento).

### UC-23 · Generar reportes
- **Actor:** cualquier rol con permiso de exportación.
- **Flujo:** pantalla o dashboard → "Exportar" (PDF/Excel) o reporte programado (periodicidad + destinatarios) → se entrega por notificación/correo.

### UC-24 · Administrar catálogos
- **Actor:** administrador de empresa (o global para catálogos de plataforma).
- **Flujo:** Configuración → catálogo (estados, prioridades, unidades, combustibles, tipos de activo) → agregar/editar/desactivar valores.
- **Regla:** un valor usado jamás se elimina: se desactiva.
- **Eventos:** ValorDeCatalogoAgregado/Desactivado.

### UC-25 · Administrar usuarios
- **Actor:** administrador de empresa.
- **Flujo:** Seguridad → Usuarios → invitar (correo) → asignar membresías (organizaciones con vigencia) y roles por contexto → activar/desactivar/resetear.
- **Eventos:** UsuarioCreado, UsuarioAsignadoAOrganizacion, UsuarioDesactivado.

### UC-26 · Administrar permisos
- **Actor:** administrador de empresa.
- **Flujo:** Seguridad → Roles → crear/clonar rol → marcar permisos (módulo → pantalla → acción) → asignar a usuarios por contexto.
- **Regla:** partir de cero permisos; todo cambio auditado.
- **Eventos:** RolCreado/Modificado, PermisoConcedido/Revocado.

### UC-27 · Consultar auditoría / línea de tiempo
- **Actor:** auditor / administrador.
- **Flujo:** entidad → "Línea de tiempo" o Auditoría global → filtros (actor, fecha, tipo de evento) → seguir la traza entre entidades (hallazgo→solicitud→OT→costos) → exportar expediente.

### UC-28 · Interactuar con el asistente IA
- **Actor:** cualquier usuario (alcance = sus permisos).
- **Flujo:** abre el asistente desde cualquier pantalla → pregunta en lenguaje natural → respuesta con datos del contexto y enlaces a las pantallas/hechos → puede aceptar propuestas (p. ej. "crear la OT sugerida") que **el usuario confirma**.
- **Regla:** la IA nunca escribe sola (ver `08_IA_ASSISTANT.md`).

---

## Reglas transversales de todos los casos de uso

1. Toda acción valida permisos en el contexto activo; lo denegado se audita.
2. Toda escritura emite su Domain Event y queda en el historial.
3. Los flujos de campo (UC-06, 08–13, 17) funcionan **offline** y sincronizan solos.
4. Prellenar > digitar: QR, últimas lecturas, plantillas y propuestas de IA reducen la captura manual.
5. Las correcciones nunca editan hechos: generan eventos compensatorios visibles.
