# 15_BACKUP_RECOVERY.md

> **DeltaOps — ETS-006 · v1.0** · Estrategia de respaldo, recuperación y alta disponibilidad.
> Documento de diseño. No implementa nada.

---

## 1. Qué se protege (y qué se regenera)

| Clase | Estrategia |
|---|---|
| **Patrimonio** — maestros, hechos/eventos, configuración publicada, auditoría, evidencias, snapshots emitidos, secretos (bóveda) | Se respalda con la máxima garantía |
| **Derivados** — read models, vistas materializadas, marts, índices de búsqueda, caches | No se respaldan como patrimonio: se **regeneran por replay** (→ `11`); solo se respaldan por conveniencia de tiempo de recuperación |
| **Estado de dispositivos** — bitácoras locales offline | Cada dispositivo es su propio respaldo hasta confirmar sincronización; la nube jamás da por recibido lo no confirmado |

## 2. Respaldos

1. **Continuos + puntos de restauración:** el patrimonio se protege de forma continua (posibilidad de restaurar a un punto en el tiempo), con snapshots periódicos completos.
2. **Regla 3-2-1 conceptual:** múltiples copias, medios/ubicaciones independientes, al menos una geográficamente separada y **aislada contra alteración** (inmutable: un ransomware o un error administrativo no pueden tocar la copia fría).
3. **Por tenant restaurable:** la arquitectura permite restaurar el patrimonio de **un solo tenant** sin tocar a los demás (error grave de un administrador de empresa ≠ desastre de plataforma).
4. **Cifrados siempre**, con claves gestionadas aparte del respaldo mismo.
5. **La auditoría se respalda con encadenamiento verificable:** una restauración demuestra que no perdió ni alteró registros.

## 3. Objetivos de recuperación (marco)

| Escenario | Objetivo conceptual |
|---|---|
| Pérdida de datos aceptable (RPO) | Cercana a cero para hechos confirmados; lo capturado offline no confirmado vive seguro en el dispositivo |
| Tiempo de recuperación (RTO) del servicio | Horas como techo contractual según plan; el modo offline móvil amortigua: **el campo sigue operando durante una caída** |
| Recuperación de derivados | Replay planificado; las pantallas declaran frescura degradada mientras tanto |
| Restauración fina | Un tenant, o un ámbito de configuración (republicar versión), sin restauraciones globales innecesarias |

Los objetivos concretos por plan/licencia son configuración de la capa plataforma y parte del contrato del tenant.

## 4. Recuperación gobernada

1. **La restauración nunca reescribe la historia en silencio:** restaurar es un evento auditado; si existen hechos posteriores al punto de restauración (p. ej. sincronizaciones móviles que llegaron durante el incidente), se **reconcilian** en bandeja explícita, no se pisan.
2. **Simulacros periódicos obligatorios:** un respaldo no probado no existe. La restauración de prueba (tenant de ensayo) es un procedimiento calendarizado con evidencia para el Auditor.
3. **Orden de recuperación:** patrimonio → verificación de integridad de auditoría → replay de derivados → reapertura del servicio con frescura declarada.
4. **Salida del tenant:** la exportación completa del patrimonio en formatos abiertos (→ `09`) es también su respaldo de última instancia y un derecho contractual.

## 5. Alta disponibilidad

- **Redundancia sin punto único de fallo** en servicio y almacenamiento del patrimonio; degradación parcial preferible a caída total (si la analítica sufre, la captura sigue).
- **La escritura es sagrada:** ante presión, la plataforma protege la ruta de comandos/eventos y la sincronización móvil antes que dashboards y reportes.
- **Mantenimientos sin cierre:** publicaciones y mantenimiento de datos sin ventanas de parada perceptibles; las pausas de proyecciones son invisibles salvo por la frescura declarada.
- **El offline-first como HA del campo:** la disponibilidad percibida por el operador no depende de la nube (ETS-004); esta es una decisión de arquitectura de datos, no solo de UX.
