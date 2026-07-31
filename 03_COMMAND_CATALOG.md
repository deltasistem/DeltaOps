# 03_COMMAND_CATALOG.md

> **DeltaOps — ETS-008 · v1.0** · Catálogo completo de comandos por módulo.
> Cada comando cambia el mundo a través de UN agregado (ETS-003), emite eventos del catálogo ETS-003/03 y queda auditado (ETS-006/06).
> Documento de diseño. No implementa nada.

---

## 0. Atributos comunes (aplican a TODOS los comandos; no se repiten)

- **Auditoría:** todo comando aceptado produce hecho + evento atómicos (outbox); autor, contexto, tiempo doble, canal y correlación siempre registrados. **Sin excepciones.**
- **Idempotencia:** clave obligatoria (`02` §2); reintento = resultado original.
- **Permisos:** evaluados en el contexto activo contra la matriz ETS-004/10; denegado por defecto. Se listan los roles típicos; la configuración del tenant puede restringir más (nunca ampliar sobre plataforma).
- **Errores universales:** `NO_AUTORIZADO`, `CONTEXTO_INVALIDO`, `VALIDACION_FALLIDA`, `CONFLICTO_VERSION`, `DUPLICADO_IDEMPOTENTE` (ver `07_ERROR_CATALOG.md`); abajo solo se listan los errores de negocio propios.
- **Offline:** «Sí» = capturable sin señal vía bitácora (`12_SYNC_API.md`), validado a tiempo de negocio; «No» = requiere línea (operaciones administrativas/configuración).
- **Correcciones:** los hechos no se editan; los comandos `Corregir*` emiten eventos compensatorios enlazados al original (ETS-006/06).

Formato por comando: **Objetivo · Actor/Permiso · Precondiciones · Postcondiciones · Eventos · Errores propios · Offline**.

---

## 1. Identity

| Comando | Definición |
|---|---|
| **CrearUsuario** | Alta de credencial. · Admin Global/Admin de Tenant · No existe usuario con ese identificador · Usuario creado sin membresías (sin acceso hasta membresía) · `UsuarioCreado` · `USUARIO_DUPLICADO` · Offline: No |
| **OtorgarMembresia** | Asignar rol+contexto+vigencia. · Admin de Tenant (SoD: nadie se otorga a sí mismo roles superiores) · Usuario y contexto existen; rol vigente · Membresía activa desde su vigencia · `MembresiaOtorgada` · `SOD_VIOLADA`, `CONTEXTO_CERRADO` · No |
| **RevocarMembresia** | Terminar membresía. · Admin de Tenant · Membresía vigente · Acceso cortado de inmediato (caches invalidados) · `MembresiaVencida` · — · No |
| **Delegar** | Delegación temporal de rol con vigencia. · Titular del rol (si la política lo permite) · Delegado con cuenta activa; periodo acotado · Delegado actúa con marca de delegación en auditoría · `DelegacionCreada` · `DELEGACION_NO_PERMITIDA` · No |
| **RevocarSesiones** | Cerrar sesiones de un usuario. · El propio usuario o Admin · Sesiones activas · Tokens revocados de inmediato · `SesionRevocada` · — · No |

## 2. Organization

| Comando | Definición |
|---|---|
| **CrearNodoOrganizacional** | Alta de sede/operación/proyecto/centro de costo/ubicación. · Admin de Tenant · Padre vigente; nivel válido en la jerarquía · Nodo vigente, disponible como contexto · `NodoOrganizacionalCreado` · `JERARQUIA_INVALIDA` · No |
| **ModificarNodoOrganizacional** | Cambios de datos del nodo. · Admin de Tenant · Nodo vigente · Datos actualizados (historia conservada) · `NodoOrganizacionalModificado` · — · No |
| **CerrarNodoOrganizacional** | Fin de vigencia (proyecto terminado). · Admin de Tenant · Sin activos asignados vigentes ni OTs abiertas (o plan de reasignación) · Nodo cerrado; historia intacta y consultable · `NodoOrganizacionalCerrado` · `NODO_CON_DEPENDENCIAS` · No |

## 3. Assets

