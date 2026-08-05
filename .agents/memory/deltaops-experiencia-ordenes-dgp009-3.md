---
name: Experiencia Órdenes DGP-009.3
description: Lecciones de la experiencia operacional de Work Orders (contratos frontend↔API, offline literal, composición idempotente).
---

# Experiencia Órdenes de Trabajo (DGP-009.3)

- **Los contratos del frontend deben verificarse contra los schemas Zod/OpenAPI reales, no contra suposiciones**: enviar campos inventados (tipoRecurso vs clase/referenciaId; metadatos sueltos vs {expectedVersion, evidencia:{attachmentId}}) es hallazgo CRÍTICO — el servidor rechaza tanto online como en sync. Mantener una suite de tests de contrato que valide los cuerpos de petición contra el JSON OpenAPI congelado (online con spy de fetch Y encolados offline).
- **"Todo funciona offline" es literal para cualquier captura cuyo input ya sea completo en cliente** (plantilla+versión+datos+opId): declararla online-only es hallazgo MAYOR. Solo operaciones que necesitan acuñar un recurso remoto (attachmentId) pueden ser online-only con error explícito.
- **Composición multi-comando en rutas HTTP deja huérfanos**: guardar→enviar→anclar sin transacción ni recuperación es MAYOR. Patrón aceptado: UN comando orquestador del módulo, idempotente por opId, con ids deterministas derivados del opId (respuestaId, sub-opIds :borrador/:enviar), que releé la versión actual del agregado para anclar y solo sella el recibo tras el anclaje; replay del mismo opId converge sin duplicados. Reejecutable desde /sync y la cola offline.
- **IDOR en rutas anidadas**: un endpoint /:id/recurso/:subId debe verificar que subId pertenece a :id (y aplicar la autorización del padre) antes de firmar URLs o devolver datos — firmar solo por subId es CRÍTICO.
- Timeline fusionada de varias fuentes (historial+bitácora) debe ordenarse por ocurridoAt; concatenar por fuente es MAYOR.
- La captura debe renderizar la definición Dynamic Forms REALMENTE asociada (clave+versión exacta resuelta del runtime), no una plantilla fija local; la respuesta queda anclada a esa clave+versión.
- No importar el barrel @workspace/dynamic-forms en código de browser (arrastra createHmac de Node y rompe el build): usar el subpath /definicion.
- El DS Tabs monta todos los paneles: en centros con N bandejas, hacer UNA consulta al read model y derivar bandejas en cliente (no N fetches).
- Definiciones locales de formulario con titulo/etiqueta vacíos lanzan en validarDefinicion al importar el módulo.
