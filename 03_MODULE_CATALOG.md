# 03_MODULE_CATALOG.md

> **DeltaOps — ETS-007 · v1.0** · Catálogo de los 22 módulos técnicos: responsabilidades, límites, dependencias, eventos e interfaces.
> Los eventos referencian el catálogo ETS-003 (`03_DOMAIN_EVENTS.md`); las capas y reglas, `02_MODULAR_ARCHITECTURE.md`.
> Documento de diseño. No implementa nada.

Formato por módulo: **Responsabilidad** · **Límites (lo que NO hace)** · **Depende de** (síncrono permitido) · **Publica / Consume** (eventos) · **Interfaz pública** (contratos principales).

---

## Fundacionales

### Core
- **Responsabilidad:** lenguaje ubicuo compartido (identidades, folios, tiempo doble, dinero, unidades, contexto organizacional como tipo), bus de eventos interno, idempotencia, resultados/errores de negocio.
- **Límites:** cero lógica de negocio; cero estado propio salvo folios.
- **Depende de:** nadie. **Publica:** — **Consume:** —
- **Interfaz:** tipos compartidos; `EmitirEvento`, `AsignarFolio`.

### Identity
- **Responsabilidad:** autenticación, sesiones y tokens (`12_SECURITY_TECHNICAL.md`), usuarios como credenciales, membresías rol+contexto con vigencia, evaluación de permisos ("¿puede X hacer Y en el contexto Z?"), delegaciones.
- **Límites:** no define la jerarquía organizacional (Organization) ni qué significa cada permiso (cada módulo lo declara).
- **Depende de:** Core, Organization (validar contextos), Configuration (roles/plantillas).
- **Publica:** `UsuarioCreado`, `MembresiaOtorgada/Vencida`, `PermisoConcedido/Revocado`, `SesionIniciada`, `DelegacionCreada`. **Consume:** `ConfiguracionPublicada` (roles).
- **Interfaz:** `Autenticar`, `EvaluarPermiso`, `ResolverMembresias`, `Delegar`.

### Organization
- **Responsabilidad:** jerarquía de 6 niveles (empresa→sede→operación→proyecto→centro de costo→ubicación) con vigencias, calendarios/turnos/festivos, resolución de contexto ("¿qué contiene qué, y cuándo?").
- **Límites:** no asigna activos (Assets) ni evalúa permisos (Identity).
- **Depende de:** Core, Configuration.
- **Publica:** `NodoOrganizacionalCreado/Modificado/Cerrado`. **Consume:** —
- **Interfaz:** `ConsultarJerarquia`, `ValidarContexto`, `ResolverVigenciaEn(fecha)`.

### Configuration
- **Responsabilidad:** el Configuration Engine completo (ETS-005/02): objetos de configuración, versionado, cascada de herencia, validación, publicación, sandbox, import/export; aloja las definiciones de formularios, workflows, reglas, catálogos, dashboards, branding y flags.
- **Límites:** no interpreta las definiciones (cada motor consume la suya); no evalúa permisos.
- **Depende de:** Core, Identity (quién publica), Organization (ámbitos).
- **Publica:** `ConfiguracionCreada/Publicada/Retirada/Importada`. **Consume:** —
- **Interfaz:** `ResolverConfiguracion(tipo, contexto)`, `Publicar`, `Exportar/Importar`, `ValidarBorrador`.

### Audit
- **Responsabilidad:** flujo durable de eventos (la fuente, ETS-006/06), encadenamiento verificable, líneas de tiempo navegables, replay para consumidores.
- **Límites:** append-only absoluto; no interpreta ni filtra negocio.
- **Depende de:** Core.
- **Publica:** — (él ES el registro). **Consume:** **todos** los eventos.
- **Interfaz:** `ConsultarLineaDeTiempo(entidad)`, `Reproducir(cursor)`, `VerificarIntegridad`.

---

## Dominio

