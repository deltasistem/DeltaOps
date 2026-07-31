# 17_DATA_QUALITY.md

> **DeltaOps — ETS-006 · v1.0** · Calidad de datos: duplicados, valores inválidos, validaciones y monitoreo.
> Documento de diseño. No implementa nada.

---

## 1. Principio

La calidad se gana **en la captura**, no se repara en el reporte. La plataforma está diseñada para que el dato correcto sea el camino más fácil: prellenado, escaneo en vez de digitación, listas cerradas en vez de texto libre, validación inmediata en el dispositivo. Lo que aun así entre mal, se corrige con eventos compensatorios visibles — nunca con ediciones silenciosas.

## 2. Prevención (diseño de captura)

1. **Prellenar todo lo conocido** (U-39): activo escaneado, usuario, fecha, última lectura, contexto — cada dígito tecleado es un riesgo evitado.
2. **Identificación física obligatoria:** QR/NFC ante el activo (ETS-004); la búsqueda manual es excepción y queda marcada como tal.
3. **Listas cerradas y catálogos** en lugar de texto libre siempre que exista clasificación (ETS-005/13); el texto libre queda para lo narrativo.
4. **Validación declarativa en origen** (ETS-005/03): rangos, formatos, coherencia entre campos, y contra el sistema (monotonía de medidores, capacidad del tanque, stock disponible) — funcionando también offline.
5. **Bloqueo vs. advertencia bien usados:** bloquear lo imposible; advertir lo improbable dejando pasar con marca (el campo no puede quedarse sin registrar por una validación demasiado celosa).

## 3. Duplicados

| Frente | Estrategia |
|---|---|
| Hechos duplicados (doble toque, reintentos, reenvíos) | **Imposibles por idempotencia** (clave de origen, U-19) |
| Maestros duplicados (dos fichas del mismo activo, dos proveedores iguales) | Detección **al crear** (similitud por claves de negocio: placa, serial, NIT) con aviso "¿es este?"; detección **periódica** con candidatos a fusión |
| Fusión | Asistida y auditada: un sobreviviente, referencias futuras redirigidas, historia de ambos intacta y enlazada (→ `02_MASTER_DATA.md`) |
| Valores de catálogo duplicados ("Alta"/"ALTA") | Normalización al capturar + fusión de catálogo (ETS-005/13) |

## 4. Valores inválidos y anomalías

1. **Lo estructuralmente inválido no entra** (validación en origen).
2. **Lo válido pero sospechoso entra marcado:** consumo fuera del patrón del activo, lectura con salto atípico, horas hombre excesivas, costo fuera de rango — el hecho se registra (la realidad manda) y va a una **bandeja de revisión** del rol competente.
3. **La corrección es compensatoria:** anulación/ajuste con motivo, ambos rastros visibles; las series analíticas excluyen o marcan lo anulado explícitamente.
4. **La IA como vigilante** (ETS-005/11): detección de anomalías y de **ausencias** (el dato que falta también es un problema de calidad: activos sin lectura en N días, checklists no realizados, OTs sin horas).

## 5. Monitoreo continuo

Indicadores de calidad por tenant, visibles al Admin y al Auditor (dashboard de gobierno, → `07`):

- **Completitud:** % de hechos con evidencias requeridas, activos con lecturas al día, OTs cerradas con costos completos.
- **Exactitud:** exactitud de inventario (conteos vs. kardex), tasa de hechos marcados como anómalos y su resolución.
- **Unicidad:** candidatos a duplicado abiertos, fusiones realizadas.
- **Puntualidad:** latencia entre tiempo de negocio y registro (salud del offline), hechos que llegan tarde por frente.
- **Corrección:** tasa de eventos compensatorios por tipo y autor (dónde se equivoca la captura — insumo para mejorar formularios, no para castigar).

**Ciclo de mejora:** las bandejas de revisión y las métricas alimentan ajustes de configuración versionados (un formulario que produce errores se corrige en el formulario). La calidad es un proceso del tenant con dueños (→ `08`), herramientas (bandejas, fusión, compensación) y evidencia (métricas) — no una campaña anual.
