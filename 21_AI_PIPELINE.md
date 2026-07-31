# 21_AI_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de IA: cómo la inteligencia propone dentro del Core sin jamás disponer.
> Documento de diseño. Sin código, sin clases.

---

## 1. Principio rector

**La IA propone, el humano (o una regla explícita del tenant) dispone** (ETS-003/04 §12, U-38/U-40). En términos del Core: los proveedores de IA son puertos de salida (06) consumidos por casos de uso internos; sus salidas son **sugerencias persistidas**, jamás comandos ejecutados.

## 2. Las etapas

```text
1. DISPARO      consumidor de eventos (10) o solicitud explícita del
                usuario (asistente) — según la capacidad (predicción,
                anomalía, recomendación, asistencia)
2. PREPARACIÓN  el caso de uso interno arma la entrada SOLO con datos
                del tenant, dentro del alcance, según el contrato de
                la capacidad versionada (ETS-007/09)
3. EVALUACIÓN   puerto Proveedor de IA: entrada contratada → salida
                contratada (sin efectos; el proveedor jamás toca
                puertos de persistencia)
4. SUGERENCIA   hecho en ia.sugerencia (ETS-010/03): capacidad y
                versión, entrada resumida, salida, confianza,
                EVIDENCIA (en qué se basó — explicabilidad U-19)
5. PRESENTACIÓN visible según Policy del tenant (05: umbral de
                confianza, capacidades habilitadas); notificable (16)
6. DESENLACE    aceptar = COMANDO NORMAL del usuario por el pipeline
                11 (con asistido_ia = verdadero); descartar = hecho
                con motivo — ambos alimentan la mejora
```

## 3. Reglas normativas

1. **Cero autoridad**: ninguna salida de IA muta la verdad; el comando que la materializa lleva actor humano (o regla explícita configurada, y entonces el actor es la regla, auditada) — la marca `asistido_ia` viaja al hecho (Kernel, 02).
2. **Aislamiento por tenant absoluto**: preparación y evaluación jamás cruzan tenants; los modelos por tenant o los compartidos con garantías se gobiernan en ETS-007/09 — el Core solo conoce el contrato de la capacidad.
3. **Capacidades versionadas**: cada capacidad declara entrada, salida, evidencia y versión; una sugerencia siempre sabe qué versión la produjo (reproducibilidad, misma disciplina que la configuración 15).
4. **Degradación limpia**: proveedor caído = sin sugerencias (el sistema opera completo sin IA); jamás bloquea un comando ni una consulta — la IA es capa aditiva (NT ETS-007).
5. **El feedback es un hecho**: aceptaciones y descartes con motivo quedan persistidos — el aprendizaje tiene materia prima gobernada, dentro del tenant.
6. **Costos y límites por tenant**: la evaluación respeta cuotas configuradas (Policy); el consumo es medible por tenant (ETS-007/10).

---

## Impacto sobre la implementación
Los casos de uso internos de IA y el hecho de sugerencia se implementan como cualquier módulo; los proveedores quedan detrás de puertos con contratos por capacidad; ninguna dependencia de IA entra al dominio de otros módulos.

## ETS relacionados
ETS-007 (09 arquitectura IA) · ETS-005 (11 configuración IA) · ETS-008 (14 API de IA) · ETS-010 (03 ia.sugerencia) · ETS-011 (05, 06, 10, 11).

## Riesgos
- "Automatización gradual" que erosiona el propone-no-dispone → la única vía de acción es regla explícita del tenant, configurada y auditada; sin excepciones de plataforma.
- Evidencia pobre vuelve las sugerencias incuestionables o inservibles → la evidencia es parte del contrato de capacidad, no opcional.

## Decisiones habilitadas
Contratos por capacidad, hecho de sugerencia, marca IA de punta a punta, medición de aceptación.

## Decisiones bloqueadas
Proveedores/modelos concretos y las capacidades de lanzamiento (priorización de producto) — implementación.
