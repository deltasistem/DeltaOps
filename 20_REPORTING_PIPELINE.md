# 20_REPORTING_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de reportes: de datos proyectados a informes entregados, sin cálculos improvisados.
> Documento de diseño. Sin código, sin clases.

---

## 1. Las tres formas de reportar

| Forma | Camino | Fuente |
|---|---|---|
| **Dashboards y KPIs** | Consultas normales (12) con drill-down ≤3 clics (ETS-004) | Read models de KPIs ya proyectados (`kpi_periodo_nodo`, ETS-010/10) |
| **Reportes operativos** (listados con filtros, exportables) | Consulta del catálogo + exportación asíncrona si el volumen lo exige | Read models del módulo |
| **BI externo** | Acceso de solo lectura gobernado | `marts` vía vistas, contrato N/N-1 (ETS-008/13, ETS-010/11 §6) |

## 2. Las etapas de una exportación

```text
1. SOLICITUD    comando "solicitar reporte": parámetros validados,
                autorización con alcance (14), Resultado = aceptado
                con id de trabajo
2. GENERACIÓN   job asíncrono sobre réplicas (nunca compite con la
                operación, ETS-010/20): lee read models/marts, aplica
                el alcance del SOLICITANTE congelado al solicitar
3. ENTREGA      archivo al almacén de objetos por el ciclo de
                archivos (18) — el reporte ES un archivo con dueño,
                clasificación y acceso auditado
4. AVISO        notificación "reporte listo" (16) con deep link
```

## 3. Reglas normativas

1. **Ningún reporte calcula negocio**: los números salen de proyecciones versionadas y probadas (10 de ETS-010); si un reporte necesita un cálculo nuevo, se proyecta primero — dos reportes jamás disienten porque calculan distinto (una sola fuente por métrica, ETS-006).
2. **Cifras congeladas vs vivas, explícito**: el reporte declara si usa la foto del cierre (periodo congelado, ETS-009/04 §5) o la proyección viva con su frescura — el "KPI de marzo" tiene dos respuestas legítimas y el reporte dice cuál es (ETS-010/16 §3.3).
3. **El alcance viaja con el reporte**: se genera con lo que el solicitante podía ver al solicitar; compartir el archivo no amplía permisos (es un archivo con su propia autorización de dueño lógico).
4. **Plantillas de reporte como configuración versionada** (ETS-005): columnas, agrupaciones y marca del tenant (branding) sin código nuevo.
5. **Todo reporte entregado queda trazado**: quién lo pidió, con qué parámetros, qué versión de plantilla, cuándo — los reportes son hechos.

---

## Impacto sobre la implementación
El generador es un job estándar sobre lectores existentes; las plantillas son definiciones versionadas; ninguna librería de reportes contiene reglas de negocio.

## ETS relacionados
ETS-004 (07 dashboards, presupuestos) · ETS-005 (07 dashboard engine, plantillas) · ETS-008 (13 BI) · ETS-010 (10-11, 16, 20) · ETS-011 (12, 16, 18).

## Riesgos
- Reportes que degeneran en SQL ad-hoc contra la verdad → prohibido por 12 §2.2; la necesidad nueva se proyecta.
- Exportaciones masivas saturan réplicas → cuotas por tenant y ventanas de ejecución (ETS-010/20 pools).

## Decisiones habilitadas
Generador asíncrono, plantillas versionadas, entrega por el ciclo de archivos, trazabilidad de reportes.

## Decisiones bloqueadas
Formatos concretos (hoja de cálculo, PDF) y librerías de generación — implementación.
