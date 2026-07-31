# 08_UNIT_OF_WORK.md

> **DeltaOps — ETS-011 · v1.0** · Unit of Work: la garantía de atomicidad del comando.
> Documento de diseño. Sin código, sin clases.

---

## 1. Definición

El Unit of Work es **el contrato del Core que garantiza que todo lo que un comando produce se confirma junto o no se confirma nada**:

```text
UNA TRANSACCIÓN (la del comando, 09):
  1. estado nuevo del agregado (con verificación de versión optimista)
  2. eventos del agregado en evento_<dominio> (secuencia por agregado)
  3. los mismos eventos en outbox_<modulo> (para despacho, 10)
  4. resultado de idempotencia por clave (respuesta reproducible)
  5. hechos adjuntos del mismo agregado (fila del hecho, folio asignado)
COMMIT → el Resultado existe; ROLLBACK → nada existió
```

Es la materialización en el Core de la transacción mínima de ETS-009/03 y de la escritura atómica comando+resultado de ETS-010/18.

## 2. Reglas normativas

1. **Un Unit of Work por comando**, abierto y cerrado por el pipeline (11) — los casos de uso no manejan transacciones a mano; los Domain Services ni saben que existen.
2. **Concurrencia optimista obligatoria**: guardar exige la versión leída; el conflicto es un Resultado de rechazo del catálogo (el cliente reintenta con estado fresco) — sin bloqueos pesimistas de negocio.
3. **Nada externo adentro** (09): ni URLs firmadas, ni proveedores de IA, ni notificaciones, ni siquiera otra transacción — todo efecto externo es consumidor del outbox después del commit.
4. **El outbox es parte del contrato, no una opción**: un guardado sin sus eventos es un defecto de la implementación del UoW, no una elección del caso de uso — la atomicidad hecho↔evento es estructural (ETS-009/04).
5. **La clave de idempotencia se registra dentro** (regla ETS-010/18 §2.1): el resultado reproducible nace en el mismo commit; el reintento posterior lee, no reejecuta.
6. **Fallos con nombre**: el UoW traduce las fallas físicas a los errores del Kernel (conflicto de versión, duplicado de idempotencia — que es éxito reproducido, no error —, violación de muralla física que se reporta como defecto, 26).
7. Las **consultas no tienen Unit of Work**: leen read models sin transacción de escritura (12); los procesos consumidores usan su propia unidad (procesar evento + avanzar cursor + escribir proyección, atómico por consumidor, ETS-009/08).

---

## Impacto sobre la implementación
El UoW se implementa una vez por módulo sobre el adaptador de persistencia; el pipeline de comandos lo administra; ninguna otra pieza abre transacciones.

## ETS relacionados
ETS-009 (03 transacción mínima, 04 atomicidad, 07 outbox) · ETS-010 (18 idempotencia física, 06 constraints) · ETS-011 (09 fronteras, 10 despachador, 11 pipeline).

## Riesgos
- Transacciones que crecen (I/O externo adentro) degradan todo el sistema → regla §2.3 + alerta de transacciones largas (ETS-010/20).
- Implementaciones por módulo que divergen → un solo patrón de UoW compartido como plantilla de plataforma (24).

## Decisiones habilitadas
Pipeline de comandos (11), despachador (10), pruebas de atomicidad con fakes transaccionales.

## Decisiones bloqueadas
Mecanismo transaccional concreto del lenguaje/driver — implementación.
