# 01_IMPLEMENTATION_BLUEPRINT.md

> **DeltaOps — ETS-012 · v1.0** · Patrón oficial de implementación: la única manera correcta de construir DeltaOps.
> Manual de implementación independiente de tecnología. Sin código, sin frameworks.

---

## 1. Qué es este manual

ETS-001…011 dicen **qué** es DeltaOps y **cómo está diseñado**. ETS-012 dice **cómo se implementa**: los patrones obligatorios que todo constructor (humano o asistido) sigue, en cualquier lenguaje que se elija después. El manual no nombra tecnologías: nombra formas. Cuando se elija el stack, cada forma se traduce una sola vez y esa traducción se vuelve la plantilla del proyecto.

## 2. El patrón oficial en una frase

**Todo hecho de negocio entra por un pipeline, se decide en dominio puro, se confirma en un Unit of Work, se cuenta como eventos y se lee por proyecciones.**

```
Canal → Adaptador de entrada → Pipeline de Comando → Caso de Uso
                                                         │
                                        Dominio puro (agregado + motores + Policies)
                                                         │
                                Unit of Work (estado + eventos + outbox + idempotencia)
                                                         │
                              Despachador → Consumidores → Read models / derivados
                                                         │
Canal ← Adaptador ← Pipeline de Consulta ←──────── lectores de read models
```

## 3. Las diez reglas de oro del implementador

1. **La Regla de Dependencia es física**: dominio no importa nada de fuera; aplicación no importa adaptadores; verificado en CI (ETS-011/23). Si un import la viola, el diseño es incorrecto — no se busca el permiso, se corrige la forma.
2. **YAGNI gobernado**: se implementa exactamente lo catalogado en ETS-008; ninguna operación, campo o parámetro "por si acaso". La extensibilidad ya está diseñada (configuración, Policies, eventos) — no se inventa otra.
3. **KISS con forma fija**: cada pieza tiene UNA plantilla (este manual). La creatividad va en el dominio del negocio, jamás en la estructura. Dos casos de uso cualesquiera se leen igual.
4. **DRY donde duele, no donde brilla**: lo universal vive en Kernel y plataforma (una vez); lo de negocio se repite entre módulos antes que acoplarlos (M1-M5, ETS-011/23). Duplicar dos líneas entre módulos es más barato que un import cruzado.
5. **Sin fallbacks silenciosos**: toda falla es explícita, todo rechazo tiene código de catálogo, toda degradación está declarada (ETS-011/26).
6. **Contrato antes que código** (API First): la operación existe en el catálogo ETS-008 antes de existir en el código; los tipos de frontera se generan del contrato, no a mano.
7. **Configuración antes que rama** (Configuration First): ninguna condición `si tenant == X`; la variabilidad es una Policy con configuración resuelta y versionada (ETS-005, ETS-011/05).
8. **Determinismo total en dominio**: reloj, identidad y azar son puertos; ningún `ahora()` ni aleatorio directo en dominio o aplicación (ETS-011/25 §determinismo).
9. **Todo comando es idempotente y auditable de serie**: `clave_idempotencia`, Contexto de Ejecución y eventos no son opcionales ni se agregan después.
10. **Probado en memoria o no está terminado**: cada caso de uso corre completo con fakes; si necesita infraestructura para probarse, está mal colocado.

## 4. Cómo usar el manual

- Documentos 02-12: las piezas del flujo, en orden de ejecución.
- Documentos 13-22: los pipelines transversales, uno a uno.
- Documentos 23-28: organización, nombres, pruebas, refactorización, evolución y la puerta de calidad (checklist de PR).
- Ante duda entre dos formas: gana la de este manual; si el manual calla, gana la más simple que respete las diez reglas; si aun así hay duda, es una decisión de arquitectura registrada (ETS-011/28 §2.3).

---

## Impacto sobre la implementación
Este documento es la constitución del código: toda plantilla, revisión y PR se juzga contra las diez reglas; la primera traducción al stack elegido se hace con este manual al lado.

## ETS relacionados
ETS-011 (todo el Core que aquí se traduce a patrones) · ETS-008 (API First) · ETS-005 (Configuration First) · ETS-002 (principios rectores).

## Riesgos
- Tratar el manual como sugerencia y no como norma → el checklist de PR (28) lo vuelve puerta obligatoria.
- Traducciones divergentes al stack por equipo → la traducción se hace una vez, como plantilla oficial del proyecto.

## Decisiones habilitadas
Plantillas por pieza, revisión objetiva de PRs, incorporación rápida de constructores nuevos.

## Decisiones bloqueadas
Lenguaje, frameworks y librerías concretas — instrucciones posteriores; este manual debe sobrevivir a cualquier elección.
