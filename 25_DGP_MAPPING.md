# 25 — Relación con DGP

> **DeltaOps — ESI-007 · v1.0** · Cómo el programa de seguridad se materializa en DGP: tres paquetes propios, secciones en todos los demás y el orden que regula el portafolio.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los tres DGP propios del programa

| DGP | Contenido | Documentos fuente |
|---|---|---|
| **DGP-Identidad** | Identidad/cuentas, autenticación (métodos, federación, dispositivo de campo), sesiones, delegación entre usuarios, RBAC y asignaciones, restricción de alcance, ciclo de credenciales humanas, desvinculación de privacidad | 02-08, 12, 15 |
| **DGP-Plataforma de Seguridad** | Almacén de secretos y resolución por identidad, registro de eventos de seguridad y motor de señales, límites y firma de superficie, credenciales no humanas, baterías (contrato de error, ZT, no-fuga), detección de secretos en puerta, modelos de amenazas R1 | 09-13, 17, 22 |
| **DGP-Gobierno** | Registro de gobierno (vistas derivadas + secciones propias), mapeos de cumplimiento, informes de derechos, score con umbrales, rituales y evaluación de madurez, vistas de tenant empresarial | 14-16, 18-21 |

## 2. Orden y encaje con el portafolio

1. **DGP-Identidad y DGP-Plataforma de Seguridad preceden al primer módulo en producción real** (madurez M1, doc 21 §2.2): sin identidad, sesiones, RBAC y secretos gobernados no hay producción con clientes — el portafolio de ESI-005/27 y las olas de ESI-006/26 los asumen como suelo.
2. **DGP-Gobierno acompaña a la Ola 1** y debe estar operando para M2 (rubros declarados + score con fuentes) — el gobierno crece con el sistema, no después de él.
3. **Todo DGP (módulo, servicio, pieza) incorpora las secciones de seguridad**: los seis rubros (01 §3), clasificación por campo (16), propuesta de riesgo con razonamiento (19), roles plantilla (07), step-up en comandos que aplique (03), SC-01…SC-12 en la definición de terminado (22) y la plantilla de revisión por riesgo (23).
4. **Dependencias explícitas**: DGP-Gobierno depende de los dos primeros; los tres dependen de las piezas de Kernel congeladas (ESI-003); las capacidades empresariales (federación, vistas de tenant, aprobación de soporte) son entregas incrementales dentro de sus DGP, activables por tenant.
5. **Cita, no repetición**: los DGP citan esta serie como norma; su contenido nuevo es lo específico (contratos, plantillas, runbooks, baterías).

## 3. Declaración (los seis rubros)

- **Clasificación**: el plan = interno (I).
- **Riesgo**: R2 (función de planificación).
- **Permisos**: los del portafolio (gobierno de plataforma).
- **Auditoría**: decisiones de secuencia por el proceso registrado.
- **Retención**: planes versionados permanentes.
- **Evidencias**: el grafo de dependencias de DGP publicado con el portafolio.

## Impacto sobre la implementación

El portafolio total queda: extensiones de plataforma + **DGP-Identidad + DGP-Plataforma de Seguridad** (suelo) → Ola 1 + DGP-Gobierno → olas siguientes; las secciones de seguridad amplían la plantilla única de DGP.

## Dependencias

Docs 01-23; ESI-005/27; ESI-006/26; ESI-002 (proceso de generación).

## Riesgos

- La tentación de "producción primero, seguridad después" por presión de calendario; mitigación: la regla §2.1 es de madurez (doc 21 §2.2), citable y bloqueante — el debate se resuelve por norma, no por reunión.

## Decisiones habilitadas

- Plan de construcción completo con la seguridad como suelo secuenciado.
- Venta empresarial alineada a entregas (capacidades incrementales).

## Decisiones bloqueadas

- Prohibido el primer módulo en producción real antes de M1.
- Prohibidos DGP sin las secciones de seguridad de §2.3.
- Prohibido duplicar norma de esta serie dentro de DGP.

## Reusable Pattern

Tres DGP propios + secciones transversales en todos + reguladores de madurez: el encaje del programa en el portafolio — replicable por cualquier programa transversal futuro.

## Anti-Patterns

- El "DGP de seguridad" monolítico que bloquea todo lo demás años.
- Secciones de seguridad copiadas entre DGP sin adaptar (rubros genéricos).
- Capacidades empresariales prometidas sin entrega incremental planificada.

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (el producto que ordena), ETS-012 (mercado).
- **ESI que consume**: ESI-002; ESI-005/27; ESI-006/26.
- **DGP que originará**: DGP-Identidad, DGP-Plataforma de Seguridad, DGP-Gobierno; secciones en todos los demás.
- **ADR relacionados**: ADR de seguridad-como-suelo (doc 26).
- **Módulos que reutilizarán este patrón**: todos incorporan las secciones §2.3 en sus DGP.
