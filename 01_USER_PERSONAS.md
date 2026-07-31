# 01_USER_PERSONAS.md

> **DeltaOps — ETS-004 · v1.0** · Roles y personas de la plataforma.
> Para cada rol: **objetivos, responsabilidades, permisos, pantallas, flujos diarios, información crítica, alertas, KPIs y acciones permitidas.**
> El sistema permite **crear nuevos roles** combinando permisos (ver `10_MATRIZ_PERMISOS.md`).
> Documento de diseño. No implementa nada.

---

## Convenciones

- Los permisos se expresan a nivel módulo → pantalla → acción y siempre se evalúan **en el contexto organizacional activo** (BC-02).
- "Pantallas" refiere al mapa de `03_MAPA_NAVEGACION.md` (ETS-002), no a diseños visuales.
- Todo rol hereda las capacidades transversales: ver notificaciones, cambiar contexto (entre sus membresías), buscar, ver su perfil.

---

## 1. Administrador Global
- **Perfil:** administra la plataforma completa (todos los tenants). Rol de plataforma, no de negocio.
- **Objetivos:** disponibilidad, seguridad y correcto aprovisionamiento de empresas.
- **Responsabilidades:** crear empresas, administradores de empresa, catálogos globales, parámetros de plataforma; supervisar auditoría global.
- **Permisos:** totales sobre Organización (nivel empresa), Seguridad, Configuración y Auditoría de todos los tenants. **No participa** en la operación diaria de negocio.
- **Pantallas:** Organización, Seguridad, Configuración, Auditoría.
- **Flujo diario:** revisar salud/alertas de plataforma → atender solicitudes de nuevas empresas/usuarios → auditar accesos.
- **Información crítica:** intentos de acceso denegados, cambios de configuración, empresas activas.
- **Alertas:** anomalías de seguridad, fallas de sincronización, tenants sin actividad.
- **KPIs:** usuarios activos, tiempo de aprovisionamiento, incidentes de seguridad.
- **Acciones:** crear/desactivar empresas, crear administradores, editar catálogos globales, consultar auditoría.

## 2. Administrador de Empresa
- **Perfil:** dueño funcional de un tenant.
- **Objetivos:** que su empresa opere completa y ordenada en DeltaOps.
- **Responsabilidades:** estructura organizacional (sedes→ubicaciones), usuarios y roles de su empresa, catálogos y parámetros del tenant.
- **Permisos:** totales dentro de su empresa; nada fuera de ella.
- **Pantallas:** Organización, Seguridad, Configuración, Auditoría (de su empresa), dashboards.
- **Flujo diario:** gestionar usuarios/permisos → mantener estructura y catálogos → revisar auditoría y adopción.
- **Información crítica:** estructura vigente, usuarios activos, cambios recientes.
- **Alertas:** usuarios sin actividad, permisos inusuales, catálogos incompletos.
- **KPIs:** adopción por módulo, datos maestros completos, incidencias de acceso.
- **Acciones:** CRUD de estructura organizacional, usuarios, roles, catálogos, parámetros.

## 3. Gerente
- **Perfil:** máxima autoridad de negocio (empresa u operación). Consume información, no opera.
- **Objetivos:** rentabilidad, disponibilidad de flota/activos, control de costos.
- **Responsabilidades:** decisiones estratégicas; aprobaciones de alto monto.
- **Permisos:** lectura total de su alcance; aprobación de compras/presupuestos según umbral.
- **Pantallas:** Dashboard ejecutivo, Analítica (costos, indicadores), Compras (aprobaciones).
- **Flujo diario:** dashboard ejecutivo → desviaciones (costos, disponibilidad) → aprobar lo pendiente → pedir análisis al asistente IA.
- **Información crítica:** costo total, disponibilidad, presupuesto vs. real, top activos problemáticos.
- **Alertas:** presupuesto excedido, disponibilidad bajo umbral, compras esperando aprobación.
- **KPIs:** TCO, disponibilidad global, costo por operación/proyecto, cumplimiento preventivo.
- **Acciones:** aprobar/rechazar compras mayores, exportar reportes, consultar todo.

