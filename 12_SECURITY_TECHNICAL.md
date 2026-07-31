# 12_SECURITY_TECHNICAL.md

> **DeltaOps — ETS-007 · v1.0** · Seguridad técnica: tokens, sesiones, CSRF, rate limit, secretos, cifrado y rotación.
> La clasificación y protección de datos está en ETS-006/13; los permisos, en ETS-004/10. Aquí, la mecánica.
> Documento de diseño. No implementa nada.

---

## 1. Autenticación y tokens

```text
Login (credenciales / SSO federado del tenant)
  → TOKEN DE ACCESO (JWT firmado, corta vida: minutos)
      porta: usuario, tenant firmado, sesión, emisión/expiración
      NO porta: permisos detallados (se evalúan en servidor por contexto —
      un token no puede "recordar" permisos que ya fueron revocados)
  → TOKEN DE REFRESCO (larga vida acotada, un solo uso, rotativo)
      almacenado con máxima protección en el cliente; canal exclusivo
```

1. **Acceso corto + refresco rotativo:** cada refresco emite par nuevo e invalida el anterior; un token de refresco reutilizado (señal de robo) revoca la cadena completa de la sesión.
2. **Verificación en cada petición:** firma, expiración, tenant, y **vigencia de la sesión** (lista de revocación consultable: el cierre de sesión y la revocación administrativa surten efecto inmediato, no al expirar el token).
3. **SSO federado por tenant** (M365/Google, `08`): la federación autentica; las membresías y permisos siempre son de DeltaOps (Identity) — la federación jamás otorga alcance.
4. **Móvil offline:** el dispositivo opera offline con su credencial local protegida por el sistema del dispositivo; la sincronización exige token vigente — la validez de los hechos capturados se evalúa a tiempo de negocio (ETS-006/14).

## 2. Sesiones

- Registro de sesiones activas por usuario (dispositivo, canal, última actividad) visible para el usuario y el administrador; revocación individual o total ("cerrar todas").
- Expiración por inactividad y vida máxima absoluta, configurables por tenant dentro de mínimos de plataforma (ETS-005/12).
- Acciones sensibles (cambiar permisos, exportar masivo, aprobar sobre umbral alto) pueden exigir **re-autenticación reciente** según política del tenant.
- Todo evento de sesión (inicio, refresco anómalo, revocación) va a auditoría (ETS-006/06).

## 3. Protección de superficie web

| Amenaza | Defensa |
|---|---|
| CSRF | Tokens portados por cabecera (no cookies ambientales) + verificación de origen; si algún flujo usa cookies, van con atributos estrictos y token anti-CSRF sincronizado |
| XSS | Política de contenido restrictiva, escape por defecto en toda plantilla, sanitización del texto libre (que es mínimo por diseño — los formularios son estructurados) |
| Inyección | Consultas parametrizadas estructuralmente (la capa de datos no concatena), validación declarativa en frontera |
| Clickjacking | Prohibición de embebido salvo lista explícita |
| Enumeración | Errores de autenticación uniformes, respuestas de existencia homogéneas entre tenants |
| Subidas | Verificación de tipo real, tamaño, antimalware (`07`); nunca se sirve contenido subido desde el dominio de la aplicación |

## 4. Rate limiting

- **Por capas:** por IP en el borde (anónimos), por sesión (autenticados), por cuenta de servicio (API/integraciones) y **por tenant** (vecindad SaaS, `05`).
- **Presupuestos distintos por costo:** login y recuperación de contraseña, estrictos (fuerza bruta); lecturas, generosos; comandos, moderados; ingesta IoT, por cola con absorción (`08`).
- Respuestas con presupuesto visible y espera sugerida; los límites excedidos son métricas y, en patrón anómalo, alertas de seguridad (`10`).

## 5. Secretos

1. **Bóveda dedicada** (ETS-006/13): credenciales de integraciones, claves de firma, secretos de canal — nunca en configuración legible, código, logs ni exportaciones.
2. **Escritura sin lectura:** un secreto guardado se usa, no se re-lee (la interfaz muestra solo existencia y huella); reemplazar = escribir de nuevo.
3. **Por entorno y por tenant:** un secreto de QA jamás sirve en producción (`15`); los de tenant, segregados como todo lo demás.
4. **Acceso de procesos por identidad de servicio** con mínimo privilegio, auditado.

## 6. Cifrado

- **Tránsito:** todo canal cifrado con protocolos vigentes, incluidos internos (aplicación↔base, aplicación↔almacén, webhooks salientes firmados).
- **Reposo:** todo el patrimonio (ETS-006/13); claves por tenant para Restringido/Crítico; almacén de archivos y respaldos cifrados con claves gestionadas aparte (ETS-006/15).
- **Firmas:** eventos de webhook, URLs de archivos (`07`), y el encadenamiento verificable de auditoría (ETS-006/06) usan material criptográfico dedicado, separado del de sesión.

## 7. Rotación

| Material | Política |
|---|---|
| Claves de firma de tokens | Rotación programada con ventana de convivencia (las emisiones viejas expiran solas por su corta vida) |
| Claves de cifrado en reposo | Rotación por re-cifrado progresivo, sin parada; jerarquía de claves (clave de datos envuelta por clave maestra) para rotar sin re-cifrar todo |
| Credenciales de integraciones | Rotación programada por conector; revocación inmediata disponible; el panel de integración avisa vencimientos |
| Credenciales de dispositivos IoT | Individuales y revocables (`08`); rotación por re-registro |
| Secretos de canal (correo, mensajería) | Con el proveedor, según su ciclo; el cambio es configuración, no despliegue |

Toda rotación es un procedimiento operativo con evidencia (auditada), ensayado — no un evento excepcional.
