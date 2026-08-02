# 04 — Inicialización del Kernel

> **DeltaOps — ESI-003 · v1.0** · El anillo interior en runtime: contratos vivos, catálogos cargados, invariantes activas.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Qué contiene el Kernel en ejecución

El Kernel diseñado en ETS-011 se materializa en runtime como el conjunto de piezas sin efectos colaterales que todos los módulos comparten:

| Pieza | Contenido | Fuente de diseño |
|---|---|---|
| Tipos base | Identificadores, dinero, cantidades, fechas de negocio (fechaNegocio/fechaRegistro) | ETS-003, ETS-011 |
| Contratos de puertos | UoW, repositorio, dispatcher, reloj, generador de identificadores, archivos | ETS-011 |
| Catálogo de errores | Errores canónicos con código estable, en español | ETS-011, doc 15 |
| Policies | Contratos de decisión de negocio parametrizables por tenant | ETS-005, ETS-011 |
| Contexto de ejecución | Contrato del contexto (tenant, usuario, permisos, correlación) | Doc 09 |
| Catálogos congelados | Códigos de capacidades, permisos y eventos (ETS-002/008) | ETS-002, ETS-008 |

## 2. Inicialización

1. El Kernel se inicializa en el paso 4 del bootstrap (doc 02), antes que cualquier módulo.
2. La inicialización consiste en **cargar y verificar catálogos**: errores, capacidades, permisos y tipos de evento se validan por integridad (códigos únicos, sin huecos, referencias válidas).
3. Los catálogos son **inmutables tras el arranque**: ninguna pieza puede registrar errores o permisos nuevos en caliente.
4. El Kernel no abre conexiones, no lee la red, no toca disco: su inicialización es puramente en memoria y por eso es rápida y determinista.

## 3. Reglas normativas

1. **Cero dependencias hacia afuera**: el Kernel no importa nada de la Plataforma, del Arranque ni de módulos. La regla es verificable mecánicamente (puerta de calidad, ESI-002/14).
2. **Solo contratos y valores**: el Kernel define qué se puede pedir, jamás cómo se cumple. Toda implementación vive en la Plataforma.
3. **Lenguaje ubicuo en español**: todos los nombres del Kernel siguen ETS-003 y ESI-002/24.
4. **Cambiar el Kernel es cambiar el sistema**: cualquier modificación exige revisión del dueño de arquitectura (ESI-002/27) porque afecta a todos los módulos a la vez.
5. **Versionado implícito**: el Kernel no se versiona aparte; viaja con la versión única del producto (ESI-002/21).

## 4. Relación con los módulos

Los módulos importan del Kernel y solo del Kernel. Cuando dos módulos necesitan compartir algo, la pregunta obligatoria es: ¿es un contrato universal (va al Kernel, con revisión de arquitectura) o es acoplamiento indebido (se resuelve por eventos)? No existe una tercera opción tipo "librería común entre dos módulos" (ESI-002/02).

## Impacto sobre la implementación

El DGP del Kernel es el primero de la secuencia (ESI-002/20): sin Kernel verificado no se construye plataforma ni módulos. Sus pruebas son unitarias puras, sin infraestructura.

## Dependencias

ETS-002, ETS-003, ETS-005, ETS-008, ETS-011; docs 05, 09 y 15 de esta serie.

## Riesgos

- Que el Kernel engorde con utilidades convenientes hasta volverse un cajón de sastre; mitigación: prohibición de `utils` (ESI-002/03) y revisión de arquitectura obligatoria.
- Catálogos desincronizados con la BD física (ETS-010); mitigación: verificación de integridad al arranque compara catálogo contra esquema.

## Decisiones habilitadas

- Escribir el DGP del Kernel con alcance cerrado.
- Verificar mecánicamente la regla de dependencias en la puerta de CI.

## Decisiones bloqueadas

- Prohibido efecto colateral alguno dentro del Kernel.
- Prohibido registrar entradas de catálogo en caliente.
- Prohibido que el Kernel dependa de librerías fuera de la lista mínima aprobada.
