# 17 — Human Engineering Workflow

> **DeltaOps — ESI-010 · v1.0** · El flujo de trabajo humano: dónde el juicio humano es insustituible, cómo se le protege el foco y qué se le exige — el mismo estándar, el rol propio.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

En un sistema con puertas mecánicas, registros consultables e IA generando dentro de patrones, el trabajo humano se concentra donde vale: **decidir, diseñar, revisar, responder y aprender**. Este documento no crea proceso nuevo — nombra el rol humano dentro del flujo único (doc 02).

## 2. Las responsabilidades insustituibles

1. **Decidir**: las decisiones normativas, de arquitectura y de tradeoff son humanas por diseño (ESI-002/27, doc 16 §2.5); la evidencia informa, la persona decide y firma.
2. **Encuadrar**: formular el problema contra el corpus (doc 02 §2.2) — la habilidad central del ingeniero de esta casa: saber qué existe, qué aplica, qué falta; el encuadre es lo que la IA amplifica o degrada según su calidad.
3. **Revisar**: DR-01…06 (ESI-009/06) y las preguntas de dominio (XR, SR) son juicio; el revisor responde por lo que aprueba.
4. **Responder**: la operación (incidentes, reversas, promociones) tiene conductor humano con nombre (ESI-009/10 §2.5, /15 §2.1).
5. **Aprender y enseñar**: retrospectivas, promociones a puerta, mentoría — el conocimiento que el corpus no captura viaja por personas, y lo que se repite se escribe (doc 22).

## 3. Reglas normativas

1. **El dueño humano es explícito en todo**: cambios (ESI-009/05), módulos (doc 11), artefactos (doc 03), decisiones (doc 07) — la propiedad difusa es la antesala del abandono.
2. **El foco se protege estructuralmente**: las ceremonias son mínimas (ESI-009/20 §2.4), lo mecánico está en puertas, el estado vive en tableros — interrumpir a una persona para preguntar lo que un registro responde es un defecto de proceso, no un estilo.
3. **La competencia sobre el corpus es exigible**: operar en esta casa exige saber navegarla (doc 04); el onboarding entrena la navegación antes que la producción — el ingeniero que no consulta produce lo plausible-pero-ilegal igual que la IA sin contexto (doc 16 §2.1).
4. **La proporción del trabajo se vigila**: si las personas pasan el día alimentando el proceso en vez de ejerciendo el juicio, el proceso está enfermo — E1/E8 (ESI-009/19 §3.6) y la poda de ceremonia existen para eso.
5. **El desacuerdo tiene canal**: quien ve un defecto en una norma congelada lo lleva al proceso (doc 07); acatar-y-proponer en vez de erosionar en silencio — el estándar se cambia por el canal, se cumple mientras tanto.

## Impacto sobre la implementación

Sin mecanismo nuevo: perfiles de onboarding y expectativas de rol se materializan en la documentación operativa del DGP de entrega.

## Dependencias

ESI-002/27; ESI-009/05-06, /10, /15, /19-20; docs 02-04, 07, 16, 22.

## Riesgos

- El péndulo hacia "todo lo hace la IA y el humano firma sin leer"; mitigación: el dueño que entiende (doc 16 §2.4) es exigible en revisión — firmar sin entender es el hallazgo, no la norma.

## Decisiones habilitadas

- Talento concentrado en juicio, diseño y aprendizaje.
- Onboarding con expectativas explícitas de navegación del corpus.

## Decisiones bloqueadas

- Prohibida la propiedad difusa ("del equipo") sin persona responsable.
- Prohibido el desacuerdo por erosión en vez de por el canal.
- Prohibido consumir el foco humano en lo que registros y puertas resuelven.

## Reusable Pattern

Humano = decidir, encuadrar, revisar, responder, aprender — con dueño explícito y foco protegido: el rol humano como complemento diseñado del sistema mecánico.

## Anti-Patterns

- La reunión de estado que un tablero sustituye.
- El "aprobador" que no leyó lo que aprueba.
- El ingeniero estrella que opera fuera del corpus "porque sabe".

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-002/27 (decidir); ESI-009 (los roles del flujo).
- **DGP que originará**: expectativas de rol y onboarding en el DGP de entrega.
- **ADR relacionados**: ADR de responsabilidades humanas insustituibles.
- **Módulos que reutilizarán este patrón**: todos los equipos operan con estos roles.
