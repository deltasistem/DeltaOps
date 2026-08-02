# 27 — Checklist de Calidad

> **DeltaOps — ESI-004 · v1.0** · Las cualidades no funcionales que todo módulo demuestra: rendimiento, robustez, seguridad, operabilidad.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Naturaleza

El checklist de completitud (doc 21) pregunta "¿está todo?"; el de revisión (doc 26) "¿está donde debe?"; este pregunta **"¿se comporta con calidad?"**. Se verifica al cierre del módulo y en cada release que lo toque (ESI-002/22).

## 2. El checklist

### Q-01 — Presupuestos de rendimiento declarados y medidos
Cada comando y consulta del módulo declara su presupuesto de latencia (contra el seed oficial, en QA); el ejemplar declara los suyos y la verificación queda automatizada. Sin presupuesto no hay optimización racional: primero el número, después el juicio.

### Q-02 — Sin degradación por volumen razonable
El listado pagina estable con volúmenes de referencia; ninguna consulta degenera con el crecimiento esperado (los planes de consulta de las rutas calientes se revisan una vez contra el seed grande). Los N+1 se cazan en las pruebas de adaptador.

### Q-03 — Robustez ante lo torcido
Entradas malformadas, cuerpos gigantes, cursores corruptos, claves de idempotencia reutilizadas con payload distinto (error canónico, no reejecución): todo produce error canónico controlado, jamás 500 accidental. Batería de robustez del borde incluida.

### Q-04 — Comportamiento bajo fallo parcial
Con la BD caída: errores explícitos y salud en rojo (nada cuelga). Con el consumidor detenido: los comandos siguen; la bandeja crece con alerta; al reanudar, converge sin pérdida. Probado en el ejemplar como patrón de resiliencia.

### Q-05 — Seguridad verificada
CA-04/CA-05 (doc 25) más: sin fugas en mensajes de error, sin datos sensibles en logs/telemetría (escaneo de la puerta), dependencias del módulo sin vulnerabilidades conocidas por encima del umbral (ESI-002/13).

### Q-06 — Operabilidad demostrada
Toda alerta del módulo tiene respuesta escrita y **ensayada una vez** (la reconstrucción de proyección se ejecuta de verdad en QA); los trabajos del módulo declaran presupuesto y punto seguro (ESI-003/22).

### Q-07 — Coste razonado
Ruido de log dentro de presupuesto (doc 16), cardinalidad de métricas revisada (doc 18), sin trabajo periódico injustificado.

## 3. Reglas

1. Los umbrales concretos (latencias, volúmenes) los fija cada módulo en su DGP **antes de construir**; el patrón fija que existan y se midan.
2. Un Q-nn en rojo en release bloquea igual que una prueba rota (ESI-002/22 §checklist).

## Impacto sobre la implementación

Añade al DGP del módulo de referencia las baterías de robustez y resiliencia y la declaración de presupuestos; ambas quedan como infraestructura patrón.

## Dependencias

Docs 16, 18, 21, 25 y 26; ESI-002/13, /14 y /22; ESI-003/15, /17, /18 y /22.

## Riesgos

- Presupuestos de fantasía (muy holgados para pasar siempre, o rígidos sin medición); mitigación: se calibran contra la primera medición real y se cambian con PR justificado, no en caliente.

## Decisiones habilitadas

- Verificación de calidad continua por release, no heroísmos pre-lanzamiento.
- Baterías de robustez y resiliencia reutilizables.

## Decisiones bloqueadas

- Prohibido declarar terminado un módulo sin presupuestos medidos.
- Prohibido liberar con Q-nn en rojo.

## Reusable Pattern

Los DGP futuros copian los siete Q-nn como estructura fija, rellenando umbrales propios; las baterías de robustez (Q-03) y resiliencia (Q-04) se instancian desde las del ejemplar.

## Anti-Patterns

- Optimizar sin presupuesto ni medición ("me pareció lento").
- Pruebas de carga teatrales una vez al año en lugar de presupuestos continuos.
- Tratar la operabilidad (Q-06) como documentación opcional.
