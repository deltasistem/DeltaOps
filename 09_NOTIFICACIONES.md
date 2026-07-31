# 09_NOTIFICACIONES.md

> **DeltaOps — ETS-004 · v1.0** · Diseño completo del sistema de notificaciones: dentro del sistema, push, correo, WhatsApp (preparado) y SMS (preparado).
> Las notificaciones son reacciones a Domain Events (ETS-003); no contienen lógica de negocio.
> Documento de diseño. No implementa nada.

---

## 1. Canales

| Canal | Uso previsto | Estado |
|---|---|---|
| **Dentro del sistema** (bandeja + tiempo real) | Todo evento relevante para el usuario; historial completo | Diseñado |
| **Push (PWA)** | Urgencias y trabajo asignado en campo | Diseñado |
| **Correo** | Aprobaciones, resúmenes programados, invitaciones | Diseñado |
| **WhatsApp** | Alertas críticas y aprobaciones a usuarios poco conectados | **Preparado** |
| **SMS** | Fallback de alertas críticas en zonas sin datos | **Preparado** |

"Preparado" significa: el diseño trata los canales como salidas intercambiables de la misma notificación; habilitar WhatsApp/SMS no cambia ningún flujo, solo agrega una vía de entrega.

## 2. Principios

1. **Toda notificación es accionable o informativa, nunca ruido:** si no cambia lo que el usuario hará, no se envía.
2. **Accionables resuelven en línea:** aprobar/rechazar/asignar desde la notificación, sin abrir la pantalla completa (≤ 2 toques).
3. **Respetan el tenant y los permisos:** nadie es notificado de lo que no puede ver.
4. **Deduplicación y agrupación:** 12 alertas de stock bajo = 1 notificación agrupada, no 12.
5. **Respetan el turno y el descanso:** las push de campo siguen el horario del turno del usuario; lo no urgente espera.
6. **Trazables:** emisión y lectura quedan registradas (NotificacionEmitida/Leida).
7. **Idempotentes:** un mismo evento jamás genera la misma notificación dos veces.

## 3. Catálogo de notificaciones por evento

### Urgentes (push inmediata + bandeja; escalan si no se atienden)

| Evento | Destinatario | Acción en línea |
|---|---|---|
| ChecklistRechazado (activo no apto) | Supervisor del frente | Ver hallazgo / crear solicitud |
| HallazgoRegistrado crítico | Supervisor, SST | Escalar |
| ConsumoAnomaloDetectado | Supervisor, analista | Investigar |
| OTAsignada urgente | Técnico | Iniciar |
| PresupuestoExcedido | Gerente, director | Ver desglose |
| StockBajoDetectado (repuesto crítico) | Almacenista, comprador | Crear necesidad |
| IntentoDeAccesoDenegado reiterado | Admin de empresa | Ver auditoría |

### De trabajo (push + bandeja)

| Evento | Destinatario | Acción |
|---|---|---|
| OTAsignada / reprogramada | Técnico / contratista | Abrir OT |
| SolicitudDeServicioCreada | Coordinador | Aprobar / rechazar |
| OrdenDeCompraCreada (pendiente) | Aprobador según umbral | Aprobar / rechazar |
| RepuestoReservadoParaOT (disponible) | Técnico, almacenista | Despachar / recoger |
| RecepcionDeCompraRegistrada | Comprador | Ver recepción |
| CierreDeOT solicitado | Jefe de taller | Aprobar / rechazar |
| HallazgoEscaladoASolicitud / SolicitudConvertidaEnOT | Operador que reportó | Ver estado ("tu reporte avanza") |

### Preventivas y de vencimiento (bandeja + correo; anticipación configurable)

| Evento | Destinatario |
|---|---|
| MantenimientoPreventivoProgramado / PreventivoVencido | Planeador, jefe de taller |
| ContratoVencido / por vencer (30/60/90) | Comprador, admin |
| CompetenciaVencida / por vencer | Técnico, jefe de taller, SST |
| LecturaDeMedidorFaltante (activos ciegos) | Supervisor, planeador |
| Recepción de compra atrasada | Comprador |

### Resúmenes programados (correo)

- Resumen diario del turno (supervisor): checklists, hallazgos, horas pendientes.
- Resumen semanal ejecutivo (gerencia): KPIs, desviaciones, aprobaciones realizadas.
- Resumen de cumplimiento preventivo (planeador).
- Cualquier dashboard exportado con periodicidad (UC-23).

## 4. Reglas de enrutamiento y escalamiento

1. **Enrutamiento por rol y contexto**, no por persona: "el supervisor del frente X", resuelto al momento del evento (si cambia el supervisor, cambia el destinatario).
2. **Escalamiento configurable (Motor de Reglas):** una notificación urgente no atendida en N minutos escala al siguiente nivel (supervisor → coordinador → director) y cambia de canal (push → correo → WhatsApp/SMS cuando estén habilitados).
3. **Umbrales por tenant:** qué es "crítico", anticipaciones y tiempos de escalamiento los define cada empresa.
4. **Silencios legítimos:** vacaciones/ausencias redirigen al suplente definido; nunca a un agujero negro.

## 5. Preferencias del usuario

- Cada usuario configura canal por categoría (trabajo, alertas, resúmenes) dentro de los mínimos que su rol exige (un aprobador no puede apagar las de aprobación; puede elegir el canal).
- Horario de no molestar respetando urgencias definidas por el tenant.
- Idioma de las notificaciones = idioma del usuario.

## 6. La bandeja

- **Centro único:** todo lo notificado vive en la bandeja, agrupado por categoría, con estado (nueva/leída/atendida) y edad.
- **Acciones masivas:** marcar grupo como leído.
- **Toda notificación enlaza** a la entidad origen (deep link) y sobrevive al canal (lo enviado por push también está en bandeja).
- **Historial auditado:** qué se notificó, a quién, por dónde y cuándo se leyó.
