/**
 * DGP-017 · Guardas de seguridad Offline conscientes de identidad y tenant.
 *
 * Las colas offline de los módulos ya se almacenan con clave por tenant
 * (`deltaops:<modulo>:cola:<tenant>`) y las cachés con `deltaops:<modulo>:cache:
 * <tenant>`. Esta guarda añade la garantía adicional exigida por DGP-017: un
 * cambio de USUARIO o de TENANT invalida (no reutiliza) cualquier cola/caché
 * incompatible. Ninguna operación offline puede saltarse sesión/tenant.
 *
 * Enfoque conservador y COMPATIBLE: no reescribe los módulos existentes; sólo
 * observa el contexto activo persistido y, cuando cambia, purga el
 * almacenamiento local del espacio `deltaops:*` para que ninguna cola de otro
 * contexto se reutilice. La sincronización real siempre pasa por el backend,
 * que valida sesión/tenant/permiso/expiración.
 */

const CLAVE_CONTEXTO = "deltaops:identidad:contexto";
/** Prefijo del almacenamiento offline (colas y cachés) de todos los módulos. */
const PREFIJO_OFFLINE = "deltaops:";
/** Claves que NO deben purgarse por no pertenecer a datos de un tenant. */
const CLAVES_PROTEGIDAS = new Set([CLAVE_CONTEXTO]);

interface Contexto {
  tenantId: string;
  identityId: string;
}

function storage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function leerContexto(s: Storage): Contexto | null {
  try {
    const raw = s.getItem(CLAVE_CONTEXTO);
    return raw ? (JSON.parse(raw) as Contexto) : null;
  } catch {
    return null;
  }
}

/**
 * Purga las colas/cachés offline (`deltaops:*`) que puedan pertenecer a otro
 * tenant/usuario. Se invoca cuando cambia el contexto activo. Nunca toca claves
 * protegidas (el propio contexto de identidad).
 */
export function purgarAlmacenamientoOffline(): void {
  const s = storage();
  if (!s) return;
  const aBorrar: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k) continue;
    if (k.startsWith(PREFIJO_OFFLINE) && !CLAVES_PROTEGIDAS.has(k)) aBorrar.push(k);
  }
  for (const k of aBorrar) s.removeItem(k);
}

/**
 * Registra el tenant/usuario activo. Si el contexto anterior era de un tenant o
 * usuario DISTINTO, purga primero el almacenamiento offline incompatible.
 * Devuelve `true` si hubo cambio de contexto (y por tanto purga).
 */
export function guardarTenantActivo(tenantId: string, identityId: string): boolean {
  const s = storage();
  if (!s) return false;
  const previo = leerContexto(s);
  const cambio = !previo || previo.tenantId !== tenantId || previo.identityId !== identityId;
  if (cambio && previo) {
    // El contexto anterior existía y es distinto: no reutilizar sus colas.
    purgarAlmacenamientoOffline();
  }
  try {
    s.setItem(CLAVE_CONTEXTO, JSON.stringify({ tenantId, identityId }));
  } catch {
    /* almacenamiento no disponible: sin persistencia, sin reutilización */
  }
  return cambio;
}

/**
 * Purga las colas/cachés cuyo tenant en la clave NO coincida con el activo.
 * Las claves siguen el patrón `deltaops:<modulo>:(cola|cache|borrador):<tenant>`.
 * Complementa a `guardarTenantActivo`: incluso si un módulo escribió una cola de
 * otro tenant, aquí se elimina antes de cualquier reutilización.
 */
export function purgarColasDeOtrosTenants(tenantActivo: string): void {
  const s = storage();
  if (!s) return;
  const aBorrar: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k || !k.startsWith(PREFIJO_OFFLINE) || CLAVES_PROTEGIDAS.has(k)) continue;
    const partes = k.split(":");
    // deltaops : modulo : tipo : <tenant...>
    if (partes.length >= 4) {
      const tenantEnClave = partes.slice(3).join(":");
      if (tenantEnClave && tenantEnClave !== tenantActivo && tenantEnClave !== "deltaops") {
        aBorrar.push(k);
      }
    }
  }
  for (const k of aBorrar) s.removeItem(k);
}

/** Contexto offline actualmente persistido (para diagnósticos/pruebas). */
export function contextoActivo(): Contexto | null {
  const s = storage();
  return s ? leerContexto(s) : null;
}

/** Restablece el contexto (usado en pruebas y en logout total). */
export function limpiarContexto(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(CLAVE_CONTEXTO);
}
