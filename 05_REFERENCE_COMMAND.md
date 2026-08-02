# 05 — Command de Referencia: Activar Elemento de Referencia

> **DeltaOps — ESI-004 · v1.0** · El comando canónico: un cambio de estado con invariantes, Policy, evento e idempotencia.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Definición

| Atributo | Valor |
|---|---|
| Nombre | Activar Elemento de Referencia — verbo en infinitivo (ESI-002/24) |
| Entrada | Identificador del elemento, `clave_idempotencia`; el tenant y el actor vienen del contexto, jamás del cuerpo (ESI-003/09) |
| Capacidad | `capacidad_de_referencia` (doc 04) |
| Permiso | `REFERENCIA.ELEMENTO.ACTIVAR` |
| Efecto | Transición BORRADOR → ACTIVO si las invariantes y la Policy lo permiten |
| Evento | Elemento de Referencia Activado (doc 14), por outbox |
| Respuesta | Contrato ETS-008 con el estado resultante y la versión nueva del agregado |

## 2. Recorrido del comando (resumen; el detalle en doc 07)

1. El borde recibe la petición conforme al contrato ETS-008 y la traduce al comando; cero lógica.
2. La plataforma verifica capacidad y permiso declarados (ESI-003/07 y /12).
3. La validación de entrada rechaza lo malformado antes de tocar dominio (doc 08).
4. El caso de uso (doc 10) abre la UoW, carga el agregado por su repositorio, consulta la Policy del tenant (doc 09), y ordena al agregado activarse.
5. El agregado decide: invariantes propias (nombre válido, estado BORRADOR) o error canónico de negocio.
6. La UoW confirma: cambio + evento en outbox + clave de idempotencia, atómico (ESI-003/20).

## 3. Qué demuestra deliberadamente

1. **Idempotencia real**: reenviar el comando con la misma clave devuelve el resultado original sin doble efecto — prueba obligatoria (doc 19).
2. **Concurrencia**: dos activaciones simultáneas del mismo elemento producen exactamente un éxito y un error canónico de concurrencia (bloqueo optimista, ETS-009).
3. **Los tres niveles de denegación** por separado: capacidad (tenant B), permiso (actor sin rol), invariante (elemento ya ACTIVO). Tres errores canónicos distintos.
4. **Error de transición ilegal**: intentar activar un elemento ARCHIVADO produce el error de máquina de estados, demostrando que las invariantes viven en el agregado, no en el caso de uso.

## Impacto sobre la implementación

Es la instancia canónica de la plantilla T01 (ESI-002/18); el generador de casos de uso produce esta forma exacta. Su recorrido es el patrón de todo comando futuro.

## Dependencias

Docs 04, 07-10, 14; ESI-003/09, /12, /15 y /20; ETS-008 (contrato), ETS-009 (idempotencia y concurrencia).

## Riesgos

- Que el patrón se perciba como "demasiado ceremonial" para comandos triviales; mitigación: el generador produce la ceremonia; el coste humano es solo el cuerpo de la decisión.

## Decisiones habilitadas

- Plantilla T01 verificada contra una instancia real completa.
- Pruebas patrón de idempotencia y concurrencia reutilizables.

## Decisiones bloqueadas

- Prohibido aceptar tenant o actor en el cuerpo del comando.
- Prohibido comando de escritura sin `clave_idempotencia`.
- Prohibido decidir transiciones fuera del agregado.

## Reusable Pattern

Los DGP futuros copian: la tabla de definición §1 como formulario de todo comando, el recorrido §2 como secuencia inmutable, y las cuatro demostraciones §3 como pruebas obligatorias de todo comando (idempotencia, concurrencia, tres denegaciones, transición ilegal).

## Anti-Patterns

- Comandos "múltiples" que hacen varias cosas según banderas de entrada.
- Lógica de negocio en el borde o en la validación de entrada.
- Respuestas que inventan formato en lugar de usar el contrato ETS-008.
