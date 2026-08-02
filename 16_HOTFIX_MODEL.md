# 16 — Hotfix Model

> **DeltaOps — ESI-009 · v1.0** · El modelo de hotfix: el atajo gobernado — mínimo, acelerado, jamás exento — y su regreso obligatorio a la principal.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

El hotfix corrige un defecto grave en la versión liberada cuando esperar al tren normal (doc 10 §2.8) es inaceptable. Es un **atajo de velocidad, no de calidad**: recorta espera, jamás verificación. Su primera pregunta es siempre: ¿de verdad no basta la reversa (doc 14) o el toggle (doc 12)? El hotfix es el tercer recurso, no el primero.

## 2. Reglas normativas

1. **Solo para S1/S2** (doc 15) o defectos que rompen promesas de contrato en la versión liberada; lo demás viaja en el tren — el "hotfix" de conveniencia degrada el término y el proceso.
2. **Nace de la etiqueta liberada** (doc 03): rama de hotfix desde la versión en producción, con el cambio **mínimo necesario** — nada de aprovechar el viaje; el refactor oportunista en un hotfix es un hallazgo bloqueante.
3. **Todas las puertas, revisión acelerada**: las puertas estáticas y las suites afectadas corren completas (docs 07-08); la revisión (doc 06) es inmediata y prioritaria, con el segundo revisor si la categoría lo exige — se acelera a las personas, no se apagan las máquinas.
4. **Versión parche etiquetada** (doc 11): el hotfix produce una versión inmutable que recorre la cadena de entornos en modo acelerado (preproducción como mínimo) — el hotfix directo a producción sin ensayo es la excepción S1 extrema, decidida y registrada por el conductor del incidente.
5. **Regreso obligatorio a la principal**: el cambio se integra a la principal de inmediato (por el flujo normal); el defecto que revive en la siguiente versión porque el hotfix nunca volvió es la regresión más evitable y más vergonzosa del catálogo.
6. **El contrato de entrega aplica entero**: los nueve rubros (doc 05 §2.2), con Rollback especialmente afilado — el hotfix que empeora las cosas debe poder revertirse en segundos.
7. **Todo hotfix alimenta la retrospectiva**: ¿por qué el defecto llegó a producción? ¿qué puerta, prueba o revisión faltó? — la respuesta se promueve (doc 15 §2.8); el hotfix repetido sobre la misma zona es señal de deuda estructural (doc 17).

## Impacto sobre la implementación

El circuito acelerado (aprobaciones, entornos mínimos) se define en el DGP de entrega; las versiones sujetas a hotfix las define el ciclo de soporte (doc 11 §2.6).

## Dependencias

Docs 03, 05-08, 10-12, 14-15, 17.

## Riesgos

- El circuito acelerado volviéndose el camino habitual ("todo es urgente"); mitigación: el criterio S1/S2 explícito, la métrica de frecuencia de hotfix (doc 18) con umbral, y la retrospectiva obligatoria que encarece el atajo.

## Decisiones habilitadas

- Corrección de defectos graves en horas sin sacrificar verificación.
- Confianza de clientes en el ciclo de soporte declarado.

## Decisiones bloqueadas

- Prohibido el hotfix para lo que cabe en el tren.
- Prohibido el hotfix sin regreso inmediato a la principal.
- Prohibido apagar puertas o suites en el circuito de hotfix.

## Reusable Pattern

Atajo de espera, no de verificación + mínimo necesario + regreso obligatorio + retrospectiva: la urgencia gobernada — rápida sin volverse salvaje.

## Anti-Patterns

- El hotfix que aprovecha para "mejorar tres cosas más".
- Parchar producción y olvidar la principal.
- La cultura donde todo defecto es "hotfixeable" para saltarse la fila.

## Knowledge Graph

- **ETS que consume**: ETS-012 (promesas de soporte que el hotfix honra).
- **ESI que consume**: los regímenes de esta serie (docs 05-08, 14-15) aplicados en modo acelerado.
- **DGP que originará**: el circuito acelerado y sus aprobaciones en el DGP de entrega.
- **ADR relacionados**: ADR de hotfix como atajo de espera; ADR de regreso obligatorio.
- **Módulos que reutilizarán este patrón**: todos; el hotfix repetido en un módulo dispara revisión de su deuda.
