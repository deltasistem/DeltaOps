# 09_SNAPSHOTS.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de snapshots: qué dominios los usan, frecuencia y recuperación.
> Un snapshot es una foto derivada del estado de un agregado a una secuencia dada, para no releer historias largas. Jamás sustituye a la historia: la acelera.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Papel del snapshot

En DeltaOps el estado vigente de cada agregado ya persiste junto a su historia (02 §1) — ese estado vigente **es** el snapshot permanente de la última secuencia. Los snapshots adicionales de esta estrategia cubren tres necesidades distintas:

1. **Reconstrucción rápida:** reproyectar un agregado o vista sin releer años de eventos (arrancar desde la foto más cercana + los eventos posteriores).
2. **Fotos de corte de negocio:** el estado del mundo a una fecha (cierres de periodo, cortes contables).
3. **Estado "a la fecha" para auditoría:** responder "¿cómo estaba este activo el 12 de marzo?" sin replay completo.

## 2. Qué dominios usan snapshots

| Dominio | Tipo de snapshot | Motivo |
|---|---|---|
| Activos de larga vida | Foto periódica del agregado (secuencia + estado) | Hojas de vida de años; el replay completo se encarece |
| Inventario | Corte de saldos por ítem-bodega | Base de conteos, cierres y reconciliación (02 §4) |
| KPIs / vistas de corte | Foto al cierre del periodo (08) | El cierre reportado queda congelado |
| Medidores | Acumulado a fecha por serie | Reconstruir horómetros sin releer todas las lecturas |
| Configuración resuelta | El paquete móvil emitido (05 §2) | Ya es un snapshot versionado por diseño |
| Periodos congelados | Foto emitida por `CongelarPeriodo` (04 §5) | Contrato de negocio, no optimización |

OTs no necesitan snapshots intermedios: su historia es corta y al cerrar quedan selladas (su estado final es su foto definitiva).

## 3. Frecuencia

- **Por umbral de historia, no por calendario, para agregados:** se toma snapshot cuando el agregado acumula N eventos desde el último — los activos intensivos generan fotos frecuentes, los tranquilos casi nunca (frecuencia proporcional al beneficio).
- **Por calendario de negocio para cortes:** diario (backlog, saldos), mensual (KPIs, costos), según el ciclo del tenant (configurable, ETS-005).
- La toma de snapshots es tarea de fondo a prioridad baja (jamás compite con la operación) y es **idempotente y prescindible**: si una foto no se tomó, todo sigue funcionando más lento.

## 4. Recuperación y uso

- Regla de lectura: **foto más cercana anterior + eventos posteriores hasta el punto pedido**. Vale para reconstruir el presente (recuperación de proyecciones, 08 §3) y para el estado a una fecha (auditoría, 06 §4).
- Los snapshots son **derivados desechables** (excepto los de corte de negocio emitidos, que son hechos congelados): un snapshot corrupto o de esquema viejo se descarta y se regenera del flujo — jamás se "repara".
- Verificación de honestidad: periódicamente se reconstruye una muestra de agregados desde cero y se compara contra su cadena de snapshots (control de calidad automático, mismo espíritu que la reconciliación de saldos).
- En recuperación de desastre (17-18), los snapshots aceleran el retorno del plano derivado; la verdad se restaura del flujo de eventos y los respaldos — nunca desde snapshots.
