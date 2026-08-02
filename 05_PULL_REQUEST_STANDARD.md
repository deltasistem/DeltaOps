# 05 — Pull Request Standard

> **DeltaOps — ESI-009 · v1.0** · El estándar de pull request: la unidad de integración con contrato de nueve rubros, tamaño acotado y puertas antes que ojos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El PR como contrato de entrega

El PR es donde el cambio declara su contrato (doc 01 §2.3). No es un aviso de merge: es la solicitud formal de entrada a la principal, con todo lo necesario para juzgarla — la instancia en código del principio "la declaración precede" (ESI-008/05).

## 2. Reglas normativas

1. **Un PR, una intención**: la unidad de revisión coincide con la unidad de cambio (doc 03 §2.2); el PR que mezcla intenciones se parte antes de pedir revisión.
2. **El contrato de nueve rubros es obligatorio**: todo PR declara **Objetivo, ETS relacionados, ESI relacionados, DGP relacionados, Riesgos, Evidencias, Pruebas, Rollback y Observabilidad**. Los rubros sin contenido dicen "ninguno" con justificación breve — el silencio no es una opción. La plantilla es mecánica; la puerta rechaza el PR incompleto.
3. **Tamaño acotado con umbral**: el DGP define el umbral de tamaño (líneas efectivas, archivos); superarlo exige partición o justificación explícita (migraciones generadas, renombres masivos). El PR gigante no se revisa: se aprueba por cansancio — y eso es lo que el umbral bloquea.
4. **Puertas antes que ojos**: la revisión humana solo empieza con las puertas en verde (doc 07); el revisor no es un linter caro.
5. **Las dependencias entre PR se declaran**: cadenas de PR (por partición, doc 03) declaran su orden en el contrato; el PR que depende de otro no se integra antes.
6. **Rollback y observabilidad no son opcionales**: el rubro Rollback dice cómo se deshace (revert simple, contracción de esquema, toggle off — doc 14); Observabilidad dice qué señal confirmará en producción que el cambio funciona (doc 10 §2.7). Un PR que no sabe deshacerse ni observarse no está listo.
7. **El PR se cierra integrando o descartando**: PR abiertos sin actividad más allá del umbral van al tablero de higiene (doc 18); el PR eterno es la rama zombi con público.
8. **Cambios especiales, rubros reforzados**: migraciones de esquema, cambios de contrato N/N-1, permisos y superficies de seguridad (ESI-007/22) marcan su categoría en el contrato y activan revisión reforzada (doc 06 §2.5).

## Impacto sobre la implementación

La plantilla de contrato y los umbrales de tamaño se configuran en la plataforma de repositorio; la verificación de rubros completos es puerta mecánica.

## Dependencias

Docs 01, 03-04, 06-07, 10, 14, 18; ESI-007/22; ESI-008/05 (patrón).

## Riesgos

- El contrato degenerando en texto ritual copiado; mitigación: la revisión verifica coherencia entre contrato y diff (doc 06 §2.2) y las retrospectivas de incidente (doc 15) auditan contratos de los cambios implicados — el contrato falso queda expuesto donde más cuesta.

## Decisiones habilitadas

- Revisión eficiente sobre cambios chicos con contexto completo.
- Auditoría de cualquier liberación hasta su contrato original.

## Decisiones bloqueadas

- Prohibido integrar sin contrato de nueve rubros completo.
- Prohibida la revisión humana con puertas en rojo.
- Prohibido integrar PR con dependencias declaradas sin resolver.

## Reusable Pattern

Contrato de nueve rubros + tamaño acotado + puertas primero: el PR como comando de integración con precondiciones — no como conversación abierta.

## Anti-Patterns

- El PR de 4.000 líneas "urgente" aprobado en diez minutos.
- Descripción vacía: "ver título".
- Usar el PR como entorno de desarrollo (cientos de commits de prueba sobre la rama).

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-007/22 (superficies sensibles); ESI-008/05 (contrato que precede).
- **DGP que originará**: plantilla de contrato y umbrales en el DGP de entrega.
- **ADR relacionados**: ADR del contrato de entrega de nueve rubros.
- **Módulos que reutilizarán este patrón**: todos integran por PR con contrato; sin excepciones.
