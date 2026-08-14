---
name: Aterrizaje operacional LITE-07
description: Conclusiones del discovery/diseño de aterrizaje operacional Delta (equipo, horómetro, rutinas, combustible, mano de obra, hoja de vida) que condicionan las fases de implementación.
---

# DELTAOPS LITE-07 — Aterrizaje Operacional Delta (solo discovery+diseño)

Documento fuente: `docs/dgp/DELTAOPS-LITE-07-ATERRIZAJE-OPERACIONAL.md`. Lecciones durables:

- **Backend adelantado a la UI:** el disparador «Próxima rutina · Faltan X h» ya existe end-to-end en el motor de frecuencias de Planes (reglas por horometro/odometro/ciclos → vencida/excedente/proximaMeta) con la cadena Utilización→Activo→Planes cableada; solo falta la superficie operacional. Antes de proponer desarrollo nuevo, verificar si es EXISTE-PERO-NO-EXPUESTO / REQUIERE COMPOSICIÓN.
- **Horómetro ya cumple los invariantes críticos:** lecturas append-only, lectura menor ⇒ marcada `inconsistente` (no reinicio), corrección solo vía regularizar-medidor con motivo + anular-lectura; propagación fail-safe al Activo.
- **Combustible:** catálogo multi-energía (no asumir ACPM); `proveedorId` ya es string sin FK ⇒ el patrón «proveedor como snapshot transaccional» está en el dominio; rendimiento SIEMPRE derivado con estado `sin-datos`. GAP: unidad fija `litros` incoherente para activos eléctricos (kWh).
- **Inventario no es requisito de cierre de OT** (verificado en la máquina de estados) — mantenerlo así; la captura ligera de repuesto-en-OT es desarrollo pendiente.
- **Config de módulos por rol NO EXISTE:** entitlements son por-tenant y solo SUPER_ADMIN; la visibilidad por rol está hardcodeada en RBAC. Cualquier «configuración por perfil» es desarrollo, y VISIBILIDAD ≠ SEGURIDAD.
- **Conceptos que NO existen en el dominio:** centro de trabajo/operación y equipo/grupo de mantenimiento (REQUIERE DESARROLLO); centroCosto existe pero sin captura. El contexto de sesión es por tenant (switch-tenant), no por centro.
- **10 decisiones quedaron como preguntas a Dirección** (multicentro, origen de centros de costos, OT automática por rutina vencida, insumos de confiabilidad, etc.) — no implementar nada de eso sin respuesta explícita.
- **Roadmap aprobable:** F1 exposición rutina-por-uso + hoja de vida (composición) → F2 captura ligera → F3 navegación/tema/responsive por perfil → F4 multicentro → F5 costeo/indicadores → F6 config por rol.
