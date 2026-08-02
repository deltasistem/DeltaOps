# 10 — Release Pipeline

> **DeltaOps — ESI-009 · v1.0** · El pipeline de liberación: promoción del mismo artefacto por entornos, verificación creciente y la liberación como no-evento.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La liberación es el tramo del flujo entre la principal y producción. Su meta normativa: que liberar sea **frecuente, aburrido y reversible** — el drama de liberación es el síntoma de un proceso enfermo.

## 2. Reglas normativas

1. **Cadena de entornos normada**: desarrollo → integración → preproducción → producción; cada entorno existe para una pregunta distinta (¿funciona junto?, ¿funciona como producción?, ¿funciona de verdad?). El DGP fija cuántos y cómo; el modelo fija que se promueve **el mismo artefacto** con configuración por entorno (ESI-006/20) — jamás una reconstrucción.
2. **La versión candidata nace de la principal** con etiqueta (doc 11); si el DGP habilita rama de release, es de estabilización breve (doc 03) — solo correcciones, nada nuevo.
3. **Verificación creciente por entorno**: integración corre las suites completas; preproducción corre E2E de jornadas críticas, migraciones ensayadas contra datos de forma productiva (sintéticos, ESI-007/16) y verificación de rendimiento; producción recibe verificación post-despliegue (§2.7).
4. **Las migraciones viajan con la versión** y respetan expandir-migrar-contraer (ESI-003): compatibles con N-1 en expansión, contracción solo cuando ninguna versión activa las necesita — la base de la reversa sin drama (doc 14).
5. **La promoción a producción es decisión registrada**: quién, qué versión, con el checklist de liberación (doc 25) en verde; puede ser diaria y rutinaria, pero jamás anónima.
6. **Las notas de liberación se derivan de la historia** (doc 04 §2.1): qué entra, qué toggles trae, qué migraciones ejecuta — generadas, no redactadas de memoria.
7. **La liberación termina con la señal, no con el despliegue**: las señales de Observabilidad declaradas por los cambios (doc 05 §2.6) se confirman en producción durante la ventana definida; sin confirmación, la liberación no se considera exitosa y la reversa (doc 14) está sobre la mesa.
8. **El tren no espera a nadie**: la cadencia de liberación es regular (el DGP la fija); el cambio que no llegó, va en el siguiente — nada de "aguántame el release" (los toggles, doc 12, eliminan la necesidad).

## Impacto sobre la implementación

La cadena de entornos, la ventana de confirmación y la cadencia del tren se fijan en el DGP de entrega; la configuración por entorno ya está normada por ESI-006/20.

## Dependencias

ESI-003 (migraciones); ESI-006/20; ESI-007/16; docs 03-05, 09, 11-12, 14, 25.

## Riesgos

- Preproducción divergiendo de producción hasta volver la verificación teatro; mitigación: paridad declarada en el DGP y auditada; toda diferencia conocida se registra y se justifica.

## Decisiones habilitadas

- Liberaciones frecuentes de bajo riesgo con reversa ensayada.
- Confianza en preproducción como ensayo real de migraciones.

## Decisiones bloqueadas

- Prohibido promover artefactos distintos del verificado.
- Prohibidas migraciones fuera de expandir-migrar-contraer.
- Prohibido declarar éxito sin confirmar las señales declaradas.

## Reusable Pattern

Mismo artefacto + verificación creciente + promoción registrada + confirmación por señal: la liberación como no-evento repetible.

## Anti-Patterns

- El "release del viernes por la noche" con todos en línea.
- Arreglar en preproducción editando a mano lo que la versión trae mal.
- Declarar éxito porque "no llegó ninguna queja".

## Knowledge Graph

- **ETS que consume**: ETS-012 (la cadencia que el mercado exige).
- **ESI que consume**: ESI-003 (expandir-migrar-contraer); ESI-006/20 (configuración por entorno); ESI-007/16.
- **DGP que originará**: cadena de entornos, cadencia y ventana de confirmación en el DGP de entrega.
- **ADR relacionados**: ADR de promoción de artefacto único; ADR de tren de liberación.
- **Módulos que reutilizarán este patrón**: todos liberan por el mismo tren; ninguno tiene pipeline propio.