| Comando | Definición |
|---|---|
| **CrearActivo** | Alta de activo con tipo y atributos dinámicos (ETS-005/13). · Planeador/Admin de Activos · Tipo vigente en catálogo; atributos obligatorios completos · Activo existe con folio; sin asignación aún · `ActivoCreado` · `TIPO_INEXISTENTE`, `CODIGO_DUPLICADO` · No |
| **ActualizarActivo** | Modificar datos de ficha (no hechos). · Planeador/Admin de Activos · Activo existe; versión conocida · Ficha actualizada, versión incrementada · `ActivoModificado` · — · No |
| **AsignarActivo** | Asignación a contexto con vigencia. · Planeador (ámbito de origen Y destino) · Activo sin asignación vigente solapada · Asignación vigente; hoja de vida proyecta · `ActivoAsignado` · `ASIGNACION_SOLAPADA`, `DESTINO_CERRADO` · No |
| **TrasladarActivo** | Cierre de asignación + apertura en destino. · Planeador (ambos ámbitos) · Asignación vigente; destino válido · Traslado con fecha de negocio; historia continua · `ActivoTrasladado` · `DESTINO_CERRADO` · Sí (captura en campo; validación al sincronizar) |
| **InstalarComponente** | Montar componente en activo padre. · Técnico/Planeador · Componente disponible (no montado en otro) · Componente vinculado; historia de montaje · `ComponenteInstalado` · `COMPONENTE_OCUPADO` · Sí |
| **RetirarComponente** | Desmontar componente. · Técnico/Planeador · Componente montado en ese activo · Componente disponible; historia conservada · `ComponenteRetirado` · — · Sí |
| **RegistrarLectura** | Lectura de medidor (horómetro/odómetro/otros). · Operador/Técnico/IoT · Medidor declarado en el activo · Lectura aceptada como hecho · `LecturaRegistrada` · `LECTURA_NO_MONOTONA` (a bandeja si es telemetría), `FUERA_DE_RANGO` · **Sí** |
| **CorregirLectura** | Compensación de lectura errónea. · Supervisor (permiso de corrección) · Lectura original existe · Evento compensatorio enlazado; proyecciones recalculan · `LecturaCorregida` · — · No |
| **DarBajaActivo** | Fin de vida del activo. · Admin de Activos (aprobación según workflow del tenant) · Sin OTs abiertas; asignación cerrada · Activo en estado final; historia permanente · `ActivoDadoDeBaja` · `ACTIVO_CON_OTS_ABIERTAS` · No |

## 4. Maintenance

| Comando | Definición |
|---|---|
| **CrearSolicitud** | Reporte de falla/necesidad (UC-01). · Cualquier usuario con acceso al activo (incl. Operador) · Activo visible en su ámbito · Solicitud con folio; el reportante recibirá cierre (U-38) · `SolicitudCreada` · — · **Sí** |
| **AtenderSolicitud** | Decisión del coordinador: convertir a OT / rechazar con motivo. · Coordinador · Solicitud abierta · Solicitud atendida y enlazada a su OT o cerrada con motivo visible al reportante · `SolicitudAtendida` · `SOLICITUD_YA_ATENDIDA` · No |
| **EjecutarChecklist** | Realizar checklist (plantilla versionada ETS-005/03). · Operador/Técnico · Plantilla vigente al iniciar (en vuelo termina con su versión) · Checklist como hecho; hallazgos generados por ítems en mal estado · `ChecklistRealizado`, `HallazgoDetectado`* · `PLANTILLA_INVALIDA` · **Sí** |
| **RegistrarHallazgo** | Hallazgo directo (fuera de checklist). · Operador/Técnico/Supervisor · Activo visible · Hallazgo abierto con criticidad · `HallazgoDetectado` · — · **Sí** |
| **ProgramarPreventivos** | Generar OTs preventivas del plan (por uso/calendario). · Planeador (o automático por Rules) · Plan vigente; activos con lecturas · OTs preventivas programadas · `OTPreventivaProgramada` · `PLAN_SIN_ACTIVOS` · No |
| **ModificarPlanPreventivo** | Cambiar plan (frecuencias, tareas) — vía Configuration si es plantilla; aquí la vinculación activo↔plan. · Planeador · Plan y activos vigentes · Vinculación nueva versionada; en vuelo no cambia · `PlanPreventivoModificado` · — · No |

