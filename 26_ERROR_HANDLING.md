# 26_ERROR_HANDLING.md

> **DeltaOps — ETS-011 · v1.0** · Estrategia de manejo de errores del Core: cada falla con nombre, dueño y desenlace.
> Documento de diseño. Sin código.

---

## 1. Taxonomía (cuatro géneros, cuatro tratamientos)

| Género | Ejemplos | Tratamiento |
|---|---|---|
| **Rechazo de negocio** | Precondición violada, permiso denegado, validación fallida, conflicto de versión | NO es excepción: es un Resultado del Kernel (02) con código del catálogo (ETS-008/07) — camino normal, esperado, probado |
| **Anomalía registrable** | Lectura que retrocede, dato sospechoso del canal móvil | Tercer desenlace: aceptado-en-revisión (13 §2.4) — el hecho existe apartado |
| **Falla de infraestructura** | Puerto no disponible, timeout, agotamiento | Error técnico transitorio: reintento donde es seguro (idempotencia lo hace seguro), degradación declarada donde no; el usuario recibe error honesto reintentable (ETS-008/07) |
| **Defecto** | Invariante roto que llegó a la BD, violación de muralla física (ETS-010/12 §3), estado imposible | Alarma, jamás manejo silencioso: se registra con contexto completo, se corta la operación, se trata como incidente con dueño |

## 2. Reglas normativas

1. **Los rechazos de negocio no son excepciones** del lenguaje: son valores del dominio (Resultado) — el flujo de control de negocio es visible y probable; las excepciones quedan para lo excepcional (géneros 3-4).
2. **Sin fallbacks silenciosos** (principio rector del proyecto): ante falla, el sistema es explícito — jamás valores por defecto inventados, ni continuar "como si", ni degradar sin declararlo. La degradación legítima existe (IA caída = sin sugerencias, 21 §4) pero es diseñada, visible y con nombre.
3. **Traducción en las fronteras, una vez**: lo físico → vocabulario del puerto (07 §2.2); el Resultado → sobre HTTP con código de catálogo (adaptador de entrada); ninguna capa intermedia envuelve ni re-lanza decorando — cada error cruza cada frontera una sola vez.
4. **Todo error viaja con el contexto de correlación** (02): id de correlación, operación, tenant, etapa del pipeline — el error en el registro y el error del usuario comparten correlación (soporte encuentra en segundos, ETS-008/07).
5. **Los consumidores no mueren, encolan** (10 §2.3): la falla al procesar un evento va a la bandeja con diagnóstico; el flujo sigue; la bandeja tiene dueño y alerta.
6. **El catálogo de errores es cerrado y versionado** (ETS-008/07): un error nuevo es cambio de contrato, no un string creativo; los textos para humanos son de presentación (traducibles), el código es eterno.
7. **Pánico honesto**: si el proceso no puede garantizar consistencia (defecto en pleno UoW), aborta la transacción y el proceso si es necesario — medio-commit jamás; el UoW garantiza que abortar es siempre seguro (08).

---

## Impacto sobre la implementación
El Resultado del Kernel modela el flujo de negocio en todos los casos de uso; los adaptadores concentran la traducción; las bandejas y alarmas de defectos son plataforma de serie; la revisión rechaza capturas silenciosas.

## ETS relacionados
ETS-008 (07 catálogo de errores) · ETS-010 (12 §3 constraints como defecto, 18 idempotencia) · ETS-011 (02 Resultado, 10 bandejas, 13 desenlaces, 27 correlación).

## Riesgos
- Capturas genéricas "por robustez" que tragan defectos → prohibidas; solo las fronteras capturan, y para traducir.
- Códigos de error proliferando sin gobierno → el catálogo ETS-008/07 es la única puerta.

## Decisiones habilitadas
Plantilla de manejo por género, bandejas con dueño, alarmas de defecto, soporte por correlación.

## Decisiones bloqueadas
Mecanismos del lenguaje (excepciones vs valores en la práctica) — implementación fiel a esta taxonomía.
