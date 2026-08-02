# 22 — AI Experience

> **DeltaOps — ESI-008 · v1.0** · La experiencia de IA: siempre marcada, siempre opcional, jamás decide — la IA como copiloto gobernado del usuario operativo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Base congelada y formas

ESI-006/13 fijó la plataforma (casos de uso declarados, exclusión de datos P, servicio requerido). Este documento norma **cómo se presenta**. Las tres formas permitidas:

| Forma | Qué es | Dónde |
|---|---|---|
| **Sugerencia** | Contenido propuesto en un control: prellenado, clasificación sugerida, borrador de texto | Formularios (doc 19), asistentes (doc 17) |
| **Síntesis** | Resumen narrativo de datos que el usuario ya puede ver | Tableros (doc 18), fichas L2, bandeja (doc 15) |
| **Asistente conversacional** | Diálogo desde el shell (doc 02): preguntas, navegación, arranque de acciones | Panel propio, transversal |

## 2. Reglas

1. **Marcado inconfundible y universal**: todo contenido de IA porta la marca del sistema (token semántico dedicado, doc 08) — sin excepciones ni sutilezas; el usuario distingue a un vistazo dato de sugerencia. La pantalla que declara "IA: ninguna" (doc 05) no puede contener nada generado.
2. **La IA propone, el usuario dispone, el comando decide**: ninguna forma de IA dispara comandos por sí misma; la sugerencia aceptada pasa por la edición del usuario y el comando por su pipeline completo (las cuatro verdades, validaciones, auditoría — el actor es el usuario, no la IA). El asistente conversacional puede *preparar* una acción (formulario prellenado) — jamás ejecutarla.
3. **La IA solo ve lo que el usuario ve**: toda consulta de IA corre con el alcance del solicitante (el patrón de identidad del solicitante, ESI-006/19); la exclusión de datos P es de plataforma (ESI-006/13). La IA no es un túnel a través de las murallas.
4. **Honestidad de origen y límites**: las síntesis citan de qué datos salen (período, alcance) y se declaran falibles; el error de IA se corrige con el dato real visible al lado — la síntesis jamás sustituye al número del catálogo (doc 18 §2.1), lo acompaña.
5. **Opcional de verdad**: cada forma es desactivable por preferencia de cuenta y gobernable por tenant (configuración, ESI-006/20); el producto es completamente operable sin IA — la IA es acelerador, no rampa obligatoria.
6. **Degradación silenciosa prohibida, ruidosa también**: sin servicio de IA (offline, doc 11; o no contratada), las superficies de IA desaparecen limpiamente — ni huecos rotos ni disculpas repetidas.

## 3. Declaración (los ocho rubros)

- **Commands**: ninguno propio — la IA no dispara; prepara.
- **Queries**: las consultas de contexto con el alcance del solicitante.
- **Capacidades**: la IA es capacidad contratable (ETS-005, ESI-006/13); sin ella, nada de esto existe.
- **Servicios**: la plataforma de IA (ESI-006/13); configuración para preferencias.
- **Permisos**: los del usuario, siempre; la IA no tiene permisos propios en superficie.
- **Offline**: no disponible (servicio requerido); las superficies desaparecen, lo demás opera.
- **KPIs**: sugerencias aceptadas/editadas/rechazadas (calidad real), uso por forma, desactivaciones (rechazo).
- **IA**: este documento ES el rubro; toda pantalla lo declara: ninguna / sugerencias / asistencia.

## Impacto sobre la implementación

La marca de IA, las tres formas y el panel del asistente entran al DGP de experiencia; cada caso de uso concreto ya se declara por módulo (ESI-006/13).

## Dependencias

Docs 02, 05, 08, 11, 15, 17-19; ETS-005; ESI-006/13, /19, /20; ESI-007/04.

## Riesgos

- Erosión del marcado (la sugerencia que se ve "casi igual" que el dato); mitigación: la marca es token del sistema con revisión de bloqueo (doc 25) — la distinción es contrato, no estilo.

## Decisiones habilitadas

- IA vendible con gobernanza demostrable (marcado + alcance + opcionalidad).
- Métricas reales de valor de IA (aceptación editada, no uso bruto).

## Decisiones bloqueadas

- Prohibido contenido de IA sin marca.
- Prohibido que la IA ejecute comandos.
- Prohibido que la IA acceda más allá del alcance del solicitante.

## Reusable Pattern

Tres formas + marca universal + propone-dispone-decide: la gramática de IA en superficie — cada caso de uso nuevo elige forma, hereda gobierno.

## Anti-Patterns

- El "modo IA" que rediseña la pantalla entera.
- Síntesis presentadas como hechos sin origen.
- La IA como excusa para no diseñar la experiencia base.

## Knowledge Graph

- **ETS que consume**: ETS-005 (capacidad contratable), ETS-012 (IA como diferenciador gobernado).
- **ESI que consume**: ESI-006/13 (plataforma), /19, /20; ESI-007/04.
- **DGP que originará**: marca, formas y asistente en el DGP de experiencia.
- **ADR relacionados**: ADR de propone-dispone-decide; ADR de marca universal de IA.
- **Módulos que reutilizarán este patrón**: todos los casos de uso de IA declarados eligen forma de este catálogo.