## 5. Work Orders

| Comando | Definición |
|---|---|
| **CrearOT** | Crear OT (correctiva desde solicitud/hallazgo, o directa). · Coordinador/Planeador · Activo vigente; origen (si existe) abierto · OT en estado inicial del workflow del tenant · `OTCreada` · `ORIGEN_YA_ENLAZADO` · No |
| **AsignarOT** | Asignar técnico(s) y programar. · Coordinador · OT en estado asignable; técnico con membresía vigente en el ámbito · OT asignada; técnico notificado; aparece en su bandeja móvil · `OTAsignada` · `TECNICO_FUERA_DE_AMBITO` · No |
| **TransicionarOT** | Transición de estado (iniciar, pausar, reanudar…) según workflow (ETS-005/04). · Rol autorizado por la transición · Transición válida desde el estado actual; campos requeridos por la transición completos · Estado nuevo; SLA recalculado · `TransicionEjecutada` (+ evento específico: `OTIniciada`, `OTPausada`…) · `TRANSICION_INVALIDA`, `CAMPOS_REQUERIDOS_FALTANTES` · **Sí** (las transiciones de ejecución en campo) |
| **RegistrarDiagnostico** | Diagnóstico técnico en la OT. · Técnico asignado · OT en ejecución · Diagnóstico en expediente (sugerencias IA marcadas si se usaron, U-40) · `DiagnosticoRegistrado` · — · **Sí** |
| **RegistrarHoras** | Horas hombre trabajadas. · Técnico asignado · OT en ejecución; horas dentro de rangos · Horas al expediente y al costo · `HorasRegistradas` · `HORAS_FUERA_DE_RANGO` · **Sí** |
| **SolicitarRepuesto** | Necesidad de repuesto desde la OT. · Técnico asignado · OT en ejecución; ítem en catálogo · Reserva solicitada a bodega · `RepuestoSolicitado` · `ITEM_INEXISTENTE` · **Sí** |
| **CerrarOT** | Cierre con trabajo realizado, evidencias y firmas (UC-08). · Técnico (cierre técnico) + Supervisor si el workflow exige validación · Requisitos de cierre del tenant completos (evidencias, checklist de cierre, firmas) · OT cerrada; costos consolidan; hoja de vida proyecta; reportante notificado (U-38) · `OTCerrada` · `REQUISITOS_CIERRE_INCOMPLETOS` · **Sí** |
| **ReabrirOT** | Reapertura excepcional con motivo. · Supervisor/Coordinador (permiso explícito) · OT cerrada; dentro de ventana de reapertura del tenant · OT reabierta enlazada al cierre original (nada se borra) · `OTReabierta` · `VENTANA_REAPERTURA_VENCIDA` · No |
| **CancelarOT** | Cancelación con motivo. · Coordinador · OT no cerrada · OT cancelada; reservas liberadas · `OTCancelada` · — · No |

## 6. Inventory

| Comando | Definición |
|---|---|
| **CrearItem** | Alta en maestro de ítems. · Admin de Inventario · Código único; categoría del catálogo · Ítem disponible para movimientos · `ItemCreado` · `CODIGO_DUPLICADO` · No |
| **ActualizarItem** | Modificar maestro (mínimos, datos). · Admin de Inventario · Ítem existe · Maestro actualizado versionado · `ItemModificado` · — · No |
| **ReservarStock** | Reserva contra existencias. · Sistema (desde `SolicitarRepuesto`) o Almacenista · Existencia disponible en la bodega del ámbito · Reserva vigente; disponible reducido · `StockReservado` · `STOCK_INSUFICIENTE` (genera necesidad a Purchasing) · No |
| **RegistrarAjuste** | Ajuste de inventario con motivo (conteo, merma). · Almacenista + aprobación según umbral (SoD) · Motivo del catálogo; evidencia si el tenant la exige · Movimiento de ajuste auditado; kardex proyecta · `AjusteRealizado` · `AJUSTE_SIN_APROBACION` · No |
| **RegistrarConteo** | Conteo cíclico/físico. · Almacenista (segundo contador si el tenant lo exige) · Ciclo de conteo abierto · Conteo como hecho; diferencias generan ajustes propuestos · `ConteoRegistrado` · — · **Sí** |

