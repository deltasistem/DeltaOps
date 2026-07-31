# 06_MOBILE_FIRST.md

> **DeltaOps — ETS-004 · v1.0** · Experiencia móvil completa: offline, sincronización, GPS, fotografía, firma, QR, código de barras y NFC (preparado).
> Documento de diseño. No implementa nada.

---

## 1. Filosofía móvil

- **El campo primero:** los roles de mayor volumen (operador, técnico, supervisor, almacenista) trabajan en móvil; la app móvil no es una versión reducida sino la **experiencia principal** de sus flujos.
- **PWA instalable:** una sola aplicación web progresiva, instalable en Android/iOS, con sesión persistente y actualización silenciosa.
- **Diseño para condiciones reales:** sol directo (alto contraste), guantes (objetivos táctiles grandes), ruido (todo visual, nada dependiente de audio), una sola mano (acciones primarias en la zona del pulgar).

## 2. Operación offline / sin cobertura

**Principio:** ningún flujo de campo depende de la señal. Puertos, minas y zonas rurales son el escenario normal, no la excepción.

### Qué funciona offline (completo)
- Ejecutar checklist (plantillas precargadas por tipo de activo).
- Registrar tanqueo/carga eléctrica, lecturas de medidor, horas hombre.
- Ver y ejecutar OTs asignadas (descargadas al asignarse), registrar diagnóstico, fotos, horas.
- Reportar fallas/hallazgos.
- Consultar fichas y hoja de vida resumida de los activos del frente (precargadas).

### Qué requiere conexión
- Aprobaciones (compras, cierres), administración, dashboards en vivo, asistente IA (con respuestas degradadas: consultas locales básicas).

### Reglas offline
1. **Precarga inteligente:** al iniciar sesión con señal, la app descarga el paquete del usuario: sus activos, plantillas vigentes, OTs, catálogos y últimos valores (lecturas previas para validar monotonía offline).
2. **Todo registro local queda sellado** con fecha/hora del dispositivo, GPS y usuario; se marca visiblemente "pendiente de sincronizar".
3. **Validaciones locales:** las reglas críticas (combustible ∈ los del activo, lectura monotónica contra el último valor conocido, ítems obligatorios) se validan sin señal.
4. **Nada se pierde:** los datos pendientes sobreviven a cierres de la app y reinicios del dispositivo.

## 3. Sincronización

- **Automática y silenciosa:** al recuperar señal, la cola se sube en orden cronológico; el usuario ve el progreso (n pendientes → 0) sin tener que hacer nada.
- **Conflictos:** el modelo de eventos minimiza conflictos (los registros de campo son hechos nuevos, no ediciones). Si un hecho llega tarde (p. ej. una lectura anterior a otra ya registrada), el sistema lo acepta con su fecha real y recalcula proyecciones; los conflictos reales (dos checklists del mismo turno) se resuelven con regla de negocio y quedan trazados.
- **Indicador de estado permanente:** en línea / sin señal / n pendientes. La confianza del usuario depende de ver este estado siempre.
- **Sincronización parcial:** fotos pesadas pueden subir después (primero los datos, luego los adjuntos), configurable para redes lentas o por datos móviles.

## 4. GPS

- **Sellado de ubicación:** checklists, tanqueos, lecturas y cierres de OT en campo registran coordenadas y precisión (VO UbicacionGPS).
- **Uso razonable:** el GPS valida el contexto (¿el tanqueo ocurrió en el patio?), alimenta auditoría y permite mapas de flota; no se rastrea a las personas de forma continua.
- **Sin GPS disponible:** el registro procede y queda marcado "sin ubicación", visible en auditoría.

## 5. Fotografía

- **Cámara directa** en todo punto que acepte evidencia: ítems de checklist, hallazgos, diagnóstico/antes/después en OT, recepción de compras, surtidor en tanqueos.
- **Compresión automática** en el dispositivo (calidad suficiente para evidencia, tamaño apto para redes lentas).
- **Anotación mínima:** marcar/flechar sobre la foto para señalar el detalle.
- **Metadatos:** fecha, GPS, autor y entidad vinculada viajan con la foto; las evidencias son inmutables una vez sincronizadas.

## 6. Firma

- **Firma en pantalla** para inspecciones, entregas de turno, despachos y cierres que la política exija.
- La firma sella el documento (VO Firma: autor + fecha + medio) y lo vuelve **inmutable**.
- Preparado para doble firma (quien entrega / quien recibe) en despachos y entregas de activos.

## 7. Código QR

- **Cada activo tiene un QR** (y cada almacén/ubicación puede tenerlo): escanearlo abre el menú contextual del activo según el rol (operador: checklist/tanqueo/lectura; técnico: OTs del activo; supervisor: estado y reportes).
- El QR es el **método primario de identificación** en campo: elimina búsquedas y errores de digitación.
- Generación e impresión de etiquetas QR desde la ficha del activo (lote disponible).

## 8. Código de barras

- **Repuestos e inventario:** el escáner de barras acelera despachos, recepciones y conteos (el almacenista escanea en lugar de buscar).
- Compatible con lectores físicos (pistolas) además de la cámara del teléfono.

## 9. NFC (preparado)

- El modelo contempla **etiquetas NFC** como identificador alternativo del activo (útil con guantes, superficies sucias o poca luz donde el QR falla).
- Preparado significa: la identificación de activos es abstracta (QR, barras, NFC o búsqueda producen el mismo resultado); habilitar NFC no cambia ningún flujo.

## 10. Experiencia móvil por rol (resumen)

| Rol | Inicio móvil | Flujos móviles clave |
|---|---|---|
| Operador | Mi turno (activo habitual + pendientes) | Checklist, tanqueo, lecturas, reporte de falla |
| Técnico | Mis OTs de hoy | Ejecución completa de OT, horas, fotos, repuestos |
| Supervisor | Tablero del turno | Hallazgos, solicitudes, aprobación de horas |
| Almacenista | Cola de despachos/recepciones | Escaneo de movimientos, conteos |
| Jefe de taller | Kanban de OTs | Asignar, aprobar cierres |
| Gerente/Director | KPIs + aprobaciones | Aprobar compras/traslados, drill-down, asistente |
| Contratista | Mis OTs | Igual que técnico, restringido |

## 11. Reglas de la experiencia móvil

1. Ningún flujo de campo exige teclear lo que se puede escanear o prellenar.
2. Toda pantalla móvil crítica funciona con una mano y con guantes.
3. El estado de sincronización es visible siempre; la confianza es un requisito de diseño.
4. Las notificaciones push respetan el turno (no despertar al operador del turno día por eventos del turno noche).
5. La batería importa: GPS y cámara se usan por evento, no en continuo.
