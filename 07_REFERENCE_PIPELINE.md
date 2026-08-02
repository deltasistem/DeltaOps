# 07 — Pipeline Completo de Referencia

> **DeltaOps — ESI-004 · v1.0** · El recorrido íntegro de una petición, del borde al evento consumido, con cada responsabilidad en su sitio.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El pipeline de escritura, paso a paso

```
[cliente]
  → cadena de middleware (ESI-003/10): correlación → log de acceso
    → telemetría → límites → autenticación → contexto (permisos resueltos)
  → borde del módulo: traducir contrato ETS-008 → comando
  → plataforma: verificar capacidad (doc 04) → verificar permiso (ESI-003/12)
  → validación de entrada (doc 08): forma, tipos, límites
  → caso de uso (doc 10): abrir UoW (tenant RLS fijado)
      → repositorio: cargar agregado (doc 12)
      → Policy del tenant (doc 09): ¿el límite lo permite?
      → agregado: decidir la transición (invariantes propias)
      → registrar evento de dominio (doc 14)
      → UoW: outbox + clave de idempotencia + confirmar (doc 13)
  → frontera de errores (ESI-003/15): traducir resultado o error canónico
  → [respuesta al cliente]
      ⇢ (asíncrono) relevo → bandeja → consumidor (doc 15)
          → proyección del modelo de lectura actualizada
```

## 2. La tabla de responsabilidades

| Tramo | Decide sobre | Jamás decide sobre |
|---|---|---|
| Middleware | Identidad, contexto, límites técnicos | Negocio, permisos por pieza |
| Borde del módulo | Traducción de formatos | Validación de negocio, transacciones |
| Plataforma (capacidad/permiso) | Acceso funcional | Estado del negocio |
| Validación de entrada | Forma de los datos | Reglas que requieren estado |
| Caso de uso | Orquestación: qué cargar, qué preguntar, en qué orden | Las reglas mismas |
| Policy | La regla parametrizada del tenant | Orquestación, persistencia |
| Agregado | Sus invariantes y transiciones | Otros agregados, IO |
| UoW / repositorio | Atomicidad, persistencia, RLS | Negocio |
| Consumidor | Reacción asíncrona | Nada síncrono del comando |

## 3. Qué demuestra

1. **Cada pregunta tiene un solo lugar donde responderse**: la tabla §2 resuelve el 90% de las dudas de diseño de un módulo nuevo ("¿esto va en el caso de uso o en el agregado?").
2. **La traza única**: la prueba E2E (doc 19) sigue la correlación desde la petición HTTP hasta la proyección actualizada, atravesando el evento — observabilidad extremo a extremo (ESI-003/17).
3. **La respuesta no espera al consumidor**: el cliente recibe éxito cuando la transacción confirma; el modelo de lectura converge después (consistencia eventual explícita, ETS-008).

## Impacto sobre la implementación

Es el mapa de revisión de todo PR de módulo: cada pieza nueva se ubica en un tramo y hereda sus reglas. El DGP del módulo lo implementa íntegro una vez.

## Dependencias

Docs 04-06, 08-15; ESI-003/10, /12, /15, /19 y /20; ETS-008.

## Riesgos

- Lecturas del pipeline como sugerencia y no como norma; mitigación: la tabla §2 se referencia desde el checklist de revisión (doc 26).

## Decisiones habilitadas

- Resolver ubicación de lógica nueva por tabla, sin debate por PR.
- Pruebas E2E patrón que verifican el pipeline completo.

## Decisiones bloqueadas

- Prohibido saltarse tramos ("el borde llama al repositorio directo").
- Prohibido esperar síncronamente la convergencia del modelo de lectura.
- Prohibido duplicar una responsabilidad en dos tramos.

## Reusable Pattern

Los DGP futuros reutilizan el diagrama §1 y la tabla §2 como material normativo directo: todo comando de todo módulo recorre exactamente estos tramos; solo cambia el contenido de dominio.

## Anti-Patterns

- Atajos entre tramos por rendimiento sin medición ni ADR.
- Lógica repartida "un poco en cada tramo" hasta ser inauditables las reglas.
- Consumidores que responden al cliente o mutan la petición original.
