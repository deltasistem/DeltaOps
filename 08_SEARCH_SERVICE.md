# 08 — Search Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de búsqueda global: encontrar cualquier entidad desde una sola caja, sin violar fronteras ni murallas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

La búsqueda global resuelve "llévame al activo AC-1043" o "encuentra lo relacionado con 'bomba hidráulica'" a través de todos los módulos. Es un **índice de proyección** alimentado por eventos — la respuesta legítima a la búsqueda textual que ESI-005/07 §2.3 excluyó del plano transaccional.

| Concepto | Definición |
|---|---|
| **Documento de búsqueda** | Proyección indexable de una entidad: referencia, título, campos buscables declarados, estado resumido |
| **Declaración de indexación** | El módulo declara qué tipos de entidad se indexan, con qué campos, desde qué eventos (creación/cambio/archivo) |
| **Resultado** | Referencia + resumen + enlace; el detalle vive en el módulo — la búsqueda encuentra, no muestra |

## 2. Reglas

1. **Solo se indexa lo declarado**: campos buscables explícitos por tipo de entidad; los datos clasificados sensibles (ESI-005/15) no entran al índice salvo declaración reforzada con permiso dedicado.
2. **El filtrado de acceso ocurre en la consulta**: los resultados respetan tenant (aislamiento del índice, ESI-005/17 §2.5) y permisos de lectura por tipo (quien no puede listar compras no las encuentra). Sin fugas de existencia por buscador.
3. **Consistencia eventual declarada**: el índice sigue a los eventos con el retraso de bandeja; la búsqueda no es fuente para decisiones ni conteos de negocio.
4. **Reconstruible** (ESI-004/15): el índice entero se regenera desde el estado de los módulos; su pérdida no pierde nada.
5. **Relevancia neutral v1**: coincidencia y recencia; sin personalización opaca.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `busqueda_global` (por tenant).
- **Eventos**: ninguno de negocio en v1 (consume, no produce); métricas operativas por telemetría.
- **Contratos**: consulta global tipada (texto + filtro por tipo de entidad, cursor); declaración de indexación por módulo.
- **Configuración**: tipos habilitados por tenant, sinónimos del tenant (vocabulario propio de la operación).
- **KPIs**: búsquedas por tenant, tasa de clic en resultados, búsquedas sin resultados (señal de vocabulario o cobertura), retraso de indexación.
- **Permisos**: `BUSQUEDA.GLOBAL.CONSULTAR`; el filtrado fino lo hacen los permisos de lectura de cada tipo (§2.2).
- **Consumidores**: todos los módulos como declarantes; el cliente como consultante.

## Impacto sobre la implementación

DGP propio (índice, consumidores de indexación, consulta con filtrado de acceso); los módulos declaran su indexación en una tabla por tipo de entidad.

## Dependencias

ESI-004/15; ESI-005/07, /15 y /17; docs 01-02 y 17-20; ETS-009.

## Riesgos

- Fugas por el buscador (existencia de entidades no autorizadas); mitigación: el filtrado §2.2 se prueba con la batería de aislamiento extendida (CA-05) incluyendo permisos por tipo, como criterio de aceptación del servicio.

## Decisiones habilitadas

- Búsqueda global sin JOINs cruzados ni endpoints de búsqueda por módulo.
- Navegación rápida operario-céntrica (códigos físicos → doc 12).

## Decisiones bloqueadas

- Prohibido indexar campos no declarados o sensibles sin refuerzo.
- Prohibido usar el índice para decisiones o conteos de negocio.
- Prohibidas búsquedas textuales libres en el plano transaccional (refuerza ESI-005/07).

## Reusable Pattern

Declaración de indexación por tipo + filtrado de acceso en consulta + reconstruibilidad: el patrón de todo índice derivado futuro.

## Anti-Patterns

- El buscador como API de datos (scraping interno por integradores).
- Índices por módulo compitiendo con el global.
- Relevancia con lógica de dominio dentro del servicio.

## Knowledge Graph

- **ETS que consume**: ETS-008 (contratos), ETS-009 (aislamiento/clasificación).
- **ESI que consume**: ESI-004/15; ESI-005/07, /15, /17.
- **DGP que originará**: DGP-Búsqueda; tablas de indexación en cada DGP-módulo.
- **ADR relacionados**: ADR de búsqueda como proyección (ESI-005/07 §2.3 + este doc).
- **Módulos que reutilizarán este patrón**: todos; Activos e Inventario concentran el volumen de entidades indexadas.
