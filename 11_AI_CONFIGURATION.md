# 11_AI_CONFIGURATION.md

> **DeltaOps — ETS-005 · v1.0** · AI Configuration: gobierno configurable de la inteligencia artificial.
> Complementa `08_IA_ASSISTANT.md` (ETS-004): aquel definió la experiencia; este define su configuración y gobierno.
> Documento de diseño. No implementa nada.

---

## 1. Principio (Core, no configurable)

> **La IA propone, no dispone.** Nunca escribe, nunca aprueba, nunca ejecuta; toda sugerencia la acepta o descarta un humano con permisos, y queda auditado quién decidió. La IA jamás ve más de lo que el usuario asistido puede ver.

Lo configurable es **cuánta IA** y **dónde**, nunca estos límites.

## 2. Qué módulos usan IA (configurable por tenant, sobre el techo de licencia)

| Capacidad | Qué propone |
|---|---|
| Asistente conversacional | Respuestas sobre los datos del tenant en el alcance del usuario ("¿qué OTs vencidas tiene mi frente?") |
| Diagnóstico de fallas | Causas probables y repuestos, a partir del historial del activo y su tipo |
| Preventivos | Recalibración de frecuencias según uso real y fallas (planes mal calibrados) |
| Inventario | Puntos de reorden sugeridos, obsolescencia probable |
| Vigilancia de datos | Anomalías: consumos atípicos, lecturas faltantes, costos fuera de patrón |
| Redacción asistida | Borradores de descripciones de OT, informes, actas — siempre editables |
| Clasificación | Sugerir prioridad/criticidad/causa raíz al crear solicitudes |

Cada capacidad se activa por separado (Feature Flags), por ámbito si se desea.

## 3. Qué modelos (capa plataforma)

- La plataforma mantiene un **catálogo de modelos aprobados** (proveedor, versión, capacidades, residencia de datos, costo). El tenant elige entre los aprobados según su licencia y política; no configura modelos arbitrarios.
- Por capacidad se asigna un modelo (el diagnóstico puede usar uno; la redacción, otro más ligero).
- **Actualización gobernada:** cambiar la versión del modelo es una publicación versionada, con periodo de observación; las sugerencias registran con qué modelo y versión se generaron.
- Política de datos del tenant: si sus datos pueden o no usarse para mejorar modelos (por defecto: **no**); residencia y retención según contrato.

## 4. Qué permisos (gobierno de acceso)

1. La IA opera **siempre en nombre de un usuario y su contexto activo**: hereda su alcance de lectura exacto; cero escritura propia.
2. El rol IA Assistant (ETS-004) tiene su fila en la matriz de permisos (`10_MATRIZ_PERMISOS.md`): lectura limitada, nunca superior al asistido.
3. El tenant puede **restringir más**: excluir módulos sensibles (costos, salarios de contratos) del alcance de la IA aunque el usuario los vea.
4. Toda interacción queda auditada: qué se preguntó, qué datos alcanzó, qué sugirió, qué decidió el humano.

## 5. Qué sugerencias (calibración por tenant)

- **Umbral de confianza** por capacidad: por debajo, la IA calla (mejor silencio que ruido).
- **Volumen y momentos:** dónde aparecen sugerencias (dashboard, dentro de la OT, en el diagnóstico) y cuántas.
- **Modo observación** al activar una capacidad: la IA genera sugerencias visibles solo para administradores durante la calibración.
- **Métricas de valor:** tasa de aceptación/descarte por capacidad — una capacidad con descarte alto se recalibra o se apaga; los descartes alimentan la mejora (dentro de la política de datos del tenant).
- **Marcado inequívoco (Core):** toda sugerencia se distingue visualmente de los datos confirmados (U-40) y muestra su porqué ("basado en 12 fallas similares de este modelo").

## 6. Capas

| Capa | Decide |
|---|---|
| Plataforma | Catálogo de modelos, techos por licencia, límites Core inviolables |
| Tenant | Qué capacidades, en qué ámbitos, con qué modelo aprobado, umbrales, exclusiones de datos, política de datos |
| Usuario | Silenciar sugerencias no obligatorias en su vista; el asistente conversacional siempre es opcional para el usuario |
