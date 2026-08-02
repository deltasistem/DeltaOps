# 24_ENGINEERING_CONVENTIONS.md

> **DeltaOps — ESI-002 · v1.0** · Convenciones de ingeniería: los nombres y formas transversales que nadie decide dos veces.
> Consolida y remite; no re-norma lo ya normado. Sin código.

---

## 1. Mapa de convenciones (dónde está normado qué)

| Convención | Fuente |
|---|---|
| Lenguaje ubicuo en español | ETS-003 (dominio), 03 (carpetas), 12 (datos), 16 (comandos) |
| Nombres de BD | ETS-010/07 (convenciones de base de datos) |
| Contratos API (rutas, sobres, errores) | ETS-008 |
| Estructura de capas y qué importa a qué | ETS-011/23, ETS-012/23 |
| Commits, ramas, PRs | 04 |
| Variables de entorno | 07 §2.3 |
| Versiones | 21 |
| Documentos | 23 |

## 2. Convenciones de código transversales (las que faltaban)

1. **Nombres**: el identificador de una pieza es su nombre de catálogo en español (`crear_orden_trabajo`); el estilo por lenguaje lo fija el formateador oficial — la discusión de estilo terminó en ESI-001/06.
2. **El nombre dice el tipo**: casos de uso en verbo-infinitivo + sustantivo; consultas como pregunta-de-listado (`listar_`, `obtener_`, `buscar_`); eventos en pasado (`orden_trabajo_creada`); Policies como regla nombrada. La forma exacta por tipo la fija su plantilla (18).
3. **Sin abreviaturas inventadas**: `orden_trabajo`, no `ot`; las siglas consagradas del dominio (definidas en el glosario ETS-003) son la única excepción.
4. **Booleanos afirmativos** (`esta_activa`, no `no_deshabilitada`), fechas con el par `fecha_negocio`/`fecha_registro` donde el Kernel lo norma (ETS-011), ids siempre UUIDv7 tipados.
5. **Errores por catálogo**: todo error de negocio usa código del catálogo (ETS-008/07); inventar mensajes sueltos está prohibido (ETS-012/15).
6. **Comentarios explican porqués**: el comentario que narra el qué se borra; la decisión no obvia se comenta o se lleva a ADR; los TODO con dueño y expediente (14 §3.4).
7. **Simetría entre planos**: el frontend nombra funcionalidades y archivos con el mismo lenguaje ubicuo que el backend — la orden de trabajo se llama igual en la pantalla, el contrato, el módulo y la tabla.

## 3. Convenciones de interacción (el pegamento diario)

1. **Todo artefacto nuevo nace de su plantilla** (18) por su generador (19); la convención más fuerte es la que no hay que recordar.
2. **La duda de convención se resuelve una vez**: quien encuentra un caso no cubierto lo lleva a gobierno (27); la respuesta se escribe en la fuente que corresponda del mapa §1 — jamás queda en el chat.
3. **La convención vieja se migra o se convive explícitamente**: si una convención cambia, el PR de cambio declara el destino de lo existente (migración mecánica, convivencia acotada con expediente) — el repo nunca tiene dos formas sin explicación escrita.

---

## Impacto sobre la implementación
Con este mapa, ninguna pieza del Sprint 1 en adelante inventa nombres ni formas: todo identificador es derivable de los catálogos y estas reglas; la revisión rechaza lo no derivable.

## Dependencias
Todo el mapa del §1 · 18/19 (plantillas y generadores que las encarnan) · 27 (resolución de casos nuevos).

## Riesgos
- Convenciones dispersas que nadie encuentra → este mapa es el índice único; toda convención nueva se registra aquí además de en su fuente.
- Excepciones acumulándose sin migrar → regla 3 del §3: la convivencia sin expediente falla revisión.

## Decisiones habilitadas
Verificaciones mecánicas de nomenclatura (lint propio, Semgrep DeltaOps — ESI-001/08 §regla 2), glosario vivo enlazado al de ETS-003.

## Decisiones bloqueadas
Convenciones de tipos de pieza aún sin plantilla — nacen con su plantilla (18 §4.4).
