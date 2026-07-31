# 13_CATALOG_ARCHITECTURE.md

> **DeltaOps — ETS-005 · v1.0** · Catalog Engine: arquitectura unificada de catálogos.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

**Ningún valor de lista vive en el código.** Tipos de activo, combustibles, estados, prioridades, criticidades, especialidades, fabricantes, modelos, marcas, unidades, monedas, países, idiomas, tipos de documento, clasificaciones, causas raíz… todo es un **catálogo**: datos administrados con un único modelo, un único ciclo de vida y una única pantalla de administración. Agregar el combustible "GNV" o el tipo de activo "Dron" es un acto administrativo de minutos, no un desarrollo.

## 2. Modelo unificado de catálogo

Todo catálogo comparte la misma anatomía:

```text
Catálogo (ej. "Criticidades")
 ├── Naturaleza: plano / jerárquico (clasificaciones, ubicaciones de bodega)
 │              / dependiente (Modelo depende de Marca; Ciudad de País)
 ├── Capa: de plataforma (compartido) o de tenant (propio)
 └── Valores
      ├── Código estable (nunca cambia; es lo que referencian los hechos)
      ├── Nombre multiidioma + descripción + orden + ícono/color opcional
      ├── Atributos propios del catálogo (ver §4)
      ├── Estado: activo / inactivo (nunca borrado si fue usado)
      └── Vigencia y trazabilidad (quién, cuándo, versión)
```

## 3. Catálogos de plataforma vs. de tenant

| Capa | Catálogos | Regla |
|---|---|---|
| **Plataforma** (fabricante los mantiene) | Países, monedas, idiomas, unidades de medida (SI + usuales), husos horarios | El tenant **selecciona y habilita** un subconjunto; no los edita (una "hora" o un "COP" significan lo mismo en todo el mundo) |
| **Semilla** (plataforma propone, tenant adopta y adapta) | Tipos de activo base, combustibles, prioridades, criticidades, especialidades, causas raíz, tipos de documento | Vienen en la plantilla de industria; el tenant los clona y extiende |
| **Tenant** (100 % propios) | Marcas, modelos, fabricantes, clasificaciones internas, centros de costo, y cualquier catálogo **nuevo** que necesite | Creación libre, incluidos catálogos ad-hoc para sus formularios |

El tenant puede **crear catálogos nuevos completos** (ej. "Tipos de terreno") y usarlos de inmediato como tipo de campo en formularios (03), condición en reglas (05) y filtro en dashboards (07).

## 4. Catálogos con semántica (atributos propios)

Algunos catálogos llevan atributos que los motores de dominio leen — configurables, sin código:

| Catálogo | Atributos con efecto |
|---|---|
| **Tipos de activo** | Atributos dinámicos de la ficha, medidores esperados (horómetro/odómetro/ninguno), checklists aplicables, planes preventivos sugeridos, si consume combustible |
| **Combustibles** | Unidad (galón, litro, **kWh** — eléctrico es un combustible más, ETS-002), densidad opcional, factor de emisiones opcional |
| **Prioridades** | Peso de ordenamiento, SLA objetivo asociado |
| **Criticidades** | Efecto en priorización y en reglas ("checklist crítico" se define aquí) |
| **Unidades** | Magnitud y factores de conversión (plataforma) |
| **Monedas** | Decimales, formato (plataforma); tasas de cambio son datos operativos del tenant, no catálogo |
| **Causas raíz** | Jerarquía (sistema → subsistema → causa) para análisis de Pareto |

## 5. Reglas del motor

1. **Los hechos referencian el código, nunca el texto.** Renombrar "Alta" → "Urgente" cambia todas las vistas; el histórico sigue íntegro porque apunta al código.
2. **Nunca se borra lo usado.** Un valor referenciado por hechos solo se **inactiva**: deja de ofrecerse para uso nuevo, sigue legible para siempre. El motor ofrece **fusión asistida** de duplicados (evento auditado que redirige referencias futuras, sin reescribir pasadas).
3. **Multiidioma nativo:** cada valor tiene nombre por idioma habilitado; el validador advierte traducciones faltantes.
4. **Dependencias declaradas:** Modelo→Marca, Ciudad→País; el motor mantiene la integridad y las listas en cascada en formularios.
5. **Herencia por ámbito estándar** (ETS-005/02): un catálogo puede especializarse por sede/operación si el tenant lo permite.
6. **Importación masiva** (hojas de cálculo) con validación previa y reporte de duplicados/errores; exportación estándar.
7. **Todo cambio es evento auditado**, como el resto de la configuración.

## 6. Frontera

- Un catálogo lista y describe; **no contiene lógica**: qué hace el sistema con una criticidad la deciden reglas/workflows, no el catálogo.
- Los catálogos con semántica exponen solo los atributos que el producto define; si un catálogo "necesita comportamiento nuevo", es una petición de producto.
