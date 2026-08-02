# 13 — Gestión de Permisos en Runtime

> **DeltaOps — ESI-003 · v1.0** · Del catálogo congelado a los permisos efectivos del actor, resueltos una vez por petición.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Cadena de resolución

```
catálogo de permisos (Kernel, congelado)
        → roles del tenant (datos, administrables)
        → asignaciones actor-rol (datos, administrables)
        → permisos efectivos (calculados por la plataforma)
```

Lo que puede cambiar en runtime son los datos (roles y asignaciones, administrados por el módulo de administración según ETS-006). Lo que jamás cambia en runtime es el catálogo (doc 04).

## 2. Permisos efectivos

1. **Se resuelven una vez por unidad de trabajo**, durante la construcción del contexto (docs 09 y 10, paso 6), y viajan congelados en él. Una petición se evalúa completa con la misma foto de permisos; los cambios aplican a la siguiente.
2. **Resolución por unión**: el actor tiene la unión de los permisos de sus roles en el tenant activo. Sin permisos negativos ni precedencias en el MVP — la ausencia deniega (doc 12, regla 1). **Por qué:** los modelos con denegaciones explícitas y prioridades son el origen clásico de configuraciones inauditablemente contradictorias.
3. **Caché por proceso** de la resolución rol→permisos con invalidación por evento de administración y expiración corta de respaldo (mismo patrón que capacidades, doc 07).
4. **Roles del sistema**: cada tenant nace con roles semilla del producto (definidos en ETS-006 y sembrados por seed/aprovisionamiento); los tenant pueden crear roles propios combinando permisos del catálogo, jamás inventar permisos.

## 3. Reglas normativas

1. **El permiso es la unidad, el rol es el empaque**: toda decisión técnica se toma contra permisos; los roles existen para administración humana.
2. **Cambios de permisos auditados**: toda alta/baja de rol o asignación deja rastro de auditoría (ETS-006) con actor, tenant y fecha.
3. **Sin permisos entre tenants**: la resolución ocurre siempre dentro del tenant del contexto; no existen permisos globales de plataforma visibles para tenants.
4. **Actor-sistema con permisos de catálogo** (doc 09, regla 3): los trabajos internos declaran qué permisos usan; nada de omnipotencia implícita.
5. **Exposición a la UI por contrato**: los permisos efectivos se exponen en la sesión según ETS-008 para que la UI componga su navegación; misma fuente, cero duplicación de reglas.

## Impacto sobre la implementación

El DGP de plataforma implementa la resolución, la caché y la invalidación. El módulo de administración de usuarios implementa la gestión de roles y asignaciones consumiendo estos contratos.

## Dependencias

Docs 04, 07, 09, 12 y 14; ETS-006 (modelo), ETS-008 (exposición), ETS-009 (persistencia).

## Riesgos

- Foto de permisos obsoleta en sesiones largas; mitigación: resolución por petición (no por sesión) + invalidación por evento; la ventana de desfase es de segundos.
- Explosión de roles artesanales por tenant; mitigación: roles semilla bien diseñados y guía de administración; el catálogo de permisos permanece pequeño y por operación de negocio.

## Decisiones habilitadas

- Diseño del módulo de administración de usuarios sobre contratos estables.
- Auditoría de seguridad uniforme de cambios de autorización.

## Decisiones bloqueadas

- Prohibidos los permisos negativos y las precedencias en el MVP.
- Prohibida la creación de permisos por tenants.
- Prohibido resolver permisos fuera de la construcción del contexto.