### Assets
- **Responsabilidad:** BCs de Activos y Asignaciones (ETS-003): ficha universal con atributos dinámicos por tipo, componentes, medidores declarados, asignaciones con vigencia, traslados; proyección Hoja de Vida.
- **Límites:** no crea OTs ni registra consumos; no posee la estructura organizacional.
- **Depende de:** Core, Identity, Organization, Configuration (tipos/atributos).
- **Publica:** `ActivoCreado/Modificado`, `ActivoAsignado/Trasladado`, `ComponenteInstalado/Retirado`, `LecturaRegistrada`. **Consume:** `OTCerrada`, `CombustibleRegistrado`, `ChecklistRealizado` (para Hoja de Vida).
- **Interfaz:** `CrearActivo`, `AsignarActivo`, `RegistrarLectura`, `ConsultarHojaDeVida`, `ConsultarFicha`.

### Maintenance
- **Responsabilidad:** BCs de solicitudes, planes preventivos y checklists (ETS-003): solicitudes de servicio, hallazgos, motor de preventivos (por uso/calendario), ejecución de checklists (las plantillas viven en Configuration).
- **Límites:** no ejecuta OTs (Work Orders); no define plantillas (Configuration).
- **Depende de:** Core, Identity, Organization, Configuration, Assets (consultar ficha/medidores).
- **Publica:** `SolicitudCreada/Atendida`, `ChecklistRealizado`, `HallazgoDetectado`, `OTPreventivaProgramada`. **Consume:** `LecturaRegistrada` (disparo por uso), `OTCerrada` (reprogramación).
- **Interfaz:** `CrearSolicitud`, `EjecutarChecklist`, `ConsultarPlanes`, `ProgramarPreventivos`.

### Work Orders
- **Responsabilidad:** el agregado OT completo: ciclo de vida (estados del Workflow Engine), asignación de técnicos, diagnósticos, horas hombre, repuestos usados, cierre; expediente de OT.
- **Límites:** no mueve inventario (emite necesidad; Warehouse despacha); no calcula costos (Analytics los consolida).
- **Depende de:** Core, Identity, Organization, Configuration, Workflow (su máquina de estados), Assets (ficha).
- **Publica:** `OTCreada/Asignada/Iniciada/…/OTCerrada/Reabierta`, `HorasRegistradas`, `RepuestoSolicitado`. **Consume:** `SolicitudCreada` (origen), `DespachoRealizado` (repuestos), `ChecklistRealizado` (si la OT lo exige).
- **Interfaz:** `CrearOT`, `TransicionarOT`, `RegistrarHoras`, `CerrarOT`, `ConsultarExpediente`, `MisOTs`.

### Inventory
- **Responsabilidad:** maestro de ítems, existencias como proyección de movimientos, reservas, mínimos/reorden, kardex, conteos cíclicos.
- **Límites:** no compra (Purchasing); la operación física de bodega es de Warehouse.
- **Depende de:** Core, Identity, Organization, Configuration.
- **Publica:** `MovimientoRegistrado`, `StockBajoMinimo`, `AjusteRealizado`, `ConteoRegistrado`. **Consume:** `RecepcionRegistrada`, `DespachoRealizado`.
- **Interfaz:** `ConsultarStock`, `Reservar`, `RegistrarAjuste`, `ConsultarKardex`.

### Fuel & Energy
- **Responsabilidad:** BC de combustible multi-fuel (ETS-003): tanqueos y cargas (ACPM, gasolina, gas, **kWh** — mismo evento), consumos por activo, rendimientos, anomalías de consumo.
- **Límites:** no gestiona medidores del activo (Assets registra lecturas; este módulo las usa).
- **Depende de:** Core, Identity, Organization, Configuration, Assets (medidor/capacidad).
- **Publica:** `CombustibleRegistrado`, `ConsumoAnomaloDetectado`. **Consume:** `LecturaRegistrada`.
- **Interfaz:** `RegistrarTanqueo`, `ConsultarConsumos`, `ConsultarRendimientos`.

