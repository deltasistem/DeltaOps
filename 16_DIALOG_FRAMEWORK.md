# 16 — Dialog Framework

> **DeltaOps — ESI-008 · v1.0** · El marco de diálogos: interrumpir es caro — un catálogo cerrado de interrupciones con reglas de foco, confirmación y proporcionalidad.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El catálogo de diálogos

| Tipo | Propósito | Reglas propias |
|---|---|---|
| **Confirmación** | Verificar una acción de consecuencia | Solo para lo irreversible o costoso; enuncia la consecuencia concreta ("se cancelará la OT y se liberarán sus reservas"); el botón repite el verbo, jamás "Aceptar" |
| **Confirmación reforzada** | Lo destructivo mayor | Exige acto adicional (escribir el nombre del recurso, o step-up si el comando lo declara, ESI-007/03) |
| **Tarea modal** | Micro-flujo que no amerita pantalla (crear rápido, seleccionar) | Una responsabilidad; si crece a pasos, es asistente (doc 17); si crece a secciones, es pantalla |
| **Panel lateral** | Detalle o edición en contexto sin abandonar la lista | Preserva la pantalla debajo viva; cierre seguro con trabajo sin guardar |
| **Aviso bloqueante** | El sistema debe detener (sesión por expirar, crítica doc 15) | Reservado; su alta se revisa como las notificaciones críticas |

## 2. Reglas

1. **Proporcionalidad**: la interrupción mínima que cumpla el propósito; la escalera es en-línea → panel → modal → bloqueante, y cada peldaño se justifica. La confirmación de lo reversible está prohibida — deshacer es mejor que preguntar (donde el contrato del comando lo permita).
2. **Foco y retorno por contrato** (doc 10 §2.2): el diálogo atrapa el foco, se cierra con el gesto estándar, y devuelve el foco exactamente a donde estaba; el fondo queda inerte pero visible (el contexto orienta).
3. **Cierre seguro siempre**: cerrar con trabajo sin guardar pregunta (guardar borrador / descartar / seguir); el cierre accidental jamás pierde trabajo (doc 13 §2.4).
4. **Un diálogo a la vez**: prohibido apilar modales; el flujo que necesita un diálogo desde un diálogo está mal partido (es asistente o pantalla).
5. **El diálogo declara como pantalla**: todo diálogo con comandos usa el contrato (doc 05) — sus comandos, permisos y estados; el modal no es zona franca declarativa.

## 3. Declaración (los ocho rubros)

- **Commands**: los del diálogo concreto (declarados en su contrato); la confirmación reforzada hereda el step-up del comando.
- **Queries**: las del contenido del diálogo concreto.
- **Capacidades/Permisos**: los del comando que confirma o la tarea que ejecuta.
- **Servicios**: ninguno propio del marco.
- **Offline**: los diálogos de comandos encolables confirman el encolado (doc 11 §2.3); los online-only no se abren — su disparador está deshabilitado con motivo.
- **KPIs**: confirmaciones canceladas (fricción u honestidad), cierres con trabajo rescatado.
- **IA**: ninguna en confirmaciones (la consecuencia la enuncia el sistema, no una sugerencia).

## Impacto sobre la implementación

El catálogo de cinco tipos con sus contratos de foco/cierre entra al DGP de experiencia; las pantallas instancian sin redefinir comportamiento.

## Dependencias

Docs 05, 10-11, 13, 15, 17; ESI-007/03.

## Riesgos

- La confirmación como tic universal ("¿está seguro?" en todo) que entrena el clic automático; mitigación: la regla §2.1 (solo irreversible/costoso) y el KPI de cancelaciones — la confirmación que nadie cancela jamás es ruido a eliminar.

## Decisiones habilitadas

- Interrupciones consistentes, predecibles y accesibles en todo el producto.
- Lo destructivo protegido proporcionalmente a su daño.

## Decisiones bloqueadas

- Prohibido apilar diálogos modales.
- Prohibida la confirmación de acciones reversibles.
- Prohibidos botones "Aceptar/Cancelar" sin verbo de consecuencia.

## Reusable Pattern

Catálogo cerrado de interrupciones + escalera de proporcionalidad + cierre seguro: la gramática de interrupción — cada uso elige tipo, no inventa comportamiento.

## Anti-Patterns

- El modal-pantalla con pestañas y scroll infinito.
- La confirmación que no dice qué va a pasar.
- El panel lateral que congela la lista de abajo sin motivo.

## Knowledge Graph

- **ETS que consume**: ETS-011 (interrupciones caras en operación).
- **ESI que consume**: ESI-007/03 (step-up declarativo).
- **DGP que originará**: el catálogo de diálogos en el DGP de experiencia.
- **ADR relacionados**: ADR de proporcionalidad de interrupción.
- **Módulos que reutilizarán este patrón**: todos; ningún módulo define modales propios.
