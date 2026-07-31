# 06_AUDIT_PERSISTENCE.md

> **DeltaOps — ETS-009 · v1.0** · Persistencia de auditoría: separación, integridad, cadena y consulta.
> Principio heredado (ETS-006/06): la auditoría no se escribe — se **es**. El flujo de eventos ES la auditoría.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Separación

- **No existe una "tabla de auditoría" que los módulos llenan a mano** (fuente clásica de huecos): el registro auditable es el propio flujo de eventos persistido (02-03), que nace atómico con cada hecho vía outbox — imposible olvidar auditar.
- El módulo Audit mantiene una **réplica de consulta separada** del flujo: un consumidor más de eventos (ETS-007), con almacenamiento propio, índices propios para las preguntas de auditoría y permisos propios (rol Auditor, solo lectura).
- Separación física progresiva: arranca como almacén lógico separado en el mismo motor; su aislamiento en infraestructura dedicada es una decisión de escala prevista que no cambia ningún contrato (19).
- Se auditan además las **lecturas sensibles**: accesos a datos Restringido y descargas firmadas generan sus propios registros append-only (ETS-007/12).

## 2. Integridad

- Los eventos son append-only con las protecciones estructurales de 04 §4: la API no ofrece edición, la persistencia la rechaza, y ni las operaciones administrativas reescriben.
- La réplica de Audit se **verifica contra el flujo origen** por reconciliación periódica automática (conteos y huellas por rango): una divergencia es alerta de seguridad, no un ajuste.
- Los respaldos del flujo de eventos son inmutables y con retención independiente (17): ni un error operativo ni un actor malicioso con acceso al entorno productivo puede reescribir la historia respaldada.

## 3. Cadena

Para que la alteración sea **detectable** además de prohibida:

```text
Cada evento registra la huella criptográfica de su contenido
   + la huella del evento anterior de su cadena (por tenant)
   → cualquier alteración, inserción o supresión posterior
     rompe la cadena desde ese punto y es evidente

Periódicamente se emite un SELLO DE CIERRE (por tenant, por periodo):
   huella acumulada del rango, firmada y almacenada
   por separado (incluso exportable al propio tenant)
   → el tenant puede verificar de forma independiente que
     su historia no fue alterada desde el sello
```

- La verificación de cadena corre como control automático programado y bajo demanda (un auditor puede pedirla sobre un rango).
- El sello por periodo se alinea con el congelamiento de periodos (04 §5): el cierre contable y el sello de integridad son la misma ceremonia.

## 4. Consulta

- Los contratos de ETS-008/04: línea de tiempo por entidad (`ConsultarLineaDeTiempo`), por actor, por periodo, por tipo de evento — servidas desde la réplica de Audit con sus índices, no desde el flujo caliente (las consultas forenses pesadas jamás compiten con la operación).
- Toda respuesta de auditoría incluye la cadena causal completa: comando → evento → reglas disparadas → eventos derivados (ETS-008/09 §2) y la delegación si la hubo ("X actuando por Y").
- Exportación de evidencia: un rango auditado se exporta como paquete congelado con su verificación de integridad incluida — apto para un tercero (auditor externo, autoridad).
- Retención: la auditoría hereda la retención más larga del sistema (10); archivarla en frío jamás la hace inconsultable, solo más lenta (recuperación gobernada).
