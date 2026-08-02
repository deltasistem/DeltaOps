# 28_PULL_REQUEST_CHECKLIST.md

> **DeltaOps — ETS-012 · v1.0** · Checklist obligatorio de Pull Request: la puerta única de calidad.
> Cierra la serie ETS-012. Sin código.

---

## 1. Uso

Todo PR declara su tipo (operación nueva · cambio de dominio · adaptador · plataforma · refactor · evolución) y atraviesa el checklist completo. Un "no" en cualquier punto marcado ⛔ bloquea el merge sin discusión; los puntos ◆ exigen justificación escrita en el PR. El checklist lo aplican revisor y CI a partes iguales — lo automatizable (dependencias, generación, matrices) jamás se verifica a ojo.

## 2. El checklist

**Arquitectura**
- ⛔ La verificación de dependencias (R1-R5, M1-M5) pasa sin excepciones nuevas; toda excepción nueva trae fecha de retiro y dueño.
- ⛔ Ninguna pieza quedó fuera de su lugar del árbol (23); no aparecieron carpetas basurero.
- ⛔ Cero condicionales de negocio en casos de uso o adaptadores; cero `si tenant == X` en cualquier parte.
- ◆ Puertos nuevos o firmas ampliadas: justificados ante el catálogo (08 §regla 3).

**Contrato y catálogo**
- ⛔ Toda operación nueva existe primero en el catálogo ETS-008; los tipos de frontera están regenerados, no editados.
- ⛔ Metadatos completos: permiso, claves de configuración, eventos posibles, errores posibles.
- ⛔ Cambios de frontera cumplen N/N-1 o traen versión nueva con plan de convivencia (27).

**Comportamiento**
- ⛔ Rechazos como Resultado con código de catálogo; ninguna excepción usada como control de flujo de negocio.
- ⛔ Sin capturas silenciosas, sin valores por defecto inventados, sin degradación no declarada (15 §regla 6).
- ⛔ Eventos con nombre en pasado del lenguaje ubicuo, actor, tiempo doble y versiones de configuración.
- ◆ Reglas nuevas de negocio: ¿invariante (dominio) o variable por tenant (Policy + clave registrada)? — decisión explícita.

**Pruebas**
- ⛔ Cada pieza nueva trae su prueba en su plantilla (tabla de casos, caso de uso con fakes, suite de contrato).
- ⛔ Operaciones nuevas registradas en las matrices transversales (autorización, configuración, idempotencia, tenant).
- ⛔ Ninguna prueba de negocio toca infraestructura; ninguna prueba existente de contrato fue modificada en un refactor.
- ⛔ CI verde completo — no existen pruebas desactivadas "temporalmente" en este PR.

**Nombres y forma**
- ⛔ Nombres conforme a los patrones (24); coincidencia literal catálogo↔código↔metadatos.
- ◆ Casos de uso que superan una pantalla: divididos o justificados.

**Seguridad y datos**
- ⛔ Ningún secreto, credencial o endpoint en el código; configuración de despliegue solo en arranque.
- ⛔ Datos Restringidos: sin apariciones en logs, errores, índices, notificaciones ni contextos de IA fuera de lista blanca.
- ⛔ Toda escritura pasa por comando y UoW; no hay caminos directos a la base.

**Tipo declarado**
- ⛔ Refactor: cero cambio observable, pruebas intactas (26 §regla 2). Evolución: mecánica del tipo aplicada (27 §1).

## 3. Regla final

El checklist se cambia por gobierno (decisión de arquitectura registrada), nunca por costumbre; punto que la práctica revela inútil se retira formalmente — jamás se "deja de aplicar".

---

## Impacto sobre la implementación
La calidad deja de depender del revisor heroico: la puerta es la misma para todo PR, la mitad es mecánica en CI, y las diez reglas de oro (01) se vuelven verificables una a una.

## ETS relacionados
ETS-012 completo (es su síntesis operativa) · ETS-011 (23, 25, 28) · ETS-008 (17) · ETS-006 (13).

## Riesgos
- Checklist degradado a ritual de palomeo → la mitad automatizada en CI no se palomea; la mitad humana exige evidencia en el PR (◆).
- PRs gigantes que hacen el checklist impracticable → PRs chicos por diseño (una operación, una pieza); el tamaño excesivo es en sí observación de revisión.

## Decisiones habilitadas
Revisión objetiva y uniforme, incorporación de revisores nuevos, automatización progresiva de la puerta.

## Decisiones bloqueadas
Herramienta de PR/CI concreta — con el stack; el contenido de la puerta la sobrevive.

---

**Fin de la serie ETS-012.** El Manual Oficial de Implementación queda completo: el patrón oficial y sus diez reglas de oro, los flujos canónicos de comando y consulta, las plantillas de cada pieza (casos de uso, motores, Policies, repositorios, puertos, adaptadores, despachador, UoW, pipelines), las implementaciones transversales (validación, Resultado, errores, configuración, auditoría, archivos, búsqueda, reportes, IA, integraciones), la organización física, los nombres, el testing, el refactor, la evolución y la puerta de calidad — todo independiente de tecnología, listo para traducirse una sola vez al stack que se elija.
