# 08_SECURITY_CONTRACTS.md

> **DeltaOps — ETS-008 · v1.0** · Contratos de seguridad de la API: tokens, claims, scopes, delegación, SSO, cuentas de servicio, dispositivos e IoT.
> La mecánica interna está en ETS-007/12; aquí, lo que el contrato expone y exige.
> Documento de diseño. No implementa nada.

---

## 1. JWT de acceso (contrato de claims)

Token corto (minutos), firmado, portado en `Authorization`.

| Claim conceptual | Contenido | Regla |
|---|---|---|
| Sujeto | Identificador del usuario o cuenta de servicio | Opaco y estable |
| **Tenant** | Tenant firmado | Inmutable; discrepancia = rechazo inmediato (`02` §4) |
| Sesión | Identificador de sesión | Verificable contra revocación en cada petición |
| Tipo de actor | humano · cuenta de servicio · dispositivo | Gobierna qué superficies puede tocar |
| Emisión / expiración | Tiempos del token | Corta vida; sin tokens eternos |
| Delegación (si aplica) | Referencia a la delegación activa | La auditoría registra "X actuando por Y" |

**Lo que el token NO porta:** permisos detallados ni membresías — se evalúan en el servidor por contexto en cada petición (un token no puede recordar permisos ya revocados, ETS-007/12 §1). El contexto activo tampoco: viaja por cabecera y se valida por petición.

## 2. Refresco

- Token de refresco de un solo uso, rotativo: cada uso emite par nuevo e invalida el anterior; reutilización detectada = revocación de la cadena completa (señal de robo).
- Canal exclusivo (`POST /sesiones/refresco`); jamás acompaña peticiones normales.
- Vida máxima absoluta de la sesión y expiración por inactividad: configurables por tenant dentro de mínimos de plataforma.

## 3. Scopes (cuentas de servicio y API keys)

Los humanos no usan scopes (usan roles+contextos, ETS-004/10). Las **cuentas de servicio** declaran alcance explícito de mínimo privilegio:

- **Scope = módulo + operación + ámbito organizacional:** p. ej. lectura de consumos de una operación; escritura de lecturas de medidor de una flota (IoT); lectura de marts para BI.
- El alcance de una cuenta jamás excede el de quien la creó al crearla; se valida en cada petición como cualquier permiso (denegado por defecto).
- Credencial visible **una sola vez** al emitirse; almacenada como huella; rotación y revocación inmediatas disponibles (`03` §15).
- Toda acción de cuenta de servicio queda auditada con su identidad propia — nunca "el sistema".

## 4. Delegación

- La delegación (titular→delegado, con vigencia, ETS-004) se refleja en el contrato: el delegado opera con **su propia sesión** y un claim de delegación; los permisos efectivos son los delegados, recortados por la vigencia.
- La auditoría registra siempre ambas identidades; la delegación no es transferible ni re-delegable.
- `GET /permisos/efectivos` muestra el origen de cada permiso (propio o delegado).

## 5. SSO

- Federación por tenant (M365/Google — ETS-007/08 §4): el proveedor del tenant **autentica**; DeltaOps **autoriza** (membresías y roles siempre propios — la federación jamás otorga alcance).
- El intercambio federado termina en los mismos tokens DeltaOps (§1): después del login, el contrato es idéntico para todos.
- Aprovisionamiento de usuarios por federación: opcional por tenant, crea usuarios **sin membresías** (el acceso real siempre lo otorga un administrador, `03` §1).

## 6. API keys

- Forma simple de credencial para integraciones que no soportan flujos de token: clave estática asociada a una cuenta de servicio (mismos scopes, misma auditoría, mismo rate limit).
- Solo por canal cifrado, con rotación programada y revocación inmediata; nunca en URLs.
- Preferencia del contrato: tokens de cuenta de servicio; las API keys existen por compatibilidad práctica con el ecosistema.

## 7. Tokens de dispositivo (móvil)

- Registro de dispositivo (`03` §14) emite credencial de dispositivo, protegida por el almacén seguro del sistema operativo.
- El dispositivo opera offline con su credencial local; **sincronizar exige token de usuario vigente** — la validez de los hechos capturados se evalúa a tiempo de negocio, no al momento de conectar (ETS-006/14).
- Revocar el dispositivo (pérdida/robo) invalida su credencial al instante; la cola local capturada legítimamente se conserva cifrada y puede entregarse tras re-registro verificado (`07` §4).
- Límite de dispositivos por usuario según licencia.

## 8. IoT

- **Credencial individual por dispositivo físico** (jamás credenciales compartidas de flota): emitida al registrar, revocable individualmente, rotada por re-registro (ETS-007/08 §5).
- El dispositivo IoT es un actor de tipo propio con alcance mínimo (los comandos de telemetría de sus activos autorizados) — un sensor de combustible no puede consultar OTs.
- La ingesta valida credencial + registro activo antes de encolar; lo demás (validación de dominio) ocurre después con bandeja de errores — la autenticación nunca se sacrifica por el volumen.
- MQTT (preparado): el mismo registro y las mismas credenciales individuales gobiernan el transporte futuro.

## 9. Reglas transversales del contrato de seguridad

1. Denegado por defecto en toda superficie; `RECURSO_NO_ENCONTRADO` homogéneo (no se revela existencia de lo no visible).
2. Ninguna credencial en URLs, logs ni exportaciones; secretos en bóveda sin lectura (ETS-007/12 §5).
3. Acciones sensibles pueden exigir re-autenticación reciente (política del tenant).
4. Todos los eventos de seguridad (login, refresco anómalo, revocaciones, cambios de permisos, exportaciones masivas) son auditoría permanente (ETS-006/06) y generan alertas ante patrones anómalos (ETS-007/10 §6).
