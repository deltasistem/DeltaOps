# 16 — Logging en el Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · Qué registra un módulo bien educado — y todo lo que no registra.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El principio

El runtime de logging está congelado (ESI-003/16): estructurado, con correlación, tenant y actor automáticos. Lo que este ejemplar fija es **la disciplina de uso del módulo**: qué líneas emite, con qué nivel y qué campos.

## 2. Las líneas del módulo de referencia (catálogo completo)

| Momento | Nivel | Campos propios |
|---|---|---|
| Elemento activado (éxito del comando) | INFO | identificador, código natural, versión nueva |
| Denegación por Policy (límite alcanzado) | INFO | identificador, límite, activos actuales |
| Transición ilegal intentada | INFO | identificador, estado actual, transición pedida |
| Conflicto de concurrencia | WARNING | identificador, versión esperada/encontrada |
| Proyección actualizada (consumidor) | DEBUG | identificador de evento, resultado |
| Divergencia detectada en verificación de proyección | ERROR | conteos esperado/encontrado |

**Y nada más.** El log de acceso, las denegaciones de capacidad/permiso, los errores técnicos y las métricas ya los emite la plataforma (ESI-003/10, /16, /17): el módulo no los duplica.

## 3. Qué demuestra

1. **El presupuesto de ruido en la práctica** (ESI-003/16 regla 5): seis tipos de línea bastan para un módulo completo. Un módulo real tendrá más hitos, no más categorías.
2. **Negocio denegado es INFO, no ERROR**: los "no" del dominio son operación normal; ERROR queda reservado a lo que exige acción (la divergencia de proyección).
3. **Datos en campos, jamás interpolados**; nombres de campo del lenguaje ubicuo.
4. **Ni un dato sensible**: el ejemplar no tiene PII por diseño, y aún así demuestra la regla: nunca se loguea el contenido completo de entrada, solo identificadores.

## 4. Reglas normativas

1. El catálogo de líneas del módulo **se documenta** en su documentación (doc 20): revisable, auditable, con campos declarados.
2. Añadir una línea nueva pasa por la revisión normal; añadir un campo nuevo verifica la lista de campos permitidos (ESI-003/16).

## Impacto sobre la implementación

Las plantillas T01/T07 traen los puntos de log del patrón ya colocados; el DGP de módulo redacta su catálogo de líneas como parte de la documentación.

## Dependencias

ESI-003/10, /16 y /17; docs 05, 09, 15 y 20 de esta serie.

## Riesgos

- Módulos reales copiando el minimalismo sin criterio y quedando ciegos en flujos complejos; mitigación: la regla es "hitos de negocio y anomalías", no "seis líneas"; el catálogo documentado obliga a pensarlo.

## Decisiones habilitadas

- Auditoría del logging por catálogo declarado, módulo a módulo.
- Detección de duplicación módulo-plataforma en revisión.

## Decisiones bloqueadas

- Prohibido duplicar en el módulo lo que la plataforma ya registra.
- Prohibido loguear cuerpos de entrada o datos sensibles.
- Prohibido ERROR para denegaciones de negocio.

## Reusable Pattern

Los DGP futuros copian: la técnica del catálogo de líneas declarado (tabla §2 como formato), la regla de niveles §3.2, y la frontera módulo/plataforma ("y nada más").

## Anti-Patterns

- Log por paso ("entrando a la función…", "saliendo…").
- Mensajes con datos interpolados imposibles de consultar.
- Silencio total: un módulo sin hitos tampoco es auditable operativamente.
