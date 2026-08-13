---
name: Composición de costos DGP-021.3
description: Lecciones de la composición de costos por OT/activo (lectura pura, estados sin $0 falsos, combustible float, logo por tema)
---

# DGP-021.3 — Composición de Costos por OT y Activo

## Contextual ≠ exento de las reglas de dinero
Regla: etiquetar un valor como "contextual/no exacto" y excluirlo del total NO autoriza calcularlo con float. Si la fuente congelada expone dinero float, la composición solo puede: exponer valores de ORIGEN individuales (string tal cual, sin sumar) o conteos enteros / magnitudes físicas — jamás un agregado monetario nuevo.
**Why:** R1 FAIL — `acc.costoOrigen += costo` (float) para combustible pese a estar marcado como no-exacto y fuera del total.
**How to apply:** cualquier futuro total de combustible exige que Utilización publique contrato con cadenas decimales exactas; test de regresión con floats fraccionarios (0.1+0.2) que pruebe que no existe ninguna suma.

## Composición de lectura pura en api-server
- Patrón: orquestación de LECTURA componiendo solo queries públicas de módulos, ejecutada con el PRINCIPAL DE SESIÓN ⇒ el RBAC/RLS de cada módulo aplica solo (sin permisos nuevos, tenant solo de sesión).
- Estados COMPLETO/PARCIAL/SIN_DATOS_SUFICIENTES/PENDIENTE/NO_APLICA: nunca $0 para ausencia; $0 real se demuestra con hechos.
- Totales por moneda con neto ΣCARGO−ΣABONO en micros BigInt string-only; series jamás mezcladas ni convertidas.
- Frontend: cero aritmética monetaria en React — formateo con Intl sobre la cadena exacta; los totales llegan del backend.
- Sin relación contractual combustible→OT: componente NO_APLICA en OT y contextual claramente separado en activo (GAP-FUEL-OT).
- costoReal manual de la OT excluido como fuente económica (declaración manual sin respaldo; documentado, no eliminado).

## Logo por tema efectivo
- Variante `imagotipo-auto` del componente Logo: observa el tema efectivo del ThemeProvider GLOBAL vía DOM (clase/atributo del html + prefers-color-scheme con MutationObserver) — sin contexto nuevo, sin recolorear con CSS/filtros. Asset oficial «Full color-Blanco» (delta rojo + tipografía crema) para fondos oscuros; color/negro para claros.
- «Selección correcta de logo» aplica a TODAS las superficies temáticas (shell incluido), no solo al login; las previsualizaciones de branding con fondo fijo quedan exentas.

## Login corporativo
- Rediseño de dos zonas (branding oscuro + formulario del tema) conservando el flujo de auth intacto es viable solo-presentación; los tests previos del login (7/7) son la red de seguridad de que el flujo no cambió.
