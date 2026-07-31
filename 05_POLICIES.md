# 05_POLICIES.md

> **DeltaOps — ETS-011 · v1.0** · Policies: los puntos de decisión variables del negocio, encapsulados y gobernados.
> Documento de diseño. Sin código, sin clases.

---

## 1. Definición

Una Policy es **una decisión de negocio cuya respuesta varía por configuración del tenant** (o del contexto organizacional), encapsulada detrás de una pregunta estable. El dominio pregunta ("¿puede el despacho dejar saldo negativo?"); la Policy responde según la configuración resuelta y versionada — el dominio nunca lee configuración cruda ni conoce la cascada (ETS-005).

## 2. Catálogo por familia (las preguntas, no las respuestas)

| Familia | Preguntas típicas |
|---|---|
| **Inventario** | ¿Saldo negativo permitido? ¿Reserva obligatoria antes de despacho a OT? |
| **Mantenimiento/OT** | ¿Qué transiciones exige el workflow vigente? ¿Firma requerida al cerrar? ¿Tolerancia de vencimiento de preventivos? |
| **Aprobaciones** | ¿Cuántos niveles, quiénes, desde qué monto? (compras, ajustes, bajas) |
| **Medidores** | ¿Tolerancia de retroceso? ¿Apartar o rechazar fuera de rango? |
| **Combustible** | ¿Umbral de consumo anómalo? ¿Combustibles admitidos por tipo de activo? |
| **Archivos** | ¿Evidencia obligatoria por tipo de operación? ¿Tipos/tamaños admitidos? |
| **Notificaciones** | ¿Qué eventos notifican a quién por qué canal? (suscripciones) |
| **Retención/privacidad** | ¿Horizontes por familia de datos dentro de mínimos de plataforma? |
| **IA** | ¿Capacidades habilitadas? ¿Umbral de confianza para mostrar sugerencias? |
| **Numeración** | ¿Formato de folios por tipo de documento? |

## 3. Reglas normativas

1. **La pregunta es estable, la respuesta es configuración**: agregar variabilidad nueva = nueva versión de configuración (ETS-005), no código nuevo; agregar una *pregunta* nueva sí es cambio de Core gobernado (28).
2. **Toda Policy se evalúa contra una versión resuelta** entregada por el pipeline 15; la versión usada queda congelada en el hecho (ETS-009/05) — la respuesta de ayer es reproducible por siempre.
3. **Las Policies viven en el dominio** del módulo dueño de la pregunta; son puras (la resolución de configuración ya ocurrió afuera).
4. **Denegar por defecto**: ante configuración ausente o ilegible, la Policy responde el lado seguro (rechazar, exigir aprobación, apartar) y el error es explícito — jamás un permisivo silencioso (coherente con NP y ETS-008/07).
5. **Sin jerarquías de Policies**: una Policy no consulta otra; si dos preguntas se combinan, el Domain Service combina las respuestas — la composición es visible en el motor, no oculta en cadena.
6. Las decisiones de Policy relevantes quedan **explicables**: el hecho registra qué configuración (id+versión) determinó la decisión — el "¿por qué me lo rechazó?" siempre tiene respuesta (U-19).

## 4. Frontera con el Motor de Reglas (ETS-005/05)

El Motor de Reglas evalúa reglas configurables **reactivas** (umbrales que disparan alertas/acciones sobre el flujo de eventos). Las Policies son **decisiones dentro del comando**. Ambos leen la misma configuración versionada; ninguno duplica al otro: si una regla del tenant debe *bloquear* un comando, es Policy; si debe *reaccionar* a un hecho, es regla del motor.

---

## Impacto sobre la implementación
Cada punto configurable identificado en ETS-005 se implementa como Policy con su pregunta declarada; el inventario de Policies por módulo forma parte de los metadatos del caso de uso (03 §3.6).

## ETS relacionados
ETS-005 (plataforma de configuración, 05 motor de reglas) · ETS-009 (05 versiones congeladas) · ETS-011 (04 frontera con motores, 15 resolución).

## Riesgos
- Policies que crecen hasta ser motores → si hay mecánica invariable adentro, se extrae a Domain Service (04 §4).
- Defaults permisivos introducidos por conveniencia en pruebas → regla §3.4 verificada en revisión y pruebas de configuración ausente.

## Decisiones habilitadas
Inventario de Policies por módulo, pruebas de matriz de configuración, explicabilidad de decisiones.

## Decisiones bloqueadas
Lista exhaustiva y cerrada de Policies (crece con ETS-005 aplicado módulo a módulo en implementación) y su forma concreta.
