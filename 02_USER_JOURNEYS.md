# 02_USER_JOURNEYS.md

> **DeltaOps — ETS-004 · v1.0** · Recorridos de usuario (journeys): la experiencia día a día por rol, con momentos, emociones y puntos de fricción a eliminar.
> Documento de diseño. No implementa nada.

---

## Formato

Cada journey describe: **escenario → etapas (momento, acción, sistema, sentimiento objetivo) → momentos de la verdad → fricciones que la experiencia debe eliminar.**

---

## J-01 · Operador — Inicio de turno (móvil, 5:30 a. m., posiblemente sin señal)

**Escenario:** el operador llega al patio, debe verificar su volqueta antes de operar.

| Etapa | Acción del usuario | Respuesta del sistema | Sentimiento objetivo |
|---|---|---|---|
| Llegada | Abre la app (PWA, ya autenticado por sesión persistente) | Home móvil con "Mi turno": activo habitual + checklist pendiente | "Ya sabe qué vengo a hacer" |
| Identificación | Escanea el QR del activo | Carga la ficha y la plantilla correcta (por tipo de activo) — funciona **offline** | Cero digitación |
| Inspección | Recorre los ítems, marca, toma 2 fotos de un neumático | Guarda local; ítems críticos destacados | Rapidez, claridad |
| Hallazgo | Marca "fuga leve de aceite" con foto | Crea hallazgo vinculado, sugiere criticidad | "Reportar es fácil" |
| Firma | Firma en pantalla | Sella inspección (fecha, GPS, firma) | Formalidad sin papeleo |
| Resultado | Ve APTO con observación | Semáforo claro; si NO APTO, bloquea e informa a quién avisa | Certeza inmediata |
| Sincronización | Recupera señal a las 7:00 | Sube todo solo, notifica al supervisor el hallazgo | Confianza: nada se pierde |

**Momentos de la verdad:** escaneo QR instantáneo; funcionar sin señal; resultado inequívoco.
**Fricciones a eliminar:** logins repetidos, buscar el activo en listas, formularios largos, pérdida de datos sin cobertura.

## J-02 · Operador — Tanqueo a media jornada

Escanea QR → "Registrar tanqueo" (acción rápida) → selecciona combustible (solo los del activo; el eléctrico ve "carga kWh") → cantidad + costo (opcional según política) + lectura del odómetro/horómetro sugerida con el último valor → foto del surtidor (opcional) → listo en **< 60 segundos**. Si la lectura retrocede, la app exige justificación en el momento.

## J-03 · Técnico — Ejecutar una OT correctiva (móvil, taller)

| Etapa | Acción | Sistema | Sentimiento |
|---|---|---|---|
| Asignación | Recibe push "OT-00341 asignada, prioridad alta" | Mis OTs ordenadas por prioridad/SLA | Foco |
| Contexto | Abre la OT | Ve falla reportada, hallazgo origen con fotos, hoja de vida resumida (IA: "3.ª vez este año esta falla") | "Tengo toda la historia" |
| Inicio | Toca "Iniciar" | Cronómetro de MTTR corre; estado EnEjecución | |
| Diagnóstico | Dicta o escribe diagnóstico; IA sugiere causas raíz típicas para ese síntoma/modelo | Estructura diagnóstico → causa → solución | Menos tecleo |
| Repuestos | Solicita 2 filtros desde la OT | Ve stock del almacén cercano; genera reserva | Sin caminar al almacén "a ver si hay" |
| Espera | Pausa la OT "esperando repuesto" | El backlog refleja la causa de pausa | Honestidad del indicador |
| Ejecución | Recibe repuesto, ejecuta, toma fotos antes/después | Evidencias adjuntas a la OT | |
| Cierre | Registra horas (sugeridas por el cronómetro), solución, firma | Valida completitud; jefe de taller aprueba cierre | Cerrar toma 2 minutos, no 20 |

**Momentos de la verdad:** ver el historial del activo antes de tocar nada; stock visible desde la OT.
**Fricciones a eliminar:** OTs en papel, repuestos por WhatsApp, cierre masivo de OTs el viernes (datos falsos).

## J-04 · Supervisor — Control del turno (móvil/tablet, campo)

Inicia el día con el **tablero del turno**: X activos, checklists hechos/pendientes, no aptos en rojo. Un checklist rechazado le llega por push al instante → abre el hallazgo → crea solicitud de servicio con dos toques (la IA ya prellenó activo, hallazgo y criticidad) → sigue el estado hasta que taller la convierte en OT. Al cierre del turno valida horas hombre de su gente en una sola pantalla de aprobación masiva.

