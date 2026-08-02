# 20 — Documentación del Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · Qué documenta un módulo, dónde y con qué límite — con el ejemplar como demostración.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El expediente documental del módulo

Conforme a ESI-002/23 (tipos y hogares), todo módulo mantiene junto a su código:

| Documento | Contenido | Regla de vida |
|---|---|---|
| **Presentación del módulo** | Propósito, lenguaje del dominio, el mapa de piezas (la tabla del doc 01 §3 instanciada) | Se actualiza con cada pieza nueva |
| **Decisiones del módulo (ADR locales)** | Las decisiones de diseño propias, con su porqué (p. ej. por qué el resumen es proyección y no vista) | Solo se añaden; se marcan reemplazadas |
| **Catálogo de líneas de log** | La tabla del doc 16 §2 | Con cada línea nueva |
| **Catálogo de hechos auditados** | La tabla del doc 17 §1 | Con cada hecho nuevo |
| **Operación del módulo** | Respuestas a alertas propias (reconstruir proyección, doc 15/18), procedimientos de reproceso | Con cada alerta nueva |
| **Capítulo de seed** | Escenarios con nombre y su intención (la asimetría del doc 04 §3 documentada) | Con cada escenario |

## 2. Qué NO documenta un módulo

1. Lo que la plataforma ya norma (transacciones, RLS, middleware): se **cita** ESI-003, no se repite (ESI-002/23: citar, no repetir).
2. Lo que el código dice mejor: firmas, estructuras, listas de rutas — el generador de contratos (ETS-008) y la declaración del módulo son la verdad.
3. Manuales de usuario: pertenecen al producto, no al repositorio del módulo.

## 3. Qué demuestra

1. **El expediente completo es pequeño**: seis documentos cortos y vivos; la documentación de módulo es mantenible precisamente porque cita en lugar de repetir.
2. **Documentación como criterio de hecho**: el checklist del módulo (doc 21) exige el expediente al día; un módulo sin su expediente no está terminado (Charter §9).
3. **Trazabilidad diseño → código**: cada pieza del módulo referencia el documento de esta serie que la norma, cerrando el circuito ETS/ESI ↔ implementación.

## Impacto sobre la implementación

La plantilla T09 (módulo) genera el esqueleto del expediente; la plantilla T15 (documento de ingeniería) da el formato. El DGP incluye la redacción del expediente como tareas de primera clase.

## Dependencias

ESI-002/18 y /23; docs 01, 04, 15-18 y 21; Charter §9; ETS-008 (contratos generados).

## Riesgos

- Expedientes que nacen y mueren ("documentación de lanzamiento"); mitigación: las reglas de vida §1 son por evento (cada pieza nueva), no por calendario, y el checklist de revisión (doc 26) las verifica en PR.

## Decisiones habilitadas

- Formato uniforme de expediente para todos los módulos.
- Onboarding por módulo apoyado en la presentación (ESI-002/06).

## Decisiones bloqueadas

- Prohibido repetir normas de plataforma en documentación de módulo.
- Prohibido documentar rutas o contratos a mano si se generan.
- Prohibido cerrar un PR con el expediente desactualizado en lo que el PR toca.

## Reusable Pattern

Los DGP futuros copian: la tabla del expediente §1 como estructura obligatoria, la lista negativa §2 tal cual, y la trazabilidad pieza→documento normativo §3.3.

## Anti-Patterns

- Wikis externas divergiendo del repositorio (la verdad vive en el repo, ESI-002/01).
- Comentarios masivos en lugar de documentos con dueño.
- Documentar "cómo funciona" copiando el diseño en vez de citarlo.
