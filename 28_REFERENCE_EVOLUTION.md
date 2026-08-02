# 28 — Evolución del Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · Cómo evoluciona el patrón sin dejar huérfanos a los módulos que ya lo siguen.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Principio

El módulo de referencia es **normativo**: cambiarlo cambia la definición de "módulo bien hecho". Por eso evoluciona con las mismas garantías que las reglas de plataforma (ESI-002/27) y con una obligación extra: **todo cambio del patrón declara qué pasa con los módulos ya construidos con la versión anterior.**

## 2. Tipos de cambio

| Tipo | Ejemplo | Tratamiento |
|---|---|---|
| **Aclaración** | Redactar mejor una regla, añadir una prueba que faltaba al patrón | PR normal sobre la serie/módulo; sin impacto en módulos existentes |
| **Extensión** | La plataforma añade una pieza nueva (p. ej. un runtime nuevo de ESI-003/28) y el patrón debe demostrarla | El módulo de referencia la incorpora primero; los módulos existentes la adoptan por el plan de adopción del cambio |
| **Corrección del patrón** | Se descubre que una práctica del patrón causa daño | Cambio de regla (ESI-002/27) + el módulo de referencia se corrige + plan de migración para módulos afectados, priorizado por daño |
| **Cambio de arquitectura** | Un ETS/ESI congelado evoluciona formalmente | Fuera del alcance de esta serie: la serie se actualiza como consecuencia, nunca como causa |

## 3. Mecánica de evolución

1. **El módulo y su serie cambian juntos**: un PR que cambia el patrón toca el documento normativo, el módulo, las plantillas y los generadores afectados (regla de sincronía de ESI-002/18, ampliada al patrón). Divergencia doc↔módulo = defecto de máxima prioridad, porque el patrón miente.
2. **Deriva vigilada**: la comparación mecánica plantillas↔módulo (CA-07, doc 25) corre en la puerta permanentemente, no solo en la aceptación.
3. **Los módulos existentes no migran automáticamente**: cada cambio de patrón declara su clase de adopción — inmediata (seguridad), en la próxima intervención del módulo (mejoras), u opcional (aclaraciones). El inventario de adopciones pendientes es visible (ESI-002/27, salud de plataforma).
4. **El patrón no versiona aparte**: viaja con la versión del producto (ESI-002/21); "construido con patrón viejo" se lee en el inventario de adopciones, no en etiquetas.

## 4. Señales de evolución (señal → respuesta)

| Señal | Respuesta |
|---|---|
| DGP repitiendo la misma desviación justificada | El patrón está incompleto: extensión |
| Revisores citando reglas que no logran ubicar en la serie | Aclaración |
| Un AP nuevo recurrente en PRs | Alta en doc 23 por proceso + posible pieza de puerta |
| Módulos reales sin usar una pieza del patrón sistemáticamente | Revisar si la pieza es patrón o era circunstancia del ejemplar |

## Impacto sobre la implementación

Define el mantenimiento permanente del patrón tras su aceptación: dueño, sincronía mecánica y clases de adopción. El dueño del patrón es el dueño de arquitectura (ESI-002/27).

## Dependencias

Docs 21-25; ESI-002/18, /21, /27 y /28; ESI-003/28.

## Riesgos

- Patrón congelado por miedo al coste de adopción; mitigación: las clases de adopción desacoplan corregir el patrón de migrar el mundo; corregir es barato, migrar se prioriza.
- Evolución del patrón sin actualizar la serie (el código se adelanta a la norma); mitigación: regla de sincronía §3.1 verificada en revisión.

## Decisiones habilitadas

- Evolucionar el patrón con coste de adopción explícito y gobernado.
- Mantener la verdad única doc↔módulo↔plantillas mecánicamente.

## Decisiones bloqueadas

- Prohibido cambiar el módulo de referencia sin cambiar su documento normativo en el mismo PR.
- Prohibida la migración forzosa masiva de módulos salvo clase "inmediata" (seguridad).
- Prohibido que el patrón contradiga un ETS/ESI vigente.

## Reusable Pattern

Los DGP futuros heredan: las clases de adopción como vocabulario estándar de cambio, y la regla "norma y ejemplar cambian juntos" aplicada a sus propios expedientes.

## Anti-Patterns

- "El módulo de referencia quedó viejo, ya nadie lo mira" — el abandono del patrón es el fracaso de la serie.
- Migraciones masivas de módulos por perfeccionismo sin daño que lo justifique.
- Evolucionar plantillas sin evolucionar el ejemplar (o viceversa).

---

**Fin de la serie ESI-004.**
