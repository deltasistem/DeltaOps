# 14_AI_API.md

> **DeltaOps — ETS-008 · v1.0** · Contratos del asistente y las capacidades de IA: preguntas, contexto, sugerencias, diagnóstico, explicaciones y retroalimentación.
> Gobierno en ETS-005/11; arquitectura en ETS-007/09. Principio inviolable: **la IA propone, no dispone** — no existe contrato de escritura para la IA.
> Documento de diseño. No implementa nada.

---

## 1. Conversaciones (asistente)

- `POST /ia/conversaciones` abre un hilo; `POST /ia/conversaciones/{id}/mensajes` pregunta (texto + entidad de anclaje opcional: "estoy viendo esta OT").
- **Contexto construido por petición** desde read models minimizados bajo el alcance del asistido (ETS-007/09 §3): lo que el usuario no puede listar, no entra — estructural.
- Respuesta: contenido + **fuentes citadas** (entidades, documentos con versión y sección cuando hay recuperación) + marca IA siempre presente (U-40) + advertencia de confianza cuando aplica.
- Respuestas honestas: `CONTEXTO_INSUFICIENTE` cuando no hay fundamento en el alcance — el asistente jamás inventa (`07` §7); caídas del proveedor son degradación explícita (`PROVEEDOR_IA_NO_DISPONIBLE`).
- Hilos por usuario y sesión, con expiración; jamás compartidos entre usuarios (memoria gobernada, ETS-007/09 §4).

## 2. Sugerencias

Las capacidades proactivas (diagnóstico, preventivos, inventario, vigilancia de consumo) emiten **sugerencias**, no acciones:

- `GET /ia/sugerencias` — vigentes e históricas, filtrables por capacidad/entidad/estado; cada una con su **trazabilidad completa**: qué vistas y versiones vio, qué propuso, con qué confianza, quién decidió y cuándo.
- Visibilidad recortada: una sugerencia solo la ve quien podría ver los datos que la sustentan.
- Vigencia: el mundo cambia y las sugerencias caducan (`SUGERENCIA_VENCIDA`); nunca se muestra consejo sobre un estado que ya no existe.

## 3. Aceptar / descartar (el humano decide)

- `POST /ia/sugerencias/{id}/aceptacion` — registra la adopción; **el hecho resultante lo comanda el humano** por el endpoint normal del dominio (crear la solicitud, ajustar el plan) con sus propios permisos; el hecho queda marcado como asistido por IA (U-40) y enlazado a la sugerencia.
- `POST /ia/sugerencias/{id}/descarte` — con motivo opcional; alimenta la calibración del tenant (umbrales por capacidad, ETS-005/11).
- No existe "aceptar y ejecutar": la aceptación jamás ejecuta el comando de dominio por sí sola — la arquitectura no deja atajo (ETS-007/09 §7).

## 4. Diagnóstico asistido

Contrato específico de la capacidad estrella del técnico (UC/F de ETS-004):

- Petición anclada a una OT/hallazgo: síntomas descritos (o los ya registrados).
- Respuesta: hipótesis ordenadas por probabilidad, cada una con su **evidencia**: fallas similares del tipo de activo (con folios enlazados), fragmentos de manual citados (documento+versión+sección), repuestos usados en casos parecidos.
- Todo enlazado y navegable (drill-down a los casos, U-05); el técnico registra su diagnóstico real por el comando normal (`RegistrarDiagnostico`) — con marca de asistencia si adoptó la hipótesis.
- Disponible offline en modo degradado explícito: sin señal no hay IA; el contrato no simula (la app lo dice).

## 5. Explicaciones

- Toda salida de IA es **explicable en lenguaje de negocio**: `GET /ia/sugerencias/{id}` incluye el razonamiento presentable ("consumo 32 % sobre la media de su flota en 30 días, sin OT reciente") y sus datos sustento enlazados.
- Las vigilancias configuradas (anomalías) explican su línea base y su umbral (del catálogo de configuración del tenant).
- Sin cajas negras hacia el usuario: si una capacidad no puede explicar su salida en estos términos, no se libera (regla de gobierno, ETS-005/11).

## 6. Retroalimentación

- `POST /ia/retroalimentacion` — valoración de una respuesta/sugerencia propia (útil / no útil + comentario opcional).
- Alimenta métricas por capacidad (aceptación, utilidad, latencia, costo — ETS-007/09 §8) y la calibración del tenant; **jamás** entrena modelos con datos del tenant salvo política explícita y anonimizada (ETS-005/11).
- Los administradores ven las métricas agregadas de sus capacidades en su panel (adopción real, no fe).
