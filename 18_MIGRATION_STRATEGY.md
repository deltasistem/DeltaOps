# 18_MIGRATION_STRATEGY.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de migración y recuperación granular: cambios de esquema, versiones, compatibilidad, rollback; y recuperación por tenant, módulo, objeto, evento y configuración.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Migración de esquemas: expandir → migrar → contraer

Todo cambio de estructura persistente sigue el patrón sin ventanas de corte (ETS-007/15 §4):

```text
1. EXPANDIR    agregar lo nuevo junto a lo viejo (columna, estructura,
               versión de esquema) — compatible con el código N-1
2. MIGRAR      poblar/convertir gradualmente, por lotes, medible,
               reanudable; el sistema opera normal durante todo el proceso
3. CONTRAER    retirar lo viejo SOLO cuando nada lo lee (verificado por
               telemetría de uso, no por suposición) — puede tardar versiones
```

- Prohibidos: cambios destructivos en un paso, migraciones que exigen parada, conversiones irreversibles sin periodo de convivencia.
- Cada migración es un artefacto versionado, revisado y ensayado contra una restauración de producción (17 §6) antes de tocar producción.

## 2. Las tres familias de "esquema" y sus reglas

| Familia | Regla de migración |
|---|---|
| **Plano de la verdad** | Lo ya escrito jamás se reescribe (04): los cambios son aditivos; leer historia vieja usa traducción al leer (upcasting, ETS-008/09 §4). Migrar datos históricos "para uniformar" está prohibido — la uniformidad la da la lectura, no la reescritura |
| **Eventos** | Versionado de esquema por tipo, aditivo, con convivencia N/N-1 (ETS-008/09): los eventos almacenados quedan en su versión para siempre |
| **Read models / derivados** | La migración es trivial por diseño: se construye la proyección nueva en paralelo por replay y se conmuta (08 §3) — nunca se "migra" un read model en sitio |

## 3. Compatibilidad y rollback

- Regla de oro: **el esquema N es utilizable por el código N-1** (fase expandir) — así el rollback de aplicación nunca exige rollback de datos.
- El rollback de una migración en curso = detener la fase de migrar y seguir operando en expandido (estado legítimo, sin prisa); el rollback tras contraer no existe — por eso contraer espera evidencia de no-uso.
- Los datos escritos por el código nuevo durante un rollback de aplicación quedan válidos: la compatibilidad es bidireccional dentro de N/N-1 (tolerancia del lector también en la persistencia).

## 4. Recuperación granular

Restaurar todo (17) es el último recurso; los casos reales son quirúrgicos:

| Ámbito | Estrategia |
|---|---|
| **Tenant** | Restauración del tenant completo a punto en el tiempo, en entorno aislado primero (verificación de cadena, conteos) y conmutación después; los demás tenants ni se enteran (14 §2) |
| **Módulo** | Los almacenes de un módulo se restauran/reconstruyen por su propiedad exclusiva (01 §4): la verdad del módulo desde respaldo, sus derivados por replay; los demás módulos siguen operando (degradación parcial declarada, ETS-007/13) |
| **Objeto** (un agregado dañado) | El daño en estado vigente se repara **reconstruyendo desde su historia** (02 §1); el binario perdido se recupera del almacén redundante por su huella (13 §4). Jamás edición manual "para arreglar": si la historia está bien, todo lo demás se deriva |
| **Evento** | Un evento perdido no existe como caso normal (outbox + respaldos inmutables); la sospecha se investiga por reconciliación y cadena (06 §2-3). La corrupción detectada se restaura del respaldo inmutable verificado — la cadena demuestra qué rango restaurar |
| **Configuración** | Volver a una versión anterior NO es restaurar un respaldo: es **publicar de nuevo la versión histórica** (acto de dominio auditado, ETS-005/12) — la historia de configuración conserva también el arrepentimiento |

- Toda recuperación es una operación auditada de plataforma: qué, por qué, quién autorizó, qué rango, verificación posterior.
- El error humano de negocio (borré/anulé mal) **no se recupera por respaldos**: se compensa por el dominio (16 §5) — los respaldos son para pérdida física, no para deshacer decisiones.
