# 25_DEVELOPMENT_CHECKLIST.md

> **DeltaOps — ESI-002 · v1.0** · Checklist oficial de desarrollo: lo que toda pieza cumple antes de mergearse.
> Operacionaliza el checklist de ETS-012/28 y la Definition of Done del Charter §9 en la plataforma. Sin código.

---

## 1. Uso del checklist

- Lo aplica el **autor** como autorrevisión (14 §3.1) antes de abrir el PR, y el **revisor** como criterio de aprobación.
- La plantilla de PR (T13, 18) lo incluye; los puntos con verificación mecánica los responde la puerta — el humano verifica solo lo que la máquina no puede.
- Aplica igual a humanos y agentes IA (17); el aprobador responde por el conjunto.

## 2. El checklist (por bloques)

### A. Forma (verificación mecánica — la puerta lo dice)
- [ ] Formato, lint, tipos y reglas de imports en verde (14).
- [ ] Contratos regenerados sin diff manual (03 §regla 5).
- [ ] Sin secretos, sin dependencias nuevas no justificadas (08/13).
- [ ] Commits convencionales; rama y PR con nomenclatura (04).

### B. Pieza (el humano verifica)
- [ ] La pieza nació de su plantilla/generador y respeta su forma (18/19); toda desviación está decidida, no improvisada (18 §4.3).
- [ ] Nombres del lenguaje ubicuo, derivables de los catálogos (24).
- [ ] La pieza hace UNA cosa y está en su capa correcta (Regla de Dependencia); nada de lógica en adaptadores.
- [ ] Errores por catálogo; sin capturas silenciosas (ETS-012/15).
- [ ] Idempotencia y tenancy respetadas donde aplican (`clave_idempotencia`, sin fugas entre murallas).

### C. Pruebas (Definition of Done)
- [ ] Prueba espejo presente y significativa: tabla de casos con los incómodos (rechazos, bordes, concurrencia si aplica) — no solo el camino feliz.
- [ ] Las matrices transversales cubren la pieza si toca autorización/config/tenant/consumidores (ETS-012/25).
- [ ] La suite completa local en verde (`verificar` + `pruebas`, 16) antes de abrir el PR.

### D. Alrededores (lo que la pieza arrastra)
- [ ] Migración con expandir-migrar-contraer si toca esquema (T08).
- [ ] Capítulo de seed actualizado si introduce entidades/estados nuevos (12 §2.6).
- [ ] Documentación de la pieza (docstring de plantilla) y guía/ADR si tomó decisiones no obvias (23).
- [ ] Observabilidad: la pieza emite lo que su plantilla exige (operación, códigos, sin PII — ESI-001/09 §regla 2).

### E. PR
- [ ] Descripción con plantilla T13: qué, por qué, decisiones, DGP citado (20 §4.4 cuando existan).
- [ ] Tamaño autorrevisable en 15 minutos (14 §3.3); si no, dividir.
- [ ] Marcado `asistido_ia` si corresponde (17).

## 3. Reglas

1. **El checklist no se negocia por prisa**: el punto que "se hará después" convierte el PR en incompleto — se termina o no se abre (Charter §9).
2. **El checklist evoluciona por gobierno** (27): puntos nuevos entran cuando una clase de defecto recurrente lo justifica; puntos muertos se retiran — el checklist largo e ignorado protege menos que el corto y vivido.
3. **Lo mecanizable se mecaniza**: todo punto del bloque B-D que se vuelva verificable por herramienta migra al bloque A (Charter §3.9) — el objetivo es que el humano piense, no que marque casillas.

---

## Impacto sobre la implementación
Este checklist es el criterio operativo de "terminado" para toda pieza del Sprint 1 en adelante; la plantilla de PR lo incluye y la puerta automatiza el bloque A.

## Dependencias
ETS-012/28 (checklist fuente) · Charter §9 (DoD) · 14 (autorrevisión) · 18 (T13) · 16 (comandos de verificación) · 27 (evolución).

## Riesgos
- Checklist tratado como ritual de casillas → regla 3: mecanizar lo mecánico deja al humano solo lo que exige juicio.
- Divergencia entre este checklist y ETS-012/28 → este documento operacionaliza aquel; ante conflicto gana ETS-012 y el conflicto se corrige aquí (01 §4).

## Decisiones habilitadas
Plantilla de PR definitiva, criterios de revisión uniformes, métricas de defectos por bloque (27).

## Decisiones bloqueadas
Puntos específicos de tipos de pieza aún sin plantilla — nacen con ellas (18).
