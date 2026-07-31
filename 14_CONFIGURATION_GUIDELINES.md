# 14_CONFIGURATION_GUIDELINES.md

> **DeltaOps — ETS-005 · v1.0** · Lineamientos normativos de configuración: las reglas que gobiernan cómo configurar bien la plataforma.
> Cierra la serie ETS-005. Documento de diseño. No implementa nada.

---

## 1. Las diez normas de oro

| # | Norma |
|---|---|
| N-01 | **Configurar antes que pedir; pedir antes que programar.** Si la plataforma no lo permite, es una petición de producto al fabricante — jamás un desarrollo dentro del tenant. |
| N-02 | **El Core es intocable.** Ninguna configuración puede debilitar auditoría, permisos, SoD, folios, aislamiento de tenants o "la IA propone, no dispone" (ver `12_TENANT_CONFIGURATION.md` §3). |
| N-03 | **Toda configuración es versionada, con vigencia y auditada.** No existen cambios anónimos ni ediciones en caliente. |
| N-04 | **Lo que está en vuelo termina con su versión.** Publicar hacia adelante, jamás reinterpretar el pasado. |
| N-05 | **Ensayar antes de publicar.** Formularios, workflows y reglas pasan por el sandbox del tenant; las reglas además se simulan contra historia. |
| N-06 | **Roles y destinatarios por contexto, nunca personas quemadas.** Las cadenas de aprobación y notificaciones se resuelven por rol en el contexto del hecho. |
| N-07 | **Códigos estables, nombres libres.** Los hechos referencian códigos de catálogo; los nombres se traducen y renombran sin romper la historia. |
| N-08 | **Nunca borrar lo usado; inactivar y fusionar.** Vale para catálogos, formularios, workflows, roles. |
| N-09 | **Menos es más.** Cada estado, regla, campo obligatorio y notificación tiene un costo en fricción y ruido. Toda pieza debe justificar su existencia; la plataforma reporta configuración muerta. |
| N-10 | **La configuración se gobierna como el dinero:** con responsables, SoD, motivo obligatorio en lo sensible y revisión periódica. |

## 2. Guía de decisión: ¿dónde vive esto?

```text
¿Define qué ES DeltaOps (invariantes, eventos, fórmulas canónicas)?
  → CORE (fabricante, por versión de producto)
¿Es un valor de lista o clasificación?
  → CATÁLOGO (13) — plataforma, semilla o tenant según §3 de ese doc
¿Es captura de datos estructurada?
  → FORMULARIO (03)
¿Es un ciclo de vida con estados, responsables y aprobaciones?
  → WORKFLOW (04)
¿Es una reacción automática a un evento?
  → REGLA (05)
¿Es a quién avisar y por dónde?
  → NOTIFICACIÓN (06)
¿Es cómo se ve un número?
  → DASHBOARD (07) — la fórmula es Core; la meta y el umbral, del tenant
¿Es identidad visual o idioma?
  → BRANDING (08) / preferencia de usuario
¿Es si un módulo existe para la empresa?
  → FEATURE FLAG (09)
¿Es hablar con otro sistema?
  → INTEGRACIÓN (10)
¿Es cuánta IA y dónde?
  → AI CONFIG (11)
```

Si una necesidad no encaja en ninguna rama, **no se fuerza**: se documenta como petición de producto (N-01).

## 3. Buenas prácticas por motor

- **Catálogos:** pocos valores bien definidos > muchos parecidos. Definir el dueño de cada catálogo. Importar masivo solo tras limpiar duplicados.
- **Formularios:** prellenar todo lo conocido; solo campos que alguien leerá; ítems críticos con foto de referencia; probar en móvil y sin señal antes de publicar (U-01…U-05).
- **Workflows:** partir de la plantilla de industria; cada estado debe cambiar responsable, exigencia o información — si no, sobra; SLAs realistas medidos, no deseados.
- **Reglas:** publicar en modo observación primero; nombrar por su intención ("Stock mínimo crea necesidad"); revisar métricas de ruido mensualmente.
- **Notificaciones:** por defecto digest; inmediato solo lo accionable; crítica con acuse. Si la gente ignora las notificaciones, hay demasiadas.
- **Dashboards:** partir de D-01…D-09; máximo lo que cabe sin desplazamiento en el dispositivo objetivo; toda cifra con meta o referencia.
- **Roles:** clonar plantilla y quitar, mejor que partir de cero y adivinar; revisar trimestralmente roles sin usuarios y permisos sin uso.
- **Integraciones:** un dueño por dato maestro; probar con la bandeja de errores vigilada; nunca credenciales personales.
- **IA:** activar capacidad por capacidad, calibrar umbral con modo observación, medir aceptación.

## 4. Proceso de implantación recomendado (tenant nuevo)

1. **Estructura** organizacional completa (todo lo demás cuelga de ella).
2. **Catálogos** mínimos viables desde la plantilla de industria.
3. **Tipos de activo** con atributos y medidores; carga inicial de activos y asignaciones.
4. **Roles y usuarios** (partiendo de plantillas; denegado por defecto).
5. **Formularios** esenciales (checklist preoperacional primero: es el hábito diario).
6. **Workflows** de OT y solicitud; después compras.
7. **Reglas y notificaciones** mínimas (las obvias: crítico→solicitud, stock→compra).
8. **Dashboards** por rol; metas realistas.
9. **Piloto** en una operación; medir criterios ETS-004 (`11_CRITERIOS_USABILIDAD.md`); ajustar; expandir.

Regla del piloto: **no expandir configuración que el piloto no validó.**

## 5. Mantenimiento continuo

- Revisión trimestral: configuración muerta, reglas ruidosas, SLAs sistemáticamente incumplidos (¿mal proceso o mal SLA?), roles y permisos sin uso.
- Toda lección del piloto o la operación se vuelve ajuste de configuración versionado — el conocimiento queda en la plataforma, no en la cabeza de nadie.
- El Auditor puede leer la historia completa de la configuración: gobernarla es parte del cumplimiento, no un tema técnico.

---

**Fin de la serie ETS-005.** Con ETS-001 (auditoría), ETS-002 (arquitectura), ETS-003 (dominio), ETS-004 (experiencia) y ETS-005 (plataforma de configuración), DeltaOps queda especificado como producto SaaS enterprise adaptable a cualquier empresa **sin modificar código**.
