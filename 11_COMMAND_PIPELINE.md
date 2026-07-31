# 11_COMMAND_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de comandos: las etapas fijas que todo comando atraviesa, en orden, sin excepciones ni atajos.
> Documento de diseño. Sin código, sin clases.

---

## 1. Las etapas (orden normativo)

```text
SOBRE DE COMANDO + CONTEXTO DE EJECUCIÓN (construido por el adaptador, 07)
  1. TELEMETRÍA        abre traza y métrica de la operación (27)
  2. IDEMPOTENCIA      ¿clave ya resuelta? → devuelve el resultado
                       original y termina (no reejecuta nada)
  3. AUTORIZACIÓN      pipeline 14: ¿puede este actor, en este
                       contexto, esta operación? denegado = termina
  4. VALIDACIÓN        pipeline 13: forma → negocio → configurables
  5. CONFIGURACIÓN     pipeline 15: resolución de las versiones
                       vigentes que este comando consume
  6. CASO DE USO       carga agregados → dominio decide (04, 05)
  7. UNIT OF WORK      commit atómico (08): estado + eventos +
                       outbox + resultado de idempotencia
  8. RESPUESTA         Resultado del Kernel → el adaptador lo
                       proyecta al contrato (ETS-008)
     (todo lo demás — proyecciones, notificaciones, búsqueda, IA,
      integraciones — ocurre DESPUÉS, como consumidores del outbox)
```

## 2. Reglas normativas

1. **El orden es fijo**: autorizar antes de validar negocio (no se revela existencia de datos a quien no puede verlos); idempotencia antes que todo lo costoso; configuración resuelta antes que el dominio decida.
2. **Cada etapa termina o pasa**: no hay etapas advisory; el rechazo en cualquier etapa produce un Resultado con error de catálogo y la traza completa (26, 27).
3. **El pipeline es único y compartido**: los módulos no escriben pipelines propios; declaran metadatos (permiso, validaciones, configuración consumida — 03 §3.6) y el pipeline los aplica. Un comando "especial" que necesite saltarse una etapa es un defecto de diseño.
4. **Tercer desenlace: aceptado-en-revisión** (Kernel, 02): la validación puede apartar en lugar de rechazar (lecturas anómalas, revisiones humanas del canal móvil — ETS-009/03 §8); el hecho queda apartado con su bandeja y el resultado lo dice.
5. **El pipeline no conoce HTTP**: opera sobres del Kernel; el mismo pipeline sirve web, sync móvil (comando por comando de la bitácora), consumidores internos y jobs — la igualdad de canales es literal.
6. **Presupuesto por etapa**: el pipeline mide cada etapa (27); una etapa que crece delata su culpable (validación lenta = falta índice o sobra consulta).

---

## Impacto sobre la implementación
Se implementa una vez como plataforma (24); los módulos solo aportan metadatos y casos de uso; los adaptadores de entrada construyen el sobre y consumen el Resultado.

## ETS relacionados
ETS-008 (03 comandos, 07 errores, 12 sync) · ETS-010 (18 idempotencia) · ETS-011 (03, 08, 13, 14, 15, 26, 27).

## Riesgos
- "Excepciones al pipeline" para casos urgentes → regla §2.3: el pipeline evoluciona gobernado, nunca se esquiva.
- Doble validación divergente (adaptador valida "un poco") → el adaptador solo traduce (07 §2.1); la validación es del pipeline.

## Decisiones habilitadas
Implementación única del pipeline, metadatos por comando, medición por etapa.

## Decisiones bloqueadas
Mecanismo concreto de composición de etapas (middleware/decoradores del lenguaje) — implementación.
