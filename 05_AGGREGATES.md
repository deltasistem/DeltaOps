# 05_AGGREGATES.md

> **DeltaOps — ETS-003 · v1.0** · Aggregate Roots: límites de consistencia del dominio.
> Un Aggregate Root es la única puerta de entrada a su conjunto de objetos: garantiza los invariantes internos y emite los eventos. Todo lo externo lo referencia **solo por identidad**.
> Documento de diseño. No implementa nada.

---

## BC-01 · Organización

### AR-01 Empresa
- **Contiene:** Sedes, configuración base (moneda/idioma por defecto).
- **Invariantes:** identificador tributario único; no se desactiva con operaciones activas.
- **Eventos:** EmpresaCreada/Modificada/Desactivada, SedeCreada/Modificada/Desactivada.

### AR-02 Operación
- **Contiene:** vigencia, tipo (fertilizantes, carbón, portuaria, industrial…).
- **Invariantes:** pertenece a una sede/empresa; no se cierra con proyectos activos.

### AR-03 Proyecto
- **Contiene:** vigencia, presupuesto asociado (referencia).
- **Invariantes:** pertenece a una operación; al finalizar exige reasignación de activos vigentes.

### AR-04 CentroDeCosto
- **Contiene:** jerarquía interna (padre/hijos), vigencia.
- **Invariantes:** código único por empresa; sin ciclos en la jerarquía; no se cierra con asignaciones de activos vigentes sin reasignar.

### AR-05 Ubicación
- **Contiene:** jerarquía física/lógica (planta → área → zona…).
- **Invariantes:** sin ciclos; pertenece a una empresa/sede.

## BC-02 · Seguridad

### AR-06 Usuario
- **Contiene:** credencial (referencia), membresías organizacionales, contexto activo, preferencias.
- **Invariantes:** correo único; solo opera dentro de organizaciones donde tiene membresía vigente; denegado por defecto.
- **Eventos:** UsuarioCreado/Desactivado, UsuarioAsignadoAOrganizacion, ContextoActivoCambiado.

### AR-07 Rol
- **Contiene:** conjunto de permisos (módulo → pantalla → acción).
- **Invariantes:** los permisos concedidos existen en el catálogo de acciones; cambios siempre auditados.

## BC-03 · Activos

### AR-08 Activo ⭐ (agregado central del negocio)
- **Contiene:** identificación, atributos dinámicos por tipo, **Asignaciones (historial completo)**, Componentes, combustibles asociados, documentos (referencias), estado del ciclo de vida.
- **Invariantes:**
  - Código único por tenant.
  - **A lo sumo una asignación vigente por dimensión** (organizacional, ubicación, responsable); reasignar cierra la anterior.
  - Nunca pertenece permanentemente a nada (regla 6 de `04_PRINCIPIOS_SGMA.md`).
  - Los atributos respetan la definición del TipoDeActivo; ningún invariante depende del tipo en sí.
  - Componentes solo se instalan/retiran a través del Activo.
  - Solo consume combustibles asociados.
  - No se retira (baja) con OT abiertas.
- **Eventos:** ActivoCreado/Modificado/Asignado/Trasladado/Retirado, Componente*, Combustible*.
- **Nota:** la **Hoja de Vida no es un agregado**: es una proyección de los eventos del activo.

### AR-09 TipoDeActivo
- **Contiene:** definición de atributos dinámicos, categoría, requisitos (checklist obligatorio, medidores aplicables).
- **Invariantes:** no se elimina un tipo en uso; cambiar atributos no invalida activos existentes (versionado de definición).

### AR-10 Fabricante
- **Contiene:** sus Modelos.
- **Invariantes:** modelo único por fabricante; descontinuar un modelo no afecta activos existentes.

## BC-04 · Mantenimiento

### AR-11 OrdenDeTrabajo (OT) ⭐
- **Contiene:** folio, tipo (correctiva/preventiva/predictiva), origen (solicitud/plan/alerta), diagnóstico, causa raíz, solución, técnicos asignados (referencias), consumos de repuestos, horas hombre imputadas, costos incurridos, estados.
- **Invariantes:**
  - Folio único por tenant (Motor de Folios).
  - Siempre referencia un Activo existente y un contexto organizacional (heredado de la asignación vigente del activo al momento de crearla — queda congelado para trazabilidad de costos).
  - Transiciones válidas: Creada → Asignada → EnEjecución ⇄ Pausada → Cerrada; Cancelada solo antes de ejecutar; Reabierta solo con permiso, auditada.
  - No se cierra sin diagnóstico y solución registrados.
  - Consumos y costos solo se imputan mientras no esté cerrada.
