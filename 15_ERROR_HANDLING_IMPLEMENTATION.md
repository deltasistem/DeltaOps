# 15_ERROR_HANDLING_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación del manejo de errores: la taxonomía de ETS-011/26 llevada a reglas de escritura.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Regla por género (qué escribe el implementador)

| Género (ETS-011/26) | Cómo se implementa |
|---|---|
| **Rechazo de negocio** | Resultado rechazado con código de catálogo (14) — nunca excepción |
| **Anomalía registrable** | Resultado apartado; el hecho persiste marcado en revisión |
| **Falla de infraestructura** | error del puerto (transitorio/permanente); reintento solo donde la idempotencia lo hace seguro |
| **Defecto** | excepción que sube hasta la frontera: registro completo, transacción abortada, alarma — jamás capturada "para continuar" |

## 2. Reglas de implementación

1. **Solo las fronteras capturan**: adaptadores de entrada (traducir a sobre de error del contrato) y adaptadores de salida (traducir a error del puerto). Ninguna capa intermedia escribe capturas — un bloque de captura en dominio o aplicación es defecto de colocación salvo lista blanca documentada (liberar un recurso, jamás tragar).
2. **Capturar es traducir, no decidir**: la frontera convierte y adjunta diagnóstico; no reintenta lógica de negocio, no elige caminos alternativos, no degrada por su cuenta. Las degradaciones legítimas están diseñadas por pipeline (IA sin sugerencias, búsqueda no disponible) — declaradas en el documento del pipeline, no improvisadas en la captura.
3. **Reintentos con presupuesto y solo ante transitorios**: quien reintenta (consumidores, adaptadores de salida) lo hace con retroceso, límite declarado y solo ante errores marcados reintentables; agotado el presupuesto → bandeja (consumidores) o falla honesta al usuario (comandos). Jamás reintento infinito ni reintento de errores permanentes.
4. **El diagnóstico completo va al registro, el código va al usuario** (ETS-008/07): el sobre de error público lleva código, parámetros y correlación; el detalle técnico (pila, respuesta cruda del proveedor) vive solo en el registro estructurado, unido por la correlación.
5. **Errores de programación se hacen ruidosos temprano**: precondiciones de plataforma (metadatos faltantes, puerto no registrado en arranque) fallan al ARRANCAR, no al primer uso en producción — la composición en `arranque/` valida todo el grafo al construir.
6. **Prohibiciones absolutas**: capturar-y-continuar silencioso; capturar-y-devolver-valor-por-defecto; convertir defectos en rechazos de negocio "para que no truene"; registrar-y-tragar. Las cuatro son causales de rechazo de PR sin discusión.
7. **Los mensajes de error jamás filtran datos** (ETS-006/13): ni contenidos de campos Restringidos, ni existencia de recursos fuera del alcance del actor (un recurso ajeno responde no-encontrado, no denegado-porque-existe).

## 3. Prueba obligatoria

Por cada operación: sus errores de catálogo declarados se provocan y se afirma código + sobre exactos. Por cada adaptador de salida: las fallas físicas simuladas se afirman traducidas al error del puerto correcto. Suite de plataforma: un defecto inyectado en pleno UoW deja la base intacta y produce alarma.

---

## Impacto sobre la implementación
El manejo de errores deja de ser criterio personal: cada género tiene una única forma correcta y el revisor la exige; la operación gana diagnóstico por correlación desde el primer día.

## ETS relacionados
ETS-011 (26 taxonomía, 27 correlación, 10 bandejas) · ETS-008 (07 catálogo y sobres de error) · ETS-012 (08, 09, 14).

## Riesgos
- Cultura de "robustez" que traga errores → prohibiciones de la regla 6 en el checklist de PR (28).
- Reintentos entusiastas amplificando incidentes → regla 3: presupuesto declarado o no hay reintento.

## Decisiones habilitadas
Diagnóstico por correlación, alarmas de defectos reales (sin ruido de rechazos normales), reintentos seguros.

## Decisiones bloqueadas
Mecanismo de excepciones/valores del lenguaje concreto — la traducción oficial respeta esta taxonomía.
