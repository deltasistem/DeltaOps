# 23 — Gestión de Archivos en Runtime

> **DeltaOps — ESI-003 · v1.0** · Adjuntos y documentos: binarios en el almacén de objetos, verdad en la base de datos.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Modelo oficial

Los archivos (adjuntos de órdenes de trabajo, manuales, fotos de activos, documentos de compras) se gestionan con separación estricta:

| Qué | Dónde | Regla |
|---|---|---|
| **Binario** | Almacén de objetos aprobado en ESI-001 | Nunca en la BD ni en el disco del proceso |
| **Metadatos y propiedad** | PostgreSQL, bajo RLS (ETS-009/010) | El registro de archivo pertenece a un tenant y a un agregado propietario |
| **Acceso** | Puerto de archivos del Kernel | El módulo pide operaciones; jamás toca el almacén directo |

La clave del objeto en el almacén incluye el tenant como prefijo estructural: la segregación existe en ambas capas, metadatos (RLS) y almacén (prefijo), espejo de las dos murallas.

## 2. Flujos oficiales

1. **Subida en dos fases**: el caso de uso registra la intención (metadatos en estado pendiente) y entrega una URL firmada de subida de corta vida; el cliente sube directo al almacén sin pasar el binario por la API; una confirmación (o el barrido de doc 22) promueve el registro a activo y emite el evento de dominio correspondiente. **Por qué:** pasar binarios por el proceso API consume sus trabajadores y limita el tamaño práctico.
2. **Descarga por URL firmada de corta vida**, emitida solo tras verificar capacidad, permisos y propiedad vía metadatos (docs 07/12); la URL es el mecanismo, la autorización es de DeltaOps.
3. **Verificaciones en la subida**: tamaño máximo y tipos permitidos declarados por punto de adjunto (plano plataforma, doc 08); verificación del tipo real, no solo de la extensión.
4. **Borrado en dos tiempos**: el dominio marca el registro (estado terminal, auditable); un trabajo de fondo (doc 22) elimina el binario tras el plazo de retención. La verdad siempre es el metadato.

## 3. Reglas normativas

1. **Huérfanos imposibles por diseño**: todo binario tiene registro; los pendientes caducados y los binarios sin registro se recogen por barrido periódico.
2. **Sin archivos en el sistema de archivos del proceso**: la imagen es inmutable y los procesos son reemplazables (ESI-002/10); el disco local es solo espacio temporal efímero.
3. **Los archivos no son eventos**: los eventos portan referencias al registro, jamás binarios ni URLs firmadas (que caducan).
4. **Antivirus/saneamiento**: el MVP verifica tipo y tamaño; el escaneo de contenido queda como frontera declarada — se añade vía ADR sin cambiar contratos (el estado pendiente ya da el punto de enganche).
5. **Cuotas por tenant** medidas sobre metadatos, con métrica y alerta (doc 17); la imposición de límites comerciales es capacidad (doc 07).

## Impacto sobre la implementación

El DGP de plataforma implementa el puerto de archivos, URLs firmadas, verificaciones y barridos. Los módulos declaran sus puntos de adjunto y consumen el puerto.

## Dependencias

Docs 07, 08, 12, 19 y 22; ETS-009/010 (metadatos bajo RLS); ESI-001 (almacén de objetos).

## Riesgos

- Divergencia metadatos ↔ almacén; mitigación: barridos de conciliación periódicos con métricas de huérfanos en ambas direcciones.
- URLs firmadas filtradas; mitigación: vida corta, alcance de objeto único y emisión siempre tras autorización.

## Decisiones habilitadas

- Adjuntos en cualquier módulo sin diseño ad hoc.
- Evolución a escaneo de contenido sin romper contratos.

## Decisiones bloqueadas

- Prohibido almacenar binarios en PostgreSQL o en el disco del proceso.
- Prohibido el acceso directo de módulos al almacén de objetos.
- Prohibido servir binarios a través del proceso API como flujo normal.
