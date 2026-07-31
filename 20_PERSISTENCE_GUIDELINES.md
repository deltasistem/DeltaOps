# 20_PERSISTENCE_GUIDELINES.md

> **DeltaOps — ETS-009 · v1.0** · Lineamientos normativos de persistencia: las reglas que todo diseño e implementación futura debe obedecer, con su checklist.
> Cierra la serie ETS-009. Documento de diseño. Sin tablas, sin SQL.

---

## 1. Normas de persistencia (NP)

| # | Norma | Detalle |
|---|---|---|
| NP-01 | **Dos planos**: la verdad es transaccional y respaldada; lo derivado es 100 % reconstruible | 01 |
| NP-02 | **Hechos y eventos jamás se editan ni borran**; correcciones solo por compensación enlazada con motivo | 04, 16 |
| NP-03 | **Una transacción = un agregado + sus eventos + outbox**; nada cruza agregados transaccionalmente | 02, 16 |
| NP-04 | **Tenant obligatorio en toda estructura** de ambos planos; imposible consultar sin tenant | 14 |
| NP-05 | **Cada dato tiene un solo módulo dueño**; nadie lee el almacén de otro módulo | 01 |
| NP-06 | **UUID de nacimiento, generado donde se crea, jamás cambiado ni reutilizado**; el folio lo asigna el servidor al confirmar | 12 |
| NP-07 | **Tiempo doble en todo hecho** (fechaNegocio + fechaRegistro); proyecciones por fecha de negocio; partición física por fecha de registro | 03, 14 |
| NP-08 | **Todo lo versionable persiste como versiones inmutables completas** con vigencias; lo publicado es eterno | 05 |
| NP-09 | **Todo hecho referencia las versiones de configuración que lo gobernaron** | 03, 05 |
| NP-10 | **La auditoría es el flujo de eventos** con cadena de integridad verificable y sellos por periodo; jamás una tabla que se llena a mano | 06 |
| NP-11 | **Los binarios viven en el almacén de objetos, inmutables, con metadatos y huella en la verdad**; acceso solo firmado | 13 |
| NP-12 | **La eventualidad se declara, jamás se disimula**; frescura visible, lectura de la propia escritura garantizada | 16 |
| NP-13 | **El volumen se administra por partición, temperatura y snapshot — jamás borrando historia** | 09, 10, 14 |
| NP-14 | **Bajas solo lógicas y con semántica de dominio**; el pasado nunca se recorta | 11 |
| NP-15 | **Se respalda la verdad con inmutabilidad y verificación criptográfica; lo derivado se reconstruye**; un respaldo no probado no existe | 17 |
| NP-16 | **Esquemas migran por expandir→migrar→contraer**; N legible por N-1; lo histórico se traduce al leer, jamás se reescribe | 18 |
| NP-17 | **Motores nuevos entran detrás de los mismos contratos, poblados por replay**, con plan de salida | 19 |

## 2. Checklist de persistencia

Todo diseño de persistencia nuevo (una estructura, un read model, una vista, un almacén) responde antes de aprobarse:

**Clasificación**
- [ ] ¿Es verdad o derivado? (NP-01) Si es derivado: ¿su reconstrucción por replay está definida y probada?
- [ ] ¿Qué módulo es el dueño único? (NP-05) ¿Qué familia de datos es y qué régimen le corresponde (01 §3)?

**Estructura**
- [ ] ¿Lleva tenant + contexto organizacional? (NP-04) ¿Clave de partición por tiempo si es flujo de hechos? (NP-07)
- [ ] ¿Identidad UUID + folio si lo ven humanos? (NP-06) ¿Tiempo doble si registra hechos? (NP-07)
- [ ] ¿Referencia versiones de configuración si un hecho depende de ellas? (NP-09)

**Régimen de cambio**
- [ ] Si es hecho/evento: ¿es append-only estricto y su corrección es compensatoria? (NP-02)
- [ ] Si es versionable: ¿versiones inmutables completas con estados y vigencias? (NP-08)
- [ ] Si es maestro: ¿su baja es lógica con semántica de dominio y precondiciones? (NP-14)

**Operación**
- [ ] ¿La transacción respeta la frontera del agregado con outbox? (NP-03)
- [ ] ¿Frescura declarada si es derivado? (NP-12) ¿Con cursor propio y bandeja de errores?
- [ ] ¿Plan de crecimiento: partición, temperatura, snapshot? (NP-13) ¿Proyección de volumen a 5 años?
- [ ] ¿Índices mínimos en la verdad, riqueza en los derivados? (15)

**Protección**
- [ ] ¿Cubierto por el respaldo de la verdad o declarado reconstruible? (NP-15) ¿Probado en restauración de prueba?
- [ ] ¿Clasificación de datos aplicada (Restringido minimizado, cifrado por tenant)? (ETS-006/13)
- [ ] Si audita algo: ¿nace del flujo de eventos, no de escritura manual? (NP-10)
- [ ] Si es binario: ¿objeto inmutable + metadato con huella + acceso firmado? (NP-11)

**Evolución**
- [ ] ¿El esquema puede evolucionar expandir→migrar→contraer sin parada? (NP-16)
- [ ] Si introduce un motor nuevo: ¿pasa la puerta de adopción completa? (NP-17, 19 §8)

**Regla final:** un punto no aplicable se justifica por escrito, jamás se omite en silencio.

---

**Fin de la serie ETS-009.** La estrategia de persistencia de DeltaOps queda definida: dos planos (verdad append-only respaldada, derivados reconstruibles), persistencia por agregado y por hecho, versionado inmutable, auditoría con integridad criptográfica, read models y vistas con frescura declarada, snapshots, archivado por temperatura sin pérdida, bajas lógicas de dominio, identidad UUID-first con resolución offline, tres almacenes, particionado por tenant y tiempo, rendimiento pagado en el momento barato, consistencia fuerte por agregado y eventual declarada, respaldo verificado, migraciones sin corte, evolución preparada y 17 normas con checklist — coherente con ETS-001…008 y lista para gobernar cualquier implementación futura.
