# 15_AUDIT_STORAGE.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia física de auditoría: cómo se almacena en PostgreSQL la auditoría diseñada en ETS-009/06.
> Documento de diseño. Sin SQL.

---

## 1. Piezas físicas

```text
LA FUENTE (no es una tabla nueva)
  evento_<dominio> de cada esquema (03): el flujo de eventos ES la
  auditoría — nace atómico con cada hecho vía outbox, imposible de omitir

ESQUEMA auditoria (verdad, sellado)
  ├── cadena_evento       huella del evento + huella del eslabón anterior
  │                       (cadena por tenant), particionada mensual (09)
  ├── sello_periodo       huella acumulada por tenant/periodo, firmada;
  │                       exportable al tenant (verificación independiente)
  ├── acceso_sensible     hecho por cada lectura de dato Restringido /
  │                       descarga firmada (ETS-007/12), particionada
  └── verificacion_cadena resultados de las verificaciones programadas

ESQUEMA audit_consulta (derivado, reconstruible)
  └── linea_tiempo_entidad y proyecciones forenses indexadas por las
      preguntas de auditoría (por entidad, actor, periodo, tipo)
```

## 2. Reglas físicas

1. **Privilegios de solo-inserción**: los roles de aplicación insertan y leen; UPDATE/DELETE inexistentes sobre `auditoria` y `evento_*` para todo rol excepto el proceso de temperatura (que solo exporta+detach verificado, 09 §3). Ni el rol de migración reescribe contenido histórico.
2. **La cadena se construye al despachar**: el despachador del outbox calcula la huella encadenada en orden de secuencia por tenant — el hecho de encadenar no está en la transacción del comando (no encarece la captura) pero ningún evento se declara despachado sin eslabón (la brecha es detectable por verificación).
3. **Reconciliación flujo↔réplica**: `audit_consulta` se compara periódicamente contra `evento_*` (conteos y huellas por rango) — divergencia = alerta de seguridad (ETS-009/06 §2).
4. **Sellos alineados a cierres**: `sello_periodo` se emite con el congelamiento de periodo (ETS-009/04 §5); el sello viaja también al respaldo lógico inmutable (17 de ETS-009).
5. **Consulta forense solo en `audit_consulta`** (réplica/índices propios): las preguntas pesadas jamás tocan las particiones calientes de eventos (ETS-009/06 §4).
6. Retención: la más larga del sistema; sus particiones frías se exportan con verificación doble (huella de partición + cadena interna) — la auditoría fría sigue siendo demostrable (ETS-009/10).

---

## Impacto sobre la implementación
El despachador de outbox incorpora el encadenado de huellas desde la primera versión; los privilegios de solo-inserción se configuran en el primer despliegue; la verificación de cadena es un job de plataforma de serie.

## ETS relacionados
ETS-009 (06 auditoría, 04 append-only, 10 archivado) · ETS-007 (12 seguridad) · ETS-010 (02 esquemas, 09 particiones, 12 privilegios).

## Riesgos
- Encadenar fuera de la transacción deja ventana entre hecho y eslabón → aceptado y acotado: el evento sin eslabón no se declara despachado; la verificación detecta cualquier hueco.
- El costo de huellas a alto volumen → cálculo en el despachador (asíncrono, por lotes), no en la captura.

## Decisiones habilitadas
Implementación del despachador con cadena, jobs de verificación y reconciliación, exportación de sellos al tenant.

## Decisiones bloqueadas hasta el siguiente ETS
Algoritmo de huella/firma concreto y el formato del paquete de verificación exportable (con la implementación de seguridad).
