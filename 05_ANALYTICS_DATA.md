# 05_ANALYTICS_DATA.md

> **DeltaOps — ETS-006 · v1.0** · Datos analíticos: lo que significan los hechos.
> Documento de diseño. No implementa nada.

---

## 1. Definición y regla de oro

El dominio analítico contiene todo dato **derivado** para responder preguntas: KPIs, read models, vistas materializadas, data marts y snapshots.

> **Regla de oro: lo analítico jamás es fuente.** Todo dato analítico es reconstruible desde maestros + hechos + configuración. Si discrepa de los eventos, está mal el derivado. Nadie captura, corrige ni aprueba nada "en la analítica".

## 2. Piezas del dominio

| Pieza | Qué es | Ejemplos |
|---|---|---|
| **KPIs canónicos** | Indicadores con fórmula Core (comparables entre tenants), parametrizados por el tenant (metas, umbrales, periodos) | MTBF, MTTR, disponibilidad, cumplimiento preventivo, costo/hora, consumo por combustible (kWh incluido), exactitud de inventario |
| **Read models operativos** | Proyecciones para pantallas y bandejas (→ `12_READ_MODELS.md`) | Hoja de Vida, Stock actual, "Mis OTs", cola de aprobaciones |
| **Vistas materializadas** | Agregaciones precalculadas que sostienen dashboards con frescura declarada | Consumo mensual por activo, costos por centro de costo |
| **Data marts** | Conjuntos curados por área para BI externo (Power BI) con permisos por conjunto | Mart de mantenimiento, de combustible, de compras, de costos |
| **Snapshots** | Fotos periódicas de estados que son proyección (para análisis histórico sin re-proyectar) | Stock a fin de mes, flota disponible por día, backlog semanal de OTs |

## 3. Reglas del dominio

1. **Fórmulas canónicas Core:** "disponibilidad" se calcula igual en toda la plataforma (ETS-005/07). Los tenants parametrizan, no redefinen. Indicadores derivados simples (razones entre canónicos) se declaran, con linaje.
2. **Frescura declarada y visible:** cada pieza analítica declara su latencia (tiempo real, minutos, diaria) y toda pantalla la muestra ("datos al corte de las 6:00") — U-20.
3. **Drill-down como contrato de datos:** todo agregado conserva el camino a sus hechos origen (≤ 3 clics, U-36). Un mart sin linaje al detalle no se publica.
4. **Dimensiones con historia:** los análisis usan la estructura organizacional y los maestros **vigentes en la época del hecho**; reagrupar con la estructura actual es una opción explícita, nunca el default silencioso.
5. **Permisos heredados:** ninguna pieza analítica revela lo que el usuario no podría listar en detalle; los marts para BI llevan los permisos por conjunto de datos y por ámbito.
6. **Snapshots inmutables:** una vez tomada, la foto de fin de mes no cambia — si se detecta un error de proyección, se corrige la proyección y se toma un snapshot de corrección, ambos visibles.
7. **Reconstruible por diseño:** cualquier proyección/mart puede regenerarse desde los eventos (replay); la reconstrucción es un procedimiento normal de operación, no una emergencia (→ `11_CQRS_ARCHITECTURE.md`).
8. **La IA lee de aquí:** las capacidades de IA (ETS-005/11) consumen read models y marts bajo el alcance del usuario asistido — nunca el modelo de escritura.

## 4. Ciclo

Los datos analíticos siguen el ciclo: derivar (por eventos o por corte) → servir → recalcular/regenerar → expirar. No se archivan como patrimonio (se regeneran), **excepto los snapshots**, que se retienen según la política del tenant porque documentan cortes de negocio (cierres contables, informes emitidos).
