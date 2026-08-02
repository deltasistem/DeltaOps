# 01_ENGINEERING_PLATFORM.md

> **DeltaOps — ESI-002 · v1.0** · La Plataforma Oficial de Ingeniería: un solo entorno, unas solas reglas, para humanos e IA.
> Documento de diseño. Sin código, sin configuración, sin estructuras físicas. Subordinado a ETS-001…012, ENGINEERING_CHARTER y ESI-001.

---

## 1. Qué es la Plataforma de Ingeniería

La Plataforma de Ingeniería es el **entorno normativo completo** en el que se construirá DeltaOps: el monorepo, sus convenciones, los entornos, los datos de desarrollo, las herramientas, las plantillas y los generadores. Su propósito es que **cualquier desarrollador — humano o IA — produzca piezas indistinguibles entre sí**, porque el entorno solo permite trabajar de una manera: la oficial.

La plataforma no decide arquitectura (congelada en ETS) ni tecnología (seleccionada en ESI-001): decide **cómo se trabaja** con ambas.

## 2. Principios rectores

1. **Un solo camino**: para cada actividad (crear una pieza, correr pruebas, levantar el entorno, sembrar datos) existe exactamente un comando oficial; el segundo camino es deriva.
2. **El entorno es reproducible o no existe**: cualquier máquina debe llegar del clon al sistema corriendo con la secuencia de bootstrap (05), sin pasos tribales.
3. **Humanos e IA bajo las mismas reglas**: la IA no tiene atajos ni excepciones; las puertas (CI, plantillas, generadores) son idénticas para todo autor (17).
4. **La verdad vive en el repositorio**: convenciones, plantillas, generadores, guías y ADRs se versionan junto al código (Documentation as Code, Charter §7).
5. **Automatizar la regla, no vigilar a la persona**: toda convención que pueda verificarse mecánicamente, se verifica (Charter §3.9); las convenciones no verificables se minimizan.
6. **Fricción mínima, deriva cero**: la plataforma debe ser más cómoda que su evasión — el generador debe ser más rápido que copiar a mano.

## 3. Mapa de la serie ESI-002

| Bloque | Documentos |
|---|---|
| Estructura | 02 monorepo · 03 repositorio · 04 Git |
| Arranque | 05 bootstrap · 06 onboarding |
| Configuración | 07 variables · 08 secretos · 09 entornos |
| Ejecución local | 10 Docker · 11 desarrollo local · 12 datos |
| Disciplina diaria | 13 dependencias · 14 calidad · 15 IDE · 16 herramientas |
| Fabricación | 17 IA · 18 plantillas · 19 generadores · 20 DGP |
| Entrega | 21 versionado · 22 releases · 23 documentación |
| Gobierno | 24 convenciones · 25 checklist · 26 Sprint 1 · 27 gobierno · 28 evolución |

## 4. Jerarquía normativa

```
ENGINEERING_CHARTER  (constitución)
   ↓
ETS-001…012          (arquitectura y patrones, congelados)
   ↓
ESI-001              (stack oficial, congelado)
   ↓
ESI-002 (esta serie) (plataforma de trabajo)
   ↓
DGP futuros          (instrucciones de construcción pieza a pieza)
```

Conflicto entre niveles: gana el nivel superior, y el conflicto se reporta como defecto de documentación — nunca se resuelve en silencio (Charter §5).

## 5. Definición de "plataforma lista"

La plataforma está lista para el Sprint 1 cuando el checklist de 26 esté íntegramente en verde: monorepo estructurado, bootstrap reproducible, entornos definidos, datos de desarrollo sembrables, puerta de calidad activa, plantillas y generadores operativos, y la guía (28→06) publicada.

---

## Impacto sobre la implementación
Todo trabajo del Sprint 1 en adelante ocurre dentro de esta plataforma; ninguna pieza se crea, prueba ni entrega por fuera de los caminos que esta serie define.

## Dependencias
ENGINEERING_CHARTER (principios y proceso) · ETS-011/012 (estructura y patrones que la plataforma hospeda) · ESI-001 (stack que la plataforma instrumenta).

## Riesgos
- Plataforma diseñada pero no automatizada → el checklist de 26 exige que cada regla tenga su verificación mecánica antes del Sprint 1.
- Doble camino tolerado "por esta vez" → gobierno de 27: el camino paralelo se cierra o se oficializa, jamás convive.

## Decisiones habilitadas
Los 27 documentos restantes de esta serie; el esqueleto físico del proyecto (cuando un DGP lo ordene) implementará exactamente este diseño.

## Decisiones bloqueadas
Creación física de estructuras, archivos de configuración y scripts — corresponden a la fase de implementación bajo los DGP.
