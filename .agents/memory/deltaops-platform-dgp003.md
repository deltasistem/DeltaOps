---
name: DeltaOps plataforma (DGP-003)
description: Lecciones durables de la capa de servicios compartidos sobre el kernel
---

- La plataforma persiste en un Record Store genérico (`deltaops.platform_records`) — decisión deliberada; los módulos de negocio futuros NO deben usarlo para sus entidades (tablas propias).
- **RLS solo funciona si la transacción fija el tenant**: los adaptadores PG llaman `set_config('app.tenant_id', t, true)` antes de cada escritura. Cualquier adaptador nuevo debe hacer lo mismo o el RLS es decorativo con roles sin BYPASSRLS.
- Capacidades selladas: nunca exportar la clave de registro (`registrarKey`) en el barrel público; el sello por Symbol solo vale si la capacidad no es alcanzable.
- El frontend deltaops llama al API con rutas raíz (`/api/...`), NO con prefijo BASE_URL — el api-server se publica en la raíz del proxy.
- Reglas de revisión aprendidas: rebuild de proyecciones debe derivar solo de eventos (o auditoría mapeada 1:1 a eventos); importaciones por lotes necesitan avance durable por fila para ser idempotentes en reintento; jamás un secreto de respaldo hardcodeado.
