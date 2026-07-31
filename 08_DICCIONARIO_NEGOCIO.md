# 08_DICCIONARIO_NEGOCIO.md

> **DeltaOps — ETS-003 · v1.0** · Diccionario de negocio: el **lenguaje ubicuo** de DeltaOps.
> Cada término tiene un significado único y obligatorio en conversaciones, documentos y contratos. Si un término significa otra cosa en un contexto específico, se anota.
> Documento de diseño. No implementa nada.

---

## Organización

| Término | Significado en DeltaOps |
|---|---|
| **Empresa** | Unidad legal raíz; el tenant. Todo dato pertenece a una empresa. |
| **Sede** | Planta o instalación física de una empresa. |
| **Operación** | Línea de negocio en una sede (fertilizantes, carbón, portuaria, industrial). No confundir con "Operación en Campo" (dominio de checklists/combustible). |
| **Proyecto** | Contrato o iniciativa con vigencia dentro de una operación. |
| **Centro de costo** | Unidad contable jerárquica a la que se imputan costos. Los activos nunca le pertenecen de forma permanente. |
| **Ubicación** | Lugar físico/lógico jerárquico donde puede estar un activo o almacén. |
| **Contexto organizacional** | Combinación empresa → … → ubicación en la que ocurre un hecho. |
| **Contexto activo** | Empresa/operación/proyecto seleccionado por el usuario; filtra todo lo que ve y hace. |
| **Tenant / scoping** | Aislamiento de datos por empresa: nadie ve datos fuera de sus membresías. |

## Activos

| Término | Significado |
|---|---|
| **Activo** | Bien físico gestionado, de cualquiera de los 17+ tipos. Modelo universal: nunca hay lógica por tipo. |
| **Tipo de activo** | Categoría parametrizable que define atributos dinámicos y requisitos. |
| **Atributo dinámico** | Dato definido por el tipo de activo (p. ej. capacidad, tonelaje), sin cambiar estructura. |
| **Componente** | Parte significativa de un activo (motor, bomba, llanta), con historial propio. |
| **Fabricante / Modelo** | Marca constructora y su referencia específica. |
| **Asignación** | Vínculo **con vigencia** entre un activo y un destino (nodo organizacional, ubicación o responsable). Única forma de pertenencia. NO se dice "el activo es de X centro". |
| **Traslado** | Cierre de la asignación vigente y apertura de una nueva. En Inventario, "traslado" es entre almacenes: son conceptos distintos. |
| **Responsable** | Persona con custodia vigente de un activo (asignación de responsable). |
| **Hoja de vida** | Proyección cronológica completa del activo: intervenciones, costos, combustible, horas, componentes, documentos. |
| **Baja / Retiro** | Fin del ciclo de vida del activo. Su historial permanece. |
| **No apto** | Resultado de checklist que bloquea la operación del activo. |

## Mantenimiento

| Término | Significado |
|---|---|
| **OT (Orden de Trabajo)** | Unidad de intervención sobre un activo. Única vía de ejecutar mantenimiento. |
| **Correctivo** | Mantenimiento por falla ocurrida. |
| **Preventivo** | Mantenimiento programado por tiempo o uso (horómetro/km). |
| **Predictivo** | Mantenimiento derivado de condición/indicadores/IA. |
| **Plan preventivo** | Programa con disparadores (frecuencia de tiempo/uso) que genera OTs. |
| **Solicitud de servicio** | Reporte de falla o necesidad; puede convertirse en OT una sola vez. |
| **Diagnóstico / Causa raíz / Solución** | Trilogía obligatoria para cerrar una OT. |
| **Folio** | Consecutivo único de negocio (OT-00001) por tenant y tipo de documento. |
| **Backlog** | OTs abiertas pendientes de ejecución. |
| **Preventivo vencido** | Plan cuya OT no se ejecutó dentro de la ventana de tolerancia. |

## Operación en campo

