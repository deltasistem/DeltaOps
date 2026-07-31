# 15_PERFORMANCE_STORAGE.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de rendimiento de la persistencia: lecturas, escrituras, consultas e históricos.
> Los presupuestos de experiencia vienen de ETS-004/11 y la estrategia general de ETS-007/16; aquí, cómo la persistencia los cumple.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. El principio: pagar el costo en el momento barato

Toda la arquitectura de persistencia traslada el trabajo del **momento de leer** (donde espera un humano) al **momento de proyectar** (donde espera una cola): desnormalización por consulta (07), agregaciones pre-hechas (08), snapshots (09), árbol aplanado (02 §7). La pantalla nunca calcula: encuentra hecho.

## 2. Escrituras

- La transacción de comando es **mínima y constante**: un agregado + sus eventos + outbox (16) — sin actualizaciones colaterales de proyecciones, contadores ni índices de búsqueda dentro de la transacción (todo eso es consumo de eventos después).
- Append a partición actual = localidad máxima (14 §3); UUIDs ordenables por tiempo evitan dispersión de índices (12 §1).
- Los picos (sincronización masiva matutina de cuadrillas, lotes IoT) se absorben por cola con confirmación por elemento — la escritura de la verdad jamás se degrada por ráfaga: se encola la ráfaga, no se pierde (ETS-007/13).
- Índices sobre el plano de la verdad: los mínimos para invariantes e idempotencia — la riqueza de índices vive en los read models, donde no encarece el comando.

## 3. Lecturas

- Presupuesto heredado (ETS-004/11): lo interactivo responde en fracciones de segundo — se cumple porque cada consulta lee **su** read model ya con la forma de la respuesta (una búsqueda por índice, cero agregación al vuelo).
- Cache multinivel encima (ETS-007/11) con claves por tenant y frescura declarada; el cache acelera, el read model garantiza.
- Réplicas de lectura para separar cargas (14 §4); el retraso de réplica queda cubierto por la misma semántica de frescura declarada — jamás se miente el instante.
- Paginación por cursor estable (ETS-008/01): costo constante por página, sin recuentos globales (los totales exactos, cuando se ofrecen, salen pre-agregados).

## 4. Consultas (analítica y búsqueda)

- Nada pesado sobre la verdad caliente: analítica en marts y réplicas dedicadas (14 §4), búsqueda en su índice (07 §5), reportes pesados asíncronos declarados (07 §6).
- Drill-down ≤3 clics (U-05) garantizado por construcción: cada nivel de la cascada es una agregación materializada (08 §2) — bajar un nivel es otra búsqueda indexada, no un recálculo.
- Presupuesto por operación declarado en el catálogo (checklist ETS-008/18 §G) y medido en producción por percentiles (ETS-007/10): una regresión es un defecto con dueño, no una sorpresa.

## 5. Históricos

- Las consultas históricas normales (hoja de vida, costos de años) no releen hechos: leen proyecciones y snapshots (09 §4) — el costo es proporcional a lo pedido, no a la edad del activo.
- La poda por partición de tiempo (14 §3) protege lo caliente: ninguna consulta operativa toca bloques viejos por accidente.
- Lo profundo (forense, replay) corre gobernado, a prioridad baja, sobre réplicas o rehidratación (10 §3): puede tardar, declarado como asíncrono — lo que jamás hace es competir con la operación.

## 6. Régimen de crecimiento

El rendimiento se diseña para el volumen del año cinco, no del demo: los datos de mayor crecimiento (lecturas, combustible, telemetría) ya nacen con particionado fino, agregación temprana y ruta de salida a motor especializado (19). La señal de alarma operativa es la **tendencia** (crecimiento de latencia por percentil, tamaño de partición, retraso de proyección), vigilada por el panel de plataforma antes de que el usuario lo sienta.
