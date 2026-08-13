---
name: Diseño funcional DeltaOps Lite Fase 2
description: Decisiones del diseño LITE-02 — capacidades como capa sobre RBAC, 4 dimensiones del activo, GAPs G-A..G-H, decisiones pendientes DP-1..DP-9.
---

# DeltaOps Lite — Fase 2 Diseño Funcional/UX (LITE-02)

Doc: `docs/dgp/DELTAOPS-LITE-02-DISEÑO-FUNCIONAL-UX.md` (revisión independiente PASS). Solo diseño: NADA implementado.

- **Corrección fundamental de Dirección (vinculante para toda implementación Lite):** nada de jerarquía organizacional rígida (Coordinador→Técnico→Aprobador). Modelo de CAPACIDADES (ejecutar/asignar/supervisar/aprobar/administrar/consultar) configurables por centro; una persona puede acumular capacidades (centro compacto) o haber segregación; la segregación obligatoria es regla de negocio configurable, no universal. Trazabilidad siempre: quién/cuándo/qué/con qué capacidad actuó.
- **Capacidades = CAPA sobre el RBAC existente**, no reescritura: `Sesion` ya trae rol+capacidades[]+permisos[] y `puedeEscribirModulo` ya modula por overrides; el motor de aprobaciones ya soporta 7 modos. Prohibido romper el contrato de identidad DGP-017/019.
- **4 dimensiones independientes del activo:** centro de costos (existe, falta exponer como filtro/columna), ubicación (existe con historial), responsable (existe con historial), equipo/grupo de mantenimiento (GAP G-A — solo existe asignación grupo/cuadrilla a nivel OT).
- **GAPs G-A..G-H** (equipo mantenimiento, preoperacional guiado+veredicto de instancia, ítem crítico, puente auto hallazgo→correctivo, rol OPERADOR, capacidades por centro, contexto multicentro, selects nativos oscuro).
- **Decisiones pendientes DP-1..DP-9;** DETENERSE-Y-PREGUNTAR antes de implementar: DP-2 (semántica APTO CON OBSERVACIONES / qué ítems son críticos — regla de seguridad no derivable del código) y DP-5 (multicentro-en-tenant vs multiempresa; la directiva mezcla ambos).
- Dualidad a unificar (DP-1): severidad de hallazgos vive en el motor de forms del frontend (`lib/forms/motor.ts`), no en el ítem del checklist de dominio (`lib/dynamic-forms/checklist.ts`).
- Nav Lite = reagrupación por proceso (equipo→preoperacional→…→indicadores); módulos quedan como capacidades internas; nada se elimina.
