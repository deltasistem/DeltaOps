# 01 — El Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · Un módulo deliberadamente neutro cuyo único negocio es demostrar la arquitectura completa.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

El Módulo de Referencia (`referencia`) es el patrón oficial de construcción de módulos de DeltaOps. No pertenece al negocio: no toca Activos, Inventario, Combustible, Compras, OT ni SST. Su dominio es inventado y mínimo, elegido para ejercitar **todas** las piezas de la arquitectura congelada (ETS-003/011, ESI-003) sin arrastrar complejidad de dominio real.

Es simultáneamente:

1. **Demostración viva**: prueba que el Backend Foundation está completo (ESI-003/27, bloque F).
2. **Patrón normativo**: todo módulo futuro se construye "como referencia", pieza por pieza.
3. **Fuente de plantillas**: las plantillas T01-T11 (ESI-002/18) y los generadores (ESI-002/19) se extraen de él y se mantienen sincronizados con él.
4. **Aula**: el onboarding (ESI-002/06) lo usa como primer contacto con el sistema.

## 2. El dominio neutro oficial

El dominio del módulo es la **gestión de Elementos de Referencia**: un agregado deliberadamente simple con identidad, código natural, nombre, y una máquina de estados mínima pero completa:

```
BORRADOR → ACTIVO → ARCHIVADO
```

Con exactamente la complejidad suficiente para demostrar: invariantes (no activar sin nombre válido), transición ilegal (no archivar un borrador), Policy parametrizable por tenant (límite de elementos activos), evento de dominio (elemento activado), y lectura paginada. Nada más. **Por qué:** cada concepto extra diluiría el patrón; cada concepto menos dejaría una pieza de la arquitectura sin demostrar.

## 3. Alcance funcional cerrado

| Pieza | Instancia en el módulo |
|---|---|
| Capacidad | `capacidad_de_referencia` (doc 04) |
| Comando | Activar Elemento de Referencia (doc 05) |
| Consulta | Listar Elementos de Referencia (doc 06) |
| Policy | Límite de elementos activos por tenant (doc 09) |
| Evento | Elemento de Referencia Activado (doc 14) |
| Consumidor | Actualiza el modelo de lectura de resumen (doc 15) |

El alcance es **cerrado por diseño**: añadirle funciones "útiles" está prohibido; su utilidad es ser patrón.

## Impacto sobre la implementación

Será el primer módulo construido tras el readiness del Foundation (ESI-003/27) y el objeto del DGP de módulo de referencia (ESI-002/20). Su construcción valida plantillas, generadores y plataforma a la vez.

## Dependencias

ESI-003 completa (plataforma congelada); ESI-002/18-20 (plantillas, generadores, DGP); ETS-003/011 (patrones de dominio y aplicación).

## Riesgos

- Que el módulo crezca hasta parecer negocio; mitigación: alcance cerrado por regla y revisión de arquitectura para cualquier cambio (doc 28).
- Que dominio neutro se lea como "juguete" y se le perdone rigor; mitigación: se le exige exactamente la misma puerta y checklist que a un módulo real — esa es su razón de ser.

## Decisiones habilitadas

- Escribir los documentos 02-28 de esta serie sobre un dominio concreto y estable.
- Derivar plantillas y generadores de un ejemplar único y canónico.

## Decisiones bloqueadas

- Prohibido usar conceptos de negocio real en el módulo.
- Prohibido ampliar el alcance funcional fuera del proceso del doc 28.
- Prohibido desplegar el módulo en PROD como funcionalidad visible para tenants reales.

## Reusable Pattern

Los futuros DGP reutilizan: la definición de "módulo completo" (tabla de piezas §3), el criterio de alcance mínimo suficiente, y el principio "el módulo nuevo se construye como referencia, sustituyendo el dominio neutro por el dominio real".

## Anti-Patterns

- Construir el primer módulo real "a mano" sin pasar por el patrón de referencia.
- Tratar el módulo de referencia con menos rigor que uno real.
- Usarlo como vertedero de experimentos de plataforma: los experimentos tienen su propio espacio (ESI-002/28).
