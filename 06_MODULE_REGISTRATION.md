# 06 — Registro de Módulos

> **DeltaOps — ESI-003 · v1.0** · El contrato por el que un módulo de negocio se une a la plataforma.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. El contrato de módulo

Todo módulo de negocio (Activos, Inventario, Compras… ETS-002) se integra en la aplicación mediante un único contrato de registro definido en el Kernel. Un módulo registrable declara:

| Declaración | Contenido |
|---|---|
| **Identidad** | Código estable del módulo según catálogo ETS-002, en español |
| **Capacidades** | Las capacidades que aporta, por código de catálogo (doc 07) |
| **Casos de uso y consultas** | Las piezas de aplicación que expone, con sus permisos requeridos |
| **Rutas** | Sus rutas HTTP bajo el prefijo del módulo, delegando en casos de uso |
| **Suscripciones a eventos** | Qué tipos de evento consume y con qué consumidor (doc 19) |
| **Piezas y necesidades** | Qué construye y qué puertos necesita, para la composición (doc 05) |
| **Migraciones y seed** | Referencia a su capítulo de migraciones y de seed (ESI-002/12) |

## 2. Proceso de registro

1. El arranque recorre la **lista explícita y ordenada** de módulos (doc 02, regla 2).
2. Por cada módulo valida la declaración completa: identidad en catálogo, capacidades existentes, permisos existentes, eventos suscritos existentes. Cualquier referencia inválida aborta el arranque.
3. Registra capacidades (doc 07), monta rutas bajo el prefijo del módulo, suscribe consumidores en el dispatcher y añade las piezas a la raíz de composición.
4. El orden de la lista solo afecta al montaje; **no puede existir dependencia funcional del orden**, porque los módulos no dependen entre sí (doc 01).

## 3. Reglas normativas

1. **Un módulo, una declaración**: toda la superficie del módulo es visible en su declaración de registro; nada se monta "por fuera".
2. **Sin registro parcial**: un módulo se registra completo o el arranque falla. Prohibido saltarse piezas inválidas con un warning.
3. **Encendido y apagado por configuración de plataforma**: la lista de módulos compilados es fija por versión; su disponibilidad por tenant se gobierna por capacidades y licenciamiento (ETS-005, doc 07), no comentando líneas del arranque.
4. **Simetría**: la declaración del módulo es espejo de su estructura física (doc 25); si algo existe en la carpeta y no en la declaración, es código muerto y la puerta lo señala.
5. **El módulo de referencia manda**: el primer módulo construido (ESI-002/20) fija el patrón de declaración que la plantilla T09 (ESI-002/18) replica.

## Impacto sobre la implementación

Define el contrato central que el DGP del Kernel debe incluir y que el DGP de cada módulo debe cumplir. Habilita validación de arranque completa antes de servir.

## Dependencias

Docs 02, 05, 07, 19 y 25; ETS-002 (catálogo de módulos), ETS-005 (configuración por tenant), ESI-002/18 (T09).

## Riesgos

- Declaraciones que se desincronizan de la realidad del módulo; mitigación: generadores (ESI-002/19) actualizan declaración y pieza a la vez; la puerta compara declaración contra estructura.
- Tentación de "módulos técnicos" registrables que en realidad son plataforma; mitigación: la plataforma no se registra como módulo, se compone en el arranque.

## Decisiones habilitadas

- Plantilla T09 de módulo con declaración completa desde el día uno.
- Validación temprana de referencias cruzadas (capacidades, permisos, eventos) al arranque.

## Decisiones bloqueadas

- Prohibido montar rutas, consumidores o piezas de un módulo fuera de su declaración.
- Prohibido el registro condicional por entorno (los entornos difieren en configuración, no en composición).
- Prohibidas dependencias funcionales del orden de registro.
