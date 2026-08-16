---
name: Informes y exportación FINAL-02
description: Lecciones de la capa de informes/exportación por composición pura (datasets, CSV/XLSX, ventanas de contrato, suites PG con dos bases)
---

# Informes y exportación (FINAL-02)

- **Suites destructivas con runtimes reales**: los runtimes de api-server usan el pool de `@workspace/db`, que compone su cadena desde `PGHOST/PGDATABASE` + rol. La forma correcta de correr una suite HTTP+runtimes contra la BD de test es `PGDATABASE=deltaops_test DELTAOPS_DB_ROLE=owner vitest run` con `DATABASE_TEST_URL` apuntando a la misma base: así runtime y `poolDestructivo` coinciden, y el guard B3 no se dispara porque compara contra `DATABASE_URL` (que sigue en dev).
  **Why:** B3 prohíbe `DATABASE_TEST_URL == DATABASE_URL`; sobrescribir `DATABASE_URL` rompe el guard, y no sobrescribir nada deja usuarios en una base y datos en otra (401s desconcertantes).
- **Marcador histórico de preoperacionales**: los registros importados llevan `contexto._origen === "HISTORICO"`, NO un campo `origen` de nivel superior. Filtrar por el campo equivocado duplica los ~3.7k históricos (record store + timeline).
- **Ventanas de contratos congelados**: listados sin offset (órdenes ≤500, preop ≤200) no garantizan corte exhaustivo. Patrón aceptado en revisión: fan-out por entidad + **advertencia explícita** cuando un lote alcanza el tope, propagada a meta, UI (`role="alert"`) y al propio archivo exportado. Jamás truncamiento mudo ni afirmar consolidación incondicional.
- **Exportación auditada de verdad**: `platform.export` tiene máquina de estados `pending→running→completed`; llamar `complete` directo falla (KRN-CFL-001). La cadena correcta es `request → updateProgress → complete`, verificando el Result de CADA transición fail-closed antes de entregar el archivo.
- **Inyección de fórmulas CSV**: todo serializador CSV debe prefijar `'` a valores que comiencen por `=`, `+`, `-`, `@`, TAB o CR **antes** del quoting; el marcador «—» no casa el patrón.
- **UI genérica dirigida por catálogo**: declarar columnas/filtros por informe en el backend y renderizar un detalle único evita 9 páginas; cualquier filtro nuevo exige declararlo en el catálogo Y modelarlo en el cliente (un parámetro solo-backend es invisible para el usuario ⇒ hallazgo MAYOR).
- El selector de equipos del frontend debe respetar `limit≤200` del contrato de activos (500 ⇒ 400 KRN-VAL-001 silencioso en la UI).
