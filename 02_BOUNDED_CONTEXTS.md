# 02_BOUNDED_CONTEXTS.md

> **DeltaOps — ETS-003 · v1.0** · Contextos delimitados (Bounded Contexts) y mapa de contextos.
> Documento de diseño. No implementa nada.

---

## 1. Bounded Contexts

### BC-01 · Organización (Core estructural)
- **Propósito:** modelar la jerarquía viva empresa → sede → operación → proyecto → centro de costo → ubicación.
- **Aggregates:** Empresa, Operación, Proyecto, CentroDeCosto, Ubicación.
- **Lenguaje:** "contexto organizacional", "vigencia", "jerarquía".
- **Regla clave:** todo otro contexto referencia nodos organizacionales solo por identidad; nunca los modifica.

### BC-02 · Seguridad y Acceso
- **Propósito:** identidad, roles, permisos y contexto activo.
- **Aggregates:** Usuario, Rol.
- **Regla clave:** los permisos se evalúan siempre respecto a un contexto organizacional; mínimo privilegio.

### BC-03 · Activos (Core del negocio)
- **Propósito:** ciclo de vida del activo universal (17+ tipos), componentes, fabricante/modelo, combustibles y asignaciones con historial.
- **Aggregates:** Activo, TipoDeActivo, Fabricante (con sus Modelos).
- **Regla clave:** el Activo es el guardián de sus asignaciones; ninguna asignación se crea por fuera del agregado.

### BC-04 · Mantenimiento (Core del negocio)
- **Propósito:** correctivo, preventivo y predictivo; solicitudes de servicio; ejecución y cierre de OT.
- **Aggregates:** OrdenDeTrabajo, PlanPreventivo, SolicitudDeServicio.
- **Regla clave:** la OT es la única unidad de intervención; preventivo y predictivo terminan generando OT.

### BC-05 · Operación en Campo
- **Propósito:** checklists preoperacionales (plantillas + inspecciones), hallazgos, tanqueos de combustible, horas hombre, lecturas de horómetro/kilometraje.
- **Aggregates:** PlantillaChecklist, InspeccionChecklist, RegistroDeCombustible, RegistroHorasHombre, LecturaDeMedidor.
- **Regla clave:** todo registro de campo es un hecho fechado, firmado e inmutable; los hallazgos pueden derivar en solicitudes.

### BC-06 · Inventario
- **Propósito:** repuestos, almacenes, existencias y movimientos.
- **Aggregates:** Repuesto, Almacén (con Existencias), Movimiento.
- **Regla clave:** el stock nunca se edita: solo cambia por movimientos atómicos.

### BC-07 · Compras y Proveedores
- **Propósito:** proveedores, calificación, órdenes de compra y contratos.
- **Aggregates:** Proveedor, OrdenDeCompra, Contrato.
- **Regla clave:** una recepción de compra produce movimientos de inventario (evento, no acceso directo).

### BC-08 · Personas
- **Propósito:** técnicos, competencias/certificaciones y responsables de activos.
- **Aggregates:** Técnico.
- **Regla clave:** la asignación de un técnico a OT exige competencia vigente cuando la regla aplique.

### BC-09 · Costos e Indicadores
- **Propósito:** consolidar costos e indicadores (MTTR, MTBF, disponibilidad, cumplimiento) por activo/centro/proyecto/operación.
- **Aggregates:** —(contexto de proyección: consume eventos, no posee transacciones propias, salvo Presupuesto).
- **Regla clave:** solo lee eventos; jamás modifica los contextos origen.

### BC-10 · Analítica e IA
- **Propósito:** predicción de fallas, recomendaciones, detección de anomalías, asistente.
- **Regla clave:** propone, no dispone: sus salidas son sugerencias que el dominio convierte (o no) en OT/planes.

### BC-11 · Auditoría e Historial
- **Propósito:** registro inmutable de todo hecho, y líneas de tiempo por entidad.
- **Regla clave:** append-only; nadie edita ni borra.

### BC-12 · Notificaciones
- **Propósito:** enterar a las personas correctas de los hechos correctos por el canal correcto.
- **Regla clave:** reacciona a eventos; no contiene lógica de negocio.

### BC-13 · Configuración y Catálogos
- **Propósito:** catálogos maestros (estados, prioridades, unidades, combustibles), monedas, idiomas, parámetros.
- **Regla clave:** los demás contextos consumen catálogos por identidad; los valores no se "quema" en texto libre.

## 2. Context Map (relaciones entre contextos)

```text
                       ┌──────────────────────────────┐
                       │  BC-01 Organización (Core)   │◄─── Conformist: todos conforman su jerarquía
                       └──────────────┬───────────────┘
        BC-02 Seguridad ◄─────────────┤ (contexto activo = empresa/operación/proyecto)
                                      ▼
   ┌────────────┐   customer/supplier   ┌────────────────┐
   │ BC-03      │◄──────────────────────│ BC-04          │  (Mantenimiento consume Activo por ID;
   │ Activos    │───ActivoAsignado…────►│ Mantenimiento  │   Activos publica eventos)
   └─────┬──────┘                       └───────┬────────┘
         │  eventos                             │ OTCerrada, RepuestoConsumido
         ▼                                      ▼
   ┌────────────┐    HallazgoRegistrado  ┌────────────┐   RecepciónDeCompra
   │ BC-05      │───────────────────────►│ BC-06      │◄───────────────────┐
   │ Campo      │                        │ Inventario │                    │
   └────────────┘                        └────────────┘             ┌──────┴──────┐
                                                                    │ BC-07       │
   BC-08 Personas ──(Técnico por ID)──► BC-04                       │ Compras     │
                                                                    └─────────────┘
   Eventos de TODOS los contextos ──► BC-09 Costos/Indicadores ──► BC-10 Analítica/IA
                                  └─► BC-11 Auditoría/Historial
                                  └─► BC-12 Notificaciones
   BC-13 Catálogos ──(shared kernel de identidades de catálogo)──► todos
```

### Patrones de relación

| Relación | Patrón | Nota |
|---|---|---|
| Organización → todos | **Conformist** | Todos aceptan la jerarquía y el scoping tal cual |
| Activos ↔ Mantenimiento | **Customer/Supplier** | Mantenimiento es cliente del modelo de Activo |
| Campo → Mantenimiento | **Published Events** | Hallazgo → Solicitud → OT |
| Compras → Inventario | **Published Events** | Recepción genera movimientos |
| Todos → Auditoría / Notificaciones / Indicadores | **Event Subscriber** | Solo escuchan; nunca escriben de vuelta |
| Catálogos → todos | **Shared Kernel (mínimo)** | Solo identidades y valores de catálogo |
| IA → Mantenimiento | **Anticorruption Layer** | Las predicciones se traducen a conceptos del dominio (Solicitud/Plan), nunca entran crudas |

## 3. Reglas de frontera

1. Un contexto **nunca** lee ni escribe los datos internos de otro: se comunica por identidades, contratos y eventos.
2. Las dependencias apuntan hacia los contextos Core/genéricos (Organización, Seguridad, Auditoría, Catálogos); nunca al revés.
3. No hay dependencias circulares entre contextos; los ciclos aparentes se resuelven con eventos.
4. Cada contexto tiene su propio lenguaje; si un término significa distinto en dos contextos, se documenta en el glosario (p. ej. "Movimiento" en Inventario ≠ "Traslado" en Activos).