**Momento de la verdad:** enterarse de un activo no apto en segundos, no al final del día.

## J-05 · Planeador — Semana de programación (escritorio)

Lunes: revisa **cumplimiento preventivo** de la semana anterior y los vencidos → el sistema explica por qué se vencieron (sin repuesto, sin ventana del activo) → ajusta tolerancias/planes → abre el calendario de la próxima semana, donde ya están las OTs preventivas generadas por lecturas y frecuencias → balancea carga entre técnicos (vista de capacidad) → revisa alertas predictivas de IA, acepta dos (se crean OTs vinculadas a la alerta) y descarta una con motivo (la IA aprende).

**Fricciones a eliminar:** Excel paralelo de programación, planes que generan OTs duplicadas, lecturas faltantes silenciosas.

## J-06 · Jefe de Taller — Día de ejecución

Tablero Kanban de OTs (por estado) → asigna las nuevas según competencia vigente y carga → durante el día ve pausas por repuesto (top de causas) → aprueba cierres con evidencia completa; rechaza uno sin fotos (vuelve al técnico con motivo) → fin del día: MTTR y cerradas vs. planeadas.

## J-07 · Almacenista — Flujo de almacén

Mañana: cola de **reservas por despachar** (vienen de OTs) → despacha escaneando código de barras del repuesto → llega una recepción de compra: recibe contra la OC (parcial), el sistema genera las entradas → alerta de stock bajo de filtros → crea solicitud de compra con un toque → tarde: conteo cíclico sugerido por el sistema (los ítems de mayor rotación primero); una diferencia exige ajuste con motivo, que queda auditado.

## J-08 · Comprador — De la necesidad a la entrega

Bandeja de necesidades (stock bajo + solicitudes de repuesto no satisfechas) → agrupa por proveedor → crea OC → se va a aprobación (gerente si supera umbral) → aprobada: la envía → seguimiento con fechas prometidas; atraso dispara alerta → recepción registrada por almacén cierra el ciclo → califica al proveedor (entrega, calidad) → el ranking alimenta la próxima compra.

## J-09 · Director / Gerente — Lectura ejecutiva (10 minutos, cualquier dispositivo)

Abre el dashboard ejecutivo: 6 números grandes (disponibilidad, costo del mes vs. presupuesto, backlog, cumplimiento preventivo, activos no aptos hoy, compras pendientes de su aprobación) → drill-down de una desviación (costo del proyecto X) hasta las OTs que lo explican → aprueba 2 compras desde el móvil → pregunta al asistente: "¿por qué subió el costo de combustible de la flota de carbón?" y recibe la explicación con los tanqueos anómalos señalados.

**Momento de la verdad:** cada número del dashboard es navegable hasta el hecho que lo origina.

## J-10 · Administrador de Empresa — Onboarding de un proyecto nuevo

Crea proyecto y centros de costo (vigencias claras) → invita usuarios (roles por contexto) → el Motor de Asignaciones le lista los activos a trasladar desde el proyecto que termina → ejecuta el traslado masivo (cada activo cierra y abre asignación, todo con historial) → verifica en la línea de tiempo que el historial quedó íntegro.

## J-11 · Auditor — Rastreo de una trazabilidad

Elige una OT cerrada de la muestra → línea de tiempo completa: checklist → hallazgo → solicitud → OT → repuestos (movimientos) → horas → costos → cierre y aprobación → verifica firmas, fechas y GPS → exporta el expediente en un clic. Sin pedirle nada a nadie.

## J-12 · Contratista — OT tercerizada

Recibe invitación con acceso restringido y vigencia → solo ve sus OTs → ejecuta y documenta como un técnico → al vencer el contrato su acceso expira solo.

---

## Principios comunes de todos los journeys

1. **El sistema llega antes que el usuario:** lo pendiente aparece primero (mi turno, mis OTs, mi cola).
2. **Identificar por escaneo, no por búsqueda** (QR/código de barras; NFC preparado).
3. **Nada se pierde sin señal:** los flujos de campo son offline-first (`06_MOBILE_FIRST.md`).
4. **Todo número es navegable** hasta el evento que lo explica.
5. **La IA prellena y propone; el humano firma** (`08_IA_ASSISTANT.md`).
6. **Las esperas son visibles:** pausas, aprobaciones y bloqueos tienen dueño y edad.
