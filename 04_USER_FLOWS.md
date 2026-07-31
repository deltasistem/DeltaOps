# 04_USER_FLOWS.md

> **DeltaOps — ETS-004 · v1.0** · Diagramas de flujo de usuario (todos los flujos operativos clave).
> Notación: flechas verticales para el camino feliz; ramas `├─` para decisiones/alternos.
> Documento de diseño. No implementa nada.

---

## F-01 · Operador: checklist preoperacional

```text
Operador
   ↓
Login (o sesión persistente)
   ↓
Selecciona empresa (si tiene varias)
   ↓
Selecciona operación
   ↓
Selecciona activo ──── escanea QR (recomendado) o busca
   ↓
Checklist (plantilla vigente por tipo de activo)
   ↓
Responde ítems ──┬─ ítem con foto obligatoria → cámara
                 └─ anomalía → registra Hallazgo (+foto)
   ↓
Firma
   ↓
Enviar (offline: se encola)
   ↓
Resultado ──┬─ APTO → operar
            ├─ APTO CON OBSERVACIONES → operar; hallazgos al supervisor
            └─ NO APTO → activo bloqueado + push al supervisor
```

## F-02 · Técnico (mecánico): ejecución de OT

```text
Técnico
   ↓
Push "OT asignada" → Mis OTs
   ↓
Abrir OT (falla, hallazgo origen, hoja de vida resumida)
   ↓
Iniciar
   ↓
Diagnóstico ──── IA sugiere causas típicas
   ↓
Causa raíz
   ↓
Repuestos ──┬─ hay stock → reserva → despacho → consumo en OT
            └─ sin stock → necesidad de compra → OT en pausa "espera repuesto"
   ↓
Ejecución
   ↓
Horas (cronómetro sugiere) 
   ↓
Fotos antes/después
   ↓
Cerrar ──┬─ completa → aprobación del jefe de taller → OT CERRADA
         └─ incompleta → sistema indica qué falta
```

## F-03 · Hallazgo → Solicitud → OT (trazabilidad completa)

```text
Checklist con hallazgo
   ↓
HallazgoRegistrado ──┬─ menor → seguimiento del supervisor → cierre directo
                     └─ relevante ↓
Supervisor: "Escalar a solicitud" (prellenado)
   ↓
Coordinador: bandeja de solicitudes ──┬─ rechaza (motivo) → fin, trazado
                                      └─ aprueba ↓
Convertir en OT (prellenada, vínculo al hallazgo)
   ↓
Flujo F-02
   ↓
OT cerrada → hallazgo cerrado → operador notificado ("tu reporte se resolvió")
```

## F-04 · Preventivo automático

```text
Plan preventivo (frecuencia tiempo/uso)
   ↓
Motor de Preventivos ← lecturas de medidor / calendario
   ↓
Ventana alcanzada ──┬─ genera OT preventiva → calendario del taller → F-02
                    └─ no ejecutada en tolerancia → PREVENTIVO VENCIDO
                                                        ↓
                                       alerta a planeador + indicador de cumplimiento
```

## F-05 · Tanqueo / carga de energía

```text
Operador
   ↓
Escanea QR del activo
   ↓
"Tanqueo" (acción rápida)
   ↓
Combustible (solo los del activo) ──┬─ líquido/gas → galones/m³ + costo
                                    └─ eléctrico → kWh (+% batería opcional)
   ↓
Lectura del medidor (prellenada) ──┬─ coherente → sigue
                                   └─ retrocede → justificación obligatoria
   ↓
Foto (opcional) → Confirmar (offline OK)
   ↓
Motor de Combustible: rendimiento ──┬─ normal → fin
                                    └─ anómalo → alerta a supervisor/analista
```

## F-06 · Solicitud de repuestos y despacho

```text
Técnico (desde OT) → busca repuesto (escáner/código)
   ↓
Disponibilidad por almacén ──┬─ hay stock → RESERVA
   │                         └─ sin stock → necesidad de compra (F-07)
   ↓
Almacenista: cola de reservas
   ↓
Despacho (escanea repuesto) → SalidaDeInventario → consumo imputado a la OT
```

