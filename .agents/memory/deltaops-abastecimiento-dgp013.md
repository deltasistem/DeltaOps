---
name: Abastecimiento DGP-013
description: Lecciones de procurement/supply chain, multiplexado de workflows y excepción del corpus.
---

# Enterprise Procurement & Supply Chain (DGP-013)

- **Workflow-engine resuelve definiciones por servicio+versión y colisiona si un servicio publica VARIAS definiciones** (multiplexar solicitud/OC/recepción bajo un mismo `modulo.X.workflow`). Hotfix aprobado como excepción documentada: `resolverDefinicion` acepta `clave?` opcional (desde `data.definicion` al iniciar y `_workflow` de la instancia al transicionar); sin clave = comportamiento previo. Cubierto por tests multiplexados offline+PG. **Cualquier módulo nuevo con varios procesos bajo un servicio depende de este fix.**
- **Toques al corpus congelado**: el revisor los marca MAYOR salvo excepción formal + cobertura que demuestre el defecto y evite regresión; registrar la excepción en el informe de cierre.
- Claves de definición de workflow no pueden contener PALABRAS_RESERVADAS_NEGOCIO ("orden", "compra"…) — usar claves neutras (`ciclo-adquisicion`).
- El mandato "QR para recepción y almacenamiento" es literal: etiquetas ancladas a platform.qr (código de plataforma en el QR, no URL), resolvedor puro con prioridad servidor + degradación local, página de escaneo — reutilizando EtiquetaItem de inventario para almacenamiento.
- module-inventario congelado no expone comando oficial de costos ⇒ los costos automáticos (promedio ponderado/último/estándar) viven en read model propio `abs_costos_read` del módulo comprador (limitación documentada).
- `idDet` con prefijos comunes largos colisiona (hash muestrea i%len): poner el token discriminante AL INICIO del string.
- El revisor exige que los archivos nuevos estén commiteados en git antes de la revisión (diff = implementación); `git add -A && git commit` tras cada bloque de fase.
