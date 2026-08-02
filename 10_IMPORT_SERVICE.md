# 10 — Import Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de importaciones: carga masiva validada, por el pipeline de comandos, con resultado por fila y sin puertas traseras.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

La carga masiva (el catálogo inicial de activos, el inventario de apertura, movimientos históricos) es la puerta de entrada clásica de datos corruptos. El servicio la disciplina: **toda importación es una secuencia de comandos normales del módulo**, orquestada, validada y reportada fila a fila. Materializa a escala interna el patrón de ingesta de ESI-005/19.

| Concepto | Definición |
|---|---|
| **Plantilla de importación** | Declarada por el módulo: comando destino, mapeo de columnas, validaciones de forma, ejemplos descargables |
| **Sesión de importación** | Archivo subido (vía doc 04) + plantilla + estados (validando → previsualizada → ejecutando → completada/parcial/rechazada) |
| **Resultado por fila** | Cada fila termina en éxito o error canónico con motivo; el archivo de resultados es descargable |

## 2. Reglas

1. **Sin escrituras directas jamás**: cada fila ejecuta el comando del módulo con pipeline completo — capacidades, permisos, Policies, invariantes, auditoría, eventos (refuerza el AP de ESI-005/19: nada de "por volumen" salta el pipeline sin decisión de arquitectura).
2. **Validar antes de ejecutar**: la fase de previsualización valida forma y reporta errores sin efectos; el usuario decide ejecutar con el panorama a la vista (todo-o-nada o filas-válidas, según la plantilla lo permita).
3. **Idempotencia de sesión**: reejecutar una sesión no duplica — cada fila lleva su `clave_idempotencia` derivada (sesión + fila), absorbida por el patrón de comandos (ESI-004/05).
4. **Errores parciales explícitos**: el resultado por fila es la verdad; sin "importó casi todo" ambiguo.
5. **fechaNegocio en cargas históricas**: los movimientos históricos entran con su fecha real (ETS-006); la plantilla lo exige donde aplica.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `importaciones` (por tenant; típicamente habilitada en implantación y acotada después).
- **Eventos**: "Importación Completada", "Importación Fallida" (v1) — notificación y cronología del tenant.
- **Contratos**: subir archivo a sesión; previsualizar; ejecutar; consultar estado y resultados (cursor); declaración de plantillas por módulo.
- **Configuración**: tamaño y filas máximas, concurrencia, plantillas habilitadas, por tenant.
- **KPIs**: sesiones por módulo/tenant, tasa de filas con error, tiempo de ejecución, reintentos de sesión.
- **Permisos**: `IMPORTACIONES.EJECUTAR` + el permiso del comando destino (doble llave, patrón doc 09); las plantillas las administra `IMPORTACIONES.PLANTILLAS.ADMINISTRAR`.
- **Consumidores**: Activos (catálogo inicial), Inventario (apertura y conteos), Compras (proveedores/históricos); cualquier módulo con maestros.

## Impacto sobre la implementación

DGP propio (sesiones, previsualización, orquestación por lotes como trabajos, ESI-003/22); los módulos declaran plantillas apuntando a comandos existentes — la importación no crea rutas de escritura nuevas.

## Dependencias

ESI-003/22; ESI-004/05; ESI-005/06 y /19; docs 03-04 y 09; ETS-006/010.

## Riesgos

- Presión de implantación por "cargar rápido" saltándose validaciones; mitigación: la regla §2.1 no tiene excepción operable — la vía rápida legítima es mejorar el rendimiento del lote, no quitarle murallas.

## Decisiones habilitadas

- Implantaciones de clientes con datos validados desde el día uno.
- Cargas históricas honestas con fechaNegocio.

## Decisiones bloqueadas

- Prohibidas escrituras masivas directas a tablas (sin pipeline).
- Prohibidas importaciones sin previsualización ni resultado por fila.
- Prohibidas plantillas que mapeen a más de un comando destino.

## Reusable Pattern

Plantilla declarada → sesión → previsualización → comandos con clave derivada → resultado por fila: el patrón de toda entrada masiva, interna o externa (comparte esqueleto con la ingesta de ESI-005/19).

## Anti-Patterns

- El "script de migración de una noche" del implantador (AP de ESI-005/28).
- Plantillas con transformaciones de negocio ocultas en el mapeo.
- Tratar el resultado parcial como éxito sin revisar los errores.

## Knowledge Graph

- **ETS que consume**: ETS-006 (fechas), ETS-010 (disciplina de datos).
- **ESI que consume**: ESI-003/22; ESI-004/05; ESI-005/06 y /19.
- **DGP que originará**: DGP-Importaciones; catálogos de plantillas en DGP de Activos, Inventario y Compras.
- **ADR relacionados**: ADR de "todo por el pipeline" (§2.1); ADR de doble llave (doc 09).
- **Módulos que reutilizarán este patrón**: Activos, Inventario, Compras en v1; cualquier módulo con implantación de datos.
