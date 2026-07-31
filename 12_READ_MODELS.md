# 12_READ_MODELS.md

> **DeltaOps — ETS-006 · v1.0** · Read models: modelos de lectura por consumidor.
> Documento de diseño. No implementa nada.

---

## 1. Principio

Cada consumidor recibe una proyección con **la forma exacta de su pregunta**: desnormalizada, filtrada por permisos y alcance, con frescura declarada y linaje a los eventos. Ninguno lee el modelo de escritura.

## 2. Catálogo de read models por consumidor

### Power BI / BI externo
- **Marts curados por área** (mantenimiento, combustible/energía, compras, inventario, costos): hechos con sus dimensiones (activo, tipo, sede/operación de la época, proveedor, periodo), con los mismos números que los dashboards internos (Motor de Indicadores).
- Refresco programado (típico: horario o diario), incremental por fecha de evento.
- **Permisos por conjunto y por ámbito:** la credencial de BI es una cuenta de servicio con alcance; nunca acceso crudo a la base.
- Diccionario de campos publicado (→ `18_METADATA_STRATEGY.md`): el analista sabe qué significa cada columna sin preguntar.

### Dashboards internos (ETS-005/07)
- Proyecciones por widget: KPI con tendencia y umbral, series por periodo, rankings, semáforos de flota.
- Frescura por widget (tiempo real para bandejas, minutos para KPIs); **cada agregado conserva el enlace a su lista de hechos** (drill-down ≤ 3 clics, U-36).
- Se calculan por contexto organizacional y se filtran por los permisos del usuario en el momento de ver, no de calcular.

### Buscador global
- Índice unificado de entidades (activos, OTs, solicitudes, ítems, proveedores, documentos, personas) con: identidad, folio, textos buscables, sinónimos del diccionario del tenant, contexto y permisos precalculados.
- Actualización casi inmediata por eventos; resultado en ≤ 3 interacciones (U-07); lo archivado también se indexa (marcado como histórico).

### IA (ETS-005/11)
- Vistas de contexto por entidad: "todo lo relevante de este activo" (ficha + historial resumido + fallas + costos + planes) listo para razonar sin recorrer el sistema.
- Siempre bajo el alcance del usuario asistido, con exclusiones del tenant aplicadas **antes** de llegar al modelo; el linaje registra qué vistas alcanzó cada sugerencia.

### Reportes y exportaciones
- Proyecciones tabulares planas por tipo de reporte (hoja de vida, consumos, backlog, kardex, expediente de OT) generadas al corte, con marca de fecha/ámbito/versión, listas para PDF/hoja de cálculo con el branding del tenant.
- Los reportes emitidos son **documentos** (se conservan como se emitieron), no consultas vivas.

### Mobile (offline)
- **Paquete de alcance:** lo que este usuario necesita sin señal — sus OTs y solicitudes, activos de su frente (ficha compacta + últimas lecturas), catálogos y formularios vigentes, stock básico de su bodega.
- Optimizado en tamaño (fichas compactas, evidencias bajo demanda), delta-sincronizable (solo cambios desde la última sincronización) y con versión declarada (→ `14_OFFLINE_SYNCHRONIZATION.md`).

### Operación (bandejas y fichas)
- Bandejas por rol ("Mis OTs", cola de aprobación, despachos pendientes) ordenadas por prioridad/SLA con el mínimo para decidir.
- Fichas 360°: Hoja de Vida del activo, expediente de OT, kardex del ítem — proyecciones canónicas de ETS-003.

## 3. Reglas comunes

1. **Nacen y mueren sin drama:** crear un read model nuevo = replay de la historia; retirarlo no toca la fuente.
2. **Permisos en la lectura:** la proyección puede precalcular ámbitos, pero la autorización final es del momento de la consulta (membresías con vigencia).
3. **Frescura visible** en toda superficie (U-17/U-20); ningún consumidor finge tiempo real.
4. **Sin lógica de negocio:** un read model nunca decide; presenta. Las decisiones son comandos.
5. **Linaje obligatorio:** de todo número mostrado se puede llegar a sus eventos (drill-down o traza de mart).