## 4. Director (de operación)
- **Perfil:** dirige una operación (fertilizantes, carbón, portuaria…).
- **Objetivos:** cumplir la promesa operativa de su operación con los activos disponibles.
- **Responsabilidades:** priorizar proyectos, autorizar traslados de activos entre proyectos, controlar costos de su operación.
- **Permisos:** lectura total de su operación; aprobación de traslados y compras según umbral.
- **Pantallas:** Dashboard, Activos (asignaciones), Analítica, Compras.
- **Flujo diario:** dashboard de operación → activos críticos/no aptos → autorizar traslados y reasignaciones → seguimiento de costos.
- **Información crítica:** activos por proyecto, disponibilidad, costos por centro.
- **Alertas:** activos no aptos, preventivos vencidos, traslados pendientes de aprobación.
- **KPIs:** disponibilidad por proyecto, costo por centro, utilización de activos.
- **Acciones:** aprobar traslados, aprobar compras (umbral), exportar.

## 5. Coordinador (de mantenimiento)
- **Perfil:** coordina el mantenimiento entre planeación y ejecución.
- **Objetivos:** backlog sano, recursos bien usados.
- **Responsabilidades:** aprobar solicitudes de servicio, priorizar OTs, coordinar contratistas.
- **Permisos:** gestión completa de Mantenimiento; lectura de Activos, Inventario, Personas.
- **Pantallas:** Mantenimiento (solicitudes, OTs, calendario), Dashboard.
- **Flujo diario:** bandeja de solicitudes → aprobar/priorizar → revisar backlog y OTs vencidas → coordinar recursos con jefe de taller.
- **Información crítica:** backlog, OTs vencidas, solicitudes pendientes, carga por técnico.
- **Alertas:** solicitud crítica nueva, OT sin asignar > X horas, preventivo vencido.
- **KPIs:** backlog, tiempo solicitud→OT, % OTs vencidas.
- **Acciones:** aprobar solicitudes, crear/priorizar/reasignar OTs, programar.

## 6. Supervisor
- **Perfil:** supervisa la operación diaria en campo de un frente/proyecto.
- **Objetivos:** que los activos operen y las novedades se atiendan ya.
- **Responsabilidades:** verificar checklists del turno, reportar fallas, validar horas hombre, custodiar activos asignados a su frente.
- **Permisos:** lectura de activos de su frente; crear solicitudes; validar registros de campo.
- **Pantallas:** Dashboard de campo, Operación (checklists, hallazgos), Activos (consulta), Solicitudes.
- **Flujo diario:** ver checklists del turno → activos no aptos → crear solicitudes → validar horas y consumos del turno.
- **Información crítica:** activos aptos/no aptos hoy, hallazgos abiertos, quién opera qué.
- **Alertas:** checklist rechazado, hallazgo crítico, activo sin checklist.
- **KPIs:** % checklists realizados, hallazgos abiertos, tiempo de reporte de falla.
- **Acciones:** crear solicitudes, validar registros, comentar hallazgos.

## 7. Jefe de Taller
- **Perfil:** dirige el taller y a los técnicos.
- **Objetivos:** ejecutar OTs con calidad y a tiempo.
- **Responsabilidades:** asignar técnicos a OTs, controlar la ejecución, validar cierres, pedir repuestos.
- **Permisos:** gestión de OTs (asignar, supervisar, validar cierre), solicitudes de repuestos; lectura de inventario y personas.
- **Pantallas:** Mantenimiento (OTs, calendario), Inventario (consulta/solicitud), Personas (disponibilidad).
- **Flujo diario:** tablero de OTs del día → asignar técnicos según competencia/carga → resolver bloqueos (repuestos) → validar cierres.
- **Información crítica:** OTs en ejecución, técnicos disponibles, repuestos pendientes.
- **Alertas:** OT pausada por repuesto, técnico sin OT, OT vencida.
- **KPIs:** MTTR, OTs cerradas/día, retrabajos.
- **Acciones:** asignar/reasignar técnicos, aprobar cierres, solicitar repuestos.

