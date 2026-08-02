# 12 — Autorización en Runtime

> **DeltaOps — ESI-003 · v1.0** · Decidir si el actor puede hacer esto, aquí, ahora — de forma declarativa y central.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Modelo oficial

La autorización de DeltaOps es **por permisos de catálogo agrupados en roles por tenant** (ETS-006): el actor tiene roles en su tenant, los roles agregan permisos, los casos de uso exigen permisos. La evaluación en runtime sigue una cadena fija:

```
capacidad del tenant (doc 07) → permiso del actor (este doc) → invariantes de dominio (el agregado)
```

Tres niveles, tres preguntas distintas: ¿está contratado?, ¿puede este actor?, ¿lo permite el estado del negocio? Ninguno sustituye a otro.

## 2. Evaluación en la petición

1. Cada caso de uso y consulta **declara** sus permisos requeridos en la declaración del módulo (doc 06); la exigencia vive junto a la pieza, no dispersa en el borde.
2. La plataforma evalúa la declaración contra los **permisos efectivos del contexto** (docs 09 y 13) antes de invocar la pieza. El módulo no escribe chequeos de entrada a mano.
3. Denegación → error canónico 403 del catálogo (doc 15), distinguible de la denegación por capacidad, con registro estructurado (actor, tenant, permiso, pieza).
4. **Autorización de grano fino** (¿puede sobre *este* recurso concreto?): cuando dependa de datos —p. ej. restricciones por ubicación o planta— se diseña como Policy de dominio (ETS-005/011) evaluada dentro del caso de uso, con los datos ya cargados. La plataforma cubre el grano funcional; el dominio cubre el grano de instancia.

## 3. Reglas normativas

1. **Denegar por defecto**: pieza sin permisos declarados = pieza no invocable. La puerta de CI rechaza declaraciones vacías sin justificación explícita de "pública interna".
2. **Los permisos son catálogo congelado** (ETS-006, doc 04): añadir un permiso es cambio de producto con revisión, jamás una fila creada en caliente.
3. **Sin condicionales de rol en el código**: prohibido preguntar "¿es admin?" dentro de un caso de uso; se pregunta por permiso o por Policy, nunca por rol.
4. **Las consultas también se autorizan**: el plano de lectura (ETS-011) exige permisos igual que los comandos; además el RLS (ETS-009) actúa como segunda muralla.
5. **Simetría con la UI**: la UI oculta lo no permitido usando la misma fuente (permisos efectivos expuestos por contrato ETS-008), pero el backend decide siempre; la UI jamás es la barrera.

## Impacto sobre la implementación

El DGP de plataforma implementa el evaluador declarativo y su integración con la invocación de piezas. Las plantillas T01/T02 (ESI-002/18) nacen con la sección de permisos requerida.

## Dependencias

Docs 06, 07, 09, 13 y 15; ETS-005 (Policies), ETS-006 (modelo de permisos), ETS-011 (plano de lectura).

## Riesgos

- Proliferación de permisos hiperespecíficos hasta volver ingobernable el catálogo; mitigación: el catálogo tiene dueño (ESI-002/27) y los permisos se diseñan por operación de negocio, no por endpoint.
- Lógica de instancia colada en la plataforma; mitigación: la frontera "funcional=plataforma, instancia=Policy" se aplica en revisión.

## Decisiones habilitadas

- Diseño de roles estándar por tenant sobre el catálogo congelado.
- Exposición de permisos efectivos a la UI por el contrato de ETS-008.

## Decisiones bloqueadas

- Prohibidas piezas invocables sin declaración de permisos.
- Prohibidos chequeos por rol en código de negocio.
- Prohibida la creación de permisos fuera del ciclo de producto.