### Purchasing
- **Responsabilidad:** necesidades, OC con cadenas de aprobación por umbral (Workflow), proveedores y su calificación, contratos con vigencias.
- **Límites:** no recibe físicamente (Warehouse) ni actualiza stock (Inventory).
- **Depende de:** Core, Identity, Organization, Configuration, Workflow.
- **Publica:** `NecesidadCreada`, `OCCreada/Aprobada/Rechazada`, `ContratoRegistrado/PorVencer`, `ProveedorCalificado`. **Consume:** `StockBajoMinimo`, `RepuestoSolicitado`, `RecepcionRegistrada` (cierre de OC).
- **Interfaz:** `CrearOC`, `AprobarOC`, `ConsultarProveedores`, `ConsultarContratos`.

### Warehouse
- **Responsabilidad:** operación física de bodega: recepciones contra OC, despachos contra reservas, devoluciones, traslados entre bodegas, ubicaciones internas.
- **Límites:** no decide qué comprar ni posee el kardex (Inventory lo proyecta).
- **Depende de:** Core, Identity, Organization, Configuration, Inventory (reservas), Purchasing (OC esperadas).
- **Publica:** `RecepcionRegistrada`, `DespachoRealizado`, `DevolucionRegistrada`. **Consume:** `OCAprobada`, `RepuestoSolicitado`.
- **Interfaz:** `RegistrarRecepcion`, `Despachar`, `ConsultarPendientes`.

---

## Capacidades

### Workflow
- **Responsabilidad:** ejecutar las máquinas de estados configuradas (ETS-005/04): transiciones, cadenas de aprobación, SLAs con calendarios, escalamientos; motor genérico al servicio de los módulos de dominio.
- **Límites:** no conoce la semántica del proceso (Work Orders sabe qué es una OT; Workflow sabe qué estado sigue).
- **Depende de:** Core, Identity (quién puede), Configuration (definiciones), Organization (calendarios).
- **Publica:** `TransicionEjecutada`, `AprobacionSolicitada/Otorgada/Rechazada`, `SLAEnRiesgo/Vencido`, `EscalamientoEjecutado`. **Consume:** eventos de dominio que disparan transiciones automáticas.
- **Interfaz:** `IniciarInstancia`, `Transicionar`, `Aprobar/Rechazar`, `ConsultarEstado`, `ColaDeAprobacion`.

### Rules
- **Responsabilidad:** el Rules Engine (ETS-005/05): evaluación de reglas por evento y calendario, idempotencia, anti-cascada, simulación contra historia, modo observación.
- **Límites:** solo emite **comandos** del catálogo cerrado de acciones; jamás toca datos.
- **Depende de:** Core, Configuration (reglas vigentes).
- **Publica:** `ReglaEjecutada/Fallida`. **Consume:** **todos** los eventos + calendario.
- **Interfaz:** `Simular(regla, periodo)`, `ConsultarEjecuciones`.

### Notifications
- **Responsabilidad:** el Notification Engine (ETS-005/06): matriz evento→destinatario→canal, plantillas, digest, deduplicación, colapso, acuses, trazas de entrega; adaptadores de canal (push, correo, WhatsApp, SMS, Teams) detrás de una interfaz común.
- **Límites:** no decide qué es notificable (eventos/reglas/workflows lo declaran).
- **Depende de:** Core, Identity (resolución de destinatarios), Configuration, Integration (proveedores de canal).
- **Publica:** `NotificacionEnviada/Entregada/Leida/Acusada`. **Consume:** eventos suscritos por la matriz del tenant.
- **Interfaz:** `Notificar(evento)`, `MiBandeja`, `MarcarLeida/Acusar`.

### Files
- **Responsabilidad:** archivos y evidencias (`07_FILE_ARCHITECTURE.md`): almacenamiento, miniaturas, metadatos, versionado de documentos, URLs firmadas, retención.
- **Límites:** no interpreta contenido; el archivo pertenece a su hecho/entidad (el dueño es el módulo que lo referencia).
- **Depende de:** Core, Identity (autorización de acceso).
- **Publica:** `ArchivoAlmacenado/Versionado`. **Consume:** eventos de anonimización (supresión de datos personales).
- **Interfaz:** `SolicitarSubida`, `ObtenerAccesoFirmado`, `VersionarDocumento`.