## 8. Planeador de Mantenimiento
- **Perfil:** diseña y programa la estrategia preventiva/predictiva.
- **Objetivos:** maximizar confiabilidad al mínimo costo.
- **Responsabilidades:** planes preventivos, programación semanal, análisis de fallas recurrentes, gestión de alertas predictivas.
- **Permisos:** gestión de planes y programación; lectura de todo mantenimiento, activos, lecturas e indicadores.
- **Pantallas:** Mantenimiento (planes, calendario, predictivo), Analítica, Activos (hoja de vida).
- **Flujo diario:** revisar cumplimiento y vencidos → ajustar planes → programar semana → analizar alertas predictivas y recomendaciones IA.
- **Información crítica:** cumplimiento preventivo, lecturas de medidores, MTBF por activo.
- **Alertas:** preventivo próximo/vencido, lectura faltante, alerta predictiva nueva.
- **KPIs:** cumplimiento preventivo, MTBF, ratio preventivo/correctivo.
- **Acciones:** crear/ajustar planes, programar, convertir alertas predictivas en OT.

## 9. Técnico (mecánico, electricista…)
- **Perfil:** ejecuta las OTs. Usuario móvil intensivo.
- **Objetivos:** ejecutar bien y rápido, con evidencia.
- **Responsabilidades:** diagnosticar, reparar, registrar repuestos/horas/fotos, cerrar su parte.
- **Permisos:** ver y ejecutar **sus** OTs; registrar consumos, horas, evidencias; sin acceso a costos globales.
- **Pantallas (móvil):** Mis OTs, detalle de OT, registro de horas, solicitud de repuestos.
- **Flujo diario:** mis OTs de hoy → iniciar → diagnóstico → repuestos → ejecución → horas + fotos → cerrar.
- **Información crítica:** OTs asignadas, historial del activo, repuestos disponibles.
- **Alertas:** nueva OT asignada, repuesto disponible para su OT, OT reprogramada.
- **KPIs (propios):** OTs cerradas, horas registradas, retrabajos.
- **Acciones:** iniciar/pausar/cerrar sus OTs, registrar diagnóstico/causa/solución, imputar repuestos y horas, adjuntar fotos.

## 10. Operador
- **Perfil:** opera un activo (conductor, operador de maquinaria). Usuario 100 % móvil.
- **Objetivos:** operar seguro con un activo apto.
- **Responsabilidades:** checklist preoperacional, reportar novedades, registrar tanqueos y lecturas.
- **Permisos:** checklist, combustible y lecturas de los activos que opera; consulta mínima del activo.
- **Pantallas (móvil):** Mi activo (QR), checklist, tanqueo, lecturas, mis reportes.
- **Flujo diario:** escanear QR del activo → checklist → firmar → operar → tanqueo/lecturas → reportar novedades.
- **Información crítica:** resultado del checklist, estado del activo, sus reportes.
- **Alertas:** checklist pendiente, activo no apto, hallazgo respondido.
- **KPIs (propios):** checklists a tiempo, hallazgos reportados, rendimiento del activo.
- **Acciones:** ejecutar checklist, firmar, registrar tanqueo/lectura, reportar falla.

## 11. Almacenista
- **Perfil:** custodia uno o más almacenes.
- **Objetivos:** stock exacto y entregas oportunas.
- **Responsabilidades:** entradas/salidas/traslados, reservas para OT, conteos, alertas de mínimos.
- **Permisos:** gestión de inventario en sus almacenes; lectura de OTs (para entregas) y compras (recepciones).
- **Pantallas:** Inventario (movimientos, existencias, reservas), Compras (recepciones).
- **Flujo diario:** despachar reservas de OTs → recibir compras → registrar movimientos → atender alertas de mínimos → conteos cíclicos.
- **Información crítica:** existencias, reservas pendientes, recepciones esperadas.
- **Alertas:** stock bajo, reserva pendiente de despacho, recepción llegada.
- **KPIs:** exactitud de inventario, tiempo de despacho, quiebres de stock.
- **Acciones:** registrar movimientos, despachar reservas, recibir compras, ejecutar conteos (ajuste con permiso).

