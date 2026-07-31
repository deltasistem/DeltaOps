# 07_FILE_ARCHITECTURE.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura de archivos: evidencias, documentos, versionado, miniaturas, metadatos y retención.
> Documento de diseño. No implementa nada.

---

## 1. Dos familias de archivos

| Familia | Ejemplos | Naturaleza |
|---|---|---|
| **Evidencias de hechos** | Fotografías de checklist, firmas, videos cortos, audio, GPS adjunto | Inmutables: pertenecen a su hecho append-only; jamás se reemplazan |
| **Documentos de entidades** | Manuales, planos, PDF, pólizas, certificados, actas, reportes emitidos | Versionables: un manual tiene ediciones; cada versión es inmutable |

Regla común: **el archivo nunca es huérfano** — todo archivo pertenece a un hecho o entidad (su dueño lógico es el módulo que lo referencia), hereda su clasificación de seguridad (ETS-006/13) y su ciclo de retención (ETS-006/09).

## 2. Almacenamiento

1. **Almacén de objetos** (no la base de datos): la base guarda referencias y metadatos; el binario vive en almacenamiento de objetos con espacios **segregados por tenant** (`05_MULTITENANT_ARCHITECTURE.md`), cifrado en reposo.
2. **Direccionamiento por contenido:** cada archivo se identifica también por la huella de su contenido — deduplicación natural (el mismo manual adjuntado 40 veces se almacena una vez por tenant) y verificación de integridad (la evidencia no fue alterada).
3. **Clases de almacenamiento por temperatura:** reciente/operativo en caliente; evidencias de hechos archivados migran a frío consultable junto con su hecho (misma frontera que ETS-006/09), transparente para el usuario salvo latencia.
4. **Acceso siempre mediado:** nunca URLs públicas permanentes; el acceso se otorga con **URLs firmadas de corta vida** emitidas por Files tras validar permisos del solicitante sobre el dueño lógico (ver el plano de un activo exige poder ver el activo). Cada emisión de acceso a material Restringido queda auditada.

## 3. Subida (flujo estándar)

```text
1. El módulo dueño autoriza la subida (permiso sobre el hecho/entidad)
2. Files emite destino firmado de subida (directo al almacén: el binario
   no atraviesa la aplicación)
3. El cliente sube (por partes y reanudable si es grande; desde móvil,
   diferido según red — 06_OFFLINE_TECHNICAL.md)
4. Files verifica (tipo real del contenido, tamaño, huella, exploración
   antimalware) → ArchivoAlmacenado
5. El hecho/entidad ya era válido sin el binario; al confirmarse, la
   referencia pasa de "pendiente" a "disponible"
```

Límites de tipo y tamaño por categoría son configuración de plataforma/tenant (ETS-005); lo rechazado se explica en lenguaje de negocio.

## 4. Miniaturas y derivados

- **Generación al ingerir:** miniaturas de fotos y páginas de PDF, vistas previas de video (fotograma), versiones de imagen por tamaño de pantalla — derivados regenerables (no patrimonio, ETS-006/15).
- Las listas y líneas de tiempo consumen miniaturas; el original solo viaja al abrirlo (rendimiento móvil, U-26).
- **Anotaciones sobre fotos** (círculos, flechas del técnico) se guardan como capa separada del original: la evidencia original nunca se altera.

## 5. Metadatos

Cada archivo lleva: dueño lógico (hecho/entidad y módulo) · tenant y contexto del momento · autor y canal de captura · tiempo doble · tipo real verificado y tamaño · huella de contenido · clasificación de seguridad heredada · metadatos de captura cuando el hecho los exige (GPS, hora del dispositivo) · versión (documentos) · estado de exploración.

Los metadatos son datos de primera clase: buscables (Search indexa nombre/tipo/entidad, no el binario), auditables y exportables con el patrimonio (ETS-006/09).

## 6. Versionado (documentos)

1. **Nueva versión, nunca reemplazo:** subir la edición 3 del manual conserva 1 y 2; las referencias históricas (la OT que consultó la edición 2) siguen apuntando a su versión.
2. **Versión vigente explícita** por documento; los vencimientos (pólizas, certificados) son datos del documento que el calendario de Rules vigila (`ContratoPorVencer`).
3. **Los reportes emitidos son documentos congelados** (ETS-006/12): se almacenan como se emitieron, con la marca de su época.

## 7. Retención y supresión

- **Evidencias:** misma retención que su hecho; a frío más temprano (ETS-006/09).
- **Documentos legales:** su vigencia + margen normativo.
- **Supresión de datos personales:** las evidencias afectadas se transforman de manera irreversible (difuminado de rostros/firmas según obligación) o se sustituyen por constancia de supresión — el hecho conserva su validez documental (ETS-006/13); la huella original se retira del índice.
- **Salida del tenant:** el patrimonio de archivos se exporta junto con sus metadatos; la eliminación certificada cubre también los binarios y sus derivados.
