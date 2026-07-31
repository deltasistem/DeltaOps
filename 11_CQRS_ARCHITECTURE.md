# 11_CQRS_ARCHITECTURE.md

> **DeltaOps — ETS-006 · v1.0** · Arquitectura CQRS: separación de comandos y consultas.
> Documento de diseño. No implementa nada.

---

## 1. Principio

Escribir y leer son problemas distintos con modelos distintos:

- El **modelo de escritura** existe para proteger invariantes: pequeño, normalizado alrededor de los agregados (ETS-003), transaccional.
- Los **modelos de lectura** existen para responder rápido a cada consumidor: desnormalizados, específicos, reconstruibles.

Ni las pantallas consultan el modelo de escritura, ni nadie escribe en un modelo de lectura.

## 2. Lado de los comandos (escritura)

```text
COMANDO ("cerrar OT", "registrar tanqueo", "aprobar OC")
  1. Autenticación + permisos en el contexto activo (ETS-004/10)
  2. Validación declarativa (formulario/workflow/reglas de la versión vigente)
  3. El AGREGADO verifica sus invariantes (una OT cerrada no recibe horas;
     una lectura no retrocede sin permiso especial)
  4. Acepta → EVENTO(s) de dominio confirmados atómicamente con el estado
     Rechaza → error explícito en lenguaje de negocio (nunca silencio)
```

Reglas:

1. **Un comando, un agregado, una transacción.** Operaciones que tocan varios agregados se coordinan por eventos y compensación, no con transacciones gigantes.
2. **Comandos idempotentes** por clave de origen (doble toque, reintento offline, reenvío de integración — U-19).
3. **El comando expresa intención de negocio** ("trasladar activo"), nunca manipulación de datos ("actualizar campo").
4. **Autoría completa:** usuario o cuenta de servicio, dispositivo, canal, y si medió sugerencia de IA, quién decidió.

## 3. Lado de las consultas (lectura)

- Cada consumidor tiene **su** read model, con la forma exacta de su pregunta (→ `12_READ_MODELS.md`): la bandeja "Mis OTs" no es la tabla de OTs; es una proyección por técnico, ordenada por prioridad, con lo necesario para decidir.
- Las consultas **no ejecutan lógica de negocio**: solo filtran, ordenan y presentan lo ya proyectado, bajo los permisos del usuario.
- Frescura declarada: cada read model conoce y expone su atraso respecto al flujo de eventos.

## 4. Consistencia

1. **Fuerte donde importa:** dentro del agregado (el cierre de la OT y su evento son atómicos). El usuario que ejecuta un comando ve su efecto inmediatamente (lectura de su propia escritura en su sesión).
2. **Eventual donde escala:** entre proyecciones (el KPI del dashboard puede tardar minutos). La interfaz lo hace visible en lugar de fingir instantaneidad (U-17/U-20).
3. **Verificable siempre:** procesos periódicos comparan proyecciones contra eventos; discrepancia = regenerar proyección (la fuente gana), con registro del hallazgo.

## 5. Reconstrucción (replay) como operación normal

- Cualquier read model puede **regenerarse desde cero** reproduciendo los eventos: al corregir un defecto de proyección, al crear una vista nueva, al recuperar de un desastre parcial.
- El replay corre en paralelo sin detener la operación: se construye la versión nueva, se verifica y se conmuta.
- Nuevos consumidores (un mart nuevo, una capacidad de IA) nacen con historia completa gracias al replay — no "desde hoy".

## 6. Qué NO es este CQRS

- **No es doble captura:** nadie escribe dos veces; los read models solo se alimentan de eventos.
- **No es una base de reportes divergente:** todo linaje termina en los mismos eventos.
- **No es complejidad por moda:** donde el dominio es trivial (preferencias de usuario), el modelo de lectura y escritura pueden coincidir — CQRS se aplica donde el volumen y los consumidores lo justifican (hechos operativos, analítica), no como dogma uniforme.
