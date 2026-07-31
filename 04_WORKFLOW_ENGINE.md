# 04_WORKFLOW_ENGINE.md

> **DeltaOps — ETS-005 · v1.0** · Workflow Engine: motor configurable de procesos y aprobaciones.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Un solo motor gobierna el ciclo de vida configurable de cualquier proceso de negocio: **OTs, compras, contratos, solicitudes de servicio, documentos, movimientos de inventario, traslados de activos** y los que el tenant necesite. El tenant diseña estados, transiciones, aprobaciones, SLAs y escalamientos sin programar; el Core solo garantiza los invariantes (una OT cerrada no se edita; el cierre emite `OTCerrada`).

Un workflow es un Objeto de Configuración (ETS-005/02): versionado, con vigencia, validado, auditado y exportable. **Toda instancia en vuelo termina con la versión con la que empezó.**

## 2. Anatomía de un workflow

```text
Workflow (aplica a: tipo de proceso + ámbito, ej. "OT correctiva · Operación Norte")
 ├── Estados        (con tipo: inicial / intermedio / de aprobación / final)
 ├── Transiciones   (origen → destino, quién puede, con qué condiciones y efectos)
 ├── Aprobaciones   (cadenas, umbrales, delegación)
 ├── SLAs           (por estado y por proceso completo)
 └── Escalamientos  (qué pasa cuando el SLA se agota)
```

### Estados
- Definidos por el tenant sobre una **espina dorsal Core** por tipo de proceso: toda OT tiene conceptualmente inicio → ejecución → cierre; el tenant añade y nombra los intermedios (En diagnóstico, Esperando repuesto, En prueba).
- Cada estado declara: nombre (multiidioma), color/semáforo, si detiene el reloj del SLA (ej. "Esperando repuesto"), qué formularios exige (enlace al Dynamic Forms Engine) y qué roles ven/actúan.
- Estados **finales** son irreversibles salvo transición explícita de reapertura con permiso especial y motivo (auditada, vía evento compensatorio).

### Transiciones
- Declaran: **quién** (roles, en el contexto activo), **cuándo** (condiciones declarativas: campos completos, aprobaciones obtenidas, existencias reservadas), y **efectos** (emitir evento de dominio, exigir formulario, pedir firma, asignar responsable).
- Pueden ser manuales (botón), automáticas (todas las condiciones se cumplen) o disparadas por el Rules Engine.

## 3. Aprobaciones

- **Cadenas configurables:** secuenciales, paralelas (todos deben aprobar) o alternativas (uno de N).
- **Por umbral:** el monto/alcance decide la cadena (compra < X: coordinador; entre X y Y: director; > Y: gerencia). Los umbrales son configuración del tenant, en su moneda.
- **Resolución por rol y contexto**, nunca por persona nombrada: "el Director de la operación del activo", evaluado al momento de solicitar.
- **Delegación con vigencia:** vacaciones del aprobador → delegado explícito, auditado; jamás aprobaciones huérfanas.
- **SoD verificada por el motor:** el solicitante no puede aparecer en su propia cadena; el validador lo rechaza al publicar y el motor lo re-verifica al ejecutar.
- Aprobación desde móvil en ≤ 2 toques desde la notificación (ETS-004, U-06), siempre con el contexto mínimo para decidir.

## 4. SLAs

- Por **estado** ("En diagnóstico no debe superar 4 horas hábiles") y por **proceso completo** ("solicitud crítica resuelta en 24 h").
- Definidos sobre **calendarios configurables** del tenant (turnos, días hábiles, festivos por país — catálogo).
- Relojes visibles en bandejas y dashboards (verde/ámbar/rojo antes de vencer, no después).
- Los estados "en espera de terceros" pueden pausar el reloj, si el tenant así lo define — la pausa queda auditada.

## 5. Escalamientos

Cuando un SLA entra en ámbar o vence, el motor ejecuta la política configurada:

1. **Recordar** al responsable actual (Notification Engine).
2. **Escalar** al siguiente nivel jerárquico del contexto (configurable: a quién, tras cuánto tiempo, cuántos niveles).
3. **Reasignar** automáticamente si la política lo permite.
4. **Registrar** siempre: cada escalamiento es un evento auditado y un dato para indicadores (dónde se atasca el proceso).

## 6. Interacción con los demás motores

| Motor | Relación |
|---|---|
| Dynamic Forms | Un estado o transición puede exigir un formulario completo/firmado |
| Rules Engine | Reglas disparan transiciones ("checklist crítico → crear solicitud en estado inicial") y los workflows emiten eventos que las reglas escuchan |
| Notification | Cada transición/escalamiento notifica según el catálogo de eventos del tenant |
| Permisos | Toda acción de transición se evalúa contra el rol en el contexto activo |
| Auditoría | Cada transición es un evento con quién/cuándo/motivo; la línea de tiempo del proceso se reconstruye completa |

## 7. Validación y frontera

- El validador (ETS-005/02) rechaza: estados inalcanzables o sin salida, transiciones sin rol, cadenas con autoaprobación, ciclos de escalamiento, workflows sin estado final.
- El motor **no** permite código: condiciones y efectos son declarativos. Un proceso que "necesita lógica especial" indica una capacidad faltante del motor, que se pide al fabricante.
- Los invariantes Core prevalecen: ningún workflow puede omitir el evento de dominio canónico del proceso ni hacer editable un hecho cerrado.
