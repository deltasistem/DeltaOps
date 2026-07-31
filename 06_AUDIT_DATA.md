# 06_AUDIT_DATA.md

> **DeltaOps — ETS-006 · v1.0** · Datos de auditoría: la memoria de la plataforma.
> Documento de diseño. No implementa nada.

---

## 1. Definición

El dominio de auditoría es el registro **append-only estricto** de todo lo que ocurrió: hechos de negocio, cambios de configuración, accesos y acciones administrativas. Es el fundamento de la confianza del sistema (Audit by Design): no se agrega después, todo dato nace auditado.

## 2. Qué contiene

| Familia | Contenido |
|---|---|
| **Eventos de dominio** | El catálogo completo de ETS-003 (`ActivoAsignado`, `OTCerrada`, `ChecklistRealizado`…) — son a la vez hechos y auditoría |
| **Eventos compensatorios** | Correcciones con motivo obligatorio: anulaciones, ajustes, reaperturas — el error y su corrección, ambos visibles para siempre |
| **Cambios de configuración** | `ConfiguracionPublicada`, `RolModificado`, `PermisoConcedido/Revocado`, activación de módulos, cambios de umbral |
| **Acciones de seguridad** | Inicios de sesión, cambios de contexto, delegaciones, accesos denegados relevantes, exportaciones de datos |
| **Actividad de integraciones** | Qué entró/salió por cada cuenta de servicio, con resultado |
| **Actividad de IA** | Qué se consultó, qué alcance de datos tuvo, qué sugirió, quién aceptó/descartó |
| **Versiones** | Historia de versiones de maestros y configuración (quién cambió qué, diferencia, motivo) |

## 3. Anatomía de todo registro de auditoría

Quién (persona / cuenta de servicio / regla — y si medió IA, el humano que decidió) · qué (evento y datos) · cuándo (tiempo doble: ocurrió/registrado) · dónde (dispositivo, canal: web/móvil/API, GPS si el hecho lo capturó) · en qué contexto organizacional · con qué versión de configuración · por qué (motivo obligatorio en acciones sensibles) · sobre qué (referencias a las entidades afectadas).

## 4. Reglas del dominio

1. **Nadie edita la auditoría. Nadie.** Ni el Admin Global, ni el fabricante, ni proceso alguno. No existe la operación "editar/borrar" en este dominio; solo agregar.
2. **Encadenamiento verificable:** los registros se encadenan de forma que cualquier alteración sea detectable (integridad demostrable ante terceros); la verificación de integridad es un procedimiento operativo periódico.
3. **La auditoría no se apaga:** ningún feature flag, licencia o configuración la desactiva (ETS-005/09).
4. **Lectura gobernada:** el rol Auditor tiene lectura total transversal (ETS-004); los demás roles ven las líneas de tiempo de lo que su alcance permite. Leer auditoría también se audita.
5. **Líneas de tiempo como producto:** la auditoría no es un log técnico — se presenta como historias navegables: la vida de un activo, el expediente de una OT, la historia de un formulario, la actividad de un usuario, el relato de una regla.
6. **Retención larga por diseño:** la auditoría se retiene según norma y contrato (años, no meses), con archivado a frío consultable; jamás se resume destruyendo el registro (→ `09_DATA_LIFECYCLE.md`).
7. **Privacidad compatible:** si una persona ejerce supresión de datos, la auditoría conserva el hecho con el actor **anonimizado de forma irreversible pero consistente** (la historia sigue completa; la identidad, protegida) — → `13_DATA_SECURITY.md`.
8. **Separación lógica del operativo:** la auditoría se consulta sin competir con la operación (read models propios) y se replica con prioridad de patrimonio en respaldos.

## 5. Consumidores

Auditor y cumplimiento (expedientes, certificaciones), la operación (líneas de tiempo en cada ficha), indicadores de proceso (dónde se atasca, quién escala), seguridad (detección de patrones anómalos de acceso) y la reconstrucción de proyecciones (el replay lee de aquí: los eventos **son** la fuente).
