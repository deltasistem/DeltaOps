# 03_QUERY_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Flujo estándar de una Query: leer sin tocar, con frescura honesta.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. El flujo canónico

```
1. RECEPCIÓN      adaptador traduce el canal a la consulta del contrato
2. TELEMETRÍA     traza y correlación
3. AUTORIZACIÓN   capacidad + inyección del alcance organizacional (ETS-011/12)
4. VALIDACIÓN     solo de forma (filtros, paginación, rangos)
5. LECTOR         un lector de read model ejecuta; jamás tablas de verdad
6. RESPUESTA      datos + frescura declarada + cursor de paginación
```

No hay idempotencia (leer dos veces es inocuo), no hay configuración congelada (no hay decisión), no hay Unit of Work (no hay escritura).

## 2. Reglas de implementación

1. **Una consulta = un lector = un read model**: si la pantalla necesita dos formas de datos, son dos consultas del catálogo o un read model diseñado para esa pantalla (ETS-004 manda: los read models se diseñan desde la pantalla, no desde las tablas).
2. **El alcance no es un filtro que el módulo recuerda**: el pipeline lo inyecta (paso 3) y el lector lo aplica siempre; un lector que puede ejecutarse sin alcance es un defecto, no una función avanzada. Segunda muralla: RLS físico (ETS-010/12).
3. **Cero lógica de negocio en lectores**: el lector proyecta, filtra, ordena y pagina lo ya calculado; si una cifra hay que calcularla al leer, falta un consumidor que la proyecte (ETS-011/20).
4. **Frescura declarada, no supuesta**: toda respuesta de read model derivado lleva su frescura real (retraso del cursor, ETS-011/12 §2.4); el implementador jamás la inventa ni la omite.
5. **Paginación por cursor, no por offset**, en toda lista que crece (ETS-008/05): el cursor es opaco para el cliente y estable ante inserciones.
6. **Consultas as-of declaran su eje temporal**: fechaNegocio o fechaRegistro, explícito en el contrato — nunca ambigüedad de tiempo doble (ETS-006).
7. **Sin efectos, ni pequeños**: una consulta no marca "visto", no registra "último acceso" en estado de negocio, no calienta cachés de dominio. Si el negocio necesita registrar la lectura (acceso sensible), eso es auditoría estructural del pipeline (ETS-011/17), no del lector.

## 3. Qué escribe el implementador de una consulta nueva

| Artefacto | Contenido |
|---|---|
| Entrada de catálogo | la operación de lectura en ETS-008, con su eje temporal y frescura esperada |
| Metadatos | permiso, read model fuente |
| Lector | proyección + filtros + orden + paginación sobre el read model |
| (Si el read model no existe) | el consumidor que lo proyecta (10) y su cursor |
| Pruebas | lector contra read model poblado en memoria; matriz de alcance |

---

## Impacto sobre la implementación
Toda pantalla se alimenta de consultas con esta forma; la tentación de "un join rápido a las tablas de verdad" queda prohibida por la regla 5 del manual y verificada en revisión.

## ETS relacionados
ETS-011 (12, 10, 20) · ETS-008 (04-05 catálogo de consultas y paginación) · ETS-010 (12 RLS, 15 read models) · ETS-004 (pantallas).

## Riesgos
- Lectores acumulando cálculo de negocio por presión de una pantalla → la corrección es proyectar, no calcular; se detecta en revisión y por presupuesto de latencia.
- Frescura omitida "porque casi siempre es instantánea" → el contrato la exige siempre.

## Decisiones habilitadas
Read models por pantalla, paneles de frescura, generación de lectores desde el catálogo.

## Decisiones bloqueadas
Tecnología de consulta y almacenamiento de read models — ya normada físicamente en ETS-010; el stack se decide después.
