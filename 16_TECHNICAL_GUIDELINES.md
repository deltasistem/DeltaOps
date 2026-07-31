# 16_TECHNICAL_GUIDELINES.md

> **DeltaOps — ETS-007 · v1.0** · Lineamientos técnicos normativos: las reglas que gobiernan toda implementación futura.
> Cierra la serie ETS-007. Documento de diseño. No implementa nada.

---

## 1. Las quince normas técnicas (NT)

| # | Norma |
|---|---|
| NT-01 | **El dominio manda.** Los módulos técnicos siguen a los bounded contexts (ETS-003); ninguna conveniencia técnica redefine una frontera de negocio. |
| NT-02 | **Monolito modular con fronteras ejecutables:** dependencias declaradas y verificadas en la construcción; una violación de frontera rompe la construcción, no la revisión (`02`). |
| NT-03 | **Comunicación solo por contratos:** interfaz pública o eventos. Prohibido leer datos de otro módulo; prohibidas las transacciones entre módulos (`04`). |
| NT-04 | **Si puede ser evento, es evento.** El síncrono se reserva para lo que bloquea la decisión del llamador, máximo un salto de profundidad. |
| NT-05 | **Hecho y evento, atómicos** (outbox); consumidores idempotentes con cursor propio; replay como operación normal (`04`, ETS-006). |
| NT-06 | **Tenant en toda clave, contexto en toda ejecución:** ninguna consulta, cache, cola o índice existe sin tenant; ningún comando sin contexto activo validado (`05`). |
| NT-07 | **Compatibilidad N/N-1 en todo lo que convive:** contratos, eventos, esquema, protocolo móvil. Evolución aditiva; lo incompatible es una versión nueva conviviendo (`15`). |
| NT-08 | **La cola local del dispositivo es sagrada:** cero pérdida de capturas; idempotencia extremo a extremo; conflictos resueltos por reglas de dominio en el servidor (`06`). |
| NT-09 | **Los binarios no atraviesan la aplicación:** subida y descarga directas al almacén con acceso firmado y mediado por permisos (`07`). |
| NT-10 | **Una sola puerta para lo externo** (Integration), con cuenta de servicio, ACL y las mismas validaciones que un humano. No existen rutas privilegiadas (`08`). |
| NT-11 | **La IA no tiene manos:** el módulo AI carece estructuralmente de dependencias de escritura; contexto por read models minimizados bajo el alcance del asistido (`09`). |
| NT-12 | **Instrumentado de nacimiento:** logs estructurados sin datos sensibles, métricas por tenant/módulo, correlación extremo a extremo; los presupuestos UX (ETS-004/11) se miden en producción y su regresión es un defecto (`10`). |
| NT-13 | **Cache honesto:** solo con frescura declarada o invalidación por evento; datos de seguridad jamás por tiempo ciego; instancias sin estado propio (`11`). |
| NT-14 | **Seguridad como estructura:** tokens cortos con refresco rotativo, revocación inmediata, secretos en bóveda sin lectura, cifrado en tránsito y reposo, rotación ensayada (`12`). |
| NT-15 | **Desplegar no es liberar:** imagen única inmutable por versión, expandir→migrar→contraer, flags para liberar, rollback ensayado, sondas con reversa automática (`15`). |

## 2. Decisiones por defecto (cuando la implementación dude)

- **¿Consistencia o disponibilidad?** Fuerte dentro del agregado; eventual y **declarada** entre proyecciones. Nunca fingir frescura.
- **¿Dónde va esta lógica?** Invariante → agregado (dominio). Reacción → regla/consumidor. Presentación → read model. Adaptación externa → ACL de borde. Si no encaja: la frontera está mal planteada, revisar antes de forzar.
- **¿Optimizar ya?** No: medir contra los presupuestos (ETS-004/11) y optimizar lo que los incumple. El diseño (CQRS, caches, particiones) ya da el margen; usarlo cuando los datos lo pidan (`13`).
- **¿Nueva dependencia/servicio externo?** Solo gestionado, con equivalente estándar, detrás de una interfaz propia (`14` §1); toda dependencia es deuda de operación.
- **¿Excepción "solo por esta vez"?** No existe. Si el caso es legítimo, es una capacidad de la plataforma (ETS-005 N-01 aplicado a la técnica).
- **¿Falla y nadie se entera?** Prohibido: toda ruta de error termina en bandeja visible, alerta con dueño o rechazo explícito en lenguaje de negocio. El silencio es el único fallo inaceptable.

## 3. Calidad exigible a la implementación

1. **Pruebas por contrato público** de cada módulo (incluidas las de fuga cross-tenant, `05` §1) — la suite es la definición ejecutable de las fronteras.
2. **Pruebas de los flujos de ETS-004** (los 15 user flows) de extremo a extremo, incluida la sincronización offline con conflictos de la tabla ETS-006/14.
3. **Verificaciones de arquitectura automatizadas:** grafo de dependencias, no-exportación de internos, esquemas por módulo, ausencia de escritura desde AI.
4. **Presupuestos de rendimiento como pruebas:** los tiempos U-01…U-10 se verifican con perfiles realistas antes de cada release mayor.
5. **Simulacros calendarizados:** restauración (ETS-006/15), rotación de claves (`12` §7), rollback (`15` §4) — con evidencia auditada.

## 4. Traza documental (dónde vive cada respuesta)

| Pregunta | Serie |
|---|---|
| ¿Qué es el negocio y sus invariantes? | ETS-003 (dominio) |
| ¿Cómo se usa? | ETS-004 (experiencia) |
| ¿Cómo se adapta sin código? | ETS-005 (configuración) |
| ¿Cómo viven los datos? | ETS-006 (datos) |
| ¿Cómo se construye y opera? | **ETS-007 (esta serie)** |

---

**Fin de la serie ETS-007.** La arquitectura técnica queda definida: monolito modular de 22 módulos con fronteras ejecutables, comunicación por contratos y eventos, multi-tenancy estructural, offline como nodo productor, archivos mediados, integraciones por una sola puerta, IA sin manos, observabilidad y seguridad de nacimiento, y un camino de evolución a servicios que se recorre por dolor medido — todo coherente con ETS-001…006 y listo para gobernar la implementación cuando esta comience.
