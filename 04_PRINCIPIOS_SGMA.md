# 04_PRINCIPIOS_SGMA.md

> **SGMA — ETS-002 · v1.0** · Reglas arquitectónicas de la plataforma EAM.
> Estas reglas son **normativas**: toda decisión de diseño e implementación futura debe cumplirlas.
> Documento de diseño. No implementa nada.

---

## A. Organización y multi-tenancy

1. **Todo pertenece a una organización.** Ninguna entidad transaccional existe fuera del contexto empresa → sede → operación → proyecto → centro de costo → ubicación.
2. **El scoping por tenant es obligatorio.** Toda consulta y escritura se filtra por el contexto organizacional del usuario.
3. **La organización es el eje del sistema, no el activo.** El diseño gira alrededor de la organización.
4. **El contexto activo determina la vista.** Cambiar de empresa/operación/proyecto refiltra todos los datos y la navegación.
5. **Ningún usuario ve datos fuera de sus organizaciones autorizadas.**

## B. Activos y asignaciones

6. **Un activo nunca pertenece permanentemente a un centro de costo** (ni a empresa, operación, proyecto o ubicación). Toda pertenencia es una **asignación con vigencia**.
7. **Toda asignación genera historial.** Reasignar no sobrescribe: cierra la asignación anterior (fecha fin) y abre una nueva.
8. **El estado actual es una proyección del historial.** La "ubicación/centro/responsable actual" se deriva de la asignación vigente.
9. **Ningún módulo depende del tipo de activo.** El tipo es un dato de catálogo con atributos dinámicos; no se crean módulos ni ramas de código por tipo.
10. **El modelo de activo es universal.** Debe soportar los 17+ tipos definidos (y futuros) sin cambios estructurales.
11. **Un activo puede usar uno o varios combustibles** (ACPM, gasolina, gas, GLP, GNV, eléctrico, biodiesel, hidrógeno, otros). No se asume ACPM.
12. **La hoja de vida es consolidada e inmutable en su historial:** intervenciones, costos, combustible, horas, documentos.

## C. Historial, auditoría y trazabilidad

13. **Todo cambia y todo se recuerda.** Activos, operaciones, proyectos, centros de costo y responsables mantienen historial.
14. **Toda operación es auditable:** se registra quién, qué, cuándo y desde qué contexto.
15. **Todo movimiento queda registrado** (inventario, combustible, horas, asignaciones).
16. **El log de auditoría es inmutable.** No se edita ni se borra.
17. **Los eventos son la fuente de verdad de los cambios;** las lecturas rápidas usan proyecciones.

## D. Seguridad y acceso

18. **Autenticación gestionada** (no auth local artesanal). Toda petición se autentica.
19. **Autorización por rol y contexto (RBAC/ABAC).** Los permisos se evalúan en el contexto organizacional activo.
20. **Permisos granulares** a nivel de módulo, pantalla y acción.
21. **Mínimo privilegio por defecto:** lo no concedido está denegado.
22. **La seguridad es transversal (middleware),** no lógica dispersa en los handlers.

## E. Arquitectura y dominios

23. **Separación por dominios (bounded contexts).** Cada dominio encapsula sus entidades y reglas.
24. **Los módulos se comunican por contratos/servicios,** nunca accediendo a las tablas de otro dominio.
25. **Sin dependencias circulares.** Las dependencias apuntan hacia el Core (Organización, Seguridad, Auditoría).
26. **El Core no depende de módulos operativos.**
27. **Capa de servicios obligatoria:** las reglas de negocio viven en servicios, no en los controladores/rutas (corrige la deuda actual descrita en `ARQUITECTURA_ACTUAL.md`).
28. **Repositorios para el acceso a datos;** los servicios no arman SQL crudo disperso.

## F. Datos e integridad

29. **Integridad referencial explícita** (claves foráneas), superando el estado actual sin FKs.
30. **Unicidad de negocio por tenant** (p. ej. `codigo` de activo y de repuesto únicos dentro de la organización).
31. **Catálogos parametrizables, no strings mágicos.** Estados, tipos, prioridades, unidades, combustibles y monedas son catálogos.
32. **Atributos dinámicos para tipos de activo,** de modo que crecer en tipos no requiera cambiar el esquema.
33. **Fechas con zona horaria** y validación estricta (entrada inválida → error explícito, nunca fallo silencioso).

## G. API y contrato

34. **Contract-first:** OpenAPI es la fuente de verdad; de él se generan clientes y validadores (se reutiliza el patrón actual).
35. **Validación de entrada y salida** con esquemas generados (Zod).
36. **API versionada** (`/api/v1`).
37. **Paginación y filtros estándar** en todos los listados (corrige la ausencia actual de paginación).
38. **Errores consistentes** vía manejo centralizado (no 400/404/500 ad-hoc por handler).
39. **Consecutivos/folios race-safe** (patrón de reintento + unicidad, como el `OT-NNNNN` actual).
40. **Transacciones atómicas** para operaciones compuestas (p. ej. movimiento + saldo de inventario).

## H. Escalabilidad y rendimiento

41. **Diseñado para crecer** en activos, usuarios y transacciones sin rediseño.
42. **Índices por tenant** y en columnas de filtro frecuentes.
43. **Analítica e IA desacopladas** de la transacción; no bloquean la operación.
44. **Proyecciones/lecturas optimizadas** separadas del historial de eventos.

## I. Experiencia y operación en campo

45. **Mobile-first / PWA** para los flujos de campo (checklist preoperacional, combustible, lecturas).
46. **Responsive** en todas las pantallas.
47. **Un hallazgo en checklist puede originar una OT** de forma trazable.
48. **La navegación respeta permisos:** solo se muestra lo que el rol permite en el contexto activo.

## J. Internacionalización (preparado)

49. **Multimoneda preparada desde el modelo** (montos con moneda y tasa; no se asume una sola moneda).
50. **Multiidioma preparado desde el modelo** (textos y catálogos traducibles).

## K. Gobierno de la evolución

51. **Ninguna regla de negocio se codifica alrededor del tipo de activo.**
52. **Todo módulo nuevo se integra vía contrato** y respeta el scoping, la auditoría y los permisos.
53. **Reutilizar antes que reescribir:** aprovechar los activos clasificados como REUTILIZAR en `REUTILIZACION.md` (contract-first, UI, monorepo, patrones de folio/transacción/fechas).
54. **Refactorizar el dominio de datos** conforme al modelo organización-primero antes de ampliar funcionalidades.

---

## Ejemplos canónicos (para fijar el criterio)

- *Un activo nunca pertenece permanentemente a un centro de costo.* → Regla 6.
- *Toda asignación debe generar historial.* → Regla 7.
- *Ningún módulo podrá depender del tipo de activo.* → Regla 9.
- *Todas las operaciones deben ser auditables.* → Regla 14.
- *Todo movimiento debe quedar registrado.* → Regla 15.
- *No asumir ACPM: un activo puede usar varios combustibles.* → Regla 11.
- *Toda la información depende de una organización.* → Reglas 1–2.

> Estas reglas son el contrato arquitectónico del nuevo SGMA. Cualquier diseño, contrato o implementación que las contradiga debe considerarse defectuoso.
