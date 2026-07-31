# 19_FUTURE_EVOLUTION.md

> **DeltaOps — ETS-009 · v1.0** · Evolución futura de la persistencia: series de tiempo, lakehouse, data warehouse, IoT a escala, gemelos digitales e IA.
> Regla de toda evolución: motores nuevos entran **detrás de los mismos contratos** (ETS-008) y consumiendo el mismo flujo de eventos — nada de lo aquí previsto cambia un solo contrato ni un solo hecho ya escrito.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Por qué el diseño ya está preparado

Tres decisiones de esta serie hacen barata toda la evolución:

1. **El flujo de eventos como fuente replayable** (01): cualquier motor nuevo se puebla por replay + suscripción — sin migración destructiva ni doble escritura artesanal.
2. **Neutralidad de motor por capacidades** (01 §5): los módulos hablan con contratos de persistencia, no con un producto.
3. **Los derivados son desechables** (07): mover un read model a otro motor es reconstruirlo allá y conmutar (08 §3).

## 2. Series de tiempo

- **Primer candidato de especialización** (señalado en 03 §8 y 15 §6): lecturas de medidores y telemetría aceptada superan el patrón del motor relacional cuando el IoT escala.
- Movimiento previsto: motor de series de tiempo como consumidor del flujo (y de la zona de aterrizaje IoT), sirviendo las consultas de series (tendencias, agregaciones por ventana, downsampling automático caliente→histórico) tras los mismos contratos de consulta.
- La verdad no se muda: el hecho aceptado sigue naciendo en el plano de la verdad; la serie de tiempo es su proyección optimizada. El disparador es operativo (volumen/latencia medidos), no de moda.

## 3. Lakehouse

- Evolución natural del archivado frío (10 §3): las particiones históricas en formato columnar abierto **ya son la mitad de un lakehouse** — falta solo el motor de consulta federada encima para analítica profunda sin rehidratación.
- Habilita: análisis de flota multi-año, entrenamiento de modelos sobre historia completa, exploración ad-hoc de científicos de datos del tenant — todo sobre copias curadas, jamás sobre la operación (14 §4).
- El diccionario de datos y el linaje (ETS-006/07, 18_METADATA) viajan con las particiones: el lakehouse nace gobernado, no como pantano.

## 4. Data warehouse

- Los marts de BI (07 §3) son hoy el warehouse mínimo viable. Cuando la analítica multi-tenant de plataforma (benchmarks anónimos entre flotas, ETS-006) o la escala lo pidan, se gradúan a un warehouse dedicado — poblado por los mismos eventos, con el mismo contrato de marts hacia Power BI (nadie aguas abajo nota el cambio de motor).
- La agregación cross-tenant solo con anonimización gobernada y opt-in contractual: el aislamiento por tenant sobrevive a la analítica global.

## 5. IoT a escala

- La ruta ya trazada: MQTT como adaptador de la misma puerta (ETS-008/13 §6) + zona de aterrizaje elástica + condensación en la ACL (solo hechos aceptados llegan a la verdad) + series de tiempo (§2) para lo crudo consultable.
- A gran escala se agrega procesamiento de flujo en la zona de aterrizaje (agregación por ventana, detección de umbrales **antes** de persistir) — la regla se mantiene: la verdad recibe hechos condensados y validados por dominio, jamás el diluvio crudo.

## 6. Gemelos digitales

- El gemelo de un activo es, en datos, **lo que esta serie ya persiste**: identidad estable (12), historia completa (hoja de vida por eventos), estado vigente, series de medidores, jerarquía de componentes, configuración aplicada.
- La evolución es de presentación y frecuencia, no de modelo: telemetría casi en tiempo real (§5), modelos 3D/planos como binarios versionados (13), y simulación ("¿qué pasa si extiendo el intervalo de mantenimiento?") corriendo sobre réplicas del gemelo — la simulación jamás escribe hechos (misma regla que la IA).
- No se crea un "almacén de gemelos": el gemelo es una vista compuesta de lo existente.

## 7. IA

- Crece sobre las reglas ya fijadas (07 §4): contexto por petición desde read models minimizados, índices de recuperación por tenant reconstruibles, sugerencias como hechos trazables.
- Evoluciones previstas: índices semánticos más ricos (fallas, manuales, historia de OTs) como derivados desechables; features pre-calculadas para modelos predictivos como vistas materializadas más (08, mismo régimen); entrenamiento solo sobre datos del propio tenant o agregados anonimizados con opt-in (ETS-005/11).
- Lo que jamás cambia: la IA no escribe hechos, no tiene almacén privilegiado y toda su salida es explicable y trazable — la escala no relaja el gobierno.

## 8. Disciplina de adopción

Un motor nuevo entra solo con: (a) dolor medido que el actual no resuelve, (b) plan de replay y conmutación sin ventana de mentira, (c) los mismos contratos hacia arriba, (d) respaldo/recuperación equivalentes (17) y (e) salida documentada (cómo se abandonaría). Lo que no pase esa puerta es deuda disfrazada de modernidad.
