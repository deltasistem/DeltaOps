# 11_FILE_API.md

> **DeltaOps — ETS-008 · v1.0** · Contratos de archivos: subidas, descargas, versiones, miniaturas, URLs firmadas, partes y reanudación.
> La arquitectura está en ETS-007/07; aquí, el contrato que ven los clientes.
> Documento de diseño. No implementa nada.

---

## 1. Principio del contrato

**El binario nunca atraviesa la API:** los comandos y consultas manejan referencias y metadatos; los bytes viajan directo entre el cliente y el almacén de objetos mediante accesos firmados de corta vida (ETS-007 NT-09). Todo archivo pertenece a un hecho o entidad (dueño lógico) y hereda sus permisos, clasificación y retención.

## 2. Subida

```text
1. POST /archivos/subidas   (comando SolicitarSubida)
   Petición: dueño lógico (tipo+id de hecho/entidad), nombre, tipo declarado,
             tamaño, huella del contenido, categoría (evidencia/documento)
   Respuesta: idArchivo (referencia "pendiente") + destino firmado de subida
              (URL + vencimiento) — o plan de partes si supera el umbral (§6)
2. El cliente sube el binario al destino firmado
3. La plataforma verifica: huella coincide, tipo real del contenido,
   tamaño, exploración antimalware → referencia "disponible"
   (evento ArchivoAlmacenado) — o error (`07` §5: ARCHIVO_CORRUPTO,
   MALWARE_DETECTADO → cuarentena y evento de seguridad)
```

- La entidad/hecho dueño es válido **antes** del binario: una OT puede cerrarse con evidencias "pendientes de subida" solo si la política del tenant lo permite; el estado de cada referencia es visible.
- Límites de tipo y tamaño por categoría: configuración (ETS-005); rechazos en lenguaje de negocio.
- Desde móvil, la subida es **diferida**: el comando viaja en la bitácora con la referencia; el binario espera red adecuada (`12` §5, política del tenant para evidencias grandes).

## 3. Descarga y URLs firmadas

- `GET /archivos/{id}/acceso` valida el permiso del actor **sobre el dueño lógico** (ver el plano exige poder ver el activo) y devuelve URL firmada de corta vida.
- Las URLs firmadas: de un solo propósito, con vencimiento en minutos, no renovables (se pide otra — `ACCESO_FIRMADO_VENCIDO`); accesos a material Restringido, auditados individualmente (ETS-007/07 §2).
- Descargas grandes soportan rangos (reanudación de descarga estándar).

## 4. Versiones (documentos)

- `POST /documentos/{id}/versiones` (comando VersionarDocumento): nueva edición inmutable; las anteriores intactas; la vigente cambia explícitamente.
- `GET /documentos/{id}/versiones`: historial con autor, fecha, notas de la versión.
- Las referencias históricas apuntan a **su** versión para siempre (la OT que consultó la edición 2 sigue enlazando la edición 2 — ETS-007/07 §6).
- Las evidencias de hechos **no** se versionan: son inmutables; una corrección es un hecho compensatorio con su propia evidencia.

## 5. Miniaturas y derivados

- `GET /archivos/{id}/miniatura` (con tamaño solicitado dentro del catálogo de tamaños): derivado regenerable, servido firmado vía CDN.
- Listas y líneas de tiempo consumen miniaturas; el original solo al abrirlo (U-26).
- Anotaciones sobre imágenes: capa separada adjunta al mismo dueño — el original jamás se altera.

## 6. Subida por partes y reanudación

Para archivos sobre el umbral (videos, planos pesados):

1. La respuesta de `SolicitarSubida` incluye **plan de partes**: tamaño de parte, destinos firmados por parte (emitibles por tandas).
2. El cliente sube partes en cualquier orden, con huella por parte; puede consultar qué partes constan como recibidas (**reanudación** tras corte: se retoman solo las faltantes — `PARTE_FALTANTE` señala huecos al finalizar).
3. Confirmación de ensamblado: la plataforma une, verifica huella total y explora → "disponible".
4. Los planes vencen con plazo generoso (días): una subida de campo puede completarse en varios intentos y redes distintas.
5. En móvil, el agente de sincronización administra las partes automáticamente (transparente para el usuario, `12`).
