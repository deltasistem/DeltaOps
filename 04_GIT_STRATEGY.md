# 04_GIT_STRATEGY.md

> **DeltaOps — ESI-002 · v1.0** · Convenciones Git, estrategia de ramas y versionado del trabajo diario.
> Desarrolla operativamente lo decidido en ESI-001/10. Sin código, sin configuración.

---

## 1. Modelo de ramas: tronco protegido

- **`main` es el tronco**: siempre desplegable, protegido — nadie escribe directo, ni humanos ni IA ni administradores.
- **Ramas cortas por pieza**: una rama = una pieza o un grupo mínimo coherente (Charter §12); vida objetivo ≤ 3 días — la rama vieja se rebasa o se descarta.
- **Sin ramas permanentes adicionales**: no existen `develop`, `release/x`, ramas de entorno. Los entornos se alimentan de `main` y de tags (09).
- **Nomenclatura de ramas**: `tipo/ambito-descripcion-corta` en minúsculas (`feat/ordenes-crear-orden-trabajo`, `fix/config-cache-invalidacion`); el tipo coincide con los tipos de commit (§2).

## 2. Convención de commits: Conventional Commits (ESI-001/10)

- Formato: `tipo(ámbito): descripción` en español, imperativo, ≤ 72 caracteres.
- Tipos oficiales: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`. El ámbito es el módulo o zona (`ordenes`, `plataforma`, `frontend`, `infra`).
- **Ruptura de contrato**: marcador de ruptura obligatorio + referencia al expediente de versionado N/N-1 (ETS-008/17); un commit de ruptura sin expediente falla revisión.
- El mensaje verificado mecánicamente en la puerta (formato) y humanamente en revisión (honestidad: el commit dice lo que hace).

## 3. Pull Requests

1. **Todo cambio entra por PR**, incluida documentación, plantillas y el propio pipeline (ESI-001/10 §regla 1).
2. **PR chico**: una pieza o grupo mínimo; el PR que mezcla refactor con feature se divide (ETS-012/26 §regla 2).
3. **La descripción del PR usa la plantilla oficial** (18): qué pieza, qué contrato toca, qué decisiones tomó, checklist de ETS-012/28.
4. **Revisión obligatoria**: al menos un aprobador humano distinto del autor; el trabajo de IA requiere revisor humano SIEMPRE (17).
5. **Merge por squash**: un PR = un commit en `main` con mensaje convencional — historia lineal, legible, revertible pieza a pieza.
6. Rojo bloquea: ningún merge con puerta fallida, sin excepciones (Charter §10).

## 4. Tags y versiones

- **Tag SemVer inmutable por release** (`vMAYOR.MENOR.PARCHE`); el tag dispara el build único promocionable (ESI-001/10).
- El incremento se deriva de los commits desde el último tag: ruptura → mayor; feat → menor; fix/otros → parche. Detalle en 21.
- Prohibido mover o borrar tags publicados; el error se corrige con un release nuevo.

## 5. Reglas de higiene

1. **Nada generado se commitea a mano**: los artefactos generados (contratos, tipos) los escribe la generación en CI o el generador local — el diff manual falla (ESI-001/03).
2. **Nada grande ni binario en Git**: los binarios van al object storage; el repositorio guarda texto.
3. **`main` se actualiza por rebase local antes de abrir PR**: los PRs llegan sin conflictos; el conflicto se resuelve en la rama, nunca en `main`.
4. **Revert primero**: ante un defecto grave post-merge, se revierte el commit y se re-trabaja con calma — `main` desplegable vale más que el orgullo del autor.

---

## Impacto sobre la implementación
Define el ritmo diario de trabajo: rama corta → PR chico con plantilla → puerta → squash a `main` → tag cuando se libera; la historia de `main` queda siendo el registro de piezas del producto.

## Dependencias
ESI-001/10 (plataforma CI, SemVer, releases) · ETS-012/26/28 (refactoring y puerta) · 21 (versionado) · 22 (releases) · 17 (reglas para IA).

## Riesgos
- Ramas que envejecen → límite de 3 días con aviso automático; la rama vieja se descarta sin culpa.
- Squash ocultando pasos intermedios valiosos → el PR conserva su historia propia; lo que merece registro permanente va al mensaje final o a un ADR.

## Decisiones habilitadas
Protecciones del repositorio, plantilla de PR, verificación de mensajes, automatización de releases por tag (22).

## Decisiones bloqueadas
Configuración concreta de protecciones y hooks — DGP; aprobadores nominales — decisión organizacional (ESI-001/10).
