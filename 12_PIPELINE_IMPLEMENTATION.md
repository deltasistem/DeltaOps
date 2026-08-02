# 12_PIPELINE_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Pipelines: la columna vertebral compartida, escrita una vez.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Qué es un pipeline en implementación

Los pipelines de comando y consulta (ETS-011/11-12) se implementan como **una cadena fija de etapas de plataforma** que envuelve la invocación del caso de uso/lector. Los módulos no componen la cadena ni pueden alterarla: **declaran metadatos, la plataforma ejecuta**.

```
plataforma:  [telemetría [idempotencia [autorización [validación [configuración [ UoW ]]]]]]
módulo:                                                                    caso de uso
```

## 2. Reglas de implementación

1. **Un solo pipeline de comandos y uno de consultas en todo el sistema**: no hay pipelines por módulo, ni variantes por canal, ni "versión ligera para operaciones simples". La uniformidad ES la garantía (ETS-011/11 §pipeline único).
2. **Las etapas son de plataforma y cerradas**: agregar/quitar/reordenar etapas es cambio de arquitectura registrado (ETS-011/28); ningún módulo inserta interceptores propios. Lo que un módulo personaliza cabe en sus metadatos o no se personaliza.
3. **Los metadatos son datos, no código**: permiso, claves de configuración, eventos y errores posibles se declaran en forma inspeccionable — de ahí se generan documentación, paneles, matrices de prueba y validaciones de catálogo. Metadatos incompletos = la operación no registra = no existe.
4. **Cada etapa tiene contrato de entrada/salida fijo**: recibe el contexto acumulado, agrega lo suyo (identidad verificada, alcance, configuración resuelta…), jamás borra lo de etapas previas. El contexto fluye inmutable-por-acreción.
5. **Corte limpio en cualquier etapa**: cuando una etapa rechaza (idempotencia repetida, denegación, validación), el pipeline responde desde ahí con el desenlace correspondiente — las etapas posteriores ni se enteran. No hay "seguir para juntar más errores" entre etapas distintas (la acumulación es DENTRO de validación, ETS-011/13).
6. **La traza registra cada etapa** (ETS-011/27): duración y desenlace por etapa, automático; el diagnóstico "¿dónde se atoró este comando?" se responde con la traza, nunca instrumentando a mano.
7. **Los pipelines transversales (13-22 de esta serie) siguen la misma filosofía**: plantilla de plataforma + declaración del módulo. Ninguno se implementa como copia artesanal por módulo.

## 3. Orden de construcción recomendado

El pipeline se construye ANTES que el primer módulo de negocio: primero Kernel, luego pipeline de comandos con fakes de cada etapa, luego UoW y despachador, luego el primer módulo como prueba de la plataforma. Un módulo construido sin pipeline "mientras tanto" nunca se re-encaja bien.

## 4. Prueba obligatoria

El pipeline se prueba como pieza propia: por cada etapa, el caso que pasa y el que corta, verificando desenlace, código y traza. Después, cada operación de módulo hereda estas garantías sin re-probarlas — sus pruebas empiezan donde el pipeline termina.

---

## Impacto sobre la implementación
El pipeline es el mayor ahorro del sistema: idempotencia, autorización, validación, configuración, transacción y telemetría se escriben una vez y se heredan mil veces.

## ETS relacionados
ETS-011 (11, 12, 13, 14, 15, 27) · ETS-012 (02, 03, todos los transversales 13-22).

## Riesgos
- Presión por "saltarse el pipeline solo para esta operación interna" → regla 1; los internos usan el mismo pipeline con actor sistema (ETS-011/03).
- Metadatos tratados como comentarios y no mantenidos → regla 3: de ellos se genera lo operativo; si están mal, se nota inmediatamente.

## Decisiones habilitadas
Herencia total de garantías, generación desde metadatos, diagnóstico por traza uniforme.

## Decisiones bloqueadas
Mecanismo de composición concreto (middleware, decoradores, funciones anidadas) — la primera traducción al stack lo fija de una vez para siempre.
