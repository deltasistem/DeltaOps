# 07_READ_MODEL_PERSISTENCE.md

> **DeltaOps — ETS-009 · v1.0** · Persistencia de read models: dashboards, Power BI, IA, buscador y reportes.
> Los read models funcionales están en ETS-006/12; aquí, su régimen de persistencia.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Régimen común

Todo read model comparte cuatro propiedades de persistencia:

1. **Reconstruible al 100 %** desde el flujo de eventos: perderlo cuesta tiempo de reproyección, jamás datos (01 §1). Ninguno se respalda como verdad (17).
2. **Desnormalizado a la medida de su consulta:** cada uno tiene la forma exacta de la pantalla/contrato que sirve (la hoja de vida ya viene armada, no se arma al leer) — el costo se paga una vez al proyectar, no en cada lectura.
3. **Con cursor y frescura propios:** cada proyección lleva su posición en el flujo y su frescura declarada (`X-Frescura`, ETS-008/02); el retraso es visible, nunca mentido.
4. **Particionado por tenant siempre** (14), con índices propios de su patrón de consulta.

Cada read model pertenece al módulo que sirve la consulta; nadie lee el read model de otro módulo (ETS-007 NT-03).

## 2. Dashboards e indicadores

- Los KPIs canónicos (disponibilidad, MTTR, MTBF, costos, cumplimiento — ETS-004/07) persisten **pre-agregados por periodo natural y nodo organizacional**: el dashboard lee sumas hechas, no recalcula al abrir.
- La cascada de drill-down (≤3 clics, U-05) se sostiene con agregaciones por nivel: zona→sitio→activo ya proyectadas (08).
- Hechos tardíos (offline) re-proyectan los periodos afectados por fecha de negocio: los KPIs de la semana pasada pueden refinarse — con la frescura declarada, es comportamiento correcto, no error.

## 3. Power BI (marts)

- Los marts curados (ETS-006/12) son read models **externos-primero**: esquema documentado con diccionario de datos versionado, estabilidad contractual (cambiarlos sigue el gobierno N/N-1 de ETS-008/17).
- Persisten en estructuras dimensionales amigables a BI, refrescadas incrementalmente por fecha de evento; los KPIs viajan calculados (la fórmula es Core — BI no reinventa, ETS-008/13 §3).
- Ámbito recortado por credencial de servicio: cada conjunto expone solo su alcance; un mart jamás mezcla tenants.

## 4. IA (contexto)

- La IA **no tiene almacén privilegiado**: su contexto se construye por petición desde read models minimizados bajo el alcance del usuario asistido (ETS-007/09 §3).
- Lo que sí persiste como derivado propio: índices de recuperación sobre documentos y fallas históricas (representaciones para búsqueda semántica), reconstruibles desde los originales; por tenant, jamás compartidos.
- Las sugerencias emitidas y su trazabilidad (qué vio, qué versión) son **hechos**, no derivados: viven en el plano de la verdad (la explicabilidad de U-40 no puede depender de algo desechable).

## 5. Buscador

- El índice de búsqueda global (U-31) es la proyección más desechable: reconstruible por reindexación completa desde los read models fuente.
- Indexa por tenant con los permisos de visibilidad resueltos por ámbito: el recorte ocurre también al consultar (defensa doble — un índice desactualizado en permisos jamás muestra de más porque la consulta re-verifica).
- Frescura objetivo corta pero declarada; la degradación del buscador nunca degrada la operación (es prescindible por diseño, ETS-004).

## 6. Reportes

- Dos regímenes distintos:
  - **Reportes interactivos** (consultas ETS-008/04): leen read models normales con su frescura.
  - **Reportes emitidos** (el PDF del cierre mensual entregado a la gerencia): lo emitido se **congela como hecho** — documento inmutable en el almacén de objetos con sus parámetros, su corte declarado y su emisor (ETS-006). Reejecutar el reporte hoy puede dar distinto (hechos tardíos); lo entregado consta tal como se entregó.
- La generación pesada es asíncrona declarada (`202` + operación, ETS-008/01) y corre contra la réplica de lectura, jamás contra el plano de escritura (15).
