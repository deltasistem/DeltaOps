# 18_ENGINEERING_TEMPLATES.md

> **DeltaOps — ESI-002 · v1.0** · Catálogo de plantillas de ingeniería: la forma única de cada tipo de pieza.
> Sin código — el catálogo y su gobierno; el contenido ejecutable llega con el esqueleto.

---

## 1. Qué es una plantilla en DeltaOps

Una plantilla es **la forma oficial y única de un tipo de pieza**: su estructura, sus secciones obligatorias, sus pruebas mínimas y los documentos que la norman. ETS-012 definió las plantillas conceptuales; ESI-001 fijó el stack; este catálogo las convierte en artefactos del repo (zona `platform/templates`, 03) que los generadores (19) instancian.

## 2. Catálogo oficial de plantillas (v1)

| # | Plantilla | Fuente normativa |
|---|---|---|
| T01 | Caso de uso (comando) + prueba | ETS-012/02, /12 |
| T02 | Consulta + prueba | ETS-012/03 |
| T03 | Agregado / VO / evento de dominio + pruebas | ETS-012/04-06, ETS-011 |
| T04 | Policy + prueba | ETS-012/06 |
| T05 | Puerto + fake + suite de contrato | ETS-012/08 |
| T06 | Adaptador (persistencia / integración) + prueba de integración | ETS-012/07-08 |
| T07 | Consumidor de eventos + prueba (idempotencia incluida) | ETS-012/14 |
| T08 | Migración de esquema (expandir-migrar-contraer) | ETS-010/21 |
| T09 | Módulo completo (esqueleto de carpetas + registro) | ETS-011/23, 03 |
| T10 | Pantalla / funcionalidad frontend + prueba | ETS-004, ESI-001/03 |
| T11 | Escenario E2E | ESI-001/07 |
| T12 | ADR | ESI-001/11 §0 |
| T13 | Descripción de PR | 04 §3.3, ETS-012/28 |
| T14 | Capítulo de seed de módulo | 12 §2.6 |
| T15 | Documento de ingeniería (guías, expedientes) | 23 |

## 3. Anatomía obligatoria de toda plantilla

1. **Encabezado normativo**: qué pieza produce, qué documentos la norman (citas exactas), qué reglas de oro aplican.
2. **Estructura completa**: todas las secciones/archivos que la pieza tendrá, con marcadores de lo variable; nada opcional implícito.
3. **Pruebas incluidas**: la plantilla de la pieza contiene la plantilla de su prueba — no existen plantillas de piezas sin prueba.
4. **Lista de verificación propia**: qué debe cumplir la instancia antes del PR (subconjunto del checklist 25 específico del tipo).
5. **Ejemplo de referencia**: cada plantilla enlaza a UNA instancia ejemplar real en el código (el módulo de referencia, 06) — la plantilla dice la forma, el ejemplo la muestra viva.

## 4. Gobierno de plantillas (refuerzo de ETS-012)

1. **Cambiar una plantilla es cambiar el estándar**: PR con dueño de plataforma como revisor obligatorio; el cambio anota si las instancias existentes deben migrar (y con qué prioridad) o si conviven versiones de forma temporalmente.
2. **La plantilla y su generador cambian juntos** (ESI-001/06 §riesgos): el PR que toca T-algo actualiza su generador y su ejemplo de referencia.
3. **Deriva detectada = decisión forzada**: si una pieza real necesita apartarse de la plantilla, o la pieza está mal o la plantilla quedó corta — se decide explícitamente (mejorar plantilla vía PR, o corregir la pieza); la excepción silenciosa está prohibida.
4. **El catálogo es cerrado**: tipos de pieza nuevos exigen entrada nueva aquí con fuente normativa — la pieza sin plantilla no tiene forma oficial y no debería existir aún.

---

## Impacto sobre la implementación
El esqueleto entrega T01-T15 ejecutables con sus ejemplos; los DGP dirigirán la construcción pieza a pieza citando plantillas por código (T01…), dando a humanos e IA (17) el mismo molde exacto.

## Dependencias
ETS-012 (plantillas conceptuales) · 19 (generadores que instancian) · 03 (zona física) · 25 (checklist) · 06 (módulo de referencia).

## Riesgos
- Plantillas divergiendo de las piezas reales con el tiempo → regla 3 del §4 + el ejemplo de referencia vivo (compila y pasa pruebas, no puede mentir).
- Catálogo proliferando en subtipos → parametrizar la plantilla existente antes que crear una nueva; el catálogo cerrado obliga la discusión.

## Decisiones habilitadas
Generadores (19), contexto oficial para agentes (17), estructura de los DGP (20) por referencia a T-códigos.

## Decisiones bloqueadas
Contenido ejecutable de cada plantilla — esqueleto (DGP); plantillas de tipos aún inexistentes — cuando su fuente normativa exista.
