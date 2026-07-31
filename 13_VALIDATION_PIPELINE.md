# 13_VALIDATION_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de validación: las tres capas de validación de todo comando, con dueños distintos.
> Documento de diseño. Sin código, sin clases.

---

## 1. Las tres capas (en orden, cada una con su dueño)

| Capa | Valida | Dueño | Ejemplos |
|---|---|---|---|
| **1. Forma** | El sobre es sintácticamente correcto: tipos, presencias, formatos, rangos físicos | Contrato (ETS-008/06) — generable del esquema | UUID bien formado, fecha ISO, monto numérico, texto dentro del límite |
| **2. Negocio invariable** | Las precondiciones del catálogo (ETS-008/03): el mundo permite este comando | Dominio (agregados y Domain Services, 04) | La OT está en estado que admite cierre; el activo existe y está vigente; el saldo alcanza |
| **3. Negocio configurable** | Las reglas del tenant vigentes | Policies (05) + definiciones versionadas (formularios, workflows — ETS-005) | Campos obligatorios del formulario versión N; aprobación requerida sobre el monto; tolerancia de medidor |

## 2. Reglas normativas

1. **Cada regla vive en una sola capa**: lo que valida el contrato no se re-valida en dominio; lo configurable jamás se fija en código (capa 2) — la duplicación produce las divergencias clásicas.
2. **La capa 2 es la única autoridad de negocio**: aunque el cliente valide (UX inmediata, ETS-004) y el contrato filtre forma, el dominio revalida sus invariantes siempre — el cliente ayuda, el dominio decide (regla de oro ETS-008/03).
3. **Errores acumulados donde sea útil**: la capa 1 y los formularios (capa 3) reportan **todos** los errores de una vez (el técnico en campo corrige todo en un viaje, U-05); la capa 2 puede terminar en el primer invariante violado.
4. **Tres desenlaces, no dos**: válido → sigue; inválido → rechazo con errores de catálogo; **anómalo pero registrable → apartar** (11 §2.4): la validación distingue "esto no puede ser" de "esto es sospechoso pero el mundo pudo hacerlo" (lectura que retrocede, fecha lejana del canal móvil) — perder el dato es peor que revisarlo (ETS-009/03 §8).
5. **Validación contra versión congelada**: la capa 3 valida contra las versiones resueltas para ESTE comando (15); un formulario re-publicado no invalida lo capturado con la versión anterior.
6. **Los mensajes son del catálogo de errores** (ETS-008/07): código estable + detalles estructurados por campo; la traducción a idioma del usuario es de presentación.

---

## Impacto sobre la implementación
La capa 1 se genera de los esquemas del contrato; la 2 se implementa en dominio con pruebas exhaustivas; la 3 se implementa como evaluadores de definiciones versionadas (formularios/reglas) reutilizables por todos los módulos.

## ETS relacionados
ETS-008 (03 precondiciones, 06 forma, 07 errores) · ETS-005 (formularios, reglas) · ETS-009 (03 §8 apartar) · ETS-011 (05 policies, 11 pipeline, 15 resolución).

## Riesgos
- Reglas configurables fosilizadas en código por prisa → capa 3 estricta; la revisión pregunta "¿esto varía por tenant?" ante todo condicional de negocio.
- Desenlace "apartar" usado como cajón de sastre → catálogo cerrado de causas de apartado por módulo, con dueño de bandeja.

## Decisiones habilitadas
Generación de validación de forma, evaluador de formularios versionados, matriz de pruebas por capa.

## Decisiones bloqueadas
Tecnología de validación de esquemas y el catálogo fino de causas de apartado (con la implementación de cada módulo).
