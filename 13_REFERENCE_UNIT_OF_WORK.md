# 13 — Unit of Work en el Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · Cómo un módulo usa la UoW de plataforma: la demostración de que no hay nada que implementar.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El punto central

La UoW **no se implementa en el módulo**: está congelada en la plataforma (ESI-003/20). Este documento existe para demostrar, con el ejemplar delante, **qué le toca al módulo y qué no**:

| Le toca al módulo | No le toca jamás |
|---|---|
| Recibir la UoW por constructor (puerto del Kernel) | Crear, configurar o personalizar la UoW |
| Delimitar el caso de uso como una unidad (doc 10) | Abrir transacciones adicionales o anidadas |
| Registrar agregados para que sus eventos lleguen al outbox | Escribir en el outbox a mano |
| Aportar la `clave_idempotencia` recibida del comando | Implementar la detección de duplicados |
| — | Fijar el tenant de RLS (lo hace la UoW desde el contexto) |

## 2. Lo que el ejemplar demuestra en pruebas

1. **Atomicidad completa**: si la Policy deniega tras cargar, nada persiste — ni estado, ni outbox, ni clave. La prueba fuerza el fallo en cada paso del caso de uso y verifica el rollback total.
2. **Atomicidad estado+evento**: jamás existe elemento ACTIVO sin su evento en outbox, ni evento sin su cambio. Verificado inspeccionando ambos dentro y fuera de la transacción de prueba.
3. **Duplicado idempotente**: segunda invocación con la misma clave → mismo resultado, cero efectos nuevos, cero eventos nuevos.
4. **Conflicto optimista**: la actualización concurrente produce el error canónico de concurrencia y el perdedor no deja rastro.
5. **Mismo mundo**: la cuenta de activos que ve la Policy y la escritura ocurren en la misma transacción; la prueba de carrera contra el límite demuestra que dos activaciones simultáneas no lo rebasan (combinación de transacción + restricción física si el diseño del módulo la requiere, ETS-010).

## 3. Reglas normativas

1. El caso de uso usa **una** UoW, la inyectada; la prueba con fakes usa el fake de UoW del Kernel, que registra confirmación/reversión para poder afirmarlas.
2. Los consumidores (doc 15) usan su propia UoW por mensaje — misma disciplina, otra unidad de trabajo.

## Impacto sobre la implementación

El DGP del módulo no contiene tareas de UoW: contiene las cinco pruebas del §2, que son las que garantizan que el módulo la usa bien.

## Dependencias

Docs 05, 10, 12, 14; ESI-003/20 (runtime congelado); ETS-009 (idempotencia, versión), ETS-011 (fakes).

## Riesgos

- Módulos futuros "envolviendo" la UoW en abstracciones propias; mitigación: prohibición explícita y ejemplar sin envoltorios como referencia de revisión.

## Decisiones habilitadas

- Batería de pruebas transaccionales patrón, reutilizable por todo módulo.
- Revisión de PR con la tabla §1 como criterio binario.

## Decisiones bloqueadas

- Prohibido implementar, envolver o extender la UoW en módulos.
- Prohibidas transacciones adicionales dentro de un caso de uso.
- Prohibido escribir al outbox u operar RLS manualmente.

## Reusable Pattern

Los DGP futuros copian la tabla de responsabilidades §1 y las cinco pruebas del §2 como pruebas obligatorias de todo comando transaccional de todo módulo.

## Anti-Patterns

- "UnitOfWorkDelModulo" — envoltorios locales de la UoW de plataforma.
- Confirmaciones parciales o "flush intermedio" para ver datos a medias.
- Pruebas que solo cubren el camino feliz transaccional.
