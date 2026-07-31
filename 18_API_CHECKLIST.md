# 18_API_CHECKLIST.md

> **DeltaOps — ETS-008 · v1.0** · Checklist de validación: todo endpoint nuevo (o cambiado) debe pasar TODOS los puntos antes de aprobarse (`17` §6).
> Cierra la serie ETS-008. Documento de diseño. No implementa nada.

---

## A. Contrato y catálogos

- [ ] Ejecuta **exactamente un** comando (`03`) o una consulta (`04`) ya catalogados — si no existe, primero se cataloga (con todos sus atributos: permisos, eventos, errores, offline, idempotencia).
- [ ] Está registrado en `05_ENDPOINT_CATALOG.md` con método, ruta, contrato asociado y clase de rate limit.
- [ ] La especificación (`16`) se escribió y revisó **antes** de implementar (contract-first).
- [ ] Nombres en lenguaje ubicuo (ETS-003/08): recurso plural con guiones, acción de intención, campos del diccionario — la misma cosa se llama igual que en el resto de la API.

## B. Semántica

- [ ] Comando: afecta UN agregado; devuelve la representación resultante; **clave de idempotencia obligatoria** y verificada (repetir = resultado original).
- [ ] Consulta: sin efectos; sirve un read model identificado; **frescura declarada** en la respuesta.
- [ ] Si tarda más del presupuesto interactivo: es **asíncrono declarado** (`202` + recurso de operación), no una conexión colgada.
- [ ] Ediciones concurrentes protegidas por versión (If-Match / `CONFLICTO_VERSION` con representación actual).
- [ ] Lotes: atomicidad **por elemento**, jamás transacción de lote entre agregados.

## C. Seguridad y multi-tenant

- [ ] Permiso evaluado en el **contexto activo**, denegado por defecto; declarado en el catálogo y verificado por prueba.
- [ ] Tenant implícito del token; **imposible** cruzar tenants (prueba de fuga cross-tenant incluida en la suite).
- [ ] `RECURSO_NO_ENCONTRADO` homogéneo (no revela existencia de lo no visible).
- [ ] Sin credenciales/secretos en URL, cuerpo de respuesta ni logs; datos Restringido minimizados (referencias, no copias).
- [ ] SoD respetada si el endpoint participa en aprobaciones (aprobador ≠ creador, estructural).

## D. Sobres, errores y trazabilidad

- [ ] Respuestas con el sobre estándar (`06`): datos + metadatos (+ advertencias/enlaces); errores con el sobre único de problema.
- [ ] Todos los errores posibles usan códigos del catálogo (`07`) — los nuevos se catalogan primero; mensajes en lenguaje de negocio, localizables; código estable para siempre.
- [ ] Validación completa (todos los campos con problema en una respuesta, no al primero).
- [ ] `X-Id-Correlacion` en toda respuesta (incluidos errores) y propagado a eventos/notificaciones derivados.
- [ ] Indicador `reintentable` honesto en cada error.

## E. Hechos, eventos y auditoría

- [ ] Todo cambio del mundo produce hecho + evento **atómicos** (outbox); eventos del catálogo (`09`), con sobre completo (contexto, actor, tiempo doble, causalidad).
- [ ] Nada se edita ni borra: correcciones como eventos compensatorios enlazados.
- [ ] El cliente no envía campos de auditoría (autor, tenant, fechaRegistro los pone el servidor).
- [ ] Tiempo doble respetado: `fechaNegocio` aceptada donde el hecho puede preceder al registro; filtros de fecha declaran contra cuál operan.
- [ ] Si contenido asistido por IA puede llegar por aquí: marca IA presente (U-40).

## F. Comportamiento offline (si el comando es capturable en campo)

- [ ] Declarado Offline=Sí en el catálogo; procesable vía bitácora (`12`) con validación a tiempo de negocio.
- [ ] Identidades provisionales soportadas si crea entidades referenciables.
- [ ] Conflictos mapeados a las reglas de dominio (ETS-006/14): coexistir / regla automática / bandeja de revisión — nunca sobrescritura forzada.

## G. Rendimiento y operación

- [ ] Clase de rate limit asignada (`05` §0) y presupuesto de latencia declarado (derivado de ETS-004/11); medido en producción tras liberar (regresión = defecto).
- [ ] Paginación por cursor si devuelve listas; orden por defecto estable documentado.
- [ ] Política de cache declarada (frescura/eventos/ETag) o explícitamente "sin cache"; claves por tenant.
- [ ] Instrumentado: métricas por operación/tenant, logs estructurados sin datos sensibles.
- [ ] Detrás de feature flag si es funcionalidad nueva (desplegar ≠ liberar, ETS-007/15).

## H. Compatibilidad y documentación

- [ ] El cambio es aditivo (o siguió el proceso de breaking/deprecación, `17` §§3-4).
- [ ] La suite de compatibilidad N-1 pasa.
- [ ] Tolerancia del lector verificada (campos extra no rompen al cliente de referencia).
- [ ] Ejemplos realistas de éxito y error en la especificación, validados en la construcción (`16` §6).
- [ ] Novedades (changelog) redactadas en lenguaje de consumidor; SDKs regenerados (`15`).

---

**Regla final:** un punto no aplicable se marca justificado, jamás se omite en silencio. Si el endpoint no puede pasar el checklist, el problema es del diseño del endpoint — no del checklist.

**Fin de la serie ETS-008.** El contrato público de DeltaOps queda definido: filosofía y estándares, catálogos completos de comandos, consultas y endpoints, sobres y errores estables, contratos de seguridad, eventos, webhooks, archivos, sincronización offline, integraciones e IA, guía de SDK, lineamientos OpenAPI y gobierno con checklist — coherente con ETS-001…007 y listo para que backend, frontend, móvil, SDK e integraciones se construyan obedeciéndolo.
