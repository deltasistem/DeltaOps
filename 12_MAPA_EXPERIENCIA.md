# 12_MAPA_EXPERIENCIA.md

> **DeltaOps — ETS-004 · v1.0** · Mapa de experiencia global: cómo se conectan roles, procesos, dispositivos y momentos en una sola vista de la plataforma.
> Cierra la serie ETS-004 integrando `01`–`11`.
> Documento de diseño. No implementa nada.

---

## 1. El ciclo de valor de DeltaOps (macro-proceso)

```text
        ┌────────────────────────────────────────────────────────────────────┐
        │                        ORGANIZAR (Admin)                           │
        │   empresa → sede → operación → proyecto → centro → ubicación       │
        └───────────────────────────────┬────────────────────────────────────┘
                                        ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │                    ASIGNAR ACTIVOS (Dirección)                     │
        │        asignaciones con vigencia + responsable + historial         │
        └───────────────────────────────┬────────────────────────────────────┘
                                        ▼
  OPERAR (Operador/Supervisor)  ──────────────────────►  MANTENER (Taller/Planeación)
  checklist · tanqueo · lecturas · horas · hallazgos      solicitudes · OTs · preventivos
        │                                                        │
        │              ABASTECER (Almacén/Compras)               │
        │        reservas · movimientos · OC · recepciones ◄─────┘
        ▼                                                        ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │            MEDIR Y DECIDIR (Gerencia/Planeación/IA)                │
        │     costos · indicadores · predicciones · aprobaciones             │
        └───────────────────────────────┬────────────────────────────────────┘
                                        ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │              RECORDARLO TODO (Auditoría — transversal)             │
        │        eventos · historial · líneas de tiempo · expedientes        │
        └────────────────────────────────────────────────────────────────────┘
```

Cada flecha del macro-proceso es un conjunto de Domain Events (ETS-003); cada caja tiene sus journeys (`02_USER_JOURNEYS.md`), casos de uso (`03_USE_CASES.md`) y flujos (`04_USER_FLOWS.md`).

## 2. Mapa rol × momento del día

| Momento | Operador | Supervisor | Técnico | Jefe Taller | Planeador | Almacén | Compras | Gerencia |
|---|---|---|---|---|---|---|---|---|
| Inicio de turno | Checklist (QR) | Tablero del turno | Mis OTs | Asignar OTs | Vencidos/alertas | Cola de despachos | Necesidades | Dashboard (10 min) |
| Media jornada | Tanqueo, lecturas | Hallazgos/solicitudes | Ejecución + repuestos | Resolver bloqueos | Ajustar planes | Recepciones | Seguimiento OC | Aprobaciones móviles |
| Fin de turno | Reportes propios | Aprobar horas en masa | Horas + cierre | Aprobar cierres | Programar semana | Conteo cíclico | Calificar proveedor | — |
| Semanal | — | Resumen del frente | Mis indicadores | MTTR/cerradas | Cumplimiento preventivo | Exactitud stock | Lead time | Resumen ejecutivo |

## 3. Mapa rol × dispositivo

| Rol | Dispositivo primario | Uso de escritorio |
|---|---|---|
| Operador, Técnico, Contratista | **Móvil (PWA, offline-first)** | No requerido |
| Supervisor, Almacenista | Móvil/tablet | Consultas y reportes |
| Jefe de Taller | Tablet/escritorio | Kanban y aprobaciones |
| Planeador, Comprador, Admin | **Escritorio** | Móvil solo consulta/alertas |
| Gerente, Director | Ambos por igual | Aprobaciones móviles + análisis en escritorio |
| Auditor, Consulta | Escritorio | Exportes |

## 4. Cadenas de experiencia (extremo a extremo)

1. **Cadena de la confianza operativa:** checklist → hallazgo → solicitud → OT → cierre → **el operador es notificado** de que su reporte se resolvió (U-38). La experiencia premia reportar.
2. **Cadena del abastecimiento:** consumo → stock bajo → necesidad → OC → aprobación → recepción → despacho de reservas pendientes. Cada eslabón notifica al siguiente responsable; nada depende de que alguien "se acuerde".
3. **Cadena de la confiabilidad:** lecturas → preventivos por uso → OTs a tiempo → MTBF sube → menos correctivos. La IA vigila los eslabones ciegos (lecturas faltantes, planes mal calibrados).
4. **Cadena del costo:** todo hecho (repuesto, hora, tanqueo, servicio) nace imputado a su OT/activo/centro vigente → los costos se consolidan solos → gerencia navega del peso al hecho.
5. **Cadena de la trazabilidad:** todo lo anterior queda en eventos → líneas de tiempo → el auditor reconstruye cualquier historia sin pedir nada a nadie.

## 5. Emociones objetivo por rol (síntesis de journeys)

| Rol | La experiencia debe hacerle sentir |
|---|---|
| Operador | "Reportar es fácil y sirve de algo" |
| Técnico | "Tengo toda la historia y las herramientas; cerrar bien toma 2 minutos" |
| Supervisor | "Me entero al instante, no al final del día" |
| Planeador | "La estrategia se cumple sola y veo dónde intervenir" |
| Almacenista | "Mi stock es exacto y nadie me culpa por sorpresas" |
| Comprador | "Nada se atasca en silencio" |
| Gerente | "Cada número tiene su porqué a tres clics" |
| Auditor | "La historia completa está ahí, intacta" |
| Todos | "El sistema trabaja para mí, no yo para el sistema" |

## 6. Índice de la serie ETS-004

| Doc | Contenido |
|---|---|
| `01_USER_PERSONAS.md` | 16 roles con objetivos, permisos, flujos, KPIs |
| `02_USER_JOURNEYS.md` | 12 recorridos con momentos de la verdad |
| `03_USE_CASES.md` | 28 casos de uso completos |
| `04_USER_FLOWS.md` | 15 diagramas de flujo |
| `05_UX_PRINCIPIOS.md` | Presupuesto de clics, acciones rápidas/masivas, atajos, búsquedas, filtros |
| `06_MOBILE_FIRST.md` | Offline, sincronización, GPS, foto, firma, QR, barras, NFC |
| `07_DASHBOARDS.md` | 9 dashboards por audiencia |
| `08_IA_ASSISTANT.md` | Límites y comportamiento del asistente |
| `09_NOTIFICACIONES.md` | Canales, catálogo, enrutamiento, escalamiento |
| `10_MATRIZ_PERMISOS.md` | Matriz rol × módulo con reglas SoD |
| `11_CRITERIOS_USABILIDAD.md` | 40 criterios medibles y contractuales |
| `12_MAPA_EXPERIENCIA.md` | Este documento — la vista integrada |
