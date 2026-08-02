# 20 — Unit of Work Runtime

> **DeltaOps — ESI-003 · v1.0** · Una transacción por caso de uso, con el tenant fijado y el outbox dentro.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Contrato

La UoW es el puerto del Kernel (ETS-011) que delimita la unidad transaccional de un caso de uso. Su implementación de plataforma, sobre SQLAlchemy y PostgreSQL (ESI-001), garantiza en runtime:

1. **Una transacción por caso de uso**: se abre al entrar en la pieza, se confirma si termina bien, se revierte ante cualquier error. Sin transacciones anidadas de negocio ni confirmaciones parciales.
2. **Tenant fijado al abrir**: la UoW toma el tenant del contexto (doc 09) y fija la variable de sesión que activa RLS — la primera muralla; la segunda es la política en el esquema (ETS-009). El módulo jamás toca el tenant.
3. **Outbox en la misma transacción**: los eventos emitidos por los agregados se recolectan y se escriben en el outbox antes de confirmar (doc 19). Estado y eventos son atómicos: o ambos o ninguno.
4. **Bloqueo optimista**: las escrituras verifican versión de agregado (ETS-009); el conflicto produce el error canónico de concurrencia (doc 15, regla 5).
5. **`clave_idempotencia`**: cuando el comando la porta, la UoW registra la clave en la misma transacción; el duplicado se detecta por restricción única y responde el resultado original (ETS-009).

## 2. Ciclo en la petición

```
middleware → pieza de aplicación
  → abrir UoW (transacción + tenant RLS)
  → cargar agregados por repositorios (doc 21)
  → decidir (dominio puro) → registrar cambios y eventos
  → escribir outbox + clave de idempotencia
  → confirmar (o revertir todo)
  → responder; el relevo publicará los eventos después
```

## 3. Reglas normativas

1. **La UoW pertenece a la unidad de trabajo** (ámbito petición/mensaje, doc 05): prohibido compartirla o alargarla más allá de la pieza.
2. **Sin transacciones largas**: prohibido mantener la transacción abierta durante llamadas externas (docs 23/24) o esperas; lo externo va antes (lectura) o después (por evento) de la transacción.
3. **Las consultas del plano de lectura** (ETS-011) no usan UoW de escritura: leen con sesión de solo lectura, también bajo RLS.
4. **Trabajos por lotes**: los procesos masivos (doc 22) usan una UoW **por elemento o por lote pequeño con cursor**, jamás una transacción gigante; la reanudación se apoya en el cursor.
5. **La UoW no se personaliza por módulo**: es una sola implementación de plataforma; si un módulo "necesita otra semántica", el diseño del módulo está mal.

## Impacto sobre la implementación

Pieza central del DGP de plataforma; su fake del Kernel (ETS-011) permite probar casos de uso sin BD. La plantilla T01 (ESI-002/18) estructura el caso de uso alrededor de este ciclo.

## Dependencias

Docs 05, 09, 15, 19, 21 y 22; ETS-009 (RLS, bloqueo optimista, idempotencia), ETS-011 (puerto); ESI-001 (SQLAlchemy/PostgreSQL).

## Riesgos

- Transacciones que crecen en silencio hasta generar bloqueos; mitigación: métrica de duración de transacción con umbral de alerta (doc 17) y regla 2 en revisión.
- Confusión entre fecha de negocio y de registro al confirmar; mitigación: fechaNegocio/fechaRegistro son campos distintos por diseño (ETS-003) y la plantilla los distingue.

## Decisiones habilitadas

- Casos de uso atómicos con eventos garantizados, probados con fakes.
- Procesos masivos reanudables por cursor.

## Decisiones bloqueadas

- Prohibidas llamadas externas dentro de la transacción.
- Prohibidas transacciones compartidas entre casos de uso.
- Prohibidas implementaciones de UoW por módulo.
