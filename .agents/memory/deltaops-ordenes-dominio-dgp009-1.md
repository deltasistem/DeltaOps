---
name: Órdenes de Trabajo dominio DGP-009.1
description: Lecciones del dominio de Work Orders (workflow-driven, extensión tenant, alcance solo-dominio).
---

# Órdenes de Trabajo — Dominio (DGP-009.1)

Reglas duras confirmadas por revisión (no repetir):
- **"Solo dominio" es literal**: en subfases de dominio, nada de adaptadores concretos de persistencia, runtime compuesto, read models materializados/proyecciones, bitácora query, dashboard ni indexación en búsqueda — todo eso es hallazgo MAYOR aunque use fakes o el Record Store. Quedan: aggregate + VOs + policies + máquina + puertos indispensables con fakes; `detalle` solo si lee el aggregate del repositorio.
- **El Workflow Engine es NEUTRO**: rechaza vocabulario de negocio ("orden", "activo") y exige camelCase en estados/comandos y kebab-case en la clave. Patrón: definición neutra + capa de traducción `estadoDeNegocio()` a estados de negocio públicos; SIN fallback silencioso — estado no declarado ⇒ error explícito.
- **Estados de tenant deben ser OPERABLES, no solo traducibles**: contrato config→definición activa: extensión declarativa (estados+transiciones con permiso), componer base+extensión, validar con validarWorkflow y publicar/activar esa definición; comandos extendidos aceptados por transición genérica; coherencia catálogo↔definición con error ante divergencia.
- **La firma de idempotencia de publicación debe cubrir TODA la extensión** (serialización canónica con orden determinista, incl. permiso/etiqueta/final): omitir un campo semántico retiene autorizaciones obsoletas en el motor — hallazgo MAYOR de seguridad.
- La instancia de workflow es un PlatformRecord: estado en `.status` (no `.estado`); el gate devuelve `pendienteAprobacion`; `activar` usa la versión OPTIMISTA del registro, no la versión N (solo coinciden en N=1).
- Dynamic Forms en dominios consumidores: validar existencia/clase/compatibilidad N/N-1 de la plantilla vía puerto contra el runtime real, y anclar RESPUESTAS a la versión exacta; guardar referencias del cliente sin validar es hallazgo MAYOR.
- Propagar opId también a aprobar/rechazar del motor (sufijo determinista) con claim→ejecutar→finalizar; el motor es idempotente por opId.
- Transiciones = comandos orquestadores (comando de instancia del motor + sync al aggregate en UoW separada, sin comandos anidados en UoW).
