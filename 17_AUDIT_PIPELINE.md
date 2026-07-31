# 17_AUDIT_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de auditoría: la auditoría como propiedad estructural del Core, no como opción de cada módulo.
> Documento de diseño. Sin código, sin clases.

---

## 1. Principio

En DeltaOps **nadie "agrega auditoría"**: la auditoría emerge de la arquitectura misma. Tres fuentes, todas automáticas:

| Fuente | Qué captura | Dónde nace |
|---|---|---|
| **Eventos de dominio** | Todo cambio de la verdad, con contexto de ejecución completo (actor, delegante, canal, IA, tiempo doble) | El Unit of Work (08) — imposible cambiar sin evento |
| **Intentos denegados** | Autorización negada, con operación y motivo | Pipeline 14 §2.3 |
| **Accesos sensibles** | Lecturas de datos Restringidos, descargas firmadas | Pipelines 12/18 al servir, según clasificación (Kernel, 02) |

## 2. Las etapas (como consumidor)

```text
EVENTO DESPACHADO (10)
  1. ENCADENADO     eslabón de la cadena de huellas por tenant
                    (en el despachador, ETS-010/15 §2)
  2. PROYECCIÓN     réplica de consulta forense (audit_consulta):
                    líneas de tiempo por entidad, actor, periodo
  3. SELLADO        al congelar periodos: sello firmado exportable
                    (ETS-009/04 §5)
  4. VERIFICACIÓN   jobs programados: cadena íntegra, flujo↔réplica
                    reconciliados — divergencia = alerta de seguridad
```

## 3. Reglas normativas

1. **El Core no tiene "modo sin auditoría"**: ni en pruebas de carga ni en migraciones ni para administradores — el camino es uno (el UoW siempre emite; la reparación técnica excepcional queda ella misma auditada, ETS-011/19 de ETS-010 §3).
2. **La atribución es del Contexto de Ejecución** (02): el pipeline no reconstruye quién fue — lo exige presente desde el borde; comando sin actor atribuible no entra (los procesos de plataforma actúan como actor sistema, identificado).
3. **Auditoría legible**: la proyección forense traduce eventos a narrativa consultable (quién, qué, cuándo, dónde, con qué configuración, por qué canal) — la línea de tiempo de una OT es una consulta de un clic (ETS-004), no un trabajo de ingeniería.
4. **Separación de consulta** (ETS-010/15): las preguntas forenses corren contra `audit_consulta`, jamás contra las particiones calientes.
5. **La cadena es demostrable ante terceros**: sellos por periodo exportables al tenant; la integridad no exige confiar en DeltaOps (ETS-009/06).

---

## Impacto sobre la implementación
Nada que implementar "por módulo": la auditoría se hereda del UoW, el despachador y los pipelines; lo que se construye es plataforma (encadenado, proyección forense, sellos, verificaciones).

## ETS relacionados
ETS-009 (06 auditoría) · ETS-010 (15 almacenamiento físico) · ETS-006 (06 datos de auditoría) · ETS-011 (08, 10, 12, 14).

## Riesgos
- Payloads de eventos con datos Restringidos quedan eternos en el flujo → clasificación aplicada al diseñar cada evento (mínimo necesario en el payload; lo sensible se referencia).
- La proyección forense se rezaga y una investigación urgente no ve lo último → la investigación puede leer el flujo directo (gobernado); el retraso del cursor es visible.

## Decisiones habilitadas
Proyección forense, exportador de sellos, verificaciones programadas, panel de intentos denegados.

## Decisiones bloqueadas
Algoritmos de huella/firma y formato del paquete probatorio (con la implementación de seguridad, igual que ETS-010/15).
