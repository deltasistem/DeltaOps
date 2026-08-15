---
name: Auditoría cobertura FINAL-01
description: Cobertura funcional/datos/BI de DeltaOps Lite vs Forms/Excel/Power BI y arquitectura de producción decidida
---

- **Arquitectura de producción anunciada por Dirección**: Replit (dev) → GitHub → DigitalOcean Droplet → Neon PostgreSQL. Replit deja de ser destino de deploy; los criterios de readiness (roles PG mínimos, health gate, CORS, secretos) deben replicarse en Neon/Droplet.
- **Recomendación aceptada del informe: Opción C** — DeltaOps operacional + informes internos básicos con exportación + Power BI conservado para análisis gerencial (alimentado por exportes, no por Forms).
- **Gaps clave verificados** (informe FINAL-01): exportación Excel/CSV/PDF NO existe en absoluto (ni librerías ni endpoints); informes transversales filtrables faltan (las consultas viven por módulo/activo); semáforo de rutinas existe por activo pero sin vista de flota; ticket-foto no está en el flujo de tanqueo; tenencia propio/tercero/alquilado y placa no son campos. Categoría A (bloqueantes) vacía: 1 sola fase «Informes y Exportación» recomendada antes de producción.
- **MTTR/MTBF/disponibilidad siguen sin insumos**: en BD real 1/7 eventos correctivos con tiempoReparacionMin; analytics-runtime convierte insumos ausentes a 0 — no exponer esos KPI sin resolver captura (consistente con LITE-06).
- **Los Excel fuente son exportes de Microsoft Forms** (firma: Id/Hora de inicio/Correo) mayormente anónimos: los históricos importados no tienen identidad real de operador; formatos de fecha mixtos y 62% de lecturas marcadas `inconsistente` por retrocesos/reinicios de horómetro reales — consumo/hora solo confiable por tramos.
- **El Forms de horas hombre NO está reemplazado**: captura operación comercial (cliente/material/turno) que no es dominio de mantenimiento; decidir alcance con Dirección antes de retirarlo.
- **Why:** estas conclusiones fijan el alcance de la única fase de desarrollo pre-producción; no inflar con BI interno ni KPI sin datos (regla de no sobrecosto §28).
