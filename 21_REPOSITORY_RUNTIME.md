# 21 — Repository Runtime

> **DeltaOps — ESI-003 · v1.0** · Cargar y guardar agregados completos, bajo RLS, sin fugas del ORM.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Contrato

El repositorio es el puerto del Kernel (ETS-011) para persistir agregados. En runtime:

| Regla de contrato | Significado |
|---|---|
| **Por agregado** | Un repositorio por agregado raíz (ETS-003); nada de repositorios genéricos "de tablas" |
| **Agregado completo** | Cargar devuelve el agregado con lo necesario para decidir; guardar persiste el agregado entero con su versión |
| **Ligado a la UoW** | El repositorio opera dentro de la transacción de la UoW activa (doc 20); no abre sesiones propias |
| **Bajo RLS siempre** | Toda consulta corre con el tenant de sesión fijado; el repositorio no escribe filtros de tenant (ETS-009) |
| **Sin fugas del ORM** | Hacia el módulo viajan agregados del dominio, jamás entidades del ORM, sesiones ni consultas |

## 2. Escritura y lectura

1. **El plano de escritura** usa repositorios: cargar → decidir → guardar. El mapeo agregado ↔ tablas sigue ETS-010; la implementación vive en el adaptador del módulo (estructura doc 25), construida sobre la base de repositorio de plataforma.
2. **El plano de lectura** (consultas, listados, bandejas de trabajo de usuario, ETS-011) **no usa repositorios**: usa lectores de consulta que proyectan directamente a los contratos de respuesta de ETS-008, con sesión de solo lectura bajo RLS. Cargar agregados para listar es un defecto de diseño.
3. **Paginación por cursor** en todo listado (ETS-008): estable ante inserciones, sin `OFFSET` sobre conjuntos grandes.
4. **Búsquedas por identidad natural** (códigos de negocio) además del identificador técnico, según lo definido por cada agregado en su ETS de dominio.

## 3. Reglas normativas

1. **La base de repositorio de plataforma** aporta lo común (versión optimista, recolección de eventos del agregado, fechas de registro); el adaptador del módulo aporta solo el mapeo específico. Plantilla T03/T06 (ESI-002/18).
2. **Sin consultas arbitrarias en repositorios**: un repositorio expone operaciones con nombre de negocio; si hace falta una consulta nueva, se diseña como lector del plano de lectura o como operación nombrada, nunca como "filtro genérico".
3. **Carga perezosa prohibida cruzando la frontera**: lo que el caso de uso necesita se carga dentro de la transacción; los objetos que salen están completos (evita N+1 y sesiones fantasma).
4. **Los fakes del Kernel** (ETS-011) implementan el mismo contrato en memoria, con versión optimista incluida, para pruebas sin BD.
5. **Borrado según dominio**: los agregados con requisitos de auditoría usan estados terminales, no borrado físico; el borrado físico solo donde el ETS de dominio lo permita.

## Impacto sobre la implementación

El DGP de plataforma implementa la base de repositorio y el lector de consulta base; los DGP de módulo generan sus adaptadores con T06. El mapeo físico ya está congelado en ETS-010.

## Dependencias

Docs 05, 20 y 25; ETS-003 (agregados), ETS-008 (contratos y paginación), ETS-009 (RLS, versión), ETS-010 (esquema), ETS-011 (puertos y fakes).

## Riesgos

- Repositorios que degeneran en DAOs genéricos; mitigación: operaciones nombradas por negocio y revisión con checklist.
- Consultas de lectura coladas en repositorios "porque ya estaba ahí"; mitigación: separación física de lectores (doc 25) y regla 2.

## Decisiones habilitadas

- Pruebas de casos de uso con fakes fieles al contrato.
- Optimización del plano de lectura sin tocar el dominio.

## Decisiones bloqueadas

- Prohibido exponer entidades del ORM fuera del adaptador.
- Prohibidos repositorios genéricos multipropósito.
- Prohibido listar cargando agregados.
