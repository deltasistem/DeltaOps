# 02_COMMAND_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Flujo estándar de un Command: los mismos pasos, siempre, para toda escritura.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. El flujo canónico (obligatorio, sin variantes)

```
1. RECEPCIÓN      adaptador de entrada traduce el canal al comando del contrato
2. TELEMETRÍA     se abre traza, se establece correlación (ETS-011/27)
3. IDEMPOTENCIA   clave consultada; si ya ejecutó → misma respuesta, fin (ETS-010/18)
4. AUTORIZACIÓN   identidad → capacidad → alcance; denegar por defecto (ETS-011/14)
5. VALIDACIÓN     de forma, contra el contrato generado; errores acumulados (ETS-011/13)
6. CONFIGURACIÓN  resolutor entrega versiones congeladas para este comando (ETS-011/15)
7. CASO DE USO    carga agregado(s) por repositorio, invoca dominio, recoge eventos
8. UNIT OF WORK   estado + eventos + outbox + resultado idempotente, un commit (ETS-011/08)
9. RESPUESTA      Resultado → sobre del canal; traza cerrada con desenlace
```

Los pasos 2-6, 8 y 9 son de plataforma: el módulo **no los escribe**, los declara (metadatos del caso de uso). El módulo solo escribe el paso 7.

## 2. Reglas de implementación

1. **Un comando = una intención = una transacción = un agregado** (ETS-011/09). Si un flujo necesita dos agregados, son dos comandos o un proceso por eventos — jamás una transacción más grande.
2. **El comando es un dato inmutable**: se construye completo en la frontera y no se modifica en el camino; lo que el dominio necesita y no viene en el comando, viene del agregado o de la configuración resuelta — nunca de una consulta lateral dentro del paso 7.
3. **Tres desenlaces, ninguno excepcional**: confirmado, rechazado (código de catálogo), apartado/en revisión (ETS-011/13 §2.4). Los tres regresan por el mismo camino del paso 9.
4. **El caso de uso no conoce el canal**: API, sync móvil, job o integración construyen el mismo comando; la igualdad de canales es literal (ETS-011/11).
5. **Rechazar temprano y barato**: el orden 3→4→5→6 es fijo porque cada paso es más caro que el anterior; ningún comando toca dominio sin haber pasado autorización y validación.
6. **Nada externo dentro de la transacción**: notificar, indexar, integrar — todo eso son consumidores del outbox, después del commit (ETS-011/08 §nada-externo).
7. **La respuesta del comando es sobria**: identidad creada/afectada, versión resultante y desenlace; los datos completos se piden por consulta (CQRS también en la respuesta).
8. **Conflicto de concurrencia = rechazo honesto**: versión optimista no coincide → código de conflicto del catálogo, el cliente decide; jamás reintentos silenciosos que fusionan estados.

## 3. Qué escribe el implementador de un comando nuevo

| Artefacto | Contenido |
|---|---|
| Entrada de catálogo | La operación en ETS-008 (primero) |
| Metadatos | permiso requerido, claves de configuración, eventos posibles, errores posibles |
| Caso de uso | orquestación del paso 7, sin decisiones de negocio |
| Dominio | el método del agregado y/o motor que decide |
| Pruebas | dominio en memoria + caso de uso con fakes + entradas a las matrices transversales (25) |

Nada más. Pipeline, UoW, outbox, auditoría y telemetría llegan solos.

---

## Impacto sobre la implementación
Todo comando del sistema se construye llenando esta plantilla; los revisores rechazan cualquier comando cuyo flujo difiera del canónico.

## ETS relacionados
ETS-011 (08, 09, 11, 13, 14, 15) · ETS-008 (03 catálogo de comandos, 07 errores) · ETS-010 (18 idempotencia).

## Riesgos
- Consultas laterales dentro del caso de uso "porque faltaba un dato" → el dato falta en el diseño del comando o del agregado; se corrige ahí.
- Respuestas de comando engordando hasta ser consultas → regla 7 es de revisión obligatoria.

## Decisiones habilitadas
Generación de esqueletos de comando desde el catálogo, revisión uniforme, matrices de prueba automáticas.

## Decisiones bloqueadas
Sintaxis concreta de la plantilla en el lenguaje elegido — se fija en la primera traducción oficial.
