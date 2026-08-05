---
name: Ecosistema de mantenimiento DGP-010
description: Lecciones de la fase de composición Activos+Órdenes (deep links, integración sin API nueva).
---

# Maintenance Execution Ecosystem (DGP-010)

- **Las fases de "ecosistema/integración" se resuelven por composición pura**: cero API/OpenAPI nueva, cero shells; una lib de composición (deep links, fusiones de timeline, joins cliente de read models, clasificadores puros) + pestañas/paneles añadidos a fichas existentes. Duplicar capacidades o añadir endpoints innecesarios sería hallazgo.
- **Un deep link no está terminado hasta que el destino lo consume**: generar `/ruta?param=` sin que la pantalla lea el query y lo pase al filtro del hook es hallazgo MAYOR. Alinear el nombre del parámetro con el contrato de filtro existente (p.ej. `activoPrincipalId`), mostrar chip visible del filtro contextual con acción de quitar, y probar la INTEGRACIÓN ruta→filtro→consulta (todas las peticiones filtradas, no solo el constructor del enlace).
- Prompts de fase con N puntos obligatorios: verificar cobertura punto por punto antes de la revisión — la primera entrega del subagente suele cubrir el núcleo y dejar delgados calendario integrado, dependencias, supervisor in-place, QR unificado y móvil de campo.
- Superficies "sin cambio de contexto" (supervisor): Drawer del DS para abrir OT/activo in-place reutilizando las mismas vistas.
- Registrar lectura de medidor desde QR: reutilizar comandos existentes de Activos (actualizar-horometro/odometro, monotónicos ⇒ replay idempotente); evidencia conserva el patrón online-only por attachmentId.
- Móvil de campo con solo tokens: barra inferior sticky con targets ≥48px vía tokens de espaciado; foto (input capture), firma (canvas), geolocalización como hook.
