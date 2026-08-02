# 25 — Criterios de Aceptación del Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · Las condiciones verificables bajo las cuales el módulo de referencia se declara válido como patrón oficial.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Naturaleza

Los criterios de aceptación son **binarios y con evidencia**: el módulo de referencia es aceptado cuando todos se cumplen; hasta entonces, ningún DGP de negocio arranca (doc 24). Complementan al checklist de completitud (doc 21): aquel verifica que el módulo está entero; estos verifican que **cumple su misión de patrón**.

## 2. Los criterios

### CA-01 — Arranque limpio
El sistema arranca con el módulo registrado y valida su declaración completa; retirarlo de la lista de arranque deja el sistema funcionando igual (ningún acoplamiento inverso).

### CA-02 — Golden Path demostrado
Existe la bitácora de construcción (doc 22 §2b): cada pieza anotada con paso, plantilla y generador usados; ninguna pieza generable fue creada a mano.

### CA-03 — Cobertura del patrón
Cada pieza de la arquitectura declarada en el doc 01 §3 existe, funciona y tiene sus pruebas patrón pasando: comando (con idempotencia y concurrencia), consulta (con RLS y cursor), Policy (valores límite), evento (con sobre y versión), consumidor (idempotente), proyección (reconstruible), auditoría (atómica).

### CA-04 — Las cinco denegaciones distinguibles
Por API se obtienen, con errores canónicos distintos: sin autenticar (401), sin capacidad (tenant B), sin permiso (actor sin rol), denegación de Policy (límite), invariante violada (transición ilegal). Probado en E2E con el seed oficial.

### CA-05 — Aislamiento total de tenants
Con los dos tenants del seed: ni datos, ni existencia, ni auditoría, ni proyecciones, ni archivos de un tenant son observables desde el otro, por ninguna vía del módulo.

### CA-06 — Trazabilidad extremo a extremo
Una activación se sigue por su correlación: petición → transacción → outbox → bandeja → consumidor → proyección, en trazas y logs, sin huecos.

### CA-07 — Plantillas sincronizadas
Las plantillas T01-T09 y los generadores producen piezas idénticas en forma a las del módulo; la verificación es mecánica (generar y comparar estructura).

### CA-08 — Checklists en verde
Doc 21 completo con evidencia; puerta de CI sin exenciones; ningún AP-01…AP-14 presente (doc 23).

### CA-09 — Expediente y onboarding
Expediente documental completo (doc 20); una persona nueva completa el recorrido de onboarding práctico usando solo el módulo y su bitácora (ESI-002/06, validado con un caso real).

## 3. Gobierno

1. La aceptación la declara el dueño de arquitectura (ESI-002/27) con el expediente de evidencia archivado (mismo formato que ESI-003/27 §3).
2. Un criterio que falle reabre el DGP del módulo; no existen aceptaciones parciales.

## Impacto sobre la implementación

Es la definición de terminado del DGP del módulo de referencia y la llave que abre los DGP de negocio (secuencia ESI-002/20).

## Dependencias

Docs 01-24; ESI-002/06, /14, /18-20 y /27; ESI-003/27.

## Riesgos

- Presión por aceptar con criterios "casi" cumplidos para arrancar negocio; mitigación: regla de no-parcialidad y autoridad única de aceptación.

## Decisiones habilitadas

- Arranque de los DGP de negocio con fundamento demostrado.
- Formato de expediente de aceptación reutilizable.

## Decisiones bloqueadas

- Prohibido iniciar DGP de negocio con criterios pendientes.
- Prohibida la aceptación sin evidencia archivada.

## Reusable Pattern

Los DGP de módulo futuros derivan sus criterios de aceptación de esta lista: CA-01, CA-04, CA-05, CA-06 y CA-08 se copian tal cual (con sus instancias); CA-02 aplica siempre; CA-03/07/09 son específicos del rol de patrón y no se copian.

## Anti-Patterns

- Criterios de aceptación redactados después de construir, a la medida de lo construido.
- Evidencia "disponible bajo demanda" en lugar de archivada.
- Aceptar "de palabra" en reunión sin expediente.
