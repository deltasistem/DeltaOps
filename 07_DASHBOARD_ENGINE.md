# 07_DASHBOARD_ENGINE.md

> **DeltaOps — ETS-005 · v1.0** · Dashboard Engine: dashboards configurables sin programación.
> Complementa `07_DASHBOARDS.md` (ETS-004): aquel definió los 9 dashboards base; este define el motor que permite construirlos y adaptarlos.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Que cada tenant, rol y usuario tenga los tableros que necesita **componiéndolos**, no encargándolos a desarrollo. Los 9 dashboards de ETS-004 (D-01…D-09) son **plantillas de plataforma** construidas con este mismo motor; el tenant las clona y ajusta, o crea los suyos.

## 2. Anatomía

```text
Dashboard (Objeto de Configuración: versionado, con ámbito y audiencia)
 ├── Audiencia: roles que lo ven (y para quiénes es el tablero por defecto)
 ├── Contexto: hereda el contexto organizacional activo del usuario
 ├── Filtros de página: periodo, sede/operación/proyecto, tipo de activo…
 └── Widgets (rejilla responsiva, orden y tamaño configurables)
      ├── KPI simple (valor + tendencia + semáforo por umbral)
      ├── Gráficos: línea, barras, torta/dona, pareto, área apilada
      ├── Tabla / ranking (top consumidores, OTs vencidas…)
      ├── Lista de trabajo (mis pendientes, cola de aprobación)
      ├── Semáforo / mapa de calor (flota, frentes)
      ├── Línea de tiempo de eventos
      └── Sugerencias de IA (si el módulo está activo — marcadas como IA)
```

## 3. KPIs: el catálogo, no la fórmula

- Los widgets se alimentan **exclusivamente del catálogo de indicadores** definido por el Motor de Indicadores (ETS-003, BC-09): MTBF, MTTR, disponibilidad, cumplimiento preventivo, costo por hora, consumo por combustible, exactitud de inventario, etc.
- El tenant configura **parámetros** del indicador (periodo, agrupación, metas y umbrales de semáforo), **no su fórmula**: las fórmulas son Core para que "disponibilidad" signifique lo mismo en toda la plataforma y entre tenants.
- Si un tenant necesita un indicador inexistente, es una petición de producto (o un indicador derivado simple: razón entre dos del catálogo, permitida de forma declarativa).

## 4. Reglas del motor

1. **Drill-down universal (Core):** todo número navega a su lista de hechos origen en ≤ 3 clics (ETS-004 U-10/U-36). Un widget sin camino al detalle no puede publicarse.
2. **Contexto siempre visible:** cada tablero muestra el ámbito y periodo aplicados; nunca un número sin marco (U-20).
3. **Permisos:** el widget respeta al usuario — el mismo tablero muestra a cada quien solo lo que su rol y contexto permiten; jamás agrega datos que el usuario no podría listar.
4. **Metas y semáforos** son del tenant (por sede/operación si quiere), con vigencia — cambiar la meta no reescribe el histórico del semáforo.
5. **Exportación** configurable por widget y tablero (imagen, datos, PDF programado por correo — vía Notification Engine), sujeta al permiso de exportar.

## 5. Capas de personalización

| Capa | Puede |
|---|---|
| Plataforma | Plantillas D-01…D-09, catálogo de widgets e indicadores |
| Tenant | Clonar/crear tableros, fijar el tablero por defecto por rol, metas y umbrales, tableros públicos del tenant |
| Usuario | Su tablero personal: agregar/quitar/reordenar widgets, filtros guardados, favoritos — sin exceder sus permisos |

## 6. Frontera

- El motor compone y presenta; **no calcula**: los números vienen de los motores de dominio (Indicadores, Costos) como proyecciones consistentes.
- Sin consultas libres a datos crudos desde widgets (eso es análisis/exportación con permisos, no dashboard).
