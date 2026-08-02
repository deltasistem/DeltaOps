# 27_EVOLUTION_GUIDELINES.md

> **DeltaOps — ETS-012 · v1.0** · Estrategia de Evolución en implementación: cómo se escribe el cambio que sí cambia comportamiento.
> Complementa ETS-011/28 (gobierno) con la mecánica del implementador. Sin código.

---

## 1. El camino por tipo de cambio (mecánica del constructor)

| Cambio | Mecánica de implementación |
|---|---|
| Operación nueva | catálogo ETS-008 primero → regenerar frontera → metadatos → caso de uso → dominio → matrices |
| Campo nuevo en contrato | opcional-con-semántica-de-ausencia en la versión vigente, u operación/versión nueva; jamás obligatorio retroactivo (N/N-1) |
| Evento cambia de forma | versión nueva del evento + traducción al leer (upcasting) registrada donde se consume; lo histórico intacto |
| Read model cambia | consumidor versión nueva + cursor nuevo desde cero → reconstruir → conmutar lectores → retirar el viejo (sin ventana de mantenimiento) |
| Regla de negocio cambia | motor/agregado con vigencia: los hechos pasados se juzgaron con la regla y configuración de su momento (17); el cambio aplica hacia adelante |
| Clave de configuración cambia | definición nueva versionada + migración de valores por tenant gobernada (ETS-005); la clave vieja convive hasta retiro |
| Capacidad/permiso nuevo | registro en el modelo de capacidades + matriz de autorización actualizada ANTES del primer uso |
| Esquema físico cambia | expandir-migrar-contraer (ETS-010/21): nunca un despliegue que exige parar el mundo |

## 2. Reglas de evolución para el implementador

1. **Compatibilidad N/N-1 como reflejo** (ETS-008/17): todo cambio de frontera se pregunta "¿el cliente de ayer sigue funcionando hoy?" antes de escribirse; la respuesta negativa exige versión nueva y convivencia, no valentía.
2. **Expandir → migrar → contraer, en tres despliegues como mínimo**: agregar lo nuevo (compatible), mover consumo/datos, retirar lo viejo — cada fase desplegable y reversible por sí sola. La contracción sin telemetría de uso en cero es prohibida (ETS-011/28 §deprecación).
3. **Lo retro-activo no existe**: ni re-escribir eventos, ni re-calcular cierres pasados con reglas nuevas, ni "corregir" auditoría. El pasado se corrige con hechos nuevos compensatorios (comandos normales, auditados) — como en contabilidad.
4. **Deprecación con expediente**: qué se deprecia, desde cuándo, métrica de uso, fecha objetivo de retiro, dueño — visible en el archivo de deprecaciones (ETS-011/28); el código deprecado se marca de forma que el uso nuevo sea incómodo y detectable.
5. **La migración de datos es un proceso de plataforma con estado**: idempotente, reanudable, medible, ensayada contra copia realista antes de producción (ETS-010/21) — jamás un script suelto ejecutado a mano.
6. **Toda evolución actualiza sus matrices el mismo día**: operación nueva sin entrada en la matriz de autorización, o clave nueva sin matriz de configuración, no pasa CI — las transversales (25 §regla 4) son el candado.

## 3. La frontera con el refactor (26)

Si cambia algo observable (contrato, evento, Resultado, semántica de configuración) → es evolución, con este documento. Si no cambia nada observable → es refactor, con el anterior. El PR declara cuál es, y el revisor lo verifica — la ambigüedad se resuelve como evolución (el camino más gobernado).

---

## Impacto sobre la implementación
El cambio de comportamiento tiene una mecánica repetible por tipo; el implementador nunca inventa la estrategia de migración — la ejecuta.

## ETS relacionados
ETS-011 (28 gobierno) · ETS-008 (17 N/N-1) · ETS-009 (18-19) · ETS-010 (21) · ETS-005 (migración de claves) · ETS-012 (26).

## Riesgos
- Presión por saltarse la convivencia "porque nadie usa lo viejo" → la telemetría decide (uso en cero), no la intuición.
- Compensaciones retroactivas disfrazadas de "fix de datos" → regla 3: hechos nuevos, jamás historia editada.

## Decisiones habilitadas
Despliegues sin ventana, clientes N-1 vivos, migraciones ensayables, retiro basado en evidencia.

## Decisiones bloqueadas
Herramientas de migración concretas — con el stack; la mecánica expandir-migrar-contraer las sobrevive.
