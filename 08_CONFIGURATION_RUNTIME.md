# 08 — Configuración Centralizada en Runtime

> **DeltaOps — ESI-003 · v1.0** · Una sola lectura, un solo objeto validado, tres planos que no se mezclan.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Los tres planos de configuración

| Plano | Qué es | Dónde vive | Quién lo cambia |
|---|---|---|---|
| **Despliegue** | Valores del mundo de despliegue: conexiones, endpoints, plazos, límites técnicos | Variables de entorno `DELTAOPS_` (ESI-002/07) | Operación, por entorno |
| **Plataforma** | Parámetros técnicos internos con default sensato: tamaños de lote, reintentos, expiraciones de caché | Catálogo tipado con defaults; sobrescribible por entorno | Ingeniería, con PR |
| **Tenant** | Reglas de negocio parametrizables: Policies, capacidades, preferencias | Base de datos, gobernada por ETS-005 | El negocio, por la propia aplicación |

La prueba ácida de ESI-002/07 decide el plano: si le interesa a un tenant o a un auditor, no es variable de entorno.

## 2. Ciclo de vida en runtime

1. **Lectura única al arranque** (doc 02, paso 1): se leen los planos de despliegue y plataforma, se validan contra el catálogo tipado y se congela un objeto de configuración inmutable.
2. **Validación total o aborto**: tipo, rango y presencia; el mensaje de error nombra la variable exacta que falta o es inválida, sin revelar valores secretos.
3. **Distribución por inyección**: cada pieza recibe en su constructor **solo la porción que necesita** (doc 05); prohibido pasear el objeto completo por el sistema.
4. **El plano tenant se resuelve por petición** a través del contexto (doc 09) y la plataforma de ETS-005, con su caché e invalidación propias; nunca al arranque, porque es dato vivo multi-tenant.

## 3. Reglas normativas

1. **Inmutable tras el arranque**: cambiar configuración de despliegue o plataforma = reemplazar el proceso. Sin recarga en caliente en el MVP; si algún parámetro exigiera cambio en vivo, se promueve al plano tenant con diseño ETS-005.
2. **Sin lecturas dispersas**: prohibido leer variables de entorno fuera del punto único de arranque. La regla es verificable mecánicamente en la puerta (ESI-002/14).
3. **Defaults solo locales**: en QA/UAT/PROD todo valor de despliegue es explícito (ESI-002/07).
4. **Los secretos son configuración con reglas extra**: llegan por el mismo canal pero jamás se loguean ni se exponen en salud o errores (ESI-002/08, doc 15).
5. **Catálogo documentado**: toda clave nueva entra con descripción, tipo, default y plano en el catálogo único; la puerta verifica la sincronía con la plantilla local.

## Impacto sobre la implementación

El DGP de plataforma implementa el catálogo tipado, la validación al arranque y la porción-por-constructor. Los plazos del ciclo de vida (drenaje, doc 03) y de los runtimes (docs 19-24) se definen como claves de plano plataforma.

## Dependencias

ESI-002/07 y /08; ETS-005 (plano tenant); docs 02, 05 y 09.

## Riesgos

- Claves de negocio disfrazadas de plataforma para evitar el diseño ETS-005; mitigación: la prueba ácida se aplica en revisión de PR.
- Explosión de claves de plataforma; mitigación: toda clave nueva exige justificación en el PR, y las que nadie ajusta se vuelven constantes.

## Decisiones habilitadas

- Definir los parámetros operativos de todos los runtimes como catálogo tipado con defaults.
- Reemplazo de proceso como único mecanismo de recambio de configuración.

## Decisiones bloqueadas

- Prohibida la recarga de configuración en caliente en el MVP.
- Prohibidas lecturas de entorno fuera del arranque.
- Prohibido mover reglas de negocio al plano de despliegue o plataforma.
