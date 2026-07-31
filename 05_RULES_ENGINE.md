# 05_RULES_ENGINE.md

> **DeltaOps — ETS-005 · v1.0** · Rules Engine: motor de reglas de automatización.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Automatizar el "cuando pase X, haz Y" del negocio **sin programar**: el tenant declara reglas sobre el catálogo de eventos de dominio (ETS-003) y el motor las ejecuta de forma trazable, priorizada y versionada.

Ejemplos canónicos:

| SI (evento + condición) | ENTONCES (acción) |
|---|---|
| `ChecklistRealizado` con ítem crítico fallido | Crear Solicitud de servicio, prioridad alta, con el hallazgo adjunto |
| `StockActualizado` bajo el mínimo del ítem | Crear necesidad de compra y notificar al comprador |
| Contrato a 30 días de vencer | Notificar al responsable y al comprador; escalar a 15 días |
| `LecturaRegistrada` alcanza umbral del plan | Generar OT preventiva (Motor de Preventivos) |
| `OTCerrada` con costo > presupuesto de la actividad | Notificar al coordinador y marcar para revisión |

## 2. Anatomía de una regla

```text
Regla (Objeto de Configuración: versionada, con vigencia, auditada)
 ├── DISPARADOR   un evento de dominio del catálogo (ETS-003) o un evento
 │                de calendario (vencimientos, periodicidades)
 ├── CONDICIONES  predicados declarativos sobre los datos del evento y su
 │                contexto (activo, ubicación, catálogos, umbrales) — Y/O componibles
 ├── ACCIONES     una o más, del catálogo cerrado de acciones
 ├── PRIORIDAD    orden de evaluación cuando varias reglas escuchan el mismo evento
 └── ÁMBITO       tenant / sede / operación / proyecto (herencia estándar)
```

### Disparadores
- **Eventos de dominio:** cualquier evento del catálogo ETS-003 (`ActivoAsignado`, `OTCerrada`, `CombustibleRegistrado`, …). El catálogo de eventos es Core; el tenant no inventa eventos, los escucha.
- **Eventos de tiempo:** fechas de vencimiento (contratos, documentos, certificaciones, garantías), periodicidades (cada lunes, cada fin de mes) y ausencias ("no hubo lectura del medidor en 7 días" — vigilancia de eslabones ciegos).

### Condiciones
- Declarativas, sobre: los datos del evento, la entidad afectada (tipo de activo, criticidad, atributos dinámicos), el contexto organizacional, valores de catálogo y umbrales configurados.
- Sin código: comparaciones, pertenencia a listas, rangos, existencia — componibles con Y/O y agrupación.

### Acciones (catálogo cerrado)
| Acción | Nota |
|---|---|
| Crear solicitud / OT / necesidad de compra | Nace en el estado inicial de su workflow, con origen trazable a la regla y al evento |
| Transicionar un workflow | Solo transiciones automáticas permitidas por el workflow |
| Notificar / escalar | Vía Notification Engine, a roles resueltos por contexto |
| Etiquetar / priorizar / marcar para revisión | Metadatos, nunca edición de hechos |
| Solicitar un formulario | Ej. inspección extraordinaria tras un evento |
| Encolar sugerencia de IA | La regla puede pedir a la IA que analice y proponga (la IA nunca ejecuta) |

**Lo que ninguna acción puede hacer (Core):** editar o borrar hechos, saltarse aprobaciones, aprobar en nombre de alguien, mover dinero/stock sin su proceso, ni encadenarse para lograrlo indirectamente.

## 3. Ejecución

- **Determinista y ordenada:** ante un evento, las reglas aplicables se evalúan por prioridad; el resultado no depende del azar.
- **Idempotente:** el mismo evento no ejecuta la misma regla dos veces (clave evento+regla).
- **Anti-tormenta:** el motor detecta cascadas (una regla crea algo que dispara otra que crea algo…) con un límite de profundidad configurado por la plataforma; al alcanzarlo, detiene la cadena y alerta al administrador.
- **Trazable:** cada ejecución registra evento origen → regla (y versión) → condiciones evaluadas → acciones tomadas. Todo objeto creado por regla muestra su origen ("creado por la regla R-014 a partir del checklist #4571").
- **Fallo explícito:** si una acción no puede ejecutarse, queda en una bandeja de errores del administrador; nunca falla en silencio.

## 4. Versionado y pruebas

- Ciclo estándar del Configuration Engine: borrador → validación → publicación versionada → retiro.
- **Simulación en ensayo:** antes de publicar, la regla puede correrse contra eventos históricos ("¿cuántas veces se habría disparado el mes pasado y qué habría hecho?") — el mejor antídoto contra reglas ruidosas.
- **Modo observación:** una regla puede publicarse en modo "solo registrar, no actuar" durante un periodo de calibración.
- Métricas por regla: disparos, acciones, errores, ruido (creaciones canceladas por humanos) — para depurar el reglamento del tenant.

## 5. Frontera

- El Rules Engine automatiza **reacciones**; no reemplaza a los motores de dominio (Preventivos, Inventario, Costos — ETS-003), que contienen la lógica nuclear. La regla conecta; el motor de dominio ejecuta.
- No hay scripts ni expresiones arbitrarias: si una condición o acción no existe en el vocabulario, es una petición de producto al fabricante, no un desarrollo del tenant.
