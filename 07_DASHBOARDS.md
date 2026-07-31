# 07_DASHBOARDS.md

> **DeltaOps — ETS-004 · v1.0** · Dashboards por audiencia: Gerencia, Supervisor, Planeador, Técnico, Operador, Almacén, Compras, SST y Auditor.
> Regla universal: **todo número es navegable** hasta el hecho que lo explica; todo dashboard respeta el contexto organizacional activo y los permisos.
> Documento de diseño. No implementa nada.

---

## D-01 · Gerencia (ejecutivo)

- **Pregunta que responde:** ¿la operación es rentable y confiable, y qué requiere mi decisión hoy?
- **Contenido:**
  - 6 números grandes: disponibilidad global · costo del mes vs. presupuesto · backlog de OTs · cumplimiento preventivo · activos no aptos hoy · aprobaciones pendientes.
  - Tendencias (12 meses): costo total, disponibilidad, ratio preventivo/correctivo.
  - Top 10 activos por costo y por indisponibilidad.
  - Comparativo entre operaciones/proyectos.
- **Alertas destacadas:** presupuesto excedido, disponibilidad bajo umbral, compras esperando su firma.
- **Acciones desde el dashboard:** aprobar compras/traslados, exportar, preguntar al asistente.
- **Frecuencia de uso:** diaria, 5–10 minutos, frecuentemente móvil.

## D-02 · Supervisor (turno)

- **Pregunta:** ¿mis activos pueden operar ahora y qué novedades tengo?
- **Contenido:**
  - Semáforo del turno: activos aptos / con observaciones / no aptos / sin checklist.
  - Hallazgos abiertos por criticidad y edad.
  - Solicitudes creadas y su estado (¿ya son OT?).
  - Horas hombre del turno pendientes de aprobar.
  - Tanqueos y lecturas del turno (faltantes destacados).
- **Alertas:** checklist rechazado (tiempo real), hallazgo crítico, activo operando sin checklist.
- **Acciones:** escalar hallazgo, crear solicitud, aprobar horas en masa.
- **Dispositivo:** móvil/tablet en campo.

## D-03 · Planeador de mantenimiento

- **Pregunta:** ¿la estrategia preventiva se cumple y dónde debo intervenir?
- **Contenido:**
  - Cumplimiento preventivo (semana/mes) con causas de incumplidos.
  - Preventivos próximos (7/15/30 días) y vencidos.
  - MTBF y fallas recurrentes por activo/sistema.
  - Lecturas de medidor faltantes (activos "ciegos" para planes por uso).
  - Alertas predictivas de IA pendientes de decisión.
  - Capacidad: carga programada vs. disponible por técnico/semana.
- **Acciones:** ajustar planes, reprogramar, aceptar/descartar alertas predictivas.

## D-04 · Técnico (mi trabajo)

- **Pregunta:** ¿qué tengo que hacer hoy y en qué orden?
- **Contenido (móvil):**
  - Mis OTs de hoy ordenadas por prioridad/SLA, con estado.
  - Repuestos de mis OTs (reservado/despachado/pendiente).
  - Mis horas registradas de la semana.
  - Mis indicadores personales: cerradas, tiempo medio, retrabajos.
- **Alertas:** OT nueva, repuesto disponible, cierre rechazado con motivo.
- **Acciones:** iniciar/pausar/cerrar OT, registrar horas.

## D-05 · Operador (mi turno)

- **Pregunta:** ¿mi activo está apto y qué me falta registrar?
- **Contenido (móvil):**
  - Mi activo (habitual) y resultado del último checklist.
  - Pendientes del turno: checklist, lecturas.
  - Mis reportes: estado de mis hallazgos ("tu reporte ya es OT").
  - Rendimiento básico de mi activo (consumo reciente).
- **Alertas:** checklist pendiente, activo no apto, respuesta a su reporte.
- **Acciones:** checklist, tanqueo, lectura, reportar falla (las 4 acciones rápidas).

## D-06 · Almacén

- **Pregunta:** ¿qué debo despachar/recibir y mi stock es confiable?
- **Contenido:**
  - Cola de reservas por despachar (por prioridad de OT).
  - Recepciones esperadas (hoy/semana) y atrasadas.
  - Alertas de stock bajo mínimos, con sugerencia de compra.
  - Exactitud de inventario (últimos conteos) y próximos conteos cíclicos.
  - Valor del inventario y repuestos sin rotación.
- **Acciones:** despachar, recibir, iniciar conteo, generar solicitud de compra.

## D-07 · Compras

- **Pregunta:** ¿qué debo comprar, qué está atascado y cómo rinden mis proveedores?
- **Contenido:**
  - Necesidades abiertas (stock bajo + solicitudes sin stock) por antigüedad.
  - OCs por estado (borrador/aprobación/enviada/parcial) y atascadas.
  - Entregas atrasadas por proveedor.
  - Lead time de compra (tendencia) y cumplimiento de proveedores (ranking).
  - Contratos por vencer (30/60/90 días).
- **Acciones:** crear OC desde necesidad, escalar aprobación, calificar proveedor.

## D-08 · SST (seguridad y salud en el trabajo)

- **Pregunta:** ¿la operación es segura y las inspecciones se cumplen?
- **Contenido:**
  - % de checklists preoperacionales realizados (por frente/turno).
  - Activos operando sin checklist (incumplimiento crítico).
  - Hallazgos de seguridad por criticidad y tiempo de resolución.
  - Activos no aptos y reincidencia por ítem crítico.
  - Certificaciones/competencias por vencer (operadores y técnicos).
- **Alertas:** activo no apto operando (máxima severidad), ítem crítico recurrente.
- **Acciones:** exigir checklist, escalar hallazgos, exportar para entes de control.

## D-09 · Auditor

- **Pregunta:** ¿la trazabilidad es íntegra y qué eventos sensibles ocurrieron?
- **Contenido:**
  - Eventos sensibles del periodo: ajustes de inventario, OTs reabiertas, cambios de permisos, retrocesos de medidor justificados, accesos denegados.
  - Muestreo asistido (OTs cerradas, movimientos, compras).
  - Integridad documental: OTs cerradas sin evidencia, inspecciones sin firma (deberían ser cero).
  - Exportes generados (quién exportó qué).
- **Acciones:** abrir línea de tiempo, exportar expediente. **Solo lectura.**

---

## Reglas comunes de dashboards

1. **Drill-down universal:** número → dimensión → lista de hechos → hecho → línea de tiempo.
2. **Contexto y periodo visibles siempre**, cambiables sin salir del dashboard.
3. **Cada rol abre en su dashboard**; es su pantalla de inicio, no una sección aparte.
4. **Umbrales configurables por tenant** (Motor de Reglas): qué es "rojo" lo define cada empresa.
5. **Indicadores calculados, jamás digitados** (proyecciones de eventos, ETS-003).
6. **Exportables y programables:** cualquier dashboard puede enviarse por correo con periodicidad.
7. **Rendimiento:** un dashboard debe cargar con datos recientes sin bloquear la operación (lecturas desacopladas).
