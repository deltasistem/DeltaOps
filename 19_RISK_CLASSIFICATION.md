# 19 — Risk Classification

> **DeltaOps — ESI-007 · v1.0** · La clasificación de riesgo: cuatro niveles que dimensionan controles, revisión y respuesta — el rigor donde importa.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La escala

| Nivel | Nombre | Definición | Ejemplos |
|---|---|---|---|
| **R1** | Crítico | Su compromiso rompe la seguridad del sistema o de múltiples tenants | Identidad, autorización, sesiones, secretos, API, eventos de seguridad |
| **R2** | Alto | Su compromiso daña seriamente a un tenant o a la plataforma | Delegación, cuentas de servicio, exportes masivos, integraciones, gobierno |
| **R3** | Medio | Daño acotado y recuperable | Módulos de negocio estándar, servicios compartidos satélite |
| **R4** | Bajo | Daño menor, sin datos sensibles concentrados | Piezas de presentación, tableros de lectura |

El nivel se asigna por componente (módulo, servicio, pieza) y por **acción** donde aplique (un módulo R3 puede tener comandos R2: aprobar compras de alto monto).

## 2. Reglas

1. **Asignación con criterios, no intuición**: el nivel se deriva de (a) clasificación de los datos que concentra (doc 16 §2.5), (b) alcance del daño (multi-tenant > tenant > acotado), (c) irreversibilidad; la asignación se registra con su razonamiento (doc 18).
2. **El riesgo dimensiona los controles**: R1 → auditoría total, revisión senior obligatoria (doc 23), step-up disponible (doc 03 §2.1), simulacros periódicos (doc 22), sin waivers de larga vida; R2 → auditoría total, revisión reforzada; R3 → régimen estándar de las series; R4 → régimen estándar sin extras. La tabla de efectos es normativa: discutir el nivel es discutir los controles.
3. **Riesgo aceptado como decisión de primera clase**: cuando un control no se aplica (costo, plazo), el riesgo residual se acepta explícitamente en el registro (doc 18 §2.3) con dueño y revisión — la alternativa silenciosa está prohibida.
4. **El nivel se revisa con el cambio**: un componente que empieza a concentrar datos P/S o a servir más tenants re-evalúa su nivel (disparador declarado en la revisión, doc 23); el riesgo es dinámico aunque la escala sea fija.
5. **Amenazas modeladas donde el nivel lo exige**: los componentes R1 mantienen un modelo de amenazas vivo (qué puede salir mal, qué lo impide, qué lo detecta) revisado con cambios mayores; para R2 se recomienda; R3/R4 heredan los genéricos de plataforma.

## 3. Declaración (los seis rubros)

- **Clasificación**: las asignaciones de riesgo = interno (I).
- **Riesgo**: la función de clasificación misma es R2.
- **Permisos**: `GOBIERNO.RIESGO.ADMINISTRAR` (plataforma); la propuesta de nivel viene en cada DGP.
- **Auditoría**: asignaciones, cambios de nivel y aceptaciones de riesgo auditados.
- **Retención**: historial de niveles permanente (el razonamiento de ayer explica los controles de hoy).
- **Evidencias**: mapa de riesgo por componente, inventario de riesgos aceptados con revisiones al día, modelos de amenazas R1 vigentes.

## Impacto sobre la implementación

La sección de riesgo entra a todo DGP (propuesta de nivel + razonamiento); los efectos §2.2 se aplican por las puertas y calendarios existentes; los modelos de amenazas R1 son entregables del DGP de plataforma de seguridad.

## Dependencias

Docs 03, 13, 16, 18, 22-23; ESI-002/17; ETS-009.

## Riesgos

- Inflación (todo R1 "por seriedad") que diluye el rigor; deflación (todo R3 "por velocidad") que lo evita; mitigación: criterios §2.1 citables, efectos con costo visible §2.2 y revisión en ambas direcciones (doc 23).

## Decisiones habilitadas

- Inversión de seguridad priorizada y defendible.
- Conversaciones de riesgo con clientes en escala nombrada.

## Decisiones bloqueadas

- Prohibidos componentes sin nivel de riesgo declarado.
- Prohibido aceptar riesgos fuera del registro.
- Prohibidos R1 sin modelo de amenazas vigente.

## Reusable Pattern

Escala R1-R4 + criterios de derivación + tabla de efectos normativa + aceptación explícita: el dimensionador de rigor para todo componente presente y futuro.

## Anti-Patterns

- Matrices de riesgo de 25 celdas que nadie usa para decidir.
- El nivel asignado una vez y jamás revisado.
- Controles R1 aplicados uniformemente "para simplificar" (doc 01 §2.5).

## Knowledge Graph

- **ETS que consume**: ETS-009 (protección proporcional).
- **ESI que consume**: ESI-002/17; docs 16 y 18 de esta serie.
- **DGP que originará**: la sección de riesgo de todo DGP; modelos de amenazas R1.
- **ADR relacionados**: ADR de escala R1-R4 con efectos normativos (doc 26).
- **Módulos que reutilizarán este patrón**: todos proponen su nivel en su DGP; los efectos se aplican solos.
