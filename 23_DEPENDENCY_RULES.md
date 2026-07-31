# 23_DEPENDENCY_RULES.md

> **DeltaOps — ETS-011 · v1.0** · Reglas de dependencia: el grafo permitido, completo y verificable.
> Documento de diseño. Sin código, sin clases.

---

## 1. Entre capas (dentro de un módulo)

```text
ADAPTADORES → APLICACIÓN → DOMINIO → KERNEL
(cada flecha es "puede conocer"; jamás al revés; sin saltos inversos)
```

| Regla | Enunciado |
|---|---|
| R1 | El Kernel no depende de nada (02 §3.2) |
| R2 | El Dominio depende solo del Kernel: sin puertos de infraestructura, sin aplicación, sin HTTP/SQL/SDKs |
| R3 | La Aplicación depende de Dominio y Kernel; define los puertos (06) pero no conoce implementaciones |
| R4 | Los Adaptadores dependen de la Aplicación (sus puertos y casos de uso); nada depende de un adaptador |
| R5 | Ninguna capa importa librerías de infraestructura salvo Adaptadores; el Dominio ni siquiera librerías "convenientes" no esenciales (su única dependencia conceptual es el Kernel) |

## 2. Entre módulos

| Regla | Enunciado |
|---|---|
| M1 | Un módulo jamás importa el dominio ni la aplicación de otro módulo — ni "solo para leer" |
| M2 | La colaboración entre módulos ocurre solo por: (a) eventos publicados (contratos ETS-008/09) consumidos vía despachador (10); (b) consultas a read models publicados como contrato; (c) comandos por el catálogo — nunca invocación interna directa |
| M3 | Los contratos compartibles (sobres de eventos publicados, referencias) viven en el paquete de contratos de cada módulo (24), separado de su dominio — lo publicado es la puerta; lo interno es invisible |
| M4 | Las referencias entre módulos son UUIDs débiles (ETS-010/04): tener el id de un activo no da derecho a su dominio |
| M5 | La plataforma (pipelines 11-22, UoW, despachador, kernel) es de quien todos dependen; la plataforma no depende de ningún módulo de negocio |

## 3. Verificación

1. **El grafo se verifica mecánicamente en CI** (lint de dependencias sobre la estructura de paquetes 24): una importación prohibida rompe la compilación/el build, no una convención de buena voluntad.
2. **Toda excepción es visible y temporal**: si una migración de estructura exige tolerar una arista prohibida, queda listada en un archivo de excepciones con fecha de retiro — el archivo vacío es el estado normal.
3. La misma regla rige las **pruebas**: las pruebas de dominio no montan infraestructura; las de módulo no importan internos de otro módulo (25).

## 4. Por qué esta severidad

Estas reglas son la condición de posibilidad de todo lo demás: extraer un módulo a servicio propio (ETS-010/21 §1.6), reemplazar tecnología detrás de un puerto, probar el Core en memoria, y razonar localmente sobre un módulo sin leer los demás. Cada arista ilegal cancela una de esas opciones para siempre a cambio de minutos de comodidad.

---

## Impacto sobre la implementación
La estructura de paquetes (24) materializa este grafo; el lint de dependencias entra al CI el primer día; las revisiones rechazan importaciones ilegales sin debate.

## ETS relacionados
ETS-007 (02 arquitectura modular) · ETS-010 (02 esquemas por módulo, 06 sin FKs cruzadas — el mismo límite en tres planos) · ETS-011 (01, 06, 24).

## Riesgos
- Erosión gradual por excepciones "temporales" eternas → archivo de excepciones con fecha y revisión periódica; tendencia creciente = alerta de arquitectura.
- Contratos compartidos que engordan hasta ser acoplamiento encubierto → los paquetes de contratos contienen sobres y referencias, jamás lógica.

## Decisiones habilitadas
Lint de dependencias, estructura de paquetes, extracción futura de módulos, pruebas en memoria.

## Decisiones bloqueadas
Herramienta concreta de verificación del grafo — implementación (según lenguaje elegido).
