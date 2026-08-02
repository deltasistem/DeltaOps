# 11 — Version Strategy

> **DeltaOps — ESI-009 · v1.0** · La estrategia de versionado: versionado semántico por contrato, derivado de la historia, y N/N-1 como ley de compatibilidad.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Qué se versiona

| Objeto | Esquema | Norma de compatibilidad |
|---|---|---|
| **El producto** (artefacto liberado) | Semántico `MAYOR.MENOR.PARCHE` | La versión es la unidad de promoción y reversa |
| **Contratos publicados** (API ESI-003, eventos, exportes) | Por contrato, N/N-1 | El consumidor en N-1 sigue funcionando |
| **Esquema de datos** | Por migraciones ordenadas | Expandir-migrar-contraer (ESI-003) |
| **Normas y tokens** (ESI-002/27, ESI-008/08) | N/N-1 documental | Ya congelado por sus series |

## 2. Reglas normativas

1. **La versión se deriva, no se negocia**: los tipos y marcadores de los commits (doc 04) determinan el incremento — ruptura marcada → mayor; funcionalidad → menor; corrección → parche. La versión es un hecho de la historia, no una decisión de marketing (los nombres comerciales, si existen, son otra capa y no tocan este esquema).
2. **N/N-1 como ley de contratos**: todo contrato publicado sostiene a su consumidor N-1 durante la ventana definida; la ruptura sin ventana es un incidente de proceso, no un estilo. La puerta de contratos (doc 07) detecta la ruptura no declarada.
3. **Toda versión liberada es etiqueta inmutable**: la etiqueta apunta para siempre a la misma revisión; re-etiquetar está prohibido — es la base de la reversa (doc 14) y del hotfix (doc 16).
4. **Una versión de producto por despliegue**: el monorepo libera el producto como un todo versionado; los módulos no tienen versiones públicas independientes (son partes, ESI-005) — la combinatoria de versiones internas es un problema que se elige no tener.
5. **La compatibilidad hacia el dato es sagrada**: cualquier versión debe leer los datos escritos por N-1 (y viceversa durante la ventana de expansión); el dato del tenant vale más que la elegancia del esquema.
6. **Ciclo de soporte declarado**: el DGP define cuántas versiones atrás reciben hotfix (doc 16); lo no soportado se dice explícitamente — la honestidad de soporte es parte del contrato SaaS (ETS-012).

## Impacto sobre la implementación

La derivación de versión y la puerta de rupturas se materializan en el pipeline; la ventana N/N-1 y el ciclo de soporte se fijan en el DGP de entrega.

## Dependencias

ESI-003; ESI-005; ESI-008/08 (precedente N/N-1); docs 04, 07, 10, 14, 16.

## Riesgos

- El miedo al "mayor" empujando rupturas disfrazadas de menores; mitigación: la puerta de contratos detecta la ruptura real por comparación mecánica, no por confesión del autor.

## Decisiones habilitadas

- Reversa y hotfix sobre etiquetas inmutables confiables.
- Comunicación de cambios a clientes derivada del versionado.

## Decisiones bloqueadas

- Prohibido re-etiquetar versiones liberadas.
- Prohibidas rupturas de contrato sin ventana N/N-1.
- Prohibidas versiones públicas independientes por módulo.

## Reusable Pattern

Versión derivada de la historia + etiqueta inmutable + N/N-1 con puerta: el versionado como consecuencia mecánica, no como negociación.

## Anti-Patterns

- La versión "2.0" por decisión comercial sin ruptura real (o al revés).
- El contrato que rompe "porque casi nadie usa ese campo".
- Versiones internas por módulo con matriz de compatibilidad artesanal.

## Knowledge Graph

- **ETS que consume**: ETS-012 (contrato de soporte SaaS).
- **ESI que consume**: ESI-003 (contratos y migraciones); ESI-005 (módulos como partes); ESI-008/08.
- **DGP que originará**: ventana N/N-1, ciclo de soporte y derivación en el DGP de entrega.
- **ADR relacionados**: ADR de versión única de producto; ADR de versión derivada.
- **Módulos que reutilizarán este patrón**: todos versionan sus contratos publicados bajo N/N-1.