## F-07 · Compra: necesidad → recepción

```text
Necesidades (stock bajo + solicitudes sin stock)
   ↓
Comprador agrupa por proveedor → crea OC (folio)
   ↓
Aprobación ──┬─ bajo umbral → aprueba coordinador/director
             └─ sobre umbral → gerente ──┬─ rechaza (motivo) → ajustar/cancelar
                                         └─ aprueba ↓
Enviar al proveedor → seguimiento ──── atraso → alerta
   ↓
Almacenista: recepción contra OC (parcial/total)
   ↓
Entradas de inventario → StockActualizado ──→ reservas pendientes se despachan
   ↓
Comprador califica al proveedor
```

## F-08 · Asignación / traslado de activo

```text
Director/Admin
   ↓
Activo → "Trasladar" (o "Asignar" si no tiene vigente)
   ↓
Destino (operación/proyecto/centro/ubicación/responsable) + motivo + fecha
   ↓
¿Requiere aprobación? ──┬─ sí → aprobador ──┬─ rechaza → fin trazado
                        │                   └─ aprueba ↓
                        └─ no ↓
Cierra asignación vigente + abre nueva (un solo acto)
   ↓
Historial actualizado → hoja de vida → costos futuros al nuevo contexto
```

## F-09 · Supervisor: turno diario

```text
Supervisor
   ↓
Tablero del turno (checklists hechos/pendientes/no aptos)
   ↓
Push: checklist rechazado ──→ abrir hallazgo → escalar a solicitud (F-03)
   ↓
Durante el turno: reportes de falla → solicitudes
   ↓
Fin de turno: aprobación masiva de horas hombre
```

## F-10 · Planeador: semana

```text
Planeador
   ↓
Cumplimiento preventivo (semana anterior) → causas de vencidos
   ↓
Ajustar planes/tolerancias
   ↓
Calendario próximo (OTs preventivas ya generadas)
   ↓
Balancear carga por técnico
   ↓
Alertas predictivas IA ──┬─ aceptar → OT predictiva (F-02)
                         └─ descartar (motivo) → IA aprende
```

## F-11 · Gerente: aprobación móvil

```text
Push "OC pendiente de aprobación"
   ↓
Resumen (proveedor, monto, presupuesto afectado)
   ↓
¿Duda? → drill-down a líneas / pregunta al asistente
   ↓
Aprobar / Rechazar (motivo) → notificación al comprador
```

## F-12 · Auditor: expediente de trazabilidad

```text
Auditor
   ↓
Selecciona OT cerrada (muestra)
   ↓
Línea de tiempo: checklist → hallazgo → solicitud → OT → movimientos → horas → costos → cierre
   ↓
Verifica firmas/fechas/GPS
   ↓
Exportar expediente (PDF)
```

## F-13 · Administración: usuario nuevo

```text
Admin de empresa
   ↓
Invitar usuario (correo)
   ↓
Membresías (organizaciones + vigencia)
   ↓
Roles por contexto
   ↓
Usuario acepta → primer login (UC-01) → contexto activo
```

## F-14 · Conteo de inventario

```text
Plan de conteo (cíclico: alta rotación primero)
   ↓
Almacenista cuenta (escáner)
   ↓
Diferencias ──┬─ no → fin
              └─ sí → ajuste (motivo + permiso) → auditado → StockActualizado
```

## F-15 · Consulta ejecutiva con drill-down

```text
Gerente/Director
   ↓
Dashboard (número fuera de rango)
   ↓
Clic en el número → dimensión (proyecto/centro/activo)
   ↓
Lista de hechos (OTs, tanqueos, movimientos)
   ↓
Hecho individual → línea de tiempo → decisión (aprobar, pedir análisis, crear tarea)
```

---

## Reglas comunes

1. Todo flujo móvil de campo funciona **offline** y sincroniza al recuperar señal.
2. Toda rama de rechazo/negación deja **traza con motivo**.
3. Los flujos convergen: hallazgos, preventivos y predicciones siempre terminan en el mismo flujo de OT (F-02).
4. Nada exige redigitar lo que el sistema ya sabe (QR, prellenados, vínculos origen).
