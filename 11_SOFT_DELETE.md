# 11_SOFT_DELETE.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de borrado lógico: cuándo, cómo y con qué restricciones.
> Punto de partida heredado de 04: en DeltaOps el borrado físico de hechos no existe. Este documento define lo único parecido a "borrar" que el sistema conoce.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Cuándo

El borrado lógico aplica **solo a maestros y definiciones**, jamás a hechos:

| Aplica (baja lógica) | No aplica |
|---|---|
| Activos (dados de baja/vendidos) | Hechos transaccionales → compensación (04) |
| Proveedores inactivos | Eventos y auditoría → intocables |
| Ítems descontinuados | Versiones publicadas de configuración → estado `histórica` (05) |
| Usuarios retirados | Reportes emitidos / evidencias → congelados |
| Nodos organizacionales cerrados | Borradores → esos sí se descartan de verdad (aún no son nada) |
| Definiciones de configuración retiradas | |

La única supresión física real del sistema: borradores descartados, telemetría cruda vencida (10 §2), caches — cosas que nunca fueron hechos — y la seudonimización legal de datos personales (excepción gobernada, ETS-006/13).

## 2. Cómo

- La baja es un **hecho de dominio con semántica propia**, no una marca genérica: `DarDeBajaActivo` (con motivo y destino), `InactivarProveedor`, `RetirarUsuario` — cada uno con su comando del catálogo (ETS-008/03), su evento, su actor y su motivo obligatorio.
- El estado vigente del agregado pasa a su estado terminal de ciclo de vida (dado de baja, inactivo, retirado): **es un estado más del dominio**, no un limbo técnico invisible.
- Reactivación donde el dominio la admite (proveedor reactivado, ítem reintroducido): otro hecho, con la brecha visible en la historia. Donde no la admite (activo vendido), la vuelta es un alta nueva enlazada al anterior.

## 3. Restricciones

1. **La historia no se toca:** el activo dado de baja sigue en todas sus OTs, costos y KPIs históricos; el usuario retirado sigue siendo el autor de todo lo que firmó. La baja recorta el futuro, jamás el pasado.
2. **Visibilidad por defecto:** las listas operativas excluyen lo dado de baja; los filtros permiten incluirlo explícitamente ("mostrar inactivos"); las consultas históricas lo incluyen siempre. Los read models proyectan ambas vistas — el recorte es de presentación declarada, no de existencia.
3. **Integridad referencial hacia lo inactivo:** las referencias históricas siguen resolviendo (nombre, folio, ficha consultable). Lo inactivo no es elegible para hechos nuevos — validación de dominio (`ACTIVO_DADO_DE_BAJA`, catálogo ETS-008/07), no restricción física.
4. **Bajas con obligaciones pendientes, bloqueadas por dominio:** no se da de baja un activo con OTs abiertas ni se retira un proveedor con OCs en curso — primero se resuelve lo pendiente (precondiciones del comando, ETS-008/03).
5. **Cascadas prohibidas:** dar de baja un nodo organizacional exige decidir explícitamente el destino de lo que contiene (reasignar); nada se inactiva por arrastre silencioso.
6. **Identificadores jamás reutilizados:** el UUID y el folio de lo dado de baja quedan ocupados para siempre (12).