## 7. Fuel & Energy

| Comando | Definición |
|---|---|
| **RegistrarTanqueo** | Carga de combustible/energía — ACPM, gasolina, gas, **kWh: mismo comando** (UC-04, ≤60 s U-02). · Operador/Conductor/Surtidor/IoT · Activo con tipo de energía compatible; cantidad ≤ capacidad + tolerancia · Hecho de consumo; rendimiento recalcula; anomalías vigiladas · `CombustibleRegistrado` · `CAPACIDAD_EXCEDIDA`, `ENERGIA_INCOMPATIBLE`, `LECTURA_NO_MONOTONA` · **Sí** |
| **CorregirTanqueo** | Compensación de tanqueo erróneo. · Supervisor · Tanqueo original existe · Evento compensatorio enlazado · `TanqueoCorregido` · — · No |
| **RegistrarEntradaCombustible** | Ingreso a tanque/estación propia. · Almacenista de combustible · Tanque registrado; documento de proveedor · Existencia de combustible aumenta; conciliación posible · `EntradaCombustibleRegistrada` · — · Sí |

## 8. Purchasing

| Comando | Definición |
|---|---|
| **CrearNecesidad** | Necesidad de compra (manual o automática por `StockBajoMinimo`). · Almacenista/Planeador/Sistema · Ítem o descripción; ámbito de imputación · Necesidad en bandeja de compras · `NecesidadCreada` · — · No |
| **CrearOC** | Orden de compra a proveedor. · Comprador · Proveedor activo; necesidades enlazadas · OC en cadena de aprobación por umbral (ETS-005/04) · `OCCreada` · `PROVEEDOR_INACTIVO` · No |
| **AprobarOC / RechazarOC** | Decisión de aprobación (SoD: aprobador ≠ creador). · Aprobador del umbral · OC pendiente en su nivel · OC avanza o vuelve con motivo · `OCAprobada` / `OCRechazada` · `SOD_VIOLADA`, `MONTO_EXCEDE_NIVEL` · No |
| **RegistrarProveedor** | Alta/actualización de proveedor. · Comprador/Admin · Identificación única · Proveedor disponible · `ProveedorRegistrado` · `PROVEEDOR_DUPLICADO` · No |
| **CalificarProveedor** | Evaluación de desempeño. · Comprador/Almacenista · Entregas registradas del periodo · Calificación en historial del proveedor · `ProveedorCalificado` · — · No |
| **RegistrarContrato** | Contrato con vigencias y alertas de vencimiento. · Comprador/Admin · Proveedor activo; documento adjunto · Contrato vigilado por calendario (`ContratoPorVencer`) · `ContratoRegistrado` · — · No |

## 9. Warehouse

| Comando | Definición |
|---|---|
| **RegistrarRecepcion** | Recepción contra OC (total/parcial) con evidencias. · Almacenista · OC aprobada con saldo pendiente · Entrada de stock; OC avanza (cierre si completa); diferencias documentadas · `RecepcionRegistrada` · `OC_SIN_SALDO`, `ITEM_NO_ESPERADO` · Sí |
| **Despachar** | Entrega contra reserva (a OT o consumo directo) con firma del receptor. · Almacenista · Reserva vigente; receptor identificado · Salida de stock; costo imputado al destino (OT/centro de costo) · `DespachoRealizado` · `RESERVA_INEXISTENTE` · Sí |
| **RegistrarDevolucion** | Devolución de material no usado. · Almacenista · Despacho original referenciado · Entrada por devolución; costo revertido del destino · `DevolucionRegistrada` · `DESPACHO_INEXISTENTE` · Sí |
| **TrasladarStock** | Traslado entre bodegas. · Almacenista (ambos ámbitos) · Existencia en origen · Salida en origen + entrada en destino (en tránsito si aplica) · `TrasladoStockRegistrado` · `STOCK_INSUFICIENTE` · No |

## 10. Workflow (genérico, invocado por los módulos)

