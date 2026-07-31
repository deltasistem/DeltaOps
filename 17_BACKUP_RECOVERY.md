# 17_BACKUP_RECOVERY.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de respaldo: datos, configuración, archivos, eventos y read models. (La recuperación granular está en 18.)
> Base heredada: ETS-007/15 (objetivos RPO/RTO por plano); aquí, qué se respalda, cómo y con qué garantías.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Principio: se respalda la verdad, se reconstruye lo derivado

| Qué | Régimen |
|---|---|
| Plano de la verdad (hechos, eventos, agregados, configuración, metadatos de archivos, auditoría) | Respaldo completo con recuperación a punto en el tiempo — RPO cercano a cero (flujo continuo de cambios respaldado, no solo fotos nocturnas) |
| Almacén de objetos (binarios) | Redundancia geográfica + versionado del almacén + inmutabilidad; respaldo lógico adicional por retención |
| Read models, vistas, snapshots derivados, índice, caches | **No se respaldan** como verdad: se reconstruyen por replay (07-09). Excepción práctica: fotos periódicas solo para acelerar el RTO — nunca fuente de verdad |
| Configuración de plataforma (infraestructura como código, flags) | Versionada en repositorio, reconstruible por despliegue (ETS-007/15) |
| Secretos y claves | Régimen propio de la bóveda con respaldo separado y custodia reforzada (las claves de cifrado por tenant JAMÁS viajan con los datos que cifran) |

## 2. Eventos: el respaldo más sagrado

- El flujo de eventos recibe el tratamiento más fuerte: **copias inmutables** (no reescribibles ni por operadores del entorno productivo — 06 §2), en región distinta a la primaria (dentro de la residencia de datos del tenant), con retención independiente de la operativa.
- La cadena de integridad (06 §3) viaja con el respaldo: un respaldo restaurado se **verifica criptográficamente** antes de declararse bueno — se restaura historia demostrable, no solo bytes.
- Con eventos + objetos respaldados, **todo lo demás es reconstruible**: es la póliza última del sistema.

## 3. Configuración del tenant

- Las versiones de configuración están dentro del plano de la verdad (05) y viajan en su respaldo; además, **cada publicación queda exportable como paquete autocontenido** — restaurar "la configuración del tenant al 12 de marzo" es un caso de recuperación de primera clase (18 §5), no una arqueología.
- Los paquetes móviles emitidos (05 §2) constan como hechos: se sabe exactamente qué configuración tenía cada dispositivo en cualquier fecha.

## 4. Archivos

- Prioridad por clasificación: evidencias y documentos contractuales con redundancia máxima; derivados (miniaturas) sin respaldo (13 §5).
- La reconciliación metadatos↔objetos (13 §4) corre también contra los respaldos: un respaldo al que le falta un objeto referenciado es un respaldo fallido con alerta, no un descubrimiento del día del desastre.
- Lo archivado en frío (10) ya vive en almacenamiento redundante inmutable: el frío es su propio respaldo, con verificación periódica de integridad.

## 5. Aislamiento por tenant

- El respaldo es global pero la **restauración es por tenant** (14 §2): exportar, restaurar o purgar un tenant no toca a los demás — capacidad contractual del SaaS (terminación de servicio con entrega de datos, ETS-006/13).
- La purga contractual alcanza también los respaldos según el calendario de retención pactado, con certificado de purga auditado.

## 6. Verificación: un respaldo no probado no existe

- **Restauraciones de prueba programadas y automáticas** a entorno aislado: restaurar, verificar cadena de integridad, comparar conteos y huellas por rango contra producción, reconstruir una muestra de read models y compararla — con alerta si cualquier paso difiere.
- Los simulacros de recuperación completa (ETS-007/15) se ejecutan con calendario y sus tiempos medidos son los RTO reales publicables, no aspiraciones.
- Métricas vigiladas en el panel de plataforma: edad del último respaldo verificado, resultado de la última restauración de prueba, cobertura por tenant — el estado del respaldo es observable siempre, no un acto de fe.
