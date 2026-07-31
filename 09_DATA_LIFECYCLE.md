# 09_DATA_LIFECYCLE.md

> **DeltaOps — ETS-006 · v1.0** · Ciclo de vida de los datos: crear, actualizar, versionar, archivar, retener, eliminar, restaurar.
> Documento de diseño. No implementa nada.

---

## 1. El ciclo canónico

```text
CREAR → ACTUALIZAR/VERSIONAR → (vida activa) → ARCHIVAR → RETENER → ELIMINAR*
                                                              ▲          │
                                                              └ RESTAURAR ┘
* eliminar = excepción gobernada, no operación cotidiana
```

Cada dominio recorre el ciclo a su manera:

| Etapa | Maestros | Transaccionales | Configuración | Analíticos | Auditoría |
|---|---|---|---|---|---|
| **Crear** | Alta validada, sin duplicados | El hecho nace completo (contexto, autoría, versión de config) | Borrador | Derivación automática | Automática con todo |
| **Actualizar** | Nueva versión con vigencia; el pasado queda | **Nunca**: solo eventos compensatorios | Solo borradores; lo publicado jamás | Regeneración | **Nunca** |
| **Versionar** | Historia de atributos relevantes | El hecho ya es inmutable (su versión es él mismo) | Publicación inmutable | Snapshots fechados | Encadenada |
| **Archivar** | Inactivación (deja de ofrecerse) | A frío por antigüedad, consultable | Retiro (no usable para nuevos) | Se descartan y regeneran; snapshots se archivan | A frío consultable |
| **Retener** | Mientras tengan referencias: siempre | Años, por norma y contrato del tenant | Toda versión referenciada por hechos: para siempre | Snapshots: política del tenant | La más larga de todas |
| **Eliminar** | Solo lo nunca usado | Solo por obligación legal → anonimizar, no borrar | Solo borradores | Libre (derivado) | Jamás; solo anonimización de personas |
| **Restaurar** | Reactivar inactivos | Desde archivo frío o respaldo | Republicar versión anterior | Regenerar (replay) | Verificación de integridad + respaldo |

## 2. Reglas de archivado

1. **Archivar no es perder:** lo archivado sigue consultable (más lento, mismo permiso, mismo linaje); las líneas de tiempo cruzan la frontera caliente/frío sin costuras visibles al usuario.
2. **Frontera por edad y cierre:** solo se archivan hechos de procesos terminados (OTs cerradas, periodos contables cerrados); lo abierto vive caliente sin importar su edad.
3. **Nunca resumir destruyendo:** los agregados mensuales no reemplazan el detalle; conviven con él.
4. **El archivado es reversible** dentro de la retención: traer de vuelta un expediente completo para un litigio o auditoría es un procedimiento estándar.

## 3. Retención (marco por defecto, ajustable por contrato del tenant)

| Clase | Retención por defecto |
|---|---|
| Hechos operativos y auditoría | ≥ 10 años (norma industrial/fiscal típica; configurable por país del tenant — catálogo) |
| Documentos legales (actas, certificados, permisos) | Su vigencia legal + margen normativo |
| Datos personales | Vigencia de la relación + lo que exija la ley; después, anonimización |
| Configuración publicada referenciada | Permanente |
| Evidencias pesadas (fotos, videos) | Igual que su hecho; a frío más temprano |
| Derivados/analíticos | Sin retención (regenerables); snapshots según política del tenant |
| Telemetría IoT cruda de alta frecuencia | Corta en crudo (meses), permanente en hechos derivados (lecturas aceptadas) |

## 4. Eliminación y derecho de supresión

1. **El borrado físico cotidiano no existe.** "Eliminar" en la interfaz siempre significa inactivar/anular con rastro.
2. **Supresión de datos personales (habeas data / GDPR-like):** se **anonimiza de forma irreversible y consistente** — la persona desaparece, el hecho permanece ("un técnico certificado cerró esta OT"). Aplica a maestros, hechos, evidencias (rostros/firmas según obligación) y auditoría.
3. **Fin de contrato de un tenant:** exportación completa de su patrimonio (maestros, hechos, configuración, auditoría) en formatos abiertos; luego eliminación certificada según contrato, con acta. El aislamiento multi-tenant hace la supresión limpia por construcción.
4. Toda eliminación/anonimización es en sí misma un evento auditado (sin re-exponer lo suprimido).

## 5. Restauración

- **De derivados:** regenerar por replay — operación rutinaria (→ `11_CQRS_ARCHITECTURE.md`).
- **De patrimonio:** desde respaldos con objetivos definidos (→ `15_BACKUP_RECOVERY.md`); la restauración jamás reescribe auditoría — lo restaurado se reconcilia y las diferencias se registran.
- **De decisiones:** "restaurar una configuración" = republicar versión anterior como nueva; "restaurar un maestro" = reactivarlo. Nunca viajes en el tiempo silenciosos.
