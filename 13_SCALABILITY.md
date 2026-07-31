# 13_SCALABILITY.md

> **DeltaOps — ETS-007 · v1.0** · Estrategia de escalabilidad: escalado horizontal, vertical, separación futura, servicios y mensajería.
> Documento de diseño. No implementa nada.

---

## 1. Precondiciones ya diseñadas (por qué el monolito escala)

El monolito modular escala porque su diseño lo permite por construcción:

- **Instancias sin estado:** ninguna instancia guarda sesión ni estado en memoria propia (`11` §2); cualquier petición puede atenderla cualquier instancia.
- **CQRS + eventos:** la lectura escala por proyecciones y caches; la escritura, corta y sagrada, no espera a nadie (ETS-006/16).
- **Particionable por tenant y por tiempo** (ETS-006/16): datos, colas, índices y cuotas segmentan naturalmente.
- **Consumidores con cursor propio:** proyecciones, reglas, notificaciones y marts avanzan a su ritmo; el atraso es visible y aislado (`10`).

## 2. Escalado horizontal (la vía principal)

| Qué | Cómo escala |
|---|---|
| Instancias de aplicación | Réplicas idénticas tras el balanceador; escalado automático por latencia/saturación, no por hora del día |
| Consumidores de eventos | Por grupos: más trabajadores por consumidor atrasado, con orden preservado por agregado (paralelismo por clave de agregado) |
| Colas de entrada (sync móvil, IoT) | Trabajadores elásticos; las ráfagas se absorben, no se rechazan |
| Trabajos pesados (replays, reportes, exportaciones) | Colas dedicadas con presupuesto por tenant (`05` §5) — jamás compiten con la ruta interactiva |
| Lecturas de base de datos | Réplicas de lectura para read models y analítica; la escritura permanece en el primario (coherente con frescura declarada) |
| Almacén de archivos y CDN | Escalan por servicio gestionado (`14`) |

## 3. Escalado vertical (la vía táctica)

- Legítimo para el **primario de base de datos** (la escritura del patrimonio) y cargas puntuales de proyección, mientras el particionado por tenant/tiempo no exija más.
- Regla: el vertical compra tiempo; el horizontal compra futuro. Toda decisión vertical se registra con su límite esperado y su plan siguiente.

## 4. Escalado de datos (cuando crece de verdad)

1. **Primera palanca — tiempo:** archivado caliente/frío agresivo (ETS-006/09); la operación diaria trabaja sobre datos recientes y abiertos.
2. **Segunda palanca — lectura:** más réplicas/proyecciones; los marts y el índice de búsqueda ya viven aparte lógicamente.
3. **Tercera palanca — tenant:** partición física por grupos de tenants (los más grandes pueden aislarse en su propia partición de datos **sin cambiar una línea de contrato** — el tenant ya es parte de toda clave).
4. **Última palanca — extracción de módulos** (§5).

## 5. Separación futura en servicios

El camino de extracción está definido en `01_PLATFORM_ARCHITECTURE.md` §3 (fases 0–3, patrón estrangulador). Complemento operativo:

- **Disparadores medidos, no estéticos:** se extrae cuando la observabilidad demuestra perfil de carga incompatible (ingesta IoT), necesidad de aislamiento de fallos (AI con dependencias externas) o límite real de despliegue conjunto — con el dolor cuantificado (`10` métricas de arquitectura).
- **Orden probable:** Integration/IoT → AI → Search → Analytics/marts → Files. Los módulos fundacionales y de dominio, juntos hasta que exista una razón de peso.
- **Invariantes ante la topología:** contratos, eventos, multi-tenancy, seguridad y observabilidad no cambian con la extracción — solo el transporte.

## 6. Mensajería

- **Hoy:** bus interno durable con outbox transaccional (`04` §5) — la semántica (al-menos-una-vez, orden por agregado, cursores, replay) es la definitiva.
- **Mañana (con extracción):** un módulo extraído se puentea a **mensajería externa gestionada** conservando idéntica semántica; los consumidores no distinguen el transporte.
- **Regla de neutralidad:** ningún módulo depende de particularidades del transporte (garantías exóticas, orden global, exactamente-una-vez): la semántica pactada es el mínimo común portable.

## 7. Límites de servicio y degradación

- **Presupuestos por flujo** (ETS-004/11) vigilados en producción; el escalado automático defiende los presupuestos, no promedios abstractos.
- **Degradación selectiva declarada** (ETS-006/15): bajo presión extrema se protege captura, sincronización y aprobaciones; dashboards y reportes degradan frescura visiblemente.
- **Pruebas de carga como práctica:** perfiles realistas (pico de turno: cuadrillas sincronizando + checklists masivos a las 5:30) ensayados antes de cada temporada de crecimiento, no después del primer incidente.
