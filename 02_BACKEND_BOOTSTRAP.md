# 02 — Bootstrap del Backend

> **DeltaOps — ESI-003 · v1.0** · Cómo se compone la aplicación: del proceso vacío al sistema listo.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Propósito

El bootstrap es la secuencia determinista que convierte un proceso recién lanzado en una aplicación DeltaOps lista para servir. Es la única zona del backend donde se permite "conocerlo todo": lee configuración, construye la plataforma, registra módulos y entrega el control al ciclo de vida (doc 03). Distinto del bootstrap del proyecto (ESI-002/05, entorno de desarrollo): aquí se trata del arranque del proceso.

## 2. Secuencia oficial de composición

| Paso | Acción | Falla → |
|---|---|---|
| 1 | Leer y validar configuración completa (doc 08) | Abortar con error explícito; jamás arrancar a medias |
| 2 | Inicializar logging estructurado (doc 16) | Abortar: sin logs no hay diagnóstico |
| 3 | Inicializar observabilidad (doc 17) | Degradar con aviso: métricas caídas no impiden servir |
| 4 | Construir el Kernel: catálogos, errores, Policies (doc 04) | Abortar |
| 5 | Construir la plataforma: pool de BD, UoW, dispatcher, repositorios base | Abortar |
| 6 | Registrar módulos en orden declarado (doc 06) y sus capacidades (doc 07) | Abortar: un módulo inválido invalida el arranque |
| 7 | Componer el borde HTTP: middleware (doc 10), rutas de módulos, salud (doc 18) | Abortar |
| 8 | Verificación de arranque: sondas mínimas contra BD y dependencias críticas | Abortar o degradar según criticidad declarada |

El mismo bootstrap sirve para el proceso API y para los workers (doc 22): comparten los pasos 1-6 y divergen en el borde (HTTP vs consumo de bandejas).

## 3. Reglas normativas

1. **Determinista**: mismo binario + misma configuración = misma composición. Sin descubrimiento dinámico por reflexión ni escaneo de carpetas.
2. **Explícito**: la lista de módulos registrados es una declaración escrita en el arranque, revisable en PR.
3. **Rápido y ruidoso**: si algo obligatorio falta, el proceso muere en segundos con un mensaje del catálogo de errores; prohibidos los arranques parciales silenciosos.
4. **Sin trabajo de negocio**: el bootstrap no ejecuta migraciones, no siembra datos, no repara estado. Esas son operaciones separadas (ESI-002/11 y 12).
5. **Un solo camino**: no existen "modos" alternativos de arranque; los entornos difieren solo por configuración (ESI-002/09).

## 4. Relación con la inyección de dependencias

El bootstrap es el único cliente del contenedor de composición (doc 05): construye el grafo completo una vez, al arranque. Ningún componente resuelve dependencias en caliente.

## Impacto sobre la implementación

Define el contenido del anillo Arranque (ESI-002/03) y el orden que el DGP de plataforma debe respetar. Las verificaciones del paso 8 alimentan los health checks (doc 18).

## Dependencias

Docs 03-08 y 10 de esta serie; ETS-012 (blueprint); ESI-002/07 (configuración) y /09 (entornos).

## Riesgos

- Acoplamiento del bootstrap a detalles de módulos; mitigación: los módulos se registran mediante el contrato de doc 06, nunca con lógica ad hoc.
- Arranques lentos por sondas excesivas; mitigación: solo dependencias críticas en el paso 8, el resto se vigila en salud continua.

## Decisiones habilitadas

- Escribir el DGP del arranque con una secuencia cerrada y verificable.
- Reutilizar la misma composición para API y workers.

## Decisiones bloqueadas

- Prohibido el autodescubrimiento de módulos por escaneo.
- Prohibido arrancar con configuración inválida o incompleta.
- Prohibido ejecutar migraciones o seeds dentro del bootstrap del proceso.
