---
name: Módulo Activos DGP-008.1
description: Convenios del módulo de dominio Activos Empresariales (lib/module-activos) y lecciones de su revisión arquitectónica.
---

# Módulo Activos Empresariales (DGP-008.1)

Paquete `lib/module-activos` (`modulo.activos`), montado en api-server bajo `/api/deltaops/activos`; tablas `deltaops.act_*` (migración 0007). Solo dominio: sin dashboard/reportes/KPIs/IA/import/export (reservado a subfases 008.x).

Reglas duras (hallazgos de la revisión, ya corregidos — no repetir en módulos futuros):
- **Sync offline exige reclamación durable del opId ANTES de ejecutar**: claim (INSERT 'pendiente' ON CONFLICT DO NOTHING + relectura en la misma tx) → commands.execute → finalize condicional (solo si sigue 'pendiente'). Un simple find→ejecutar→insert no sobrevive concurrencia ni fallo del guardado; finalize fallido ⇒ responder 'reintentable', nunca éxito sin recibo; pendientes viejos se adoptan reconciliando contra el agregado.
- **Policies deben quedar ENLAZADAS a la autorización de cada comando** (no basta registrarlas en el PolicyEngine); las transiciones también llevan policy.
- **Catálogos con semántica inequívoca**: vacío ⇒ comportamiento canónico; no vacío ⇒ el valor debe estar presente Y habilitado (ausente ≠ permitido). Defaults de config (p.ej. moneda-defecto) se aplican ANTES de validar catálogos.
- **Alcance por subfase es mandato**: exponer 'stats' como query pública contó como dashboard prohibido; sondas internas solo en healthCheck.
- Los 15+1 catálogos van sobre el runtime de catálogo de Business Foundation (nada de tablas ad hoc por catálogo); horómetro/odómetro son Medicion monótona.