| Término | Significado |
|---|---|
| **Checklist preoperacional** | Inspección obligatoria antes de operar un activo. |
| **Plantilla** | Formulario versionado del checklist. Las versiones publicadas son inmutables. |
| **Inspección** | Ejecución firmada de una plantilla sobre un activo. |
| **Hallazgo** | Anomalía detectada en una inspección; puede escalar a solicitud → OT. |
| **Ítem crítico** | Pregunta del checklist cuya reprobación deja el activo no apto. |
| **Tanqueo** | Registro de carga de combustible/energía. Nunca se asume ACPM. |
| **Combustible** | Fuente de energía del activo: ACPM, gasolina, gas, GLP, GNV, eléctrico, biodiesel, hidrógeno, otros. Un activo puede usar varios. |
| **Rendimiento** | Consumo por unidad de uso (gal/h, km/gal, kWh/km). Siempre derivado, nunca digitado. |
| **Horómetro** | Horas acumuladas de operación de un activo. Lectura monotónica. |
| **Kilometraje** | Km acumulados. Lectura monotónica. |
| **Horas hombre** | Horas de trabajo de un técnico imputadas a un activo u OT. |
| **Lectura** | Captura fechada de un medidor (horómetro/km). |

## Inventario y compras

| Término | Significado |
|---|---|
| **Repuesto** | Ítem de inventario para mantenimiento. |
| **Almacén** | Bodega con existencias, ligada a una ubicación. |
| **Existencia / Stock** | Cantidad disponible de un repuesto en un almacén; solo cambia por movimientos. |
| **Movimiento** | Hecho inmutable: entrada, salida, traslado (atómico) o ajuste (auditado). |
| **Reserva** | Apartado de stock para una OT. |
| **Stock mínimo/máximo** | Umbrales por almacén que disparan alertas. |
| **Proveedor** | Tercero que suministra bienes/servicios; su calificación es histórica. |
| **Orden de compra** | Pedido formal aprobado a un proveedor. |
| **Recepción** | Ingreso (parcial/total) de una compra; genera entradas de inventario. |
| **Contrato** | Acuerdo con vigencia; su renovación crea nueva vigencia. |

## Personas y seguridad

| Término | Significado |
|---|---|
| **Usuario** | Persona con acceso al sistema. |
| **Técnico** | Persona que ejecuta mantenimiento u opera activos. Puede o no ser usuario. |
| **Competencia** | Certificación/habilidad con vencimiento; condiciona asignaciones a OT. |
| **Rol** | Conjunto nombrado de permisos, asignado por contexto. |
| **Permiso** | Autorización granular módulo → pantalla → acción. |
| **Membresía** | Pertenencia vigente de un usuario a una organización. |

## Medición y control

| Término | Significado |
|---|---|
| **MTTR** | Tiempo medio de reparación (calidad de la respuesta). |
| **MTBF** | Tiempo medio entre fallas (confiabilidad). |
| **Disponibilidad** | % del tiempo que el activo está apto para operar. |
| **Cumplimiento preventivo** | % de preventivos ejecutados a tiempo. |
| **Presupuesto** | Partidas planificadas por periodo y nodo organizacional. |
| **Indicador** | Métrica siempre calculada desde eventos, nunca digitada. |
| **Anomalía** | Comportamiento atípico detectado (consumo, costo, uso). |
| **Recomendación** | Propuesta de la IA; requiere decisión humana o regla explícita. |

## Trazabilidad

| Término | Significado |
|---|---|
| **Evento (de dominio)** | Hecho de negocio ocurrido, en pasado, inmutable. |
| **Auditoría** | Registro append-only de todo hecho: quién, qué, cuándo, dónde. |
| **Historial** | Secuencia completa de eventos de una entidad. Nada se sobrescribe. |
| **Línea de tiempo** | Vista cronológica del historial de una entidad. |
| **Vigencia** | Periodo (inicio, fin opcional) en el que una relación es válida. |
| **Proyección** | Estado "actual" derivado del historial (stock, hoja de vida, indicadores). |
| **Evento compensatorio** | Corrección de un error mediante un nuevo evento, nunca editando el original. |

---

## Frases prohibidas (violan el lenguaje ubicuo)

| ❌ No se dice | ✅ Se dice |
|---|---|
| "El activo es del centro de costo X" | "El activo está **asignado** al centro X desde \<fecha\>" |
| "Cámbiale la ubicación al activo" | "**Traslada** el activo (cierra y abre asignación)" |
| "Borra ese registro de combustible" | "Registra el **evento compensatorio**" |
| "Edita el stock" | "Registra un **movimiento** (o ajuste auditado)" |
| "El sistema de volquetas" | "Los activos de **tipo** volqueta" (no hay módulos por tipo) |
| "La IA creó una OT" | "La IA **propuso**; la OT la creó un usuario o una regla" |
