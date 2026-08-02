# 07 — Registro de Capacidades

> **DeltaOps — ESI-003 · v1.0** · Del catálogo congelado de capacidades al encendido por tenant en runtime.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Qué es una capacidad en runtime

Las capacidades son las unidades funcionales gobernables por tenant definidas en ETS-002 y parametrizadas por la plataforma de configuración de ETS-005. En runtime, el registro de capacidades responde una sola pregunta: **¿este tenant, ahora, tiene habilitada esta capacidad?**

## 2. Arquitectura del registro

| Componente | Responsabilidad |
|---|---|
| **Catálogo de capacidades** (Kernel) | Lista congelada de códigos por versión del producto; cargada y verificada al arranque (doc 04) |
| **Declaración por módulo** | Cada módulo declara qué capacidades aporta (doc 06); el arranque verifica que todo código declarado exista en el catálogo y que ninguna capacidad quede huérfana |
| **Estado por tenant** | Qué capacidades tiene activas cada tenant, gobernado por la configuración de tenant (ETS-005) y persistido según ETS-009 |
| **Evaluador de capacidad** (Plataforma) | Servicio de consulta que resuelve capacidad × tenant usando el contexto de ejecución (doc 09) |

## 3. Evaluación en la petición

1. Toda entrada a un caso de uso pasa por la verificación de capacidad **antes** que la de permisos (doc 12): no tiene sentido evaluar permisos sobre una funcionalidad que el tenant no contrató.
2. La verificación la realiza la plataforma, declarativamente: el caso de uso lleva anotada su capacidad en la declaración del módulo; el módulo no la comprueba a mano.
3. Capacidad deshabilitada produce el error canónico correspondiente del catálogo (doc 15), distinguible de "sin permiso": el primero es asunto comercial/configuración, el segundo es asunto de rol.
4. El estado por tenant se cachea por proceso con invalidación por evento de configuración (ETS-005); la frescura exigida es de segundos, no de milisegundos.

## 4. Reglas normativas

1. **El catálogo es congelado por versión**: añadir una capacidad es un cambio de producto (ETS-002), nunca una operación de runtime.
2. **Toda capacidad tiene dueño**: exactamente un módulo la aporta; prohibidas capacidades compartidas entre módulos.
3. **Verificación declarativa y central**: prohibido que cada módulo implemente su propio chequeo de capacidad.
4. **Trazabilidad**: toda denegación por capacidad queda en el log estructurado con tenant y código, para diagnóstico comercial y soporte.
5. **Fallo cerrado**: si el estado de capacidades de un tenant no puede resolverse, se deniega con error explícito; jamás se asume habilitado.

## Impacto sobre la implementación

El DGP de plataforma implementa catálogo, evaluador y caché; los DGP de módulo solo anotan capacidades en sus declaraciones. La UI usa la misma fuente para ocultar funcionalidades (ETS-004).

## Dependencias

ETS-002 (catálogo), ETS-005 (configuración por tenant), docs 04, 06, 09, 12 y 15.

## Riesgos

- Divergencia entre lo que la UI muestra y lo que el backend permite; mitigación: una única fuente de verdad consultable, la UI jamás decide sola.
- Cachés obsoletas tras cambios de contrato del tenant; mitigación: invalidación por evento + expiración corta de respaldo.

## Decisiones habilitadas

- Diseñar el licenciamiento comercial sobre el estado por tenant sin tocar módulos.
- Distinguir métricas de uso por capacidad para producto (doc 17).

## Decisiones bloqueadas

- Prohibido crear capacidades en caliente o fuera del catálogo ETS-002.
- Prohibidos los chequeos de capacidad manuales dentro de casos de uso.
- Prohibido el fallo abierto ante estado irresoluble.
