# 13_DATA_TYPES.md

> **DeltaOps — ETS-010 · v1.0** · Tipos de datos oficiales: el mapa concepto→tipo PostgreSQL, cerrado y sin excepciones improvisadas.
> Documento de diseño. Sin SQL.

---

## 1. El mapa oficial

| Concepto | Tipo PostgreSQL | Regla |
|---|---|---|
| Identidad (`id`, `id_*`) | `uuid` | Siempre; nunca texto (05) |
| Instantes (`*_en`) | `timestamptz` | Siempre UTC; el motor jamás guarda hora local |
| Fechas civiles (`fecha_*` de día completo) | `date` | Solo donde el dominio es de día (vigencias de calendario) |
| Dinero | `numeric(19,4)` + `moneda` (código ISO en texto corto) | Jamás flotantes; la moneda acompaña siempre al monto (multi-moneda por tenant, ETS-005) |
| Cantidades físicas | `numeric` con escala por unidad + `id_unidad` (FK a `nucleo.unidad_medida`) | La cantidad sin unidad no existe; conversión es lógica de dominio |
| Medidores/acumulados | `numeric(14,2)` | Precisión estable para horómetros/odómetros |
| Porcentajes | `numeric(5,2)` 0–100 con CHECK | No fracciones 0–1 (convención única) |
| Texto corto (nombres, códigos) | `text` con CHECK de longitud donde el dominio la fije | Sin `varchar(n)` arbitrarios: el límite es de negocio o no es |
| Texto largo (descripciones, notas) | `text` | Límites por API (ETS-008/06), no por tipo |
| Estados/enumeraciones | `text` + CHECK contra catálogo cerrado | NO tipos ENUM nativos (alterarlos es rígido); los catálogos abiertos del tenant van por FK a catálogos (ETS-005/13) |
| Booleanos | `boolean` NOT NULL con default explícito | Sin ternarios implícitos; lo desconocido se modela, no se anula |
| Estructuras dinámicas | `jsonb` | Solo en los usos oficiales de 14 |
| Huellas/hashes | `text` en hex/base64 declarado | Uniforme en 22 |
| Secuencias técnicas | `bigint` | Solo internas (05 §4) |
| Geoposición | `numeric` lat/lon (pares) | PostGIS solo si el dominio geoespacial crece (21) — no en el arranque |
| Duraciones | `interval` evitado en persistencia: se guardan instantes/minutos enteros según el caso | La aritmética de calendario es del dominio |

## 2. Reglas transversales

1. **NOT NULL por defecto**: la nulabilidad es una decisión documentada por columna (22), no el estado natural.
2. **El tipo no sustituye la validación**: el dominio valida rangos y formatos primero (12 §2); el tipo garantiza sanidad física.
3. **Sin tipos exóticos sin puerta**: arrays, rangos nativos, tipos compuestos, extensiones — solo con justificación registrada y aprobación de convenciones (07 §5). Uso previsto y admitido: `tstzrange` para vigencias si simplifica los predicados de intervalo (decisión única, aplicada uniforme).
4. **Colación**: única y neutra en toda la BD (determinista); la ordenación lingüística por idioma del usuario es de presentación, no de almacenamiiento.

---

## Impacto sobre la implementación
El DDL y los modelos de la capa de acceso a datos usan este mapa sin desviaciones; el lint (07) verifica tipo por concepto (una columna `*_en` que no sea `timestamptz` es defecto).

## ETS relacionados
ETS-009 (03 plantilla del hecho, 12 identidad) · ETS-005 (unidades, monedas, catálogos del tenant) · ETS-008 (02 UTC ISO-8601) · ETS-010 (12 CHECKs, 14 JSONB, 22 diccionario).

## Riesgos
- `numeric` sin escala pactada produce comparaciones sorpresa → escalas fijadas aquí y en 22 por concepto.
- ENUM nativos introducidos por costumbre → prohibición explícita con alternativa (CHECK/catálogo).

## Decisiones habilitadas
DDL tipado, generación de modelos tipados de los SDK internos, lint de tipos.

## Decisiones bloqueadas hasta el siguiente ETS
Adopción de `tstzrange` (decisión única pendiente de ensayo) y cualquier extensión (PostGIS) — con el DDL y evidencia.
