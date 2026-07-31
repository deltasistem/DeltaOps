# 05_ENDPOINT_CATALOG.md

> **DeltaOps — ETS-008 · v1.0** · Catálogo completo de la API pública, agrupado por módulo.
> Cada endpoint ejecuta exactamente un comando (`03`) o una consulta (`04`) — sin lógica propia.
> Documento de diseño. No implementa nada.

---

## 0. Convenciones del catálogo

- Base: `/api/v1`. **Versión:** todos nacen en v1 (regla N/N-1, `17_API_GOVERNANCE.md`).
- **Rate limit por clase** (los presupuestos concretos son configuración de plataforma, ETS-005): `A`=autenticación (estricto) · `C`=comando (moderado) · `L`=lectura (generoso) · `M`=masivo/sync/ingesta (por cola, absorción) · `X`=exportación/asíncrono (bajo, auditado).
- **Respuesta:** comandos → `201/200` con sobre estándar y representación resultante (`06`); consultas → `200` con página; asíncronos → `202` con recurso de operación.
- **Permisos y eventos:** los del comando/consulta asociado (no se repiten; se referencia el catálogo).

Formato: `MÉTODO ruta` — descripción — **Comando/Query** — clase de límite.

---

## 1. Autenticación y sesiones (Identity)

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /sesiones` | Iniciar sesión (credenciales o SSO) | Autenticar (`08`) | A |
| `POST /sesiones/refresco` | Rotar tokens | Refresco (`08`) | A |
| `DELETE /sesiones/actual` | Cerrar sesión | RevocarSesiones (propia) | A |
| `GET /sesiones` | Mis sesiones activas | consulta de sesiones | L |
| `DELETE /sesiones` | Cerrar todas mis sesiones | RevocarSesiones | A |
| `POST /usuarios` | Crear usuario | CrearUsuario | C |
| `GET /usuarios` · `GET /usuarios/{id}` | Usuarios del ámbito | consulta de usuarios | L |
| `POST /usuarios/{id}/membresias` | Otorgar membresía | OtorgarMembresia | C |
| `DELETE /usuarios/{id}/membresias/{idMembresia}` | Revocar membresía | RevocarMembresia | C |
| `POST /delegaciones` | Crear delegación | Delegar | C |
| `GET /permisos/efectivos` | Mis permisos en el contexto activo | consulta de permisos | L |

## 2. Organization

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `GET /organizacion/jerarquia` | Jerarquía del tenant (a fecha opcional) | ConsultarJerarquia | L |
| `POST /organizacion/nodos` | Crear nodo | CrearNodoOrganizacional | C |
| `PUT /organizacion/nodos/{id}` | Modificar nodo | ModificarNodoOrganizacional | C |
| `POST /organizacion/nodos/{id}/cierre` | Cerrar nodo | CerrarNodoOrganizacional | C |
| `GET /organizacion/calendarios` | Calendarios/turnos/festivos del contexto | consulta de calendarios | L |

## 3. Assets

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `GET /activos` | Listado/búsqueda | ConsultarActivos | L |
| `POST /activos` | Alta de activo | CrearActivo | C |
| `GET /activos/{id}` | Ficha completa (ETag) | ConsultarFichaActivo | L |
| `PUT /activos/{id}` | Actualizar ficha (If-Match) | ActualizarActivo | C |
| `GET /activos/{id}/hoja-vida` | Hoja de vida cronológica | ConsultarHojaVida | L |
| `POST /activos/{id}/asignaciones` | Asignar a contexto | AsignarActivo | C |
| `GET /activos/{id}/asignaciones` · `GET /asignaciones` | Historia de asignaciones | ConsultarAsignaciones | L |
| `POST /activos/{id}/traslado` | Trasladar | TrasladarActivo | C |
| `POST /activos/{id}/lecturas` | Registrar lectura de medidor | RegistrarLectura | C |
| `GET /activos/{id}/lecturas` | Serie de lecturas | ConsultarLecturas | L |
| `POST /lecturas/{id}/correccion` | Corregir lectura (compensatoria) | CorregirLectura | C |
| `POST /activos/{id}/componentes` | Instalar componente | InstalarComponente | C |
| `DELETE /activos/{id}/componentes/{idComp}` | Retirar componente | RetirarComponente | C |
| `GET /activos/{id}/componentes` | Componentes e historia | ConsultarComponentes | L |
| `POST /activos/{id}/baja` | Dar de baja | DarBajaActivo | C |

## 4. Maintenance

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /solicitudes` | Crear solicitud (UC-01) | CrearSolicitud | C |
| `GET /solicitudes` · `GET /solicitudes/{id}` | Bandeja / detalle | ConsultarSolicitudes | L |
| `POST /solicitudes/{id}/atencion` | Convertir a OT o rechazar | AtenderSolicitud | C |
| `POST /checklists` | Ejecutar checklist | EjecutarChecklist | C |
| `GET /checklists` · `GET /checklists/{id}` | Realizados / detalle por ítem | ConsultarChecklists | L |
| `GET /checklists/cumplimiento` | Cumplimiento esperado vs. real | ConsultarCumplimientoChecklists | L |
| `POST /hallazgos` | Hallazgo directo | RegistrarHallazgo | C |
| `GET /hallazgos` | Hallazgos | ConsultarHallazgos | L |
| `GET /planes-preventivos` | Planes y proyección | ConsultarPlanesPreventivos | L |
| `POST /planes-preventivos/{id}/programacion` | Generar OTs del plan | ProgramarPreventivos | C |
| `PUT /planes-preventivos/{id}/vinculacion` | Vincular activos al plan | ModificarPlanPreventivo | C |

