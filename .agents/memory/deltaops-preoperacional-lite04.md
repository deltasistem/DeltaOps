---
name: Preoperacional LITE-04
description: Lecciones del preoperacional/checklist compuesto sobre Dynamic Forms, veredicto por criticidad de plantilla y contexto de captura embebida.
---

# DELTAOPS LITE-04 — Preoperacional y Checklist Operacional

## Criticidad y veredicto (decisión de Dirección)
Fuente de verdad = la plantilla: cada ítem declara `critico` explícito (jamás inferido por nombre/heurística). Veredicto en backend: NO_APTO si ≥1 crítico NO CUMPLE; APTO_CON_OBSERVACIONES si hay observaciones/incumplimientos no críticos; APTO si todo obligatorio cumple; NO APLICA neutral. Sellado inmutable y anclado a la versión de plantilla usada — una versión nueva jamás recalcula ejecuciones históricas.

## Contexto de captura embebida: los permisos son del comando, no del rol
Reutilizar el contexto de otro módulo (`contextForFormularios`, solo permisos de plantilla) para ejecutar comandos de RESPUESTA del motor produce 403 en producción aunque los tests de dominio pasen (sellaban directo, sin la cadena real).
**Regla:** la composición embebida usa un principal de servicio con exactamente los permisos que exige la cadena de comandos ejecutada (patrón `capturarRespuesta` de órdenes) + guarda RBAC propia fail-closed en la frontera HTTP (`puedeRegistrarPreop`, patrón `puedeMaterializar` de costos), conservando la identidad canónica del usuario en el sello. Testear el camino HTTP real con sesión por rol — los fakes ocultan permisos reales.

## Persistencia sin migración
Ejecuciones como recordType en el store genérico `platform_records` (RLS + auditoría heredadas); idempotencia por opId determinista en el id. El vocabulario del motor es neutro y su guard (`detectarVocabularioProhibido`) rechaza términos de negocio ("equipo"/"activo") en plantillas: el framing de negocio vive solo en UI/API.

## Offline honesto
El veredicto solo se muestra con sello del servidor; mutación encolada ⇒ estado "se sellará al sincronizar", nunca completado optimista.

## Pendiente para LITE-05
Hallazgo→OT: solo prefill hacia correctivo (query params); mapear evidencias completas a EntradaSolicitud y generar OT corresponde a LITE-05, con la procedencia ya sellada en la ejecución.
