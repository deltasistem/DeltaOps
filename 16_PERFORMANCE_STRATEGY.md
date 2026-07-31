# 16_PERFORMANCE_STRATEGY.md

> **DeltaOps — ETS-006 · v1.0** · Estrategia de rendimiento: caching, índices conceptuales, proyecciones, lecturas, escrituras y escalabilidad.
> Documento de diseño. No implementa nada.

---

## 1. Principio

El rendimiento es una **propiedad del diseño de datos**, no una optimización posterior: CQRS, proyecciones por consumidor y eventos append-only existen, entre otras razones, para que la plataforma escale leyendo sin castigar la escritura. Los presupuestos de ETS-004 (`11_CRITERIOS_USABILIDAD.md`) son el contrato: tanqueo ≤ 60 s, búsqueda ≤ 3 interacciones, cambio de contexto < 3 s, campo utilizable en 3G.

## 2. Escrituras

1. **Camino corto y sagrado:** validar → confirmar agregado + evento → responder. Todo lo demás (proyecciones, reglas, notificaciones, marts) ocurre **después y aparte** — la captura de campo nunca espera a un dashboard.
2. **Append-only = escritura barata:** sin ediciones en caliente ni bloqueos largos; los agregados son pequeños por diseño (ETS-003) y las transacciones, mínimas.
3. **Ráfagas absorbidas:** colas de entrada para sincronización masiva (cuadrilla que recupera señal) e IoT; la plataforma nivela picos sin rechazar hechos.
4. **Idempotencia como protección:** los reintentos no duplican trabajo ni datos.

## 3. Lecturas

1. **Cada pregunta tiene su proyección** (→ `12_READ_MODELS.md`): las pantallas leen datos con su forma final; no se calculan agregaciones al vuelo en la ruta caliente.
2. **Paginación y alcance siempre:** ninguna consulta abierta "todo el historial"; el alcance organizacional y temporal acota por diseño.
3. **Caliente/frío:** la operación vive sobre datos recientes y abiertos; lo archivado se consulta por rutas propias sin ensuciar los índices calientes (→ `09`).
4. **Búsqueda por índice dedicado:** el buscador global no compite con la operación (índice propio, actualizado por eventos).

## 4. Caching (capas)

| Capa | Qué cachea | Invalidación |
|---|---|---|
| Dispositivo móvil | Paquete de alcance completo (es más que cache: es el modo offline) | Delta-sync por cursor |
| Cliente web | Configuración resuelta, catálogos, preferencias | Por versión publicada (la cascada es determinista → cacheable) |
| Servicio | Resolución de configuración por contexto, permisos evaluados por sesión+contexto, read models calientes | Por evento (publicación, cambio de membresía) — nunca por tiempo ciego en datos de seguridad |
| Analítica | Vistas materializadas y resultados de widgets | Por corte declarado (la frescura visible es el contrato) |

Regla: **cachear solo lo que declara su frescura o se invalida por evento.** Prohibido el cache que miente (número viejo presentado como actual).

## 5. Índices conceptuales

Sin diseñar motor alguno, la estrategia exige acceso eficiente por los caminos reales de consulta:

- Por **tenant + contexto organizacional** (el filtro universal).
- Por **entidad + tiempo** (línea de tiempo de un activo/OT — el patrón dominante).
- Por **responsable + estado** (bandejas: mis OTs, cola de aprobación).
- Por **clave de negocio** (folio, placa, código — búsqueda exacta instantánea).
- Por **vencimiento** (documentos, SLAs, contratos — lo que el calendario vigila).
- Texto libre solo en el índice de búsqueda dedicado.

## 6. Escalabilidad

1. **Por tenant, naturalmente particionable:** el aislamiento multi-tenant (Core) hace que datos, colas, índices y respaldos escalen horizontalmente por tenant sin rediseño.
2. **Por tiempo:** los hechos particionan por antigüedad (caliente/frío) — el crecimiento histórico no degrada la operación diaria.
3. **Consumidores independientes:** proyecciones, reglas, notificaciones y marts escalan cada uno por su lado (cursores propios, → `10`); un pico analítico jamás frena la captura.
4. **Degradación selectiva declarada:** bajo presión extrema se protege captura + sincronización + aprobaciones; dashboards y reportes degradan su frescura visiblemente (→ `15`).
5. **Presupuestos vigilados en producción:** los tiempos reales por flujo (U-01…U-10) se miden continuamente; una regresión de rendimiento es un defecto, no una curiosidad.
