# 26 — Checklist de Revisión

> **DeltaOps — ESI-004 · v1.0** · Lo que el revisor de un PR de módulo verifica, en orden, con citas listas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Naturaleza

Este es el checklist **del revisor humano** para PRs que tocan módulos (el del autor es ESI-002/25). Se centra en lo que la puerta no puede mecanizar: ubicación de lógica, fidelidad al patrón, juicio de diseño. El módulo de referencia es el material de contraste: "¿se parece esto a cómo lo hace `referencia`?"

## 2. El checklist del revisor

### R-01 — Ubicación de la lógica
Cada regla nueva está donde la taxonomía manda (agregado/Policy/servicio/caso de uso — doc 11 §2.3, tabla doc 07 §2). La pregunta operativa: si mañana llega otra vía de entrada (otro comando, un consumidor), ¿la regla se aplica sola o habría que copiarla?

### R-02 — Fronteras intactas
Ningún import cruza fronteras prohibidas (dominio→infraestructura, módulo→módulo, plataforma→módulo). La puerta detecta la mayoría; el revisor busca las fugas semánticas: DTOs de proveedor viajando (ESI-003/24), entidades ORM escapando (doc 12).

### R-03 — Declaratividad
Capacidades, permisos y auditoría declarados, no chequeados a mano (AP-07). Piezas nuevas presentes en la declaración del módulo, en el mismo PR (doc 03 §3).

### R-04 — Contratos y errores
Respuestas y errores por catálogo canónico; ninguna forma inventada; ningún detalle interno filtrado (ESI-003/15). Cambios de contrato con compatibilidad N/N-1 (ESI-002/21).

### R-05 — Pruebas en su nivel
Las pruebas nuevas prueban comportamiento en el nivel correcto (doc 19 §2.2); las baterías patrón instanciadas donde tocan (idempotencia y concurrencia en todo comando nuevo). Ningún mock artesanal de lo que tiene fake (AP-10).

### R-06 — Datos con disciplina
Migraciones expandir-migrar-contraer; seed actualizado si hay estados nuevos; proyecciones con reconstrucción (docs 15/21-C).

### R-07 — Expediente al día
Lo que el PR toca está reflejado en el expediente del módulo (doc 20): líneas de log nuevas en su catálogo, hechos auditados, decisiones locales si hubo elección de diseño.

### R-08 — Tamaño y foco
El PR es un recorrido del Golden Path, no diez (doc 22); si mezcla refactor con funcionalidad, se pide separar (ESI-002/04).

## 3. Reglas

1. El revisor cita: AP-nn (doc 23) o el documento normativo; "no me gusta" no es un hallazgo.
2. Los hallazgos R-01…R-08 bloquean; las sugerencias de estilo no bloquean y se marcan como tales.
3. La revisión de PRs `asistido_ia` usa este mismo checklist con atención extra a R-01 y R-05 (ESI-002/17: la revisión humana es indelegable).

## Impacto sobre la implementación

Se adopta desde el primer PR del DGP del módulo de referencia; la plantilla de PR (T13) enlaza este checklist para el revisor.

## Dependencias

Docs 03, 07, 11, 12, 15, 19-23; ESI-002/04, /17, /21 y /25; ESI-003/15 y /24.

## Riesgos

- Revisiones checklist-mecánicas sin juicio; mitigación: R-01 y R-02 exigen razonamiento, no marcado; la formación de revisores usa el módulo de referencia como contraste.

## Decisiones habilitadas

- Revisiones uniformes entre revisores y equipos.
- Formación de revisores con material de contraste concreto.

## Decisiones bloqueadas

- Prohibido aprobar con hallazgos R-nn abiertos.
- Prohibido usar criterios personales no citables como bloqueo.

## Reusable Pattern

Los DGP futuros heredan este checklist sin cambios: es por naturaleza independiente del dominio. Solo el material de contraste crece (más módulos ejemplares con el tiempo — el de referencia sigue siendo el canónico).

## Anti-Patterns

- Revisión de aprobación automática ("LGTM" sin recorrido).
- Revisar estilo y omitir ubicación de lógica (lo barato en vez de lo importante).
- Debates de diseño en el PR que pertenecen al proceso de cambio de reglas.