- **Eventos:** OTCreada/Asignada/Iniciada/Pausada/Cerrada/Cancelada/Reabierta, Repuesto*, HorasHombre*, Costo*.

### AR-12 PlanPreventivo
- **Contiene:** disparadores (frecuencia de tiempo y/o uso), tareas, tolerancias, activos o criterios de aplicación.
- **Invariantes:** al menos un disparador; no genera OT duplicada por ventana; se suspende si el activo se retira.

### AR-13 SolicitudDeServicio
- **Contiene:** reporte de falla, origen (manual o hallazgo), prioridad, estado.
- **Invariantes:** solo se convierte en OT una vez; conserva el vínculo al hallazgo origen.

## BC-05 · Operación en Campo

### AR-14 PlantillaChecklist
- **Contiene:** versiones, secciones, ítems (criticidad, tipo de respuesta).
- **Invariantes:** las versiones publicadas son inmutables; toda inspección referencia una versión exacta.

### AR-15 InspeccionChecklist
- **Contiene:** respuestas, firma, resultado (apto/no apto), Hallazgos.
- **Invariantes:** inmutable una vez firmada; ítem crítico reprobado ⇒ resultado no apto; hallazgos solo nacen dentro de una inspección.

### AR-16 RegistroDeCombustible
- **Contiene:** tanqueo (cantidad, combustible, costo, lectura del medidor, proveedor opcional).
- **Invariantes:** combustible ∈ combustibles del activo; inmutable (correcciones por evento compensatorio).

### AR-17 RegistroHorasHombre
- **Invariantes:** referencia técnico y (activo u OT); rango horario válido; inmutable tras cierre del turno.

### AR-18 LecturaDeMedidor
- **Invariantes:** monotónica por activo y medidor (horómetro/km); retroceso exige justificación auditada (cambio de medidor).

## BC-06 · Inventario

### AR-19 Repuesto
- **Contiene:** identificación, unidad, mínimos/máximos por almacén, criticidad.
- **Invariantes:** código único por tenant; no se descontinúa con stock sin decisión explícita.

### AR-20 Almacén
- **Contiene:** Existencias por repuesto, reservas.
- **Invariantes:** el stock solo cambia por Movimientos; sin negativos (salvo política); las reservas no exceden el disponible.

### AR-21 Movimiento
- **Invariantes:** tipo ∈ {entrada, salida, traslado, ajuste}; traslado afecta dos almacenes atómicamente; inmutable; ajuste requiere permiso.

## BC-07 · Compras

### AR-22 Proveedor
- **Contiene:** contactos, calificaciones, categorías de suministro.
- **Invariantes:** identificación única por tenant; la calificación es histórica (nunca se sobrescribe).

### AR-23 OrdenDeCompra
- **Contiene:** folio, líneas, estados, recepciones (totales/parciales).
- **Invariantes:** no se recibe más de lo ordenado; recepción emite eventos hacia Inventario; aprobación previa al envío.

### AR-24 Contrato
- **Invariantes:** vigencia válida; alertas antes del vencimiento; renovación crea nueva vigencia (historial).

## BC-08 · Personas

### AR-25 Técnico
- **Contiene:** Competencias/certificaciones (con vencimiento), disponibilidad.
- **Invariantes:** no se asigna a OT que exija competencia vencida; baja no borra su historial.

## BC-09 · Costos

### AR-26 Presupuesto
- **Contiene:** partidas por periodo y nodo organizacional.
- **Invariantes:** moneda definida; excedente genera evento, nunca bloquea silenciosamente.

---

## Reglas generales de agregados

1. **Referencia por identidad:** ningún agregado contiene a otro agregado; solo lo referencia por ID.
2. **Una transacción, un agregado:** cada operación de negocio muta un solo agregado; la coordinación entre agregados ocurre vía Domain Events y Domain Services (excepción explícita: Movimiento de traslado, que es atómico por definición de negocio).
3. **Tenant scoping:** todo agregado pertenece a un contexto organizacional y es invisible fuera de él.
4. **Los eventos salen del agregado:** solo el aggregate root emite sus eventos.
5. **Las proyecciones no son agregados:** Hoja de Vida, Stock consolidado, Indicadores, Línea de Tiempo se derivan de eventos.
