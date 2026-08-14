---
name: Auditoría funcional LITE-06
description: Hallazgos de la auditoría funcional integral (mapa operacional) que condicionan las fases siguientes de simplificación.
---

# DELTAOPS LITE-06 — Auditoría Funcional Integral (solo documentación)

Mapa completo en `docs/dgp/DELTAOPS-LITE-06-AUDITORIA-FUNCIONAL-MAPA.md` (fuente de verdad = código, criterio VERIFICADO/PARCIAL/NO VERIFICADO). Hallazgos que condicionan trabajo futuro:

- **Complejidad sobre-expuesta:** 107 páginas / 89 rutas; la operación real usa ~20–25 pantallas. Mandato de Dirección: «ocultar complejidad no es eliminar capacidad» — simplificar por presentación, jamás borrar.
- **Multicentro solo estructural:** `centroCosto` existe en dominio pero está vacío en todos los activos reales, sin captura en el alta ni filtrado/segregación. La segregación real es tenant (RLS) + responsable de OT. Cualquier fase multicentro empieza por captura y datos, no por permisos.
- **KPIs sin fuente confiable:** MTTR/MTBF/Disponibilidad dependen de `insumosKpi` manuales mayormente `null`; conteos de OT, utilización y costo/hora-km sí tienen fuente real. No prometer esos KPI sin resolver la captura de insumos.
- **Colapso de roles:** los 6 roles canónicos colapsan a 3 buckets legacy (admin/operador/lector); SUPERVISOR=PLANIFICADOR=TECNICO en casi toda escritura salvo Órdenes/Utilización. Una futura diferenciación es cambio RBAC (requiere directiva).
- **Deudas de coherencia visibles:** Correctivo deriva rol de `users.rol` legacy; `/design-system` ruteado sin guard SoloSuperAdmin; permiso `exportar-analytics` sin endpoint; prefill hallazgo→correctivo con evidencias parciales.
- **Excel/Forms/Power BI:** cero evidencia en el repo (NO VERIFICADO); no asumir procesos previos representados.

Lección de método: en fases de solo-auditoría, la revisión independiente debe re-verificar afirmaciones por muestreo contra código (detectó off-by-one en conteo de rutas) y los conteos de BD citados deben re-ejecutarse en vivo antes del cierre.
