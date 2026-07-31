# 11_CRITERIOS_USABILIDAD.md

> **DeltaOps — ETS-004 · v1.0** · Criterios de usabilidad: medibles, verificables y exigibles a cualquier implementación futura.
> Documento de diseño. No implementa nada.

---

## 1. Criterios de eficiencia (tiempo y esfuerzo)

| # | Criterio | Meta verificable |
|---|---|---|
| U-01 | Checklist preoperacional completo (plantilla típica de ~25 ítems) | ≤ 4 minutos, incluidas 2 fotos |
| U-02 | Registro de tanqueo | ≤ 60 segundos desde el escaneo del QR |
| U-03 | Registro de lectura de medidor | ≤ 20 segundos |
| U-04 | Reporte de falla desde el campo | ≤ 90 segundos con foto |
| U-05 | Cierre de OT (con datos ya capturados durante la ejecución) | ≤ 2 minutos |
| U-06 | Aprobación de una compra desde móvil | ≤ 2 toques desde la notificación |
| U-07 | Encontrar cualquier entidad por búsqueda global | ≤ 3 interacciones |
| U-08 | Tareas frecuentes | ≤ 3 niveles de navegación; diarias a ≤ 2 interacciones (ver presupuesto de clics en `05_UX_PRINCIPIOS.md`) |
| U-09 | Cambio de contexto organizacional | ≤ 2 clics, sin recarga, < 3 segundos |
| U-10 | Drill-down de un KPI al hecho origen | ≤ 3 clics |

## 2. Criterios de aprendizaje y adopción

| # | Criterio | Meta |
|---|---|---|
| U-11 | Un operador nuevo ejecuta su primer checklist sin capacitación formal | ≤ 10 minutos con la guía en pantalla |
| U-12 | Un técnico ejecuta su primera OT completa tras una inducción breve | ≤ 1 turno |
| U-13 | Terminología | 100 % alineada al lenguaje ubicuo (`08_DICCIONARIO_NEGOCIO.md`); cero jerga técnica de sistema en la interfaz |
| U-14 | Pantallas vacías | 100 % explican por qué están vacías y qué hacer (cero callejones sin salida) |
| U-15 | Mensajes de error | 100 % en lenguaje de negocio, con acción correctiva a la mano |

## 3. Criterios de confiabilidad percibida

| # | Criterio | Meta |
|---|---|---|
| U-16 | Pérdida de datos capturados offline | **Cero.** Sobreviven a cierre de app y reinicio del dispositivo |
| U-17 | Estado de sincronización visible | Siempre (en línea / sin señal / n pendientes) |
| U-18 | Feedback de toda acción | Confirmación visual < 1 segundo (aunque el proceso siga en fondo) |
| U-19 | Doble envío | Imposible: toda acción es idempotente ante doble toque |
| U-20 | Datos mostrados | Siempre con contexto y periodo visibles; nunca un número sin marco |

## 4. Criterios de campo (condiciones reales)

| # | Criterio | Meta |
|---|---|---|
| U-21 | Objetivos táctiles en flujos de campo | ≥ 48 px; operables con guantes |
| U-22 | Contraste | Legible bajo sol directo (modo alto contraste disponible) |
| U-23 | Uso con una mano | Acciones primarias en zona del pulgar en móvil |
| U-24 | Identificación de activos | Por escaneo en ≤ 2 segundos; la búsqueda manual es el plan B, nunca el camino principal |
| U-25 | Consumo de batería | GPS/cámara por evento, nunca en continuo |
| U-26 | Redes lentas | Flujos de campo utilizables en 3G; fotos suben en diferido |

## 5. Criterios de accesibilidad

| # | Criterio | Meta |
|---|---|---|
| U-27 | Contraste de texto | Cumplir WCAG 2.1 AA |
| U-28 | Tamaños de fuente | Escalables por preferencia del usuario sin romper la interfaz |
| U-29 | Estados no dependientes solo del color | Semáforos siempre con ícono/texto además del color |
| U-30 | Navegación por teclado | Completa en escritorio (bandejas y formularios) |
| U-31 | Idioma | Interfaz completa en el idioma del usuario (multiidioma preparado) |

## 6. Criterios de consistencia

| # | Criterio | Meta |
|---|---|---|
| U-32 | Un concepto, una palabra, un patrón | Asignar/trasladar/cerrar se ven y nombran igual en todos los módulos |
| U-33 | Filtros | Mismos patrones, orden y ubicación en todas las listas; persistentes y guardables |
| U-34 | Acciones destructivas/masivas | Siempre con previsualización del efecto y confirmación proporcional al riesgo |
| U-35 | Fechas, monedas y unidades | Formateadas según preferencia del usuario y política del tenant, en todo el sistema |

## 7. Criterios de valor (la experiencia cumple su promesa)

| # | Criterio | Meta |
|---|---|---|
| U-36 | Todo número navegable | 100 % de KPIs con drill-down al hecho origen |
| U-37 | Trazabilidad visible | Cadena hallazgo→solicitud→OT→costos recorrible en una línea de tiempo |
| U-38 | El que reporta se entera | El operador recibe el estado de sus reportes (cierre del ciclo de confianza) |
| U-39 | Prellenado | Ningún flujo exige digitar lo que el sistema ya sabe |
| U-40 | IA marcada | Toda sugerencia de IA distinguible de datos confirmados por humanos |

## 8. Cómo se verifica

1. **Pruebas de tarea cronometradas** con usuarios reales de cada rol (U-01 a U-12) antes de cada liberación mayor.
2. **Listas de chequeo de diseño** (U-13 a U-35) como criterio de aceptación de cada pantalla.
3. **Métricas en producción:** tiempos reales por flujo, tasa de sincronizaciones fallidas, uso de búsqueda vs. escaneo, adopción por rol.
4. **Los umbrales de esta tabla son contractuales:** una implementación que no los cumpla no está terminada.