| Comando | Definición |
|---|---|
| **Aprobar / Rechazar** | Decisión en cadena de aprobación (OT, OC, ajuste, configuración). · Aprobador del nivel (SoD estructural) · Instancia pendiente en su nivel · Instancia avanza/retorna; escalamientos cancelados · `AprobacionOtorgada` / `AprobacionRechazada` · `SOD_VIOLADA`, `NIVEL_INCORRECTO` · No |
| **ReasignarAprobacion** | Mover una aprobación pendiente (vacaciones, ausencia). · Admin/Titular con delegación · Pendiente vigente · Nuevo aprobador notificado; traza conservada · `AprobacionReasignada` · — · No |

## 11. Configuration (resumen — el detalle funcional es ETS-005)

| Comando | Definición |
|---|---|
| **CrearBorradorConfiguracion** | Nueva versión borrador de un objeto de configuración. · Admin de Configuración del ámbito · Objeto existente o nuevo; edición sobre borrador, nunca sobre publicado · Borrador editable en sandbox · `ConfiguracionCreada` · — · No |
| **PublicarConfiguracion** | Publicación versionada e inmutable (con aprobación si el tenant la exige). · Admin de Configuración (+aprobador) · Validación completa (referencias, permisos, simulación si es regla) · Versión inmutable vigente; en vuelo termina con la anterior; caches invalidados · `ConfiguracionPublicada` · `VALIDACION_CONFIGURACION_FALLIDA` · No |
| **RetirarConfiguracion** | Fin de vigencia de una versión. · Admin de Configuración · Versión vigente; sustituta definida si hay dependencias · Versión retirada (historia intacta) · `ConfiguracionRetirada` · `CONFIGURACION_CON_DEPENDENCIAS` · No |
| **ImportarConfiguracion / ExportarConfiguracion** | Paquetes entre ámbitos/tenants (plantillas de industria, ETS-005/13). · Admin de Configuración · Paquete validado contra el ámbito destino · Borradores importados (publicación aparte) · `ConfiguracionImportada` · `PAQUETE_INCOMPATIBLE` · No |

## 12. Notifications

| Comando | Definición |
|---|---|
| **MarcarLeida / Acusar** | Lectura o acuse de recibo de notificación (las críticas exigen acuse). · Destinatario · Notificación propia · Estado de entrega actualizado; escalamiento por no-acuse cancelado · `NotificacionLeida` / `NotificacionAcusada` · — · Sí |
| **ConfigurarPreferencias** | Preferencias personales de canal/digest (capa Usuario, ETS-005). · El propio usuario · Dentro de lo no-obligatorio (lo crítico no se apaga) · Preferencias aplicadas a futuros envíos · `PreferenciasNotificacionModificadas` · `NOTIFICACION_OBLIGATORIA` · No |

## 13. Files

| Comando | Definición |
|---|---|
| **SolicitarSubida** | Autorización + destino firmado de subida (`11_FILE_API.md`). · Quien tenga permiso de escritura sobre el hecho/entidad dueño · Dueño lógico válido; tipo/tamaño dentro de límites · Destino firmado emitido; referencia "pendiente" · — (el evento llega al confirmar) · `TIPO_NO_PERMITIDO`, `TAMANO_EXCEDIDO` · **Sí** (diferido: la evidencia espera red) |
| **ConfirmarArchivo** | Verificación posterior a subida (interno/automático). · Sistema · Binario recibido íntegro y explorado · Referencia "disponible"; miniaturas generadas · `ArchivoAlmacenado` · `ARCHIVO_CORRUPTO`, `MALWARE_DETECTADO` · — |
| **VersionarDocumento** | Nueva edición de documento (manuales, planos). · Rol documental del módulo dueño · Documento existente · Versión nueva; anteriores intactas; vigente actualizada · `ArchivoVersionado` · — · No |

## 14. Mobile (protocolo — detalle en `12_SYNC_API.md`)

| Comando | Definición |
|---|---|
| **SincronizarBitacora** | Entrega del lote de comandos capturados offline. · Dispositivo autenticado del usuario · Protocolo soportado (N/N-1) · Cada comando confirmado/rechazado/en revisión individualmente; mapa de identidades devuelto · `DispositivoSincronizado` (+ los eventos de cada comando aceptado) · `PROTOCOLO_NO_SOPORTADO` (por lote); por comando: los del comando · — (es el canal offline) |
| **RegistrarDispositivo** | Alta/renovación de dispositivo del usuario. · Usuario autenticado (límite por licencia) · Credencial válida · Dispositivo con credencial local; paquetes descargables · `DispositivoRegistrado` · `LIMITE_DISPOSITIVOS` · No |

