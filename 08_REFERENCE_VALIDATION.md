# 08 — Validaciones de Referencia

> **DeltaOps — ESI-004 · v1.0** · Tres niveles de validación, tres momentos, cero duplicación.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los tres niveles

| Nivel | Valida | Vive en | Momento | Error |
|---|---|---|---|---|
| **Forma** | Tipos, presencia, longitudes, formatos, rangos estáticos | Contratos de entrada del borde (ETS-008) | Antes del caso de uso | 400/422 canónico con detalle por campo |
| **Negocio sin estado** | Reglas del dominio que no requieren cargar nada (código natural bien formado según su patrón) | Tipos del dominio (valores del Kernel y del módulo) | Al construir los valores | Error canónico de negocio |
| **Negocio con estado** | Invariantes del agregado, límites de la Policy, unicidad | Agregado y Policy (docs 09/11), restricciones de BD como red final (ETS-010) | Dentro de la UoW | Error canónico de negocio |

## 2. Instancias en el módulo de referencia

1. **Forma**: el identificador del elemento debe ser un identificador válido; el nombre, si viene, entre 3 y 120 caracteres; el estado del filtro, uno del catálogo. Todo declarado en el contrato, verificado por la plataforma de borde.
2. **Sin estado**: el código natural del elemento cumple su patrón (definido en el dominio); construir un código inválido es imposible, no "detectable".
3. **Con estado**: no activar sin nombre; no activar desde ARCHIVADO; no exceder el límite de activos de la Policy; unicidad del código natural por tenant — con su restricción física espejo (ETS-010) que produce el error canónico de duplicado si una carrera la alcanza.

## 3. Reglas normativas

1. **Cada regla vive en exactamente un nivel**: prohibido re-validar la forma en el caso de uso o las invariantes en el borde. La duplicación diverge y miente.
2. **Los mensajes de forma señalan el campo**; los de negocio explican la regla en español de negocio (ESI-003/15).
3. **La restricción de BD no es la validación**: es la red contra carreras; el agregado valida primero y la restricción confirma. Un error de restricción sin invariante previa es un defecto de diseño.
4. **Lo imposible por construcción no se prueba en runtime**: los tipos del dominio hacen irrepresentable lo inválido; esa es la técnica preferida (ETS-003).

## Impacto sobre la implementación

Los contratos de entrada del DGP declaran el nivel de forma; las plantillas de dominio (T03) traen la técnica de tipos irrepresentables; el checklist de revisión (doc 26) verifica la unicidad de nivel.

## Dependencias

Docs 05, 06, 09, 11; ESI-003/15; ETS-003 (tipos), ETS-008 (contratos), ETS-010 (restricciones).

## Riesgos

- Validaciones duplicadas "por seguridad" que luego divergen; mitigación: regla 1 con revisión; la seguridad real la da la restricción física, no la copia.

## Decisiones habilitadas

- Distribución inequívoca de toda regla nueva en su nivel.
- Contratos de error por campo estables para la UI.

## Decisiones bloqueadas

- Prohibida la misma regla en dos niveles.
- Prohibido validar negocio en el borde.
- Prohibido confiar solo en la restricción de BD sin invariante de dominio.

## Reusable Pattern

Los DGP futuros copian la tabla §1 como taxonomía obligatoria y el criterio §3.4 (irrepresentable antes que verificado). Las instancias §2 sirven de ejemplo trazable a pruebas.

## Anti-Patterns

- "Validadores" genéricos centralizados que mezclan los tres niveles.
- Reglas de negocio expresadas como validación de formulario.
- Capturar el error de restricción y reintentar en bucle en lugar de diseñar la invariante.