## 5. Work Orders

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /ordenes-trabajo` | Crear OT | CrearOT | C |
| `GET /ordenes-trabajo` | Bandeja del ámbito | ConsultarOTs | L |
| `GET /ordenes-trabajo/{id}` | Expediente completo | ConsultarExpedienteOT | L |
| `GET /ordenes-trabajo/mias` | Bandeja del técnico | ConsultarMisOTs | L |
| `POST /ordenes-trabajo/{id}/asignacion` | Asignar técnico(s) | AsignarOT | C |
| `POST /ordenes-trabajo/{id}/transiciones` | Transición de estado | TransicionarOT | C |
| `POST /ordenes-trabajo/{id}/diagnosticos` | Registrar diagnóstico | RegistrarDiagnostico | C |
| `POST /ordenes-trabajo/{id}/horas` | Registrar horas | RegistrarHoras | C |
| `POST /ordenes-trabajo/{id}/repuestos` | Solicitar repuesto | SolicitarRepuesto | C |
| `POST /ordenes-trabajo/{id}/cierre` | Cerrar OT (UC-08) | CerrarOT | C |
| `POST /ordenes-trabajo/{id}/reapertura` | Reabrir con motivo | ReabrirOT | C |
| `POST /ordenes-trabajo/{id}/cancelacion` | Cancelar | CancelarOT | C |
| `GET /backlog` | Backlog priorizado | ConsultarBacklog | L |
| `GET /slas` | Estado de SLAs | ConsultarSLAs | L |

## 6. Inventory / Warehouse

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /items` · `PUT /items/{id}` | Maestro de ítems | CrearItem / ActualizarItem | C |
| `GET /inventario` | Existencias | ConsultarInventario | L |
| `GET /items/{id}/kardex` | Kardex | ConsultarKardex | L |
| `POST /reservas` | Reservar stock | ReservarStock | C |
| `GET /reservas` | Reservas vigentes | ConsultarReservas | L |
| `POST /ajustes-inventario` | Ajuste con motivo | RegistrarAjuste | C |
| `POST /conteos` | Registrar conteo | RegistrarConteo | C |
| `GET /conteos` | Ciclos y diferencias | ConsultarConteos | L |
| `POST /recepciones` | Recepción contra OC | RegistrarRecepcion | C |
| `POST /despachos` | Despacho contra reserva | Despachar | C |
| `POST /devoluciones` | Devolución de material | RegistrarDevolucion | C |
| `POST /traslados-stock` | Traslado entre bodegas | TrasladarStock | C |
| `GET /bodega/pendientes` | Bandeja operativa de bodega | ConsultarPendientesBodega | L |

## 7. Fuel & Energy

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /tanqueos` | Registrar tanqueo/carga (UC-04, incl. kWh) | RegistrarTanqueo | C |
| `POST /tanqueos/{id}/correccion` | Corrección compensatoria | CorregirTanqueo | C |
| `GET /consumos` | Consumos por dimensión | ConsultarConsumo | L |
| `GET /rendimientos` | Rendimientos vs. flota | ConsultarRendimientos | L |
| `POST /combustible/entradas` | Entrada a tanque propio | RegistrarEntradaCombustible | C |
| `GET /combustible/existencias` | Saldos y conciliación | ConsultarExistenciasCombustible | L |

## 8. Purchasing

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /necesidades` | Crear necesidad | CrearNecesidad | C |
| `GET /necesidades` | Bandeja de necesidades | ConsultarNecesidades | L |
| `POST /ordenes-compra` | Crear OC | CrearOC | C |
| `GET /ordenes-compra` · `GET /ordenes-compra/{id}` | OCs / detalle | ConsultarOCs | L |
| `POST /ordenes-compra/{id}/aprobacion` | Aprobar / rechazar (decisión en cuerpo) | AprobarOC / RechazarOC | C |
| `POST /proveedores` · `PUT /proveedores/{id}` | Alta/actualización | RegistrarProveedor | C |
| `GET /proveedores` | Proveedores con calificación | ConsultarProveedores | L |
| `POST /proveedores/{id}/calificaciones` | Calificar | CalificarProveedor | C |
| `POST /contratos` | Registrar contrato | RegistrarContrato | C |
| `GET /contratos` | Contratos y vencimientos | ConsultarContratos | L |

## 9. Workflow (transversal)

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `GET /aprobaciones/pendientes` | Mi cola de aprobación (todas las cadenas) | consulta de cola de aprobación | L |
| `POST /aprobaciones/{id}/decision` | Aprobar/rechazar con motivo | Aprobar / Rechazar | C |
| `POST /aprobaciones/{id}/reasignacion` | Reasignar pendiente | ReasignarAprobacion | C |