## 15. Integration

| Comando | Definición |
|---|---|
| **CrearSuscripcionWebhook** | Suscripción del tenant a eventos (`10_WEBHOOK_CONTRACTS.md`). · Admin de Integraciones · Eventos del catálogo; URL verificada por reto · Entregas firmadas comienzan · `SuscripcionWebhookCreada` · `URL_NO_VERIFICADA` · No |
| **CrearCuentaServicio** | Cuenta para API/conector con alcance mínimo. · Admin de Integraciones (aprobación según tenant) · Alcance ≤ permisos del creador · Credencial emitida (visible una sola vez) · `CuentaServicioCreada` · — · No |
| **RevocarCuentaServicio** | Revocación inmediata. · Admin de Integraciones · Cuenta activa · Credencial inválida al instante · `CuentaServicioRevocada` · — · No |
| **ReprocesarElemento** | Reproceso gobernado de elemento en bandeja de error (integraciones/ingesta). · Admin de Integraciones · Elemento en bandeja; causa corregida · Reproceso idempotente; traza enlazada · `ElementoReprocesado` · `ELEMENTO_YA_PROCESADO` · No |
| **IngestarTelemetria** | Lote de telemetría IoT (→ ACL → comandos candidatos). · Dispositivo IoT con credencial individual · Dispositivo registrado y activo · Hechos aceptados o a bandeja (nunca silencio) · los del comando resultante (`LecturaRegistrada`…) · `DISPOSITIVO_NO_REGISTRADO` · — (la cola absorbe) |

## 16. AI (la IA no tiene manos — solo comandos del humano sobre sugerencias)

| Comando | Definición |
|---|---|
| **AceptarSugerencia** | El humano adopta una sugerencia (el hecho resultante lo comanda el humano). · Usuario asistido con permiso sobre la acción sugerida · Sugerencia vigente y visible para su rol · Aceptación trazada; contenido marcado como asistido por IA (U-40) en el hecho que el humano cree · `SugerenciaAceptada` · `SUGERENCIA_VENCIDA` · Sí |
| **DescartarSugerencia** | Descarte con motivo opcional (alimenta calibración). · Usuario asistido · Sugerencia vigente · Descarte trazado; métricas de aceptación actualizadas · `SugerenciaDescartada` · — · Sí |
| **EnviarRetroalimentacionIA** | Valoración de una respuesta del asistente. · Usuario asistido · Respuesta propia de su sesión · Retroalimentación a calibración del tenant · `RetroalimentacionIARegistrada` · — · Sí |

## 17. Analytics / Reporting

| Comando | Definición |
|---|---|
| **EmitirReporte** | Generación de reporte al corte (asíncrono declarado). · Rol con permiso sobre el reporte y su ámbito · Plantilla vigente; parámetros válidos · Operación asíncrona → documento congelado con branding y marca de época (ETS-006/12) · `ReporteEmitido` · `PARAMETROS_INVALIDOS` · No |
| **ProgramarReporte** | Programación periódica con destinatarios. · Rol con permiso + Admin si cruza ámbitos · Calendario válido; destinatarios con permiso de lectura · Emisiones automáticas comienzan · `ReporteProgramado` · `DESTINATARIO_SIN_PERMISO` · No |
| **ExportarDatos** | Exportación masiva del ámbito (asíncrona, auditada como acceso masivo). · Rol con permiso de exportación (alerta de seguridad si es inusual) · Ámbito y filtros válidos · Operación asíncrona → archivo con diccionario; acceso registrado · `ExportacionRealizada` · `EXPORTACION_EXCEDE_AMBITO` · No |

---

**Cobertura:** los comandos anteriores cubren los 28 casos de uso de ETS-004 y los agregados de ETS-003. Cualquier comando nuevo debe entrar a este catálogo cumpliendo `18_API_CHECKLIST.md` antes de implementarse (`17_API_GOVERNANCE.md`).
