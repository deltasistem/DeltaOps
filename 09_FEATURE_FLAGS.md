# 09_FEATURE_FLAGS.md

> **DeltaOps — ETS-005 · v1.0** · Feature Flags: activación y desactivación de módulos y capacidades.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Que la plataforma se **encienda por partes**: un tenant pequeño empieza con activos + OTs + checklists; uno grande activa compras, contratos, combustible, IA e integraciones. Todo el producto existe siempre; lo que varía es qué está **habilitado**, por empresa, por licencia y por usuario — sin ramas de código ni despliegues especiales.

## 2. Qué se flaguea

| Nivel | Ejemplos |
|---|---|
| **Módulos completos** | Compras, Contratos, Combustible, Inventario, Indicadores avanzados, IA Assistant, Integraciones, Portal de contratistas |
| **Capacidades dentro de un módulo** | Firmas en checklist, NFC, aprobación multi-nivel, multi-moneda, exportaciones programadas, WhatsApp/SMS |
| **Capacidades experimentales** | Funciones nuevas liberadas gradualmente por el fabricante (beta por tenant voluntario) |

## 3. Capas de decisión (en orden, todas deben permitir)

```text
1. LICENCIA (plataforma)   ¿el plan contratado incluye el módulo?
2. TENANT (admin empresa)  ¿la empresa lo activó? ¿en qué ámbito (sede/operación)?
3. ROL/USUARIO             ¿el rol del usuario tiene permisos sobre él?
```

- La **licencia** define el techo: nadie activa lo que su plan no incluye; los límites de plan (usuarios, activos, tenants de un grupo) también viven aquí.
- El **tenant** decide qué enciende de su techo, y puede hacerlo por ámbito (combustible solo en la operación minera, no en oficinas).
- El **usuario** no "tiene flags": ve lo que su rol permite dentro de lo encendido. Los flags por usuario existen solo para pilotos/beta explícitos.

## 4. Reglas

1. **Apagado = invisible.** Un módulo desactivado desaparece de navegación, búsquedas, dashboards y notificaciones; no aparece "deshabilitado en gris" generando ruido.
2. **Apagar no borra.** Desactivar un módulo oculta su operación pero conserva íntegros sus datos e historial; reactivarlo lo restaura. La auditoría nunca se apaga.
3. **Dependencias verificadas:** el motor conoce el grafo (Compras requiere Inventario; IA de repuestos requiere Inventario+OTs) y rechaza combinaciones incoherentes explicando el porqué.
4. **Degradación limpia:** si un módulo apagado era destino de reglas o workflows, el validador lo detecta al apagar (reporte de impacto: "3 reglas y 1 workflow quedarían rotos") y exige resolverlo antes.
5. **Cambios auditados y versionados** como toda configuración; encender un módulo con costo (WhatsApp, IA) requiere confirmación explícita del administrador del tenant.
6. **El Core no es flageable:** auditoría, permisos, folios, multi-tenancy y el modelo organizacional están siempre activos.

## 5. Relación con los demás motores

- **Permisos:** el flag decide si el módulo existe en el tenant; el permiso decide quién lo usa. Ambos deben concurrir.
- **Tenant Configuration (12):** el panel de módulos del tenant es la cara visible de este motor.
- **Fabricante:** los lanzamientos graduales (beta, canary por tenant) usan el mismo mecanismo, gobernado desde la capa plataforma.
