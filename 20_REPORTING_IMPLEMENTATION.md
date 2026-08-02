# 20_REPORTING_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Reportes: proyectar, exportar, jamás calcular negocio al vuelo.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Los tres géneros y su forma (ETS-011/20)

| Género | Implementación |
|---|---|
| **Dashboard** | consultas normales (03) sobre read models de indicadores, proyectados por consumidores |
| **Reporte operativo** | job de exportación asíncrono: consulta sobre réplica → archivo → entrega vía flujo de archivos (18) |
| **Mart de BI** | proyecciones NP (ETS-009/20) pobladas por consumidores, consumidas por herramientas externas |

## 2. Reglas de implementación

1. **Ningún reporte calcula negocio** (ETS-011/20): las cifras (disponibilidad, MTBF, costos) las calculan los motores de dominio al ocurrir los hechos y los consumidores las proyectan; el reporte selecciona, agrega aritméticamente y presenta. Si un reporte "necesita calcular" una cifra de negocio, falta un motor o un consumidor — se construye eso.
2. **La exportación es un proceso con estado consultable**: solicitar (comando: valida, autoriza, encola) → generar (job sobre réplica de lectura, jamás sobre la base transaccional) → entregar (archivo por el flujo 18, notificación 16). El usuario consulta el estado; los jobs tienen presupuesto y expiración.
3. **La autorización se congela al solicitar y se aplica al generar**: el job genera con el alcance del solicitante en el momento de la solicitud; un reporte generado jamás contiene datos que el solicitante no podía ver. El archivo resultante hereda clasificación y su acceso es el del flujo de archivos.
4. **Cifra congelada vs cifra viva, explícito siempre** (ETS-011/20): todo indicador presentado declara si es un corte congelado (cierre de periodo) o una proyección viva con frescura; mezclar ambos en una vista sin distinguirlos es defecto de diseño de la consulta.
5. **Los cortes congelados son hechos de dominio**: el cierre de periodo es un comando (interno, actor sistema) que produce eventos con las cifras selladas; los reportes históricos leen esos hechos — jamás recalculan el pasado con lógica presente.
6. **Marts poblados solo por consumidores**: ninguna herramienta externa escribe en los marts, y los marts jamás son fuente para decisiones del Core (flujo unidireccional, ETS-009/20).
7. **Plantillas de presentación versionadas**: formato y layout de los reportes entregables se versionan como las plantillas de notificación — regenerar un reporte antiguo usa su versión de plantilla.

## 3. Prueba obligatoria

Read models de indicadores: suite estándar de consumidores + casos de negocio de las cifras (contra las tablas de decisión de los motores que las producen). Jobs de exportación: solicitud→estado→entrega con fakes; alcance congelado verificado con actor cuyo permiso cambia entre solicitud y generación.

---

## Impacto sobre la implementación
Reporting se implementa con piezas ya existentes (consultas, consumidores, jobs, archivos, notificaciones); la única lógica nueva admisible es presentación y agregación aritmética.

## ETS relacionados
ETS-011 (20, 10, 16, 18) · ETS-009 (20 marts NP) · ETS-010 (réplicas de lectura) · ETS-004 (dashboards por pantalla).

## Riesgos
- SQL de reporte acumulando reglas de negocio → regla 1; la revisión pregunta "¿de qué motor sale esta cifra?".
- Exportaciones pesadas sobre la base transaccional → regla 2: réplica o no se genera.

## Decisiones habilitadas
Históricos inmutables, BI externo sin riesgo para el Core, exportaciones gobernadas.

## Decisiones bloqueadas
Herramientas de BI y formatos de archivo concretos — con el stack; los flujos los sobreviven.
