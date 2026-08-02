# 07 — Static Quality Gates

> **DeltaOps — ESI-009 · v1.0** · Las puertas de calidad estática: verificación mecánica, binaria y sin apelación humana — la extensión de la puerta ESI-002/17 a toda la entrega.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La puerta estática es el filtro previo a todo juicio humano (doc 01 §2.4). ESI-002/17 la fundó; este documento consolida su catálogo para la entrega y su régimen de evolución. Una puerta es: **una verificación mecánica, binaria, rápida y con mensaje accionable**. Lo que exige juicio no es puerta: es revisión (doc 06).

## 2. Catálogo de familias de puertas

| Familia | Verifica | Origen normativo |
|---|---|---|
| Forma | Formato de commits, nomenclatura de ramas, contrato de PR completo | Docs 03-05 |
| Tipos y compilación | El monorepo compila; contratos de tipos íntegros | ESI-002 |
| Estilo y convenciones | Reglas de lint del estándar; imports entre módulos legales (ESI-005/04) | ESI-002/17 |
| Arquitectura | Fronteras de módulos, dependencias prohibidas, capas respetadas | ESI-003, ESI-005 |
| Seguridad estática | Secretos en código, dependencias con vulnerabilidades conocidas, patrones inseguros | ESI-007/22 |
| Superficie | Valores visuales sueltos, contraste, semántica de accesibilidad | ESI-008/08, /10, /25 |
| Esquema y contratos | Migraciones reversibles declaradas, compatibilidad N/N-1 de contratos publicados | ESI-003, doc 11 |
| Pruebas | Las baterías del nivel exigido pasan; cobertura no desciende bajo el piso | Doc 08 |

## 3. Reglas normativas

1. **Verde total para integrar**: no hay integración con puertas en rojo; no hay "rojo conocido" tolerado — el rojo conocido se arregla o la regla se ajusta por proceso, jamás se ignora.
2. **Sin apelación humana caso a caso**: la puerta no se discute en el PR; si la regla está mal, se cambia la regla por decisión (ESI-002/27) para todos — la coherencia vale más que la excepción cómoda.
3. **Presupuesto de velocidad**: las puertas de PR responden en minutos; la puerta lenta se optimiza o se reubica al pipeline posterior (doc 09) — la puerta que tarda una hora entrena a la gente a odiarla.
4. **Mensaje accionable obligatorio**: toda puerta en rojo dice qué regla, dónde y cómo corregir; el rojo críptico es un defecto de la puerta.
5. **Los waivers siguen el régimen único** (ESI-007/18): dueño, caducidad, visibles en el tablero; las puertas de seguridad y accesibilidad no se waivean (coherente con ESI-008/25 §3.3).
6. **Las puertas crecen por promoción**: hallazgo humano repetido → regla mecánica propuesta (docs 06 §2.4, ESI-008/25 §3.2); la puerta es el destino natural de toda lección repetida.
7. **Las puertas también se podan**: la regla que solo produce falsos positivos se retira por el mismo proceso; el catálogo vivo se audita con el score (doc 19).

## Impacto sobre la implementación

El catálogo se materializa en la configuración del pipeline (doc 09) por el DGP de entrega; cada familia cita su norma de origen.

## Dependencias

ESI-002/17, /27; ESI-005/04; ESI-007/18, /22; ESI-008/25; docs 03-06, 08-09, 11, 19.

## Riesgos

- Inflación de reglas hasta que el rojo permanente insensibiliza; mitigación: presupuesto de velocidad, poda por evidencia (§3.7) y el principio de que toda regla nueva entra por decisión con justificación.

## Decisiones habilitadas

- Revisión humana concentrada en juicio real.
- Calidad de piso uniforme entre equipos sin vigilancia manual.

## Decisiones bloqueadas

- Prohibido integrar con puertas en rojo.
- Prohibidas excepciones caso a caso sin cambio de regla.
- Prohibidos waivers de seguridad y accesibilidad.

## Reusable Pattern

Mecánico, binario, rápido, accionable + promoción y poda por evidencia: la puerta como institución viva — el patrón ESI-002/17 llevado a régimen permanente.

## Anti-Patterns

- La puerta "advertencia" que todos ignoran (o es roja o no existe).
- Deshabilitar la regla inline "solo por hoy".
- La puerta de 40 minutos en cada PR.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-002/17; ESI-005/04; ESI-007/18, /22; ESI-008/08, /10, /25.
- **DGP que originará**: el catálogo de puertas y su configuración en el DGP de entrega.
- **ADR relacionados**: ADR de puertas sin apelación caso a caso.
- **Módulos que reutilizarán este patrón**: todos pasan las mismas puertas; ninguna excepción por equipo.
