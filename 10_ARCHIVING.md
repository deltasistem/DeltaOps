# 10_ARCHIVING.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de archivado: temperaturas, retención, recuperación y costo.
> Complementa el ciclo de vida de ETS-006/09. Regla heredada de 04: la respuesta al volumen jamás es borrar historia.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Temperaturas

```text
CALIENTE   operación viva: OTs abiertas, saldos, hechos recientes,
           read models activos → almacenamiento principal, índices completos
TIBIO      historia consultable con frecuencia media (1-3 años típico):
           hojas de vida, costos históricos → mismo motor, particiones
           antiguas con menos índices, compresión mayor (14)
FRÍO       historia profunda y evidencia legal: eventos viejos, OTs
           cerradas antiguas, binarios poco accedidos → almacén de objetos
           económico, formato abierto documentado, íntegro y verificable
```

- La transición es **por partición de tiempo** (14): mover un mes completo de hechos es una operación de particiones, no un baile de filas.
- Archivar **nunca cambia contratos**: la API sigue respondiendo; lo frío responde más lento o como operación asíncrona declarada (`202`), con el estado de temperatura visible en los metadatos de respuesta.
- Los binarios (evidencias, documentos) transitan por edad de acceso dentro del almacén de objetos (13); sus metadatos y huellas quedan siempre calientes (encontrar es caliente, traer puede ser frío).

## 2. Retención

| Dato | Régimen |
|---|---|
| Eventos / auditoría | La retención más larga del sistema; el mínimo lo fija plataforma, el tenant puede extender (nunca acortar por debajo del legal) |
| Hechos operativos | Permanentes (append-only); solo cambian de temperatura |
| Compras / evidencia contractual | Retención legal larga configurable por jurisdicción del tenant (ETS-005) |
| Telemetría cruda IoT | Corta (días-semanas) en zona de aterrizaje; lo aceptado como hecho es permanente (03 §8) |
| Read models / snapshots derivados | Sin retención: se regeneran (los de corte emitidos son hechos y siguen la regla de hechos) |
| Datos personales | Excepción gobernada: seudonimización al vencer la base legal, preservando integridad de la historia (ETS-006/13) |

La política de retención es **configuración versionada por tenant** dentro de los mínimos de plataforma; su aplicación es un proceso auditado (qué transitó, cuándo, bajo qué política y versión).

## 3. Recuperación

- **Consulta de lo tibio:** transparente (más lenta, frescura/latencia declaradas).
- **Consulta de lo frío:** operación asíncrona declarada — se solicita, se notifica al estar disponible en zona de consulta temporal, con vencimiento; el contrato ETS-008 (`/operaciones/{id}`) ya lo modela.
- **Rehidratación masiva** (auditoría externa, litigio, replay profundo): operación gobernada por rango y tenant, con verificación de integridad (la cadena de 06 §3 se re-verifica al rehidratar — lo que vuelve del frío demuestra que no fue alterado).
- Los paquetes fríos incluyen lo necesario para interpretarse solos: esquema de su época, versiones de configuración referenciadas, diccionario — un paquete de 2026 se entiende en 2036 sin el sistema de 2026 (formato abierto, ETS-006/09).

## 4. Costo

- El costo de almacenamiento **por tenant y temperatura es medible** (base del modelo SaaS: planes con límites de retención caliente, frío incluido por ser barato).
- Palancas por diseño: compresión agresiva de particiones tibias, formato columnar económico en frío, miniaturas calientes con originales fríos (13), telemetría cruda de vida corta.
- Regla de decisión: **lo barato es el frío, no el borrado** — el costo de mantener la historia completa fría es marginal frente al valor (auditoría, IA entrenable, gemelos futuros, 19); ninguna optimización de costo justifica perder hechos.
- El panel de plataforma (ETS-007/10) expone crecimiento y proyección por tenant: el costo se administra con datos, no con sustos.
