# 27 — Backend Readiness

> **DeltaOps — ESI-003 · v1.0** · Cuándo el Backend Foundation está listo para recibir el primer módulo de negocio.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Principio

El Foundation está listo cuando **un módulo de referencia puede construirse encima usando solo plantillas, generadores y contratos** — sin tocar plataforma, sin pedir excepciones, sin descubrir huecos. La preparación se demuestra con evidencia, no se declara (mismo espíritu que ESI-002/26: verde total o no hay módulo).

## 2. Checklist de preparación (evidencia obligatoria)

### Bloque A — Kernel
- [ ] Catálogos (errores, capacidades, permisos, eventos) cargan y se verifican al arranque; una referencia inválida aborta.
- [ ] Todos los puertos tienen contrato y fake; los fakes pasan las mismas pruebas de contrato que las implementaciones reales.
- [ ] La regla de dependencias del Kernel (cero hacia afuera) está verificada mecánicamente en la puerta.

### Bloque B — Composición y ciclo de vida
- [ ] El bootstrap ejecuta la secuencia completa (doc 02) y aborta ante configuración inválida con mensaje exacto.
- [ ] Los cinco estados del ciclo de vida (doc 03) son observables por las sondas; el drenaje termina trabajos en punto seguro.
- [ ] API y worker comparten composición y divergen solo en el borde.

### Bloque C — Seguridad
- [ ] Autenticación, sesiones, capacidades y permisos funcionan extremo a extremo con dos tenants de seed (ESI-002/12).
- [ ] Un actor del tenant A no puede ver ni inferir recursos del tenant B: probado en API, lectores, archivos y eventos (las dos murallas activas).
- [ ] Denegaciones distinguibles: sin capacidad ≠ sin permiso ≠ no existe.

### Bloque D — Runtimes de ejecución
- [ ] Un caso de uso de prueba confirma: transacción única, outbox atómico, bloqueo optimista, idempotencia por clave (doc 20).
- [ ] Un evento viaja outbox → relevo → bandeja → consumidor idempotente; el duplicado forzado no produce efecto doble; el fallo agotado cae en bandeja muerta y se reprocesa (doc 19).
- [ ] Un trabajo programado se ejecuta con exclusiva entre dos réplicas y deja registro de ejecución (doc 22).
- [ ] Un archivo sube por dos fases, se descarga autorizado y el huérfano forzado es recogido por el barrido (doc 23).

### Bloque E — Operación
- [ ] Logs estructurados con correlación cruzando API → evento → worker en una sola traza.
- [ ] Métricas de serie visibles en tablero; una alerta definida con su respuesta escrita (doc 17).
- [ ] Apagado durante carga: cero trabajos perdidos, comprobado contra los registros de idempotencia.

### Bloque F — Plataforma de ingeniería
- [ ] Las plantillas backend (T01-T09) generan piezas que compilan, prueban y pasan la puerta sin retoques.
- [ ] El módulo de esqueleto generado con T09 se registra, arranca y responde salud sin editar plataforma.

## 3. Reglas

1. La evidencia se adjunta al expediente de preparación: salidas de prueba, capturas de tablero, registros — con fecha.
2. Todo punto en rojo bloquea el inicio del primer módulo de negocio; no existen "pendientes aceptables".
3. El expediente lo valida el dueño de arquitectura (ESI-002/27) y se archiva como documento del repositorio (ESI-002/23).

## Impacto sobre la implementación

Define el criterio de salida del conjunto de DGP de plataforma y el criterio de entrada del DGP del primer módulo (secuencia ESI-002/20).

## Dependencias

Todos los documentos de esta serie; ESI-002/12, /18-20, /26-27.

## Riesgos

- Presión por empezar el módulo con puntos en rojo; mitigación: la regla 2 es absoluta y la valida un rol con autoridad definida.
- Checklist superada una vez y jamás re-verificada; mitigación: los puntos mecanizables entran en la puerta permanente; el resto se re-verifica en cada release (ESI-002/22).

## Decisiones habilitadas

- Arrancar el DGP del módulo de referencia con la plataforma demostrada.
- Convertir esta checklist en pruebas permanentes del repositorio.

## Decisiones bloqueadas

- Prohibido iniciar módulos de negocio con el Foundation en rojo.
- Prohibido validar la preparación sin evidencia archivada.
