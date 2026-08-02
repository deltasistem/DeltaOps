# 04 — Attachment Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de adjuntos: archivos ligados a entidades de negocio con seguridad, retención y trazabilidad únicas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

Un adjunto es un archivo ligado a una **referencia de entidad** (módulo + tipo + identificador): la foto de la falla en la OT, la factura en la recepción, el certificado del extintor. El servicio posee el almacenamiento, los metadatos y el control de acceso; los módulos poseen el vínculo semántico.

| Concepto | Definición |
|---|---|
| **Adjunto** | Archivo + metadatos (nombre, tipo, tamaño, hash, quién, cuándo, fechaNegocio opcional) + referencia de entidad + categoría declarada |
| **Categoría** | Declarada por el módulo: "evidencia de cierre", "factura" — con reglas propias (obligatoriedad, tipos permitidos, retención) |
| **Acceso** | Derivado del permiso de lectura de la entidad referenciada, evaluado contra el módulo dueño — quien puede ver la OT puede ver sus adjuntos, salvo categoría reforzada |

## 2. Reglas

1. **Subida y descarga solo por el servicio**: URLs temporales firmadas; nunca archivos por el API de negocio ni almacenamiento propio por módulo.
2. **Higiene en frontera**: validación de tipo real (no extensión), límites por tenant, escaneo según política; los rechazos son errores canónicos.
3. **El adjunto es inmutable**: nuevas versiones son nuevos adjuntos encadenados; el borrado es lógico y auditado, el físico lo gobierna la retención (ETS-009) por categoría.
4. **Referencias válidas**: el vínculo se crea desde el módulo (comando del módulo que registra la referencia); adjuntos huérfanos no son creables por contrato.
5. **Offline**: la captura en campo (fotos) sigue el modelo de aptitud offline (ESI-005/18) — el archivo viaja al sincronizar, con fechaNegocio de captura.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `adjuntos_basicos`; `adjuntos_avanzados` (versionado encadenado, categorías reforzadas) si producto lo separa.
- **Eventos**: "Adjunto Registrado", "Adjunto Eliminado" (v1) — para timeline y reglas de módulos (evidencia completa).
- **Contratos**: registrar adjunto sobre referencia; listar por entidad (cursor); URL temporal de descarga; declaración de categorías.
- **Configuración**: cuotas por tenant, tipos permitidos por categoría, retención por categoría, política de escaneo.
- **KPIs**: volumen almacenado por tenant/módulo, adjuntos por categoría, tasa de rechazo de subida.
- **Permisos**: heredados de la entidad §1; propios: `ADJUNTOS.CATEGORIAS.ADMINISTRAR`, y por categoría reforzada permisos dedicados.
- **Consumidores**: todos los módulos; OT (evidencias), SST (fotos de incidentes), Compras (documentos) los más intensivos.

## Impacto sobre la implementación

DGP propio; la plataforma de almacenamiento de objetos es su adaptador. Los módulos declaran categorías y reglas de obligatoriedad en sus DGP (p. ej. "no cerrar OT sin evidencia" es Policy del módulo que consulta existencia por contrato).

## Dependencias

ETS-009 (retención, clasificación); ESI-003/09 (aislamiento extendido a archivos, ESI-005/17 §2.5); ESI-005/15 y /18; docs 06 y 17-20.

## Riesgos

- Crecimiento de almacenamiento sin gobierno; mitigación: cuotas por tenant, KPIs de volumen y retención por categoría aplicada de verdad.

## Decisiones habilitadas

- Evidencias de campo y documentos formales con un solo modelo de acceso y retención.
- Reglas de negocio sobre adjuntos (obligatoriedad) sin que los módulos toquen archivos.

## Decisiones bloqueadas

- Prohibido almacenamiento de archivos propio por módulo.
- Prohibidos adjuntos sin referencia de entidad y categoría.
- Prohibida la descarga que no pase por autorización derivada.

## Reusable Pattern

La referencia de entidad + categoría declarada + acceso derivado es el patrón de todo dato satélite ligado a entidades (lo reutilizan comentarios y cronología).

## Anti-Patterns

- Guardar archivos en la base de datos transaccional.
- Acceso a adjuntos con permiso global único del servicio.
- Módulos leyendo el almacenamiento de objetos directamente.

## Knowledge Graph

- **ETS que consume**: ETS-009 (retención/clasificación), ETS-012 (evidencias de campo).
- **ESI que consume**: ESI-003/09; ESI-005/15, /17, /18.
- **DGP que originará**: DGP-Adjuntos; secciones "categorías de adjuntos" en DGP-módulo.
- **ADR relacionados**: ADR de acceso derivado de la entidad (§1); ADR de inmutabilidad (§2.3).
- **Módulos que reutilizarán este patrón**: todos; el patrón de referencia de entidad lo heredan comentarios (doc 05) y cronología (doc 06).
