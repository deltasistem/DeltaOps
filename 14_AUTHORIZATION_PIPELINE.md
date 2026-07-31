# 14_AUTHORIZATION_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de autorización: quién puede qué, dónde, decidido en un solo lugar.
> Documento de diseño. Sin código, sin clases.

---

## 1. El modelo de decisión

Toda operación se autoriza con tres preguntas, en orden:

```text
1. IDENTIDAD    ¿el Contexto de Ejecución trae actor autenticado
                válido (cuenta o dispositivo no revocado)? — lo
                resolvió el adaptador de entrada; aquí se exige
2. CAPACIDAD    ¿el actor tiene el permiso que el caso de uso
                declara (matriz ETS-004/10, RBAC por roles del
                tenant)?
3. ALCANCE      ¿sobre ESTE contexto organizacional? El actor solo
                opera dentro de los nodos donde su membresía vigente
                se lo concede (ABAC organizacional; descendencia
                según la política del rol)
```

Decisión: **permitir · denegar** (sin "permitir con advertencia"). Denegado por defecto: sin permiso explícito no hay acceso (ETS-003/04 Motor de Permisos).

## 2. Reglas normativas

1. **El caso de uso declara, el pipeline decide**: cada comando/consulta lleva su permiso requerido en metadatos (03 §3.6); ningún caso de uso implementa autorización a mano — el Motor de Permisos (Domain Service de identidad) es la única autoridad.
2. **El alcance se evalúa con vigencias a la fecha del comando**: membresías y delegaciones son relaciones temporales (ETS-010/04 §3); la pregunta es "¿tenía el permiso cuando actuó?" — auditable retroactivamente.
3. **Denegaciones auditadas**: todo denegado produce hecho de intento denegado (auditoría 17) con actor, operación y motivo — patrón de sondas de permiso es señal de seguridad.
4. **La autorización de lectura inyecta el alcance** (12 §2.3): no responde solo sí/no sino "estos nodos puede ver" — el lector lo aplica; RLS física es la segunda muralla.
5. **Datos Restringidos** (ETS-006/13): campo o entidad con clasificación restringida exige capacidad adicional; la lectura queda registrada como acceso sensible (ETS-010/15).
6. **Delegaciones explícitas**: actuar "en nombre de" viaja en el Contexto (actor + delegante); el permiso evaluado es el del delegante dentro de los límites de la delegación vigente; ambos quedan en el hecho.
7. **El canal no da permisos**: móvil, API o integración con las mismas reglas; los comandos de sincronización se autorizan comando a comando contra el actor del dispositivo (ETS-008/12).

---

## Impacto sobre la implementación
El Motor de Permisos se implementa una vez (módulo identidad) y el pipeline lo invoca para todo; la matriz ETS-004/10 se carga como configuración de roles del tenant; las pruebas de autorización son matriz actor×operación×alcance.

## ETS relacionados
ETS-004 (10 matriz de permisos) · ETS-003 (04 motor de permisos) · ETS-006 (13 clasificación) · ETS-008 (08 contratos de seguridad, 12 dispositivos) · ETS-010 (01 RLS, 15 accesos).

## Riesgos
- Autorización duplicada en adaptadores o UIs que diverge → única autoridad §2.1; la UI solo oculta (UX), jamás decide.
- Evaluación de descendencia organizacional costosa en árboles grandes → read model de descendencia ya previsto (ETS-009/08).

## Decisiones habilitadas
Implementación del motor, pruebas de matriz, panel de intentos denegados.

## Decisiones bloqueadas
Granularidad final de capacidades por módulo (se cierra con la implementación de cada catálogo) y caché de decisiones (medir primero).
