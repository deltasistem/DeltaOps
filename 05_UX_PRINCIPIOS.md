# 05_UX_PRINCIPIOS.md

> **DeltaOps — ETS-004 · v1.0** · Principios de experiencia de usuario: clics máximos, acciones rápidas y masivas, atajos, favoritos, recientes, búsquedas y filtros.
> Documento de diseño. No implementa nada.

---

## 1. Presupuesto de clics (máximos obligatorios)

| Acción | Máximo de interacciones desde el punto natural de partida |
|---|---|
| Ejecutar checklist (activo identificado por QR) | **1 toque** para iniciar (el QR ya identifica) |
| Registrar tanqueo | **≤ 4 toques + 2 campos** (combustible, cantidad; lectura prellenada) |
| Registrar lectura de medidor | ≤ 3 interacciones |
| Reportar una falla | ≤ 3 interacciones (activo prellenado si viene de QR/hallazgo) |
| Ver mis OTs del día (técnico) | **0 clics**: es su pantalla de inicio |
| Iniciar/pausar OT | 1 toque desde la OT |
| Solicitar un repuesto desde la OT | ≤ 4 interacciones |
| Aprobar una compra (móvil) | ≤ 2 toques desde la notificación |
| Cambiar de contexto | ≤ 2 clics desde cualquier pantalla |
| Llegar a cualquier entidad por búsqueda global | ≤ 3 interacciones (atajo + escribir + elegir) |
| Drill-down de KPI a hecho origen | ≤ 3 clics |
| Consultar hoja de vida desde el activo | 1 clic |

**Regla general:** ninguna tarea frecuente puede requerir más de **3 niveles de navegación**; si algo se usa a diario, debe estar a ≤ 2 interacciones o ser la pantalla inicial del rol.

## 2. Acciones rápidas

- **Por rol, en el inicio:** cada rol tiene 3–5 acciones rápidas fijas (operador: checklist/tanqueo/lectura/reportar falla; técnico: mis OTs/horas; almacenista: despacho/recepción; gerente: aprobaciones).
- **Por entidad:** toda ficha expone sus acciones dominantes arriba (activo: trasladar, hoja de vida, reportar falla; OT: iniciar, pausar, repuestos, cerrar).
- **Desde notificaciones:** las notificaciones accionables resuelven en línea (aprobar/rechazar, asignar) sin abrir la pantalla completa.
- **Desde el escáner:** el botón de escaneo QR es global en móvil; identificar un activo abre su menú de acciones contextual según el rol.

## 3. Acciones masivas

| Contexto | Acción masiva |
|---|---|
| Activos | Traslado masivo (mismo destino), exportación, asignación de plan preventivo |
| OTs | Asignación múltiple a técnico, repriorización, reprogramación |
| Horas hombre | Aprobación masiva del turno (supervisor) |
| Usuarios | Invitación por lote, asignación de rol a varios |
| Inventario | Conteo por lote con escáner, impresión de etiquetas |
| Notificaciones | Marcar todo como leído por grupo |

**Reglas:** selección múltiple con "seleccionar todos los filtrados"; previsualización del efecto ("34 activos se trasladarán a…") antes de confirmar; resultado con detalle de éxitos/fallos por ítem; todo lote queda auditado como acciones individuales.

## 4. Atajos

- **Escritorio:** paleta de comandos (`Ctrl/Cmd+K`) para ir a cualquier módulo, entidad o acción escribiendo; `/` enfoca la búsqueda; atajos de lista (j/k navegación, Enter abre) en bandejas de alto volumen (OTs, solicitudes).
- **Móvil:** gestos estándar (deslizar para acciones en listas: aprobar/posponer), long-press para selección múltiple, escáner accesible desde cualquier pantalla.
- **Deep links:** toda entidad tiene URL estable y compartible (una OT pegada en un chat abre exactamente esa OT, respetando permisos).

## 5. Favoritos

- Cualquier entidad o vista filtrada se puede marcar como favorita (un activo crítico, "OTs vencidas de mi taller", un dashboard).
- Los favoritos viven en el inicio del usuario y en la paleta de comandos.
- Se administran por usuario y contexto (mis favoritos de la operación carbón ≠ los de portuaria).

## 6. Recientes

- El sistema mantiene "recientes" por tipo: últimos activos vistos, últimas OTs, últimas búsquedas.
- El selector de cualquier campo de referencia (activo, repuesto, técnico) muestra primero **recientes + favoritos**, luego búsqueda.
- El operador ve primero "su activo habitual" (el del último checklist).

## 7. Búsquedas

- **Búsqueda global** (una sola caja): encuentra activos, OTs, repuestos, proveedores, usuarios y documentos por código, nombre, placa/serial o folio; respeta el contexto activo y los permisos.
- **Comprensión flexible:** tolera mayúsculas/tildes/errores menores; "OT 341" = "OT-00341".
- **Resultados agrupados por tipo**, con la acción principal en línea (abrir, ver hoja de vida).
- **Búsqueda por escaneo:** el QR/código de barras es una forma de búsqueda de primera clase.

## 8. Filtros

- **Consistentes en toda lista:** mismos patrones (estado, fecha, contexto organizacional, responsable, criticidad) en el mismo orden y lugar.
- **Persistentes:** cada lista recuerda los últimos filtros del usuario.
- **Guardables:** un conjunto de filtros se guarda como vista con nombre (y puede hacerse favorita o compartirse con el equipo).
- **Chips visibles:** los filtros activos se ven y se quitan con un toque; "limpiar todo" siempre disponible.
- **Filtro por jerarquía organizacional:** todo listado puede acotarse a cualquier nodo (operación → proyecto → centro) con un selector de árbol.

## 9. Principios rectores de toda la experiencia

1. **El inicio de cada rol es su trabajo pendiente**, no un menú.
2. **Identificar por escaneo antes que buscar; buscar antes que navegar.**
3. **Prellenar todo lo que el sistema ya sabe** (últimas lecturas, plantillas, vínculos de origen, propuestas de IA).
4. **Cero callejones sin salida:** toda pantalla vacía explica por qué está vacía y qué hacer al respecto.
5. **Confirmación proporcional al riesgo:** las acciones destructivas o masivas piden confirmación con resumen del efecto; las rutinarias no estorban.
6. **Feedback inmediato:** toda acción confirma visualmente su resultado y su estado de sincronización (enviado / pendiente de señal).
7. **Errores en lenguaje de negocio,** con la salida a la mano ("El destino ya no está vigente → elegir otro proyecto").
8. **Consistencia total:** un mismo concepto (asignar, trasladar, cerrar) se ve y se dice igual en todos los módulos (lenguaje ubicuo de `08_DICCIONARIO_NEGOCIO.md`).
9. **Accesibilidad de campo:** botones grandes, alto contraste bajo sol, uso con guantes, textos cortos; idioma y unidades según preferencia del usuario.
10. **Todo número navegable:** ningún indicador es un callejón; siempre se llega al hecho que lo explica.
