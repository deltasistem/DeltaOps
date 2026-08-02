# 11_UNIT_OF_WORK_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación del Unit of Work: un commit que lo dice todo o no dice nada.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Qué confirma el Unit of Work (siempre los cuatro, siempre juntos)

```
EN UNA TRANSACCIÓN (ETS-011/08):
  1. El estado nuevo del agregado (con avance de versión optimista)
  2. Los eventos de dominio producidos (al outbox del módulo)
  3. El registro de idempotencia (clave → respuesta, ETS-010/18)
  4. Nada más — y nada externo
```

## 2. Reglas de implementación

1. **El UoW es plataforma; el caso de uso no lo maneja**: el pipeline abre, el caso de uso declara qué persistir (agregado + eventos), el pipeline confirma o revierte. No existe `commit()` visible en código de módulo — la tentación de commits parciales se elimina por diseño.
2. **Un UoW por comando, exactamente**: ni UoW anidados, ni dos comandos compartiendo transacción, ni "aprovechar el viaje" para tocar otro agregado (ETS-011/09). El que necesite más, necesita un proceso por eventos.
3. **La versión optimista se verifica al confirmar**: si el agregado cambió desde `obtenerParaActualizar`, la confirmación falla → rechazo por conflicto del catálogo. La verificación es del UoW, no del caso de uso ni del repositorio a solas.
4. **Los eventos que se confirman son los que el agregado produjo**: el UoW los recoge del agregado/Resultado tal cual; no filtra, no enriquece, no reordena. El sobre del Kernel se completa con el Contexto de Ejecución vigente.
5. **Revertir es siempre seguro y total**: cualquier falla dentro del UoW (defecto, conflicto, caída) revierte los cuatro elementos como si nada hubiera pasado; el medio-commit es imposible por construcción, no por disciplina (ETS-011/26 §pánico honesto).
6. **Nada externo adentro — con lista negra explícita**: ni publicar al flujo, ni llamar puertos de red (notificación, binarios, IA, conectores), ni escrituras a otros esquemas. El outbox ES el mecanismo para que lo externo ocurra después, con garantía.
7. **Las consultas no tienen UoW** (ETS-011/08): un lector jamás abre transacción de escritura; si el código de un lector pide UoW, hay un error de diseño.
8. **La respuesta idempotente se guarda tal como se responderá**: el registro (elemento 3) contiene la respuesta completa del comando, de modo que el reintento devuelve bit a bit lo mismo sin re-ejecutar nada.

## 3. Prueba obligatoria

El UoW real se prueba en integración con fallas inyectadas: caída antes de confirmar (nada persiste), conflicto de versión (rechazo limpio, nada persiste), confirmación exitosa (los cuatro elementos presentes y consistentes). El UoW fake para pruebas de casos de uso registra qué se le declaró — las afirmaciones de las pruebas leen de ahí.

---

## Impacto sobre la implementación
El UoW es la garantía central de consistencia de todo el sistema: eventos sin estado o estado sin eventos son imposibles, y sobre esa imposibilidad descansan auditoría, derivados e integraciones.

## ETS relacionados
ETS-011 (08, 09, 26) · ETS-010 (18 idempotencia, esquemas outbox) · ETS-012 (02 paso 8, 07 repositorios, 10 despachador).

## Riesgos
- "Solo esta notificación urgente dentro de la transacción" → regla 6 es absoluta; urgencia se resuelve con prioridad de consumidor, no rompiendo la atomicidad.
- UoW artesanales por módulo divergiendo → regla 1: hay UNO, de plataforma.

## Decisiones habilitadas
Consistencia estado/eventos garantizada, reintentos seguros de punta a punta, auditoría confiable.

## Decisiones bloqueadas
Mecánica transaccional concreta del motor de base de datos — normada físicamente en ETS-010; el stack la instrumenta.
