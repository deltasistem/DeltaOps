# 25 — Checklist de Revisión de Servicios Compartidos

> **DeltaOps — ESI-006 · v1.0** · Lo que el revisor verifica en todo cambio del estrato compartido — el ojo humano donde la máquina no llega.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Naturaleza

Complementa el checklist de implementación (doc 24): la puerta verifica lo mecánico; el revisor verifica intención y fronteras. Hereda el régimen de revisión de ESI-004/26 y añade las preguntas propias del estrato, RS-01…RS-08 (Revisión de Servicio):

## 2. Las preguntas del revisor

| # | Pregunta | Qué caza |
|---|---|---|
| **RS-01** | ¿El cambio mantiene la neutralidad de dominio? ¿Aparece algún `if` conceptual por módulo, algún conocimiento de qué es una OT? | El deslizamiento semántico hacia el ESB (doc 14 §riesgos) |
| **RS-02** | ¿Los datos de negocio se leen con la identidad del solicitante? ¿Se coló algún acceso privilegiado "para rendimiento"? | La violación del doc 19 §3.2 — la más tentadora del estrato |
| **RS-03** | ¿Los contratos nuevos declaran su patrón de autorización (propio/derivado/doble llave) y el correcto? | Autorización ad-hoc; doble llave degradada |
| **RS-04** | Ante consumidores nuevos o marcas nuevas: ¿el contrato de la marca se cumple o se parchea con casos especiales? | La marca con excepciones = lista de módulos encubierta |
| **RS-05** | ¿El cambio de contrato recorre la fila de consumidores (doc 22 §2.4) con N/N-1 planificado? | Roturas de consumidores por cambios "internos" |
| **RS-06** | ¿Los estados y errores nuevos son explícitos (denegación por cuota, degradación por proveedor)? ¿Algo falla en silencio? | Degradaciones silenciosas (doc 20 §2.2) |
| **RS-07** | ¿Lo proyectado sigue reconstruible? ¿El cambio añadió estado no derivable sin decisión registrada? | Proyecciones convertidas en fuente de verdad |
| **RS-08** | ¿La funcionalidad nueva pertenece al servicio o es semántica de un módulo pidiendo posada? | El criterio de admisión (doc 01 §3) erosionado cambio a cambio |

## 3. Reglas de aplicación

1. **RS-01, RS-02 y RS-08 son de bloqueo**: sus hallazgos detienen el cambio hasta resolverse o registrar la decisión (proceso ESI-002/27); el resto admite seguimiento con dueño y fecha.
2. **La revisión es proporcional** (ESI-004/26): cambios de contrato publicado o de autorización exigen revisor senior del estrato; ajustes internos siguen el flujo normal.
3. **Los hallazgos alimentan el catálogo de anti-patrones**: un RS repetido tres veces se candidatea a validación mecánica en la puerta (regla de promoción de ESI-002/17).

## Impacto sobre la implementación

Entra a la plantilla de revisión del repositorio para cambios bajo el estrato; sin herramienta nueva.

## Dependencias

ESI-004/26; ESI-002/17 y /27; docs 01, 14, 18-22 y 24.

## Riesgos

- Revisiones ritualizadas (checkbox sin mirada); mitigación: cada RS exige cita del hallazgo o "no aplica" razonado, no marcas ciegas — el mismo régimen que R-01…R-08 (ESI-004/26).

## Decisiones habilitadas

- Defensa humana sistemática de las tres fronteras del estrato (neutralidad, identidad, admisión).
- Promoción de hallazgos repetidos a validación mecánica.

## Decisiones bloqueadas

- Prohibido aprobar cambios con RS-01/02/08 abiertos.
- Prohibidas revisiones sin cita o razonamiento por pregunta.
- Prohibido que el autor sea el único revisor de cambios de contrato.

## Reusable Pattern

RS-01…RS-08 con bloqueo selectivo y promoción a puerta: la instancia del patrón de revisión (ESI-004/26) especializada en las fronteras del estrato.

## Anti-Patterns

- Revisar solo el diff sin mirar la declaración del registro.
- Tratar RS-05 como "problema del consumidor".
- Acumular seguimientos sin dueño hasta que prescriben.

## Knowledge Graph

- **ETS que consume**: ETS-010 (calidad exigible).
- **ESI que consume**: ESI-002/17 y /27; ESI-004/26.
- **DGP que originará**: la plantilla de revisión del estrato en cada DGP-servicio.
- **ADR relacionados**: ADR de bloqueo selectivo (§3.1); ADR de promoción hallazgo→puerta (ESI-002/17).
- **Módulos que reutilizarán este patrón**: sus revisiones siguen R-01…R-08 y RN-01…RN-07; RS aplica solo al estrato compartido.
