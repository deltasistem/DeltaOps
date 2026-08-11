---
name: Enterprise Operations Experience DGP-018
description: Lecciones de componer el Centro Operacional empresarial sobre read models existentes sin inventar contratos.
---

# DGP-018 · Enterprise Operations Experience

- Fase de composición pura: el frontend consume solo read models/deep links existentes; todo dato sin fuente real se oculta o muestra estado vacío de negocio. Gaps de contrato se documentan (doc de inventario de contratos) y se detienen — jamás criterio permisivo.
- **Atribución personal estricta:** "mis órdenes/mi trabajo" solo con match inequívoco (igualdad normalizada de `responsable` contra `identityId` o email de la sesión); ambigüedad ⇒ fallo cerrado (estado vacío + CTA a la bandeja oficial). Un criterio permisivo (`responsable != null`) fue MAYOR en revisión: exponía OTs ajenas con CTA Ejecutar.
- Roles supervisores/planificadores ven la operación tenant-wide (correcto); solo las atribuciones "personales" exigen match estricto.
- **ToastProvider del design-system debe estar en la raíz de App**: bug latente desde DGP-009 — rutas que usan `useToast` del DS explotaban porque solo shadcn Toaster estaba montado; los tests lo enmascaraban al envolver manualmente con el provider. Los tests de ruta deben montar bajo los providers reales de App.
- **Seed demo y credenciales:** `crearIdentidad` es idempotente por email y NO actualiza el hash existente; el seed debe reafirmar la contraseña (`actualizarPassword`) para que `seed:demo` sea reproducible también en credenciales. Síntoma: 401 con los defaults documentados pese a usuarios existentes.
- Mobile-first para rol de campo: bloque de foco primero en el DOM, grids `minmax(min(Npx,100%),1fr)`, targets ≥48px; responsive por breakpoint queda para e2e navegador (jsdom sin matchMedia/layout).
