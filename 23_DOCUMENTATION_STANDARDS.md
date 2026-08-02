# 23_DOCUMENTATION_STANDARDS.md

> **DeltaOps — ESI-002 · v1.0** · Estándares de documentación: Documentation as Code, en español, con dueño.
> Sin código.

---

## 1. Los tipos de documento y su hogar

| Tipo | Hogar | Regla de vida |
|---|---|---|
| **Documentos normativos** (ETS, ESI, Charter) | raíz del repositorio de diseño | congelados; cambian solo por supersesión explícita del programa |
| **ADRs** | `docs/adr/` (03) | inmutables una vez aceptados; serie única (ESI-001/11 §0) |
| **Guías de ingeniería** (onboarding, entorno, depuración) | `docs/guides/` | vivas; con dueño; desactualizada = defecto |
| **Documentación de pieza** | junto al código: el docstring/encabezado que la plantilla (18) exige | cambia con la pieza, en el mismo PR (Charter §9) |
| **Documentación de contrato** | GENERADA del OpenAPI y los catálogos (ETS-008) | jamás se escribe a mano; el generado es la verdad |
| **Expedientes** (excepciones, N/N-1, incidentes de secretos) | zona de expedientes en `docs/` | con vencimiento o cierre explícito; el expediente eterno es una decisión evitada |

## 2. Reglas de escritura

1. **En español**, con el lenguaje ubicuo de ETS-003; los términos técnicos consagrados (commit, pipeline, tag) no se traducen forzadamente.
2. **Markdown simple**: encabezados, tablas, listas y diagramas ASCII; sin herramientas de documentación que requieran build salvo lo generado de contratos.
3. **Todo documento declara**: título, versión/fecha, propósito en una línea y dueño (para los vivos); el lector sabe en 10 segundos si le sirve.
4. **Corto y normativo antes que largo y narrativo**: reglas numeradas citables (como toda esta serie); la prosa explica el porqué, las reglas dicen el qué.
5. **Citar, no repetir**: un documento referencia la fuente normativa (documento/sección) en vez de copiarla — la copia diverge; la cita envejece bien.
6. **Los documentos pasan por PR** como el código (04 §3.1), con revisión proporcional: las guías con revisión ligera, lo normativo con el gobierno de 27.

## 3. Qué NO se documenta (tan importante como qué sí)

- **Lo derivable del código con claridad**: la documentación que parafrasea código miente en cuanto el código cambia; la plantilla exige documentar intención y decisiones, no repetir la sintaxis.
- **Procedimientos que deberían ser comandos** (16 §4): el documento con 12 pasos copiables es un defecto de catálogo de comandos.
- **Conocimiento tribal en chats/wikis externas**: la verdad vive en el repo (01 §2.4); lo que importa migra al repo, lo demás es conversación.

## 4. Mantenimiento

1. **Toda guía tiene dueño** (27); la revisión trimestral marca vigente/actualizar/retirar — el documento retirado se archiva, no se deja mintiendo.
2. **El onboarding es el detector**: cada pregunta sin respuesta escrita genera la escritura (06 §3.4).
3. **Los DGP citarán documentos por sección**: la estabilidad de anclas (números de sección) importa — reorganizar un documento normativo es cambio mayor.

---

## Impacto sobre la implementación
La zona `docs/` nace con el esqueleto ya poblada (ADRs de ESI-001, guías de 06/28); las plantillas T12/T15 (18) dan formato único a ADRs y documentos; ningún conocimiento operativo queda fuera del repo.

## Dependencias
03 (zonas físicas) · 18 (plantillas de documentos) · 04 (PRs) · 27 (dueños y revisión) · Charter §7 (Documentation as Code).

## Riesgos
- Documentación viva pudriéndose → dueño + revisión trimestral + el detector del onboarding; lo no mantenible se retira antes que mienta.
- Sobre-documentación ritual → §3: la lista de lo que NO se documenta se aplica en revisión con el mismo rigor.

## Decisiones habilitadas
Estructura inicial de `docs/`, formato de expedientes, política de anclas estables para DGP.

## Decisiones bloqueadas
Herramientas de publicación/portal de documentación — innecesarias por ahora; ADR si algún día un público externo las exige.
