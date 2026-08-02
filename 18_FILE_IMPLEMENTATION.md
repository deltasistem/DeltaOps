# 18_FILE_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Archivos: el binario nunca pasa por el Core.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. El flujo canónico (ETS-011/18)

```
1. PLANEAR    comando normal: declara intención, tipo, dueño lógico → URL firmada de subida
2. TRANSFERIR el cliente sube DIRECTO al almacén de binarios (el Core no toca bytes)
3. CONFIRMAR  comando normal: cliente reporta término; se verifica huella (hash) y tamaño
4. ACCEDER    consulta normal → URL firmada de lectura, con el permiso del dueño lógico
5. DERIVAR    consumidores generan miniaturas/versiones — derivados reconstruibles
```

## 2. Reglas de implementación

1. **Los pasos 1, 3 y 4 son operaciones del catálogo comunes y corrientes**: pipeline completo, permisos, idempotencia, auditoría — un archivo se gobierna exactamente como cualquier otro hecho. No existe un "subsistema de archivos" con reglas propias.
2. **El Core gobierna metadatos, el almacén guarda bytes**: la entidad archivo (dueño lógico, clasificación, huella, estado) vive en el módulo correspondiente; los bytes viven tras el puerto AlmacénDeBinarios. Ningún byte de contenido cruza un puerto que no sea ese.
3. **El permiso del archivo es el del dueño lógico** (ETS-011/18): quien puede ver la orden de trabajo puede ver su evidencia — no hay ACLs paralelas por archivo. El implementador resuelve el acceso preguntando por el dueño, nunca duplicando reglas.
4. **Sin confirmación no hay archivo**: un binario subido sin paso 3 es un huérfano que la limpieza programada recolecta (job de plataforma); el estado "pendiente de confirmar" es explícito y expira. La huella declarada debe coincidir — discrepancia = rechazo, no aceptación con nota.
5. **Los requisitos de evidencia son Policies** (ETS-011/18): "el cierre exige N fotos" se implementa como capa 3 de validación del comando de cierre — jamás dentro del flujo de archivos.
6. **URLs firmadas efímeras, jamás rutas persistentes**: lo que se guarda y se proyecta es la identidad del archivo; toda URL se firma al momento de servir con vigencia corta. Ninguna URL firmada termina en un evento, read model o notificación.
7. **Derivados como consumidores** (10): miniaturas y conversiones reaccionan al evento de archivo confirmado, con la plantilla estándar — reconstruibles, idempotentes, con bandeja.
8. **Clasificación heredada** (ETS-006/13): el archivo hereda la clasificación de su dueño lógico; los Restringidos exigen los mismos controles de acceso sensible que sus entidades.

## 3. Prueba obligatoria

Con fake del almacén de binarios: plan → confirmar con huella correcta (confirmado), huella errónea (rechazo), confirmar dos veces (idempotente), acceso con actor sin permiso al dueño (no-encontrado), huérfano expirado recolectado. La suite de contrato del puerto cubre firma de URLs contra el almacén real en integración.

---

## Impacto sobre la implementación
El manejo de archivos se reduce a tres operaciones de catálogo y un puerto; el ancho de banda de binarios jamás toca el Core, y las evidencias quedan bajo el mismo gobierno que todo lo demás.

## ETS relacionados
ETS-011 (18, 05, 10) · ETS-010 (metadatos de archivo) · ETS-006 (13 clasificación) · ETS-008 (operaciones de archivo).

## Riesgos
- Bytes pasando por el Core "solo para validar el contenido" → si hay que inspeccionar contenido, es un consumidor que lee del almacén tras confirmar — jamás en línea con la subida.
- URLs firmadas persistidas por comodidad → regla 6, revisión estricta.

## Decisiones habilitadas
Evidencias gobernadas, almacén intercambiable, derivados reconstruibles, limpieza de huérfanos.

## Decisiones bloqueadas
Proveedor de almacenamiento y formato de firma — con el stack, detrás del puerto.