### Search
- **Responsabilidad:** índice global (ETS-006/12): entidades indexadas por eventos, sinónimos del diccionario del tenant, permisos precalculados, histórico marcado.
- **Límites:** no es fuente de nada; se reconstruye por replay.
- **Depende de:** Core, Identity. **Publica:** — **Consume:** eventos de todas las entidades indexables.
- **Interfaz:** `Buscar(texto, contexto)`, `Sugerir`.

### Reporting
- **Responsabilidad:** reportes y exportaciones como documentos emitidos (ETS-006/12): generación al corte con branding del tenant, programados (vía Notifications), expedientes PDF.
- **Límites:** no inventa números: lee read models/marts con linaje.
- **Depende de:** Core, Identity, Configuration (branding/plantillas), Files (persistir emitidos), Analytics (datos).
- **Publica:** `ReporteEmitido`. **Consume:** — (bajo demanda/programado).
- **Interfaz:** `EmitirReporte`, `ProgramarReporte`, `ConsultarEmitidos`.

### Analytics
- **Responsabilidad:** Motor de Indicadores y Costos como proyecciones (ETS-003 BC-08/09; ETS-006/05): KPIs canónicos, vistas materializadas, snapshots, marts para BI, consolidación de costos imputados en origen.
- **Límites:** jamás fuente; fórmulas canónicas Core (el tenant parametriza metas/umbrales).
- **Depende de:** Core, Identity, Configuration (metas, dashboards).
- **Publica:** `SnapshotTomado`, `UmbralKPISuperado`. **Consume:** todos los eventos con valor analítico.
- **Interfaz:** `ConsultarKPI`, `ConsultarWidget(dashboard)`, `DrillDown(kpi)`, `ExponerMart`.

### AI
- **Responsabilidad:** capacidades de IA gobernadas (ETS-005/11, `09_AI_ARCHITECTURE.md`): asistente, diagnóstico, sugerencias, anomalías; contexto por entidad, alcance del asistido, trazabilidad de sugerencias.
- **Límites:** **cero escritura**; solo lee read models permitidos y emite sugerencias.
- **Depende de:** Core, Identity (alcance), Configuration (capacidades/modelos), Analytics/read models (contexto).
- **Publica:** `SugerenciaGenerada/Aceptada/Descartada` (la aceptación la registra el humano). **Consume:** eventos según capacidad (para vigilancia).
- **Interfaz:** `Preguntar`, `SugerirDiagnostico`, `ConsultarSugerencias`.

---

## Borde

### Mobile
- **Responsabilidad:** contrato de sincronización offline (`06_OFFLINE_TECHNICAL.md`): paquetes de alcance, delta-sync, recepción idempotente de bitácoras, reconciliación de identidades provisionales, versionado de protocolo.
- **Límites:** no contiene lógica de negocio: traduce la bitácora a comandos de los módulos.
- **Depende de:** Core, Identity, Configuration (paquetes), y los contratos de comandos de dominio.
- **Publica:** `DispositivoSincronizado`. **Consume:** eventos del alcance del usuario (para armar deltas).
- **Interfaz:** `DescargarPaquete`, `SincronizarBitacora`, `ConsultarEstadoSync`.

### Integration
- **Responsabilidad:** el Integration Engine (ETS-005/10, `08_INTEGRATION_ARCHITECTURE.md`): API pública, webhooks salientes firmados, conectores (ERP, M365, Power BI), ingesta IoT/telemetría, cuentas de servicio, mapeos declarativos, **anti-corruption layer** por conector.
- **Límites:** nada entra saltándose el dominio: todo se traduce a comandos estándar.
- **Depende de:** Core, Identity (cuentas de servicio), Configuration (mapeos), contratos de dominio.
- **Publica:** `IntegracionEjecutada/Fallida`, `WebhookEntregado`. **Consume:** eventos suscritos por webhooks/conectores.
- **Interfaz:** API pública versionada; `RegistrarSuscripcion`, `ConsultarTrazas`.
