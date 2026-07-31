# 08_BRANDING_ENGINE.md

> **DeltaOps — ETS-005 · v1.0** · Branding Engine: identidad de marca por tenant.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Que cada empresa vea DeltaOps como **su** plataforma: marca, nombre, colores, dominio e idiomas configurables por tenant, sin desarrollo, aplicados de forma consistente en web, móvil, correos, notificaciones, exportes y documentos impresos.

## 2. Qué configura el tenant

| Elemento | Detalle |
|---|---|
| **Logo** | Versiones clara/oscura, símbolo compacto (móvil), favicon; aparece en app, correos, PDFs, reportes y actas |
| **Nombre** | Nombre comercial de la plataforma dentro del tenant ("DeltaOps" puede llamarse "Mantto XYZ"); usado en interfaz, correos y push |
| **Colores** | Color primario y de acento sobre el sistema de temas; la plataforma valida contraste (WCAG 2.1 AA — U-27) y deriva el resto de la paleta |
| **Tema** | Claro/oscuro/por sistema como default del tenant; el usuario decide el suyo; el modo alto contraste de campo (U-22) siempre disponible |
| **Dominio** | Subdominio (`empresa.deltaops.app`) por defecto; dominio propio (`mantto.empresa.com`) según licencia |
| **Idiomas** | Idiomas habilitados del tenant (del catálogo de plataforma) e idioma por defecto; el usuario elige el suyo entre los habilitados |
| **Monedas** | Moneda funcional del tenant y monedas adicionales visibles (catálogo); formatos de fecha/número por defecto |
| **Documentos** | Encabezado/pie de PDFs y actas (logo, datos legales, firmas), plantillas de correo con la marca |

## 3. Reglas

1. **La marca nunca cambia el comportamiento.** Branding es piel: ninguna configuración de marca altera flujos, permisos ni datos.
2. **Semántica de color reservada:** los colores de estado (crítico/advertencia/ok) son del sistema y no se rebrandean — un semáforo rojo significa lo mismo en todos los tenants (U-29).
3. **Contraste validado:** la plataforma rechaza combinaciones ilegibles; la marca no puede sacrificar accesibilidad.
4. **Terminología** (renombrar "OT" → "Aviso" en la interfaz del tenant) pertenece al diccionario del tenant (`12_TENANT_CONFIGURATION.md`), no al Branding Engine, aunque se administra junto a él; los nombres canónicos de ETS-003 siguen siendo el lenguaje interno y de integraciones.
5. **Versionado estándar** (ETS-005/02): cambios de marca son publicaciones auditadas; los documentos ya emitidos conservan la marca con la que se emitieron.
6. **Multiempresa:** en grupos empresariales, cada empresa del grupo puede tener su marca; el usuario que cambia de contexto ve cambiar la marca con el contexto.

## 4. Capas

- **Plataforma:** temas base, tipografías disponibles, validadores de contraste, catálogo de idiomas/monedas soportados.
- **Tenant:** todo lo de la tabla anterior.
- **Usuario:** tema claro/oscuro, idioma, formatos personales de fecha/número (U-31, U-35).
