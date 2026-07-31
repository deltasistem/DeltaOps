# 05_MULTITENANT_ARCHITECTURE.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura multi-tenant: aislamiento, contexto activo y herencia de configuración.
> Documento de diseño. No implementa nada.

---

## 1. Modelo de tenancy

**Aislamiento lógico con disciplina de plataforma:** todos los tenants comparten la unidad desplegable y la infraestructura, y el aislamiento se garantiza por construcción en cada capa — no por convención.

| Capa | Garantía |
|---|---|
| Identidad | Toda sesión pertenece a un tenant; los tokens llevan el tenant firmado (`12_SECURITY_TECHNICAL.md`) |
| Datos | El tenant es parte de la identidad lógica de todo registro (ETS-006); ninguna consulta existe sin filtro de tenant — el acceso a datos lo impone estructuralmente (no depende de que cada consulta "se acuerde") |
| Eventos | El bus segmenta por tenant; ningún consumidor cruza tenants |
| Caches e índices | Claves siempre prefijadas por tenant; el buscador indexa por tenant |
| Archivos | Espacios de almacenamiento segregados por tenant (`07_FILE_ARCHITECTURE.md`) |
| Cifrado | Claves separadas por tenant para datos Restringido/Crítico (ETS-006/13) |
| Respaldos | Restauración por tenant posible (ETS-006/15) |
| Observabilidad | Métricas y trazas etiquetadas por tenant (ruido de uno ≠ misterio de todos) |

**Pruebas de fuga como práctica permanente:** la suite de verificación incluye pruebas específicas de cross-tenant (intentos de acceso con IDs de otro tenant) en cada contrato público.

Grupos empresariales: cada empresa del grupo es un tenant; lo compartido (plantillas del grupo, usuarios con membresías en varias empresas) se modela explícitamente, nunca relajando el aislamiento.

## 2. El contexto activo

Toda petición ejecuta con un **contexto activo** resuelto y validado al entrar:

```text
Sesión (usuario, tenant firmado)
  + contexto seleccionado (sede / operación / proyecto / centro de costo)
  + membresías vigentes del usuario en ese contexto (Identity)
  = CONTEXTO ACTIVO: viaja inmutable por toda la ejecución
    (comandos, permisos, resolución de configuración, eventos emitidos)
```

1. **Nada se ejecuta sin contexto:** los comandos registran el contexto del hecho (ETS-006); los permisos se evalúan contra él (ETS-004); la configuración se resuelve en su cascada (ETS-005).
2. **El contexto viaja, no se re-adivina:** se resuelve una vez en la frontera y fluye explícito por módulos y eventos.
3. **Ámbito ≤ membresía:** el usuario solo activa contextos donde tiene membresía vigente; la vigencia se re-verifica en cada petición (membresías vencidas cortan el acceso de inmediato, sin esperar re-login).

## 3. Cambio de contexto

| Cambio | Comportamiento técnico |
|---|---|
| **De tenant** (usuarios multi-empresa) | Re-emisión de credenciales con el nuevo tenant firmado; nada del estado del anterior sobrevive (caches de sesión purgados); branding cambia con el tenant (ETS-005/08) |
| **De sede / operación / proyecto** | Ligero: mismo token, nuevo contexto validado contra membresías; recarga solo de lo dependiente del contexto (configuración resuelta, bandejas, dashboards) — sin recarga completa, < 3 s, ≤ 2 clics (U-09) |
| **De centro de costo** | Es selección de imputación dentro del contexto, no cambio de sesión; validado contra la jerarquía vigente |
| **En móvil offline** | El dispositivo lleva los contextos con membresía descargados; cambiar de contexto offline es local; la validez final la decide la sincronización (vigencia al tiempo de negocio del hecho — ETS-006/14) |

Todo cambio de contexto queda auditado (es un evento de seguridad, ETS-006/06).

## 4. Herencia de configuración en tiempo de ejecución

- La resolución en cascada (usuario→proyecto→operación→sede→tenant→plataforma, ETS-005/02) se materializa como **configuración resuelta por contexto**, cacheada bajo clave `tenant+contexto+tipo` e invalidada por evento `ConfiguracionPublicada` (`11_CACHE_ARCHITECTURE.md`).
- La respuesta resuelta incluye la **explicación de herencia** (de qué nivel y versión salió cada pieza) — depurable por el administrador sin herramientas externas.
- Los paquetes móviles llevan la configuración **ya resuelta para los contextos del usuario** (el dispositivo no re-implementa la cascada).

## 5. Recursos y vecindad

- **Cuotas por tenant** (peticiones, ingesta IoT, almacenamiento, notificaciones de costo) según licencia: un tenant ruidoso no degrada a los demás (rate limit por tenant además de por sesión — `12`).
- **Trabajos pesados segmentados:** replays, exportaciones y reportes corren en colas con presupuesto por tenant.
- **Métricas de vecindad** en observabilidad: consumo por tenant visible para operar el SaaS con datos, no con quejas.
