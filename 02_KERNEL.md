# 02_KERNEL.md

> **DeltaOps — ETS-011 · v1.0** · DeltaOps Kernel: los contratos universales que todo módulo comparte y ningún módulo posee.
> Documento de diseño. Sin código, sin clases.

---

## 1. Qué es (y qué no es)

El Kernel es la **capa más interna**: definiciones estables y mínimas que hacen coherente a todo el sistema. No contiene lógica de negocio, no conoce módulos, no crece por conveniencia — cada adición exige gobierno (28). Es la contraparte en el Core del "sobre universal" que ya existe en contratos (ETS-008/02) y en columnas universales (ETS-010/22): **una sola definición, tres proyecciones**.

## 2. Contenido normativo del Kernel

| Pieza | Define |
|---|---|
| **Contexto de Ejecución** | Quién (actor, delegante), dónde (tenant, contexto organizacional activo), cómo (canal, dispositivo), cuándo (instante), con qué (id de correlación, clave de idempotencia, marca IA). Inmutable durante la operación; viaja por toda tubería; nadie lo reconstruye a mitad de camino |
| **Identidad** | UUIDv7 como identidad técnica universal (ETS-010/05); el folio como concepto de identidad de negocio; la regla "quien crea, identifica" |
| **Tiempo doble** | `fechaNegocio` / `fechaRegistro` como conceptos del Kernel (no de cada módulo); reloj como puerto (06) — el Core jamás lee la hora del sistema directamente |
| **Resultado de operación** | Éxito con hecho confirmado · rechazo con error de catálogo · aceptado-en-revisión (apartado). Toda operación termina en exactamente uno de los tres |
| **Error normalizado** | Código de catálogo (ETS-008/07), severidad, detalles estructurados, id de correlación — la forma única que las capas externas traducen |
| **Sobre de evento** | Envoltura universal del evento de dominio (ETS-008/09): tipo en pasado en español, agregado, secuencia, contexto de ejecución de origen, versión de esquema, payload |
| **Sobre de comando y de consulta** | Nombre del catálogo (ETS-008/03-04), contexto de ejecución, carga; base sobre la que operan los pipelines 11-12 |
| **Paginación, orden y filtro** | Los contratos de consulta comunes (cursor, límites) una sola vez |
| **Clasificación de datos** | `publico_interno · interno · restringido` (ETS-006/13) como etiqueta que autorización y auditoría entienden |
| **Unidades y dinero** | Los value objects transversales: cantidad+unidad, monto+moneda (ETS-003/06; físicamente ETS-010/13) |

## 3. Reglas del Kernel

1. **Estabilidad extrema**: cambiar el Kernel toca todo; su evolución es la más gobernada del sistema (28) — compatible siempre, versionada, jamás rota.
2. **Cero dependencias**: el Kernel no importa nada de ninguna otra capa ni de infraestructura; es hoja en el grafo (23).
3. **Cero lógica de negocio**: si una regla menciona activos, OTs o inventario, no es del Kernel — pertenece al dominio de su módulo. La tentación de "subir" utilidades de negocio al Kernel se rechaza por defecto.
4. **Sin utilidades genéricas de programación**: el Kernel no es una librería de helpers; es un vocabulario. Lo que no sea contrato universal del sistema no entra.
5. Los contratos del Kernel son la **fuente** de la que se derivan el sobre HTTP (ETS-008/02) y las columnas universales físicas (ETS-010/22): cuando los tres deban cambiar, cambia primero el Kernel y las proyecciones lo siguen.

---

## Impacto sobre la implementación
El Kernel se implementa una sola vez como paquete raíz sin dependencias (24); todo módulo lo consume; el Contexto de Ejecución se construye en el borde (adaptador de entrada) y jamás dentro del Core.

## ETS relacionados
ETS-008 (02 sobre, 07 errores, 09 eventos) · ETS-010 (22 columnas universales, 05 identidad) · ETS-006 (13 clasificación) · ETS-003 (06 value objects).

## Riesgos
- Kernel que engorda hasta ser un "common" basurero → reglas §3.3-3.4 y revisión de gobierno para cada adición.
- Deriva entre Kernel, sobre HTTP y columnas físicas → regla §3.5: una fuente, tres proyecciones, cambio coordinado.

## Decisiones habilitadas
Estructura de paquetes con el Kernel como raíz (24), pipelines que operan sobre sobres del Kernel (11-22), pruebas en memoria.

## Decisiones bloqueadas
Representación concreta (tipos del lenguaje elegido) y serializaciones internas — implementación.
