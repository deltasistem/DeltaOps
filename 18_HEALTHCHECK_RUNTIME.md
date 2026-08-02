# 18 — Health Checks

> **DeltaOps — ESI-003 · v1.0** · Dos sondas con contratos distintos: ¿estoy vivo? y ¿puedo servir?
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Las dos sondas oficiales

| Sonda | Pregunta | Evalúa | Consumidor |
|---|---|---|---|
| **Vida** (liveness) | ¿El proceso responde? | Solo que el proceso atiende; sin dependencias | Orquestador: si falla, reemplaza el proceso |
| **Disponibilidad** (readiness) | ¿Puedo aceptar trabajo? | Estado del ciclo de vida (doc 03) + dependencias críticas | Balanceador: si falla, retira tráfico |

Confundirlas es el error clásico: una BD caída debe sacar al proceso del balanceador (disponibilidad negativa), no provocar su reinicio en bucle (vida negativa). Por eso **la sonda de vida jamás consulta dependencias**.

## 2. Diseño de la sonda de disponibilidad

1. Evalúa el estado del ciclo de vida: INICIANDO y DRENANDO responden negativo; LISTO positivo; DEGRADADO positivo **si** lo caído es no crítico.
2. Cada dependencia registrada declara su **criticidad**: crítica (BD) o no crítica (integraciones externas, doc 24). La lista y su criticidad se declaran en el arranque (doc 02, paso 8).
3. Las verificaciones de dependencias se ejecutan **en segundo plano con caché de resultado** (frescura del plano plataforma, doc 08); la sonda responde con la última foto. **Por qué:** una sonda que interroga la BD en cada consulta del balanceador amplifica los incidentes justo cuando el sistema sufre.
4. La respuesta detalla el estado por dependencia **solo para consumo interno** (red interna/operación); hacia fuera la sonda es binaria. Nada de versiones, hosts ni detalles de infraestructura en respuestas accesibles públicamente (doc 15, regla de no filtración).

## 3. Workers

Los workers exponen las mismas dos sondas. Su disponibilidad significa "estoy consumiendo bandejas": un worker vivo pero con el consumo detenido responde disponibilidad negativa y dispara alerta (doc 17), porque la edad de bandeja crecería en silencio.

## 4. Reglas normativas

1. **Rutas públicas por lista cerrada** (doc 10, regla 4): las sondas son las únicas rutas sin autenticación junto a las de acceso.
2. **Baratas y sin efectos**: una sonda jamás escribe, jamás dispara trabajo, jamás toma bloqueos.
3. **Sin lógica de negocio**: la salud es técnica; el estado funcional del negocio se mide en observabilidad (doc 17), no en sondas.
4. **La criticidad se decide en diseño, no en el incidente**: añadir una dependencia obliga a declarar su criticidad en el mismo PR (checklist ESI-002/25, bloque alrededores).
5. **Salud continua**: las mismas verificaciones alimentan métricas de dependencia (doc 17); las sondas y los tableros cuentan la misma historia.

## Impacto sobre la implementación

El DGP de plataforma implementa ambas sondas, el registro de dependencias con criticidad y el verificador en segundo plano. El despliegue (ESI-002/09-10) las consume tal cual.

## Dependencias

Docs 02, 03, 08, 10, 15 y 17; ESI-002/09 y /10.

## Riesgos

- Sondas costosas que amplifican incidentes; mitigación: verificación en segundo plano con caché (regla de diseño 3).
- Dependencias sin criticidad declarada tratadas como críticas por defecto y tumbando disponibilidad; mitigación: declaración obligatoria en el arranque; el arranque falla si falta.

## Decisiones habilitadas

- Despliegues sin pérdida apoyados en disponibilidad (doc 03).
- Alertas de dependencia coherentes entre sondas y tableros.

## Decisiones bloqueadas

- Prohibido consultar dependencias en la sonda de vida.
- Prohibidas sondas con efectos colaterales o bloqueos.
- Prohibido exponer detalle de infraestructura en sondas públicas.