## 12. Comprador
- **Perfil:** gestiona compras y proveedores.
- **Objetivos:** abastecer a tiempo al mejor costo.
- **Responsabilidades:** convertir necesidades en órdenes de compra, negociar, hacer seguimiento, calificar proveedores, administrar contratos.
- **Permisos:** gestión de Compras/Proveedores; lectura de inventario (mínimos) y solicitudes.
- **Pantallas:** Compras (OC, proveedores, contratos), Inventario (alertas).
- **Flujo diario:** necesidades (stock bajo + solicitudes) → cotizar/crear OC → enviar a aprobación → seguimiento de entregas → calificar.
- **Información crítica:** OCs abiertas, entregas atrasadas, contratos por vencer.
- **Alertas:** OC aprobada/rechazada, entrega atrasada, contrato por vencer.
- **KPIs:** lead time de compra, cumplimiento de proveedores, ahorro.
- **Acciones:** crear OC, enviar a aprobación, registrar seguimiento, calificar proveedores, gestionar contratos.

## 13. Contratista
- **Perfil:** técnico o empresa externa que ejecuta OTs específicas. Acceso restringido y temporal.
- **Objetivos:** ejecutar su OT y evidenciarla.
- **Permisos:** solo **sus** OTs asignadas; registrar avance, horas y evidencias; sin acceso a costos, inventario ni otros activos. Membresía con vigencia (vence al terminar el contrato).
- **Pantallas (móvil):** Mis OTs, detalle, evidencias.
- **Flujo diario:** igual al técnico, restringido a sus OTs.
- **Alertas:** OT asignada, OT reprogramada, vencimiento de su acceso.
- **KPIs:** cumplimiento, calidad (retrabajos).
- **Acciones:** ejecutar y documentar sus OTs.

## 14. Auditor
- **Perfil:** auditoría interna/externa. Solo lectura, alcance total.
- **Objetivos:** verificar trazabilidad e integridad.
- **Permisos:** lectura de todo (incluida auditoría y líneas de tiempo) en su alcance; **cero escritura**; su navegación también queda auditada.
- **Pantallas:** Auditoría, líneas de tiempo, hoja de vida, costos, indicadores, exportes.
- **Flujo diario:** definir muestra → seguir trazas (hallazgo→solicitud→OT→costos) → exportar evidencia.
- **Información crítica:** log de auditoría, historiales completos, ajustes de inventario, reaperturas de OT.
- **Alertas:** (configurables) eventos sensibles: ajustes, reaperturas, cambios de permisos.
- **KPIs:** hallazgos de auditoría, cobertura de revisión.
- **Acciones:** consultar y exportar. Nada más.

## 15. Consulta
- **Perfil:** rol genérico de solo lectura con alcance configurable (p. ej. cliente del proyecto, interventoría).
- **Permisos:** lectura de los módulos y nodos organizacionales que se le concedan.
- **Pantallas:** dashboards y consultas de su alcance.
- **Acciones:** consultar y exportar (si se le concede).

## 16. IA Assistant (rol de sistema)
- **Perfil:** actor no humano presente en toda la plataforma (ver `08_IA_ASSISTANT.md`).
- **Objetivos:** anticipar fallas, explicar datos, ahorrar clics.
- **Permisos:** lectura del tenant según el contexto del usuario al que asiste (nunca más que el usuario); **no ejecuta acciones de escritura por sí solo**: propone y prellena, el humano confirma.
- **Información crítica:** eventos históricos, indicadores, patrones.
- **Acciones:** responder consultas, generar alertas predictivas, proponer OTs/planes/compras, prellenar formularios, resumir hojas de vida.

---

## Creación de nuevos roles

1. Todo rol es un **conjunto nombrado de permisos** (ver `10_MATRIZ_PERMISOS.md`); los 16 anteriores son plantillas iniciales.
2. El Administrador de Empresa puede clonar un rol y ajustar permisos (siempre auditado).
3. Un usuario puede tener roles distintos en contextos distintos (técnico en una operación, supervisor en otra).
4. Regla de oro: **mínimo privilegio**; los roles nuevos parten de cero permisos, no de "todo menos…".
