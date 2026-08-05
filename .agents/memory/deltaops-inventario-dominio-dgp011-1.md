---
name: Inventario dominio DGP-011.1
description: Lecciones del dominio Enterprise Inventory (module-inventario, solo dominio).
---

# Enterprise Inventory — dominio (DGP-011.1)

- **Nunca un fallback de workflow directo/auto-aprobación como modo operativo**: los comandos gobernados por workflow (transferir, completar-transferencia, ajustar, iniciar/cerrar conteo) deben exigir un `WorkflowPort` explícito y fallar de forma segura (error de configuración) si no está provisto. La auto-aprobación vive SOLO en el runtime de pruebas. Un "modo directo" documentado o en configDefaults es hallazgo MAYOR (bypass de aprobaciones).
- **Verificar siempre el `Result` de `transicionar`** antes de efectos de stock — ignorarlo en un comando (cerrar-conteo) permitía conciliar aunque el motor rechazara.
- Pruebas de gobierno obligatorias: sin port ⇒ rechazo sin efecto; port que rechaza inicio ⇒ sin efecto; transición denegada ⇒ sin conciliación/ajuste.
- Patrón dominio-puro confirmado (igual que 009.1): deps solo kernel+platform+zod; VOs Zod congelados con `crear*():Result`; catálogos vacío⇒canónico / no-vacío⇒presente+habilitado; stock mutado SOLO por eventos con invariantes de no-negatividad y conservación de masa por familia de movimiento; idempotencia por opId revisada antes de efectos.
- Constantes internas de semántica (cubetas de stock, familias de movimiento) no son "enums encubiertos" — el revisor las distingue de catálogos de clasificación del tenant.
