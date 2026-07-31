# 16_OPENAPI_GUIDELINES.md

> **DeltaOps — ETS-008 · v1.0** · Lineamientos para construir la especificación OpenAPI **posteriormente** (aquí NO se genera OpenAPI): versionado, organización, tags, schemas y ejemplos.
> Documento de diseño. No implementa nada.

---

## 1. Papel de la especificación

Cuando la implementación comience, la especificación OpenAPI será la **materialización ejecutable de ETS-008**: contract-first (se escribe antes que el endpoint), fuente de generación de SDKs (`15`) y documentación interactiva. Regla de oro: **si difiere de ETS-008, la especificación está mal; si la implementación difiere de la especificación, la implementación está mal.**

## 2. Versionado de la especificación

- Una especificación por versión mayor de API (`v1`, `v2`…), versionada en el repositorio junto al código que la sirve; publicada en un portal con historial.
- Cambios a la especificación pasan por la revisión de gobierno (`17` §6) **antes** de implementarse; el diff de la especificación es el artefacto de revisión.
- Verificación automática en la construcción: la especificación nueva es compatible-aditiva con la publicada (ruptura detectada = construcción fallida, salvo proceso de versión mayor).

## 3. Organización

- **Un archivo raíz por versión con módulos referenciados:** la especificación se divide por módulo (assets, work-orders, fuel-energy…) espejando el catálogo `05`; los componentes compartidos (sobres, errores, paginación, seguridad) en una sección común única — nada duplicado.
- Cada operación referencia su comando/consulta del catálogo (`03`/`04`) por nombre en su descripción: la traza ETS-008→especificación es navegable.
- Los sobres estándar (`06`), el sobre de error (`07`) y las cabeceras (`02`) se definen **una vez** como componentes y se referencian en todas las operaciones.

## 4. Tags y metadatos

- Un tag por módulo del catálogo (mismos nombres y orden que `05`) + tags transversales (`sesiones`, `sync`, `webhooks`, `ia`, `archivos`, `operaciones`).
- Cada operación: identificador de operación estable en lenguaje ubicuo (`crearActivo`, `consultarHojaVida`) — es el nombre que heredan los SDK generados; descripción con propósito, permisos requeridos, eventos emitidos, clase de rate limit y comportamiento offline.
- Extensiones documentales para lo que OpenAPI no modela nativamente: frescura declarada, idempotencia, clase de límite — con convención propia estable.

## 5. Schemas

- **Nombres del diccionario de negocio** (ETS-003/08), en español, consistentes entre módulos (la misma cosa se llama igual en todo el contrato).
- Composición sobre repetición: los tipos comunes (contexto, tiempo doble, dinero/unidades, referencia a archivo, marca IA) definidos una vez.
- Todo campo: tipo, obligatoriedad, descripción de negocio, restricciones declaradas (rangos, longitudes, catálogo de valores cuando es cerrado); los catálogos abiertos (configurables por tenant, ETS-005/13) se declaran como abiertos explícitamente.
- Atributos dinámicos (ETS-005/03): modelados como estructura declarada de pares definidos por la configuración del tenant — el schema documenta el mecanismo y remite a `ConsultarConfiguracionVigente` para el detalle vigente.
- Las respuestas de error usan el sobre único con el catálogo `07` referenciado.

## 6. Examples

- **Cada operación con al menos:** un ejemplo de éxito realista (datos verosímiles del dominio: retroexcavadora, OT correctiva, tanqueo de ACPM y carga de kWh) y un ejemplo de error de negocio típico con su código.
- Los flujos compuestos (crear solicitud → atender → cerrar OT; sincronización con conflicto) documentados como secuencias de ejemplos enlazados.
- Los ejemplos se validan automáticamente contra los schemas en la construcción (un ejemplo inválido rompe la construcción): los ejemplos nunca mienten.
- Los ejemplos alimentan también las pruebas de contrato (`17` §7) y la documentación de los SDK (`15` §4).
