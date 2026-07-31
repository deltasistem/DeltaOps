# 17_API_GOVERNANCE.md

> **DeltaOps — ETS-008 · v1.0** · Gobierno de la API: versionado, deprecaciones, breaking changes, compatibilidad, documentación, testing y revisión.
> Documento de diseño. No implementa nada.

---

## 1. Principio de gobierno

La API es un producto con contrato público: **cada cambio es una promesa que se administra**, no un commit que se despliega. Nadie cambia un contrato sin pasar por este gobierno — incluido el propio equipo de DeltaOps para sus clientes internos (web, móvil, IA): todos son clientes iguales (`01` §1).

## 2. Versionado

- Versión mayor en la ruta; dentro de una mayor, **solo evolución aditiva** (`01` §§3-4).
- Regla N/N-1 universal: API, eventos, protocolo de sync y SDKs conviven con su versión anterior como mínimo.
- Una versión mayor nueva es un acontecimiento raro y planificado (años, no meses): el costo lo pagan todos los clientes, así que se agrupa y se justifica.

## 3. Clasificación de cambios

| Clase | Ejemplos | Proceso |
|---|---|---|
| **Aditivo** (permitido en la versión vigente) | Campo opcional nuevo, endpoint nuevo, valor nuevo en catálogo abierto, error nuevo, evento nuevo | Revisión estándar (§6) + checklist (`18`) |
| **Corrección de contrato** (la especificación mentía) | Documentar el comportamiento real | Revisión estándar; si el comportamiento real rompe clientes, se trata como breaking |
| **Breaking** (prohibido en la vigente) | Quitar/renombrar campos o endpoints, cambiar tipos/semántica, endurecer validación, cambiar defaults observables, cambiar significado de un código de error | Versión mayor nueva **o** deprecación completa (§4) — jamás silencioso |

Ante la duda, es breaking. El árbitro es el efecto sobre un cliente correcto existente, no la intención del autor.

## 4. Deprecaciones

```text
1. ANUNCIO      canal de novedades + cabeceras Deprecation/Sunset en las
                respuestas del endpoint afectado, con fecha y alternativa
2. TELEMETRÍA   uso del elemento deprecado medido por tenant/cuenta
                (`10_OBSERVABILITY` ETS-007): se sabe exactamente a quién afecta
3. ACOMPAÑAMIENTO  aviso dirigido a los consumidores activos restantes
                (tenants y cuentas de servicio identificables)
4. RETIRO       solo al cumplirse la fecha anunciada Y con uso residual
                cercano a cero o gestionado caso a caso; el retiro
                responde error claro con la alternativa, nunca 404 mudo
```

Plazos mínimos de plataforma (meses, proporcionales al impacto); los elementos de seguridad pueden acelerar con aviso extraordinario justificado.

## 5. Documentación

- La especificación (`16`) es la documentación primaria: publicada, versionada, con historial y diffs navegables.
- **Novedades por versión** (changelog) en lenguaje de consumidor: qué se agregó, qué se depreca, qué se retira y cuándo — cada entrada enlaza la operación afectada.
- Guías por escenario (empezar, webhooks, sync, integrar un ERP) mantenidas junto a la especificación y validadas contra ella (ejemplos que compilan/ejecutan).
- Nada indocumentado es contrato: lo que no está en la especificación puede cambiar sin aviso — y los clientes lo saben.

## 6. Revisión (el cambio de contrato como decisión)

- Todo cambio de especificación pasa por **revisión de contrato** antes de implementarse: pares del módulo + guardián del contrato (rol rotativo con autoridad sobre coherencia global).
- La revisión valida contra: este gobierno, el checklist (`18`), el diccionario de negocio (nombres), la coherencia con ETS-003…007 y el impacto en SDKs y clientes.
- El artefacto de revisión es el **diff de la especificación** (`16` §2) — pequeño, legible, discutible.
- Los cambios de catálogos transversales (errores `07`, sobres `06`, cabeceras `02`) tienen revisión reforzada: afectan a todo cliente.

## 7. Testing del contrato

1. **Pruebas de contrato por operación:** la implementación se verifica contra la especificación (formas, códigos, sobres, ejemplos) en la construcción — la deriva es imposible de desplegar.
2. **Pruebas de compatibilidad:** la suite de la versión N-1 corre contra la implementación N (lo viejo sigue funcionando); ruptura = construcción fallida.
3. **Pruebas de fuga cross-tenant en todo contrato público** (ETS-007/05 §1) y de permisos (denegado por defecto verificado por operación).
4. **Pruebas de los invariantes del contrato:** idempotencia (repetir comando = mismo resultado), paginación estable, tolerancia del lector (campos extra inyectados no rompen), errores con sobre único y correlación.
5. Los ejemplos de la especificación se ejecutan como pruebas (`16` §6).

## 8. Métricas de gobierno

Uso por operación/versión/tenant, adopción de versiones, elementos deprecados en uso, errores 4xx por código (¿el contrato confunde?), latencia contra presupuestos — revisadas periódicamente: el gobierno opera con datos, no con opiniones.
