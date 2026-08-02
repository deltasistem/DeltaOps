# 02 — Anatomía Completa del Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · Cada carpeta, cada pieza, cada frontera del módulo `referencia`.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Ubicación

El módulo vive en `apps/backend/modulos/referencia/`, conforme a la estructura congelada (ESI-002/03, ESI-003/25). Su interior es la anatomía normativa de **todo** módulo:

| Carpeta | Contenido | Documentos |
|---|---|---|
| `dominio/` | Agregado Elemento de Referencia, sus estados, invariantes, eventos de dominio, la Policy y el servicio de dominio | 09, 11, 14 |
| `aplicacion/` | Comando y su caso de uso, consulta y su lector, consumidor del evento, validaciones de entrada | 05, 06, 08, 10, 15 |
| `adaptadores/` | Repositorio concreto (mapeo ETS-010), lector de consulta, proyección del modelo de lectura | 12, 15 |
| `borde/` | Rutas HTTP del módulo, traducción contrato ETS-008 ↔ comandos/consultas | 05-07 |
| `declaracion/` | La declaración de registro del módulo (ESI-003/06): identidad, capacidad, piezas, permisos, suscripciones, migraciones, seed | 03, 04 |
| (espejo) `pruebas/modulos/referencia/` | Unitarias de dominio, de aplicación con fakes, de adaptadores con BD efímera, E2E del flujo completo | 19 |

## 2. Reglas de frontera (las de siempre, demostradas)

1. `dominio/` no importa de nadie: solo Kernel. Puro, sin IO, sin ORM, sin HTTP.
2. `aplicacion/` importa dominio y puertos del Kernel; jamás adaptadores ni FastAPI.
3. `adaptadores/` implementa puertos; conoce SQLAlchemy y el esquema físico; nadie más lo conoce.
4. `borde/` conoce FastAPI y los contratos ETS-008; delega en aplicación en una línea conceptual; cero lógica.
5. `declaracion/` es deducible de la estructura y viceversa (ESI-003/25 §4).

## 3. Contenido mínimo obligatorio

La anatomía demuestra que un módulo completo tiene exactamente: 1 agregado, 1 comando, 1 consulta, 1 Policy, 1 servicio de dominio, 1 evento publicado, 1 consumidor, 1 modelo de lectura, 1 capítulo de migraciones, 1 capítulo de seed (2 tenants, ESI-002/12), pruebas en los cuatro niveles y su documentación (doc 20). Ni una pieza opcional: si un módulo real no necesita alguna, la omite conscientemente y lo anota en su DGP; el patrón completo existe aquí.

## Impacto sobre la implementación

El generador de módulo (T09) produce esta anatomía exacta; el DGP del módulo de referencia la construye pieza a pieza siguiendo los documentos 03-19.

## Dependencias

ESI-002/03 y /12; ESI-003/06 y /25; ETS-010 (mapeo físico), ETS-011 (planos).

## Riesgos

- Anatomías divergentes entre módulos futuros; mitigación: generador + verificación de simetría en la puerta.
- Carpetas vacías "por si acaso" en módulos reales; mitigación: la omisión consciente se declara, no se deja el hueco.

## Decisiones habilitadas

- Plantilla T09 con la anatomía completa y sus pruebas espejo.
- Verificación mecánica de fronteras entre capas del módulo.

## Decisiones bloqueadas

- Prohibidas carpetas fuera de esta anatomía en módulos.
- Prohibido que `dominio/` importe algo distinto del Kernel.
- Prohibida lógica en `borde/`.

## Reusable Pattern

Los DGP futuros copian: la tabla de anatomía §1 (sustituyendo `referencia` por el módulo real), las reglas de frontera §2 tal cual, y la lista de contenido mínimo §3 como checklist de completitud.

## Anti-Patterns

- Carpetas `utils/`, `helpers/`, `servicios/` genéricas dentro del módulo.
- Piezas colocadas "donde caben" en lugar de donde la anatomía manda.
- Módulos que comparten carpetas o importan de otros módulos.
