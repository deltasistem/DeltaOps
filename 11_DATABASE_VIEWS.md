# 11_DATABASE_VIEWS.md

> **DeltaOps — ETS-010 · v1.0** · Vistas de solo lectura (no materializadas): para qué se usan y para qué no.
> Documento de diseño. Sin SQL.

---

## 1. Papel de las vistas en DeltaOps

Las vistas nativas (`v_*`) son **fachadas de conveniencia sin costo de almacenamiento**, con tres usos oficiales y solo tres:

| Uso | Ejemplo |
|---|---|
| **Alias de conmutación** de tablas proyectadas (10 §3): la vista apunta a la versión vigente (`v_kpi_periodo_nodo` → `kpi_periodo_nodo_v2`) — consumidores estables, conmutación en una transacción | Todas las proyecciones con reconstrucción prevista |
| **Recortes de presentación** sobre read models: la vista "activos vigentes" (excluye bajas) sobre la ficha proyectada — el recorte declarado de ETS-009/11 §3 sin duplicar datos | `v_activo_vigente`, `v_ot_abierta` |
| **Fachadas de compatibilidad** durante migraciones expandir→contraer (19): la vista con la forma vieja sobre la estructura nueva mantiene N-1 leyendo mientras migra | Temporales, con fecha de retiro |

## 2. Reglas

1. **Solo lectura real:** ninguna vista es actualizable; la escritura va siempre por comandos del dominio (API First — nadie escribe "por la vista").
2. **Sin lógica de negocio:** una vista filtra, renombra y junta lo ya proyectado; jamás calcula KPIs ni resuelve cascadas de configuración (eso es de proyectores, con versión y prueba). Si una vista necesita agregación pesada, es señal de que falta una tabla proyectada (10).
3. **Sin cadenas de vistas:** vista sobre vista prohibido (opacidad de planes de ejecución); máximo un nivel sobre tablas.
4. **RLS se hereda:** las vistas operan con los mismos predicados de tenant que sus tablas base (invocador, no definidor — la vista jamás escala privilegios).
5. **Registradas:** toda vista consta en el diccionario (22) con uso (§1), dueño y consumidores; las de compatibilidad además con fecha de retiro.
6. Los roles de BI/reportes (01 §3) consumen **solo vistas y marts**, nunca tablas de la verdad: la vista es la superficie estable que permite reorganizar lo físico por debajo.

---

## Impacto sobre la implementación
Las vistas de alias nacen junto con cada tabla proyectada; los permisos de roles externos se conceden sobre vistas/marts, no sobre tablas; el lint (07) verifica el prefijo y el nivel único.

## ETS relacionados
ETS-010 (10 conmutación, 19 migraciones, 01 roles) · ETS-009 (11 recortes de presentación) · ETS-008 (17 estabilidad de contrato para consumidores externos).

## Riesgos
- Vistas que acumulan lógica de negocio con los años → regla §2 + revisión; la señal es una vista lenta.
- Vistas de compatibilidad que nadie retira → fecha de retiro obligatoria y telemetría de uso (19).

## Decisiones habilitadas
Conmutación de proyecciones sin tocar consumidores, permisos de solo-lectura externos, fachadas de migración.

## Decisiones bloqueadas hasta el siguiente ETS
Inventario definitivo de vistas (nace con las tablas que fachadan) y el DDL.