## 10. Configuration

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `GET /configuracion/vigente` | Configuración resuelta del contexto (con explicación) | ConsultarConfiguracionVigente | L |
| `POST /configuracion/borradores` | Crear borrador | CrearBorradorConfiguracion | C |
| `POST /configuracion/borradores/{id}/publicacion` | Publicar versión | PublicarConfiguracion | C |
| `POST /configuracion/versiones/{id}/retiro` | Retirar versión | RetirarConfiguracion | C |
| `POST /configuracion/importaciones` · `POST /configuracion/exportaciones` | Paquetes (asíncrono) | Importar/ExportarConfiguracion | X |

## 11. Notifications

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `GET /notificaciones` | Mi bandeja | ConsultarMisNotificaciones | L |
| `POST /notificaciones/{id}/lectura` · `POST /notificaciones/{id}/acuse` | Leer / acusar | MarcarLeida / Acusar | C |
| `PUT /notificaciones/preferencias` | Mis preferencias | ConfigurarPreferencias | C |

## 12. Files (detalle en `11_FILE_API.md`)

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /archivos/subidas` | Solicitar subida firmada | SolicitarSubida | C |
| `GET /archivos/{id}/acceso` | URL firmada de descarga | ObtenerAccesoFirmado | L |
| `GET /archivos/{id}/miniatura` | Miniatura firmada | — (derivado) | L |
| `POST /documentos/{id}/versiones` | Nueva versión de documento | VersionarDocumento | C |
| `GET /documentos/{id}/versiones` | Historial de versiones | consulta de versiones | L |

## 13. Mobile / Sync (detalle en `12_SYNC_API.md`)

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /sync/dispositivos` | Registrar dispositivo | RegistrarDispositivo | C |
| `GET /sync/paquete` | Descargar paquete de alcance (delta por cursor) | DescargarPaquete | M |
| `POST /sync/bitacora` | Entregar lote de comandos offline | SincronizarBitacora | M |
| `GET /sync/estado` | Estado de sincronización | ConsultarEstadoSync | L |

## 14. Integration

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /webhooks/suscripciones` · `DELETE /webhooks/suscripciones/{id}` | Gestionar suscripciones | CrearSuscripcionWebhook | C |
| `GET /webhooks/entregas` | Trazas de entrega | consulta de entregas | L |
| `POST /cuentas-servicio` · `DELETE /cuentas-servicio/{id}` | Cuentas de servicio | Crear/RevocarCuentaServicio | C |
| `POST /iot/telemetria` | Ingesta IoT por lote | IngestarTelemetria | M |
| `GET /integraciones/salud` | Panel de salud | ConsultarSaludIntegraciones | L |
| `POST /integraciones/bandeja/{id}/reproceso` | Reprocesar elemento | ReprocesarElemento | C |

## 15. AI (detalle en `14_AI_API.md`)

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `POST /ia/conversaciones` · `POST /ia/conversaciones/{id}/mensajes` | Preguntar al asistente | Preguntar | C |
| `GET /ia/sugerencias` | Sugerencias vigentes/históricas | ConsultarSugerenciasIA | L |
| `POST /ia/sugerencias/{id}/aceptacion` | Aceptar | AceptarSugerencia | C |
| `POST /ia/sugerencias/{id}/descarte` | Descartar | DescartarSugerencia | C |
| `POST /ia/retroalimentacion` | Valorar respuesta | EnviarRetroalimentacionIA | C |

## 16. Analytics / Reporting / Transversales

| Endpoint | Descripción | Contrato | Límite |
|---|---|---|---|
| `GET /dashboards/{id}` | Dashboard con widgets | ConsultarDashboard | L |
| `GET /indicadores` · `GET /indicadores/{kpi}/drill-down` | KPIs y drill-down | ConsultarIndicadores | L |
| `GET /costos` | Costos consolidados | ConsultarCostos | L |
| `GET /tendencias` | Series con snapshots | ConsultarTendencias | L |
| `GET /alertas-kpi` | Umbrales superados | ConsultarAlertasKPI | L |
| `POST /reportes/emisiones` | Emitir reporte (asíncrono → `202`) | EmitirReporte | X |
| `POST /reportes/programaciones` | Programar reporte | ProgramarReporte | C |
| `GET /reportes/emitidos` | Reportes emitidos (congelados) | consulta de emitidos | L |
| `POST /exportaciones` | Exportación masiva (asíncrona, auditada) | ExportarDatos | X |
| `GET /busqueda` | Búsqueda global | BuscarGlobal | L |
| `GET /auditoria/linea-tiempo` | Línea de tiempo de entidad | ConsultarLineaDeTiempo | L |
| `GET /operaciones/{id}` | Estado de operación asíncrona | ConsultarOperacion | L |

---

**Regla de cierre:** ningún endpoint existe fuera de este catálogo; agregar uno exige pasar `18_API_CHECKLIST.md` y actualizar este documento primero (contract-first, `17`).
