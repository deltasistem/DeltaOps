---
name: Utilización DGP-019.1
description: Lecciones del módulo compuesto de utilización (lecturas, tanqueos, sync con Activos, RBAC, idempotencia).
---

# Utilización DGP-019.1 — lecciones

- **Versión fresca = drenar outbox antes de leer.** `modulo.activos.detalle` sirve la versión del read model, proyectada asíncronamente; el modelo de escritura valida `expectedVersion` contra su propia versión. Releer `detalle` en cada reintento NO basta si nada drena el outbox: el puerto debe ejecutar `outboxProcessor.processPending()` antes de leer, o el 409 (KRN-CFL-001) se repite indefinidamente con la misma versión rezagada.
  **Why:** e2e real falló con 3 conflictos en el mismo milisegundo pese a "releer" en cada intento.
  **How to apply:** cualquier puerto cross-módulo que derive `expectedVersion` de un read model debe converger lectura↔escritura (drenar outbox o leer del write model) antes de comandar.

- **Cross-módulo: principal de SERVICIO, jamás fabricar rol admin del usuario.** La propagación usa `system:utilizacion-sync` con permisos exactamente `["modulo.activos.operar"]`; el actor originador viaja solo como metadato de auditoría. Fabricar `contextForActivos(actorId,"admin")` es escalación de privilegios (falló revisión).

- **Claim durable de opId en TODA entrada de comando, no solo /sync.** buscar-recibo-antes + sellar-después con ON CONFLICT DO NOTHING permite doble hecho bajo carrera. Patrón: reclamar pendiente atómico (INSERT único RETURNING) antes de ejecutar; el perdedor recibe el resultado sellado o KRN-CFL-001 reintentable. Cinturón: índice único parcial de `op_id` en las tablas de hechos.

- **RBAC backend: derivar rol del rol canónico de sesión (`rolCanonico` + `aRolCanonico`), nunca del espejo legacy** — el espejo colapsa SUPERVISOR/PLANIFICADOR/TECNICO en "operador" y rompe la matriz por rol.

- **Entitlements de tenant: los tests de integración que corren contra la BD dev y llaman `actualizarModulos` con listas hardcodeadas despojan módulos nuevos.** Usar siempre `MODULOS_TODOS` canónico. Además `crearTenant` (upsert) NO refresca `modulos` de un tenant preexistente: el seed debe reafirmarlos con `actualizarModulos`.

- **"Gana la más reciente por fechaHora" produce `no-aplica` legítimos:** una lectura válida con fechaHora anterior a otra existente no propaga — no es bug; los e2e deben registrar con fecha/hora actual.

- **`documentElement.scrollWidth` se infla con tablas anchas dentro de wrappers scrollables anidados** aunque el recorte visual funcione; ni `overflow-x:clip` en ancestros ni `contain:inline-size` lo evitan. Solución sistémica: tabla desktop + tarjetas móviles (`.do-solo-desktop`/`.do-solo-movil`), con guarda de test que exige ambas variantes en páginas con `<Table>`.
