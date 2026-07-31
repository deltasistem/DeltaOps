# 14_JSONB_GUIDELINES.md

> **DeltaOps — ETS-010 · v1.0** · Uso oficial de JSONB: dónde es la solución correcta, dónde está prohibido, y su disciplina.
> Principio: JSONB es para **estructura definida por configuración versionada del tenant**, jamás para pereza de modelado.
> Documento de diseño. Sin SQL.

---

## 1. Usos oficiales (catálogo cerrado)

| Uso | Tabla(s) | Por qué JSONB es correcto |
|---|---|---|
| Atributos dinámicos de activos | `activos.activo.atributos` | La forma la define la plantilla del tenant con su versión (ETS-005/03): columnas fijas no pueden |
| Respuestas de formularios | `checklist_diligenciado.respuestas` (y todo diligenciamiento) | El esquema de facto es la versión del formulario (ETS-009/05 §4) |
| Payload de eventos | `evento_*.payload` | Cada tipo de evento tiene su esquema versionado (ETS-008/09 §4); el sobre va en columnas |
| Contenido de versiones de configuración | `configuracion.*_version.contenido` | La definición completa (formulario, workflow, regla) es documento versionado inmutable |
| Detalles de errores/bandejas | `bandeja_error.detalle`, `evento_apartado.detalle` | Diagnóstico heterogéneo por naturaleza |
| Trazabilidad de sugerencias IA | `ia.sugerencia.evidencia` | Estructura por capacidad, versionada con la capacidad |
| Mapeos de integración | `integracion.mapeo_version.definicion` | Declarativos por tenant y conector |

## 2. Prohibiciones

- **Columnas de negocio estables dentro de JSONB**: si el dominio conoce el campo (folio, fechas, montos, estados, referencias), es columna tipada — se consulta, se indexa, se restringe. JSONB no es un cajón para "lo que no quisimos modelar".
- **Referencias entre entidades dentro de JSONB**: los `id_*` van en columnas (FKs/débiles visibles, 04-06); un UUID enterrado en JSON es una referencia invisible para integridad y reconciliación.
- **JSONB mutable como estado**: el JSONB de hechos y versiones es inmutable como su fila; el único JSONB "vivo" admitido es el de estado vigente de agregado (atributos de activo), que se reemplaza completo en el comando (nunca parches parciales concurrentes).
- **Arrays JSONB como relaciones N:M**: las relaciones son tablas.

## 3. Disciplina de uso

1. **Todo JSONB tiene esquema declarado en otra parte**: la versión de configuración que lo define (plantilla, formulario, tipo de evento). "JSONB libre" no existe; el validador del dominio valida contra esa versión antes de persistir.
2. **Indexación**: solo por rutas/expresiones declaradas y justificadas por consulta (GIN selectivo o índice de expresión, 08 §2) — jamás GIN sobre el documento entero por defecto.
3. **Consulta**: los filtros frecuentes sobre campos JSONB son señal de que el campo merece promoción a columna (o el read model lo aplana al proyectar — la opción preferida: el JSONB queda en la verdad, el derivado lo sirve plano).
4. **Tamaño**: los documentos se mantienen en el orden de KB; binarios y textos enormes van al almacén de objetos con referencia (13/17).
5. **Versionado del contenido**: el JSONB lleva consigo el número de versión de su esquema (o la fila lo lleva al lado): leer siempre sabe con qué versión interpretar (ETS-009/05).

---

## Impacto sobre la implementación
La capa de acceso a datos valida JSONB contra la versión de configuración antes de escribir; los proyectores aplanan lo consultable; el lint señala columnas JSONB fuera del catálogo del §1.

## ETS relacionados
ETS-005 (03 formularios, plantillas) · ETS-009 (05 versionado, 03 hechos) · ETS-008 (09 payload de eventos) · ETS-010 (08 índices, 13 tipos).

## Riesgos
- El "campo rápido en JSONB" erosiona el modelo con los años → catálogo cerrado del §1 + revisión de convenciones para ampliarlo.
- Consultas analíticas directas sobre JSONB de la verdad → regla §3.3: aplanar al proyectar.

## Decisiones habilitadas
Validación contra versiones de configuración, promoción de campos a columnas por evidencia, índices selectivos.

## Decisiones bloqueadas hasta el siguiente ETS
Rutas indexadas concretas (nacen con consultas reales) y el validador de esquemas de implementación.
