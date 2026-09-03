/**
 * Implementación local del puerto `Almacen`. Guarda la base completa en el
 * navegador, de modo que la aplicación funcione sin servidor y sin conexión.
 *
 * Es el único lugar que conoce el medio de persistencia: sustituirlo por un
 * cliente HTTP no obliga a tocar ni el dominio ni las pantallas.
 */

import {
  crearSemilla,
  hoyEnBogota,
  type Almacen,
  type BaseDatos,
} from '@workspace/horas-maquina';

const CLAVE = 'delta-horas.base';
const VERSION = 1;

/**
 * Completa las colecciones ausentes con la semilla. Permite abrir una base
 * guardada por una versión anterior sin perder los registros capturados.
 */
function reconciliar(guardada: Partial<BaseDatos>, hoy: string): BaseDatos {
  const semilla = crearSemilla(hoy);
  return {
    version: VERSION,
    registros: guardada.registros ?? semilla.registros,
    maquinas: guardada.maquinas ?? semilla.maquinas,
    operadores: guardada.operadores ?? semilla.operadores,
    supervisores: guardada.supervisores ?? semilla.supervisores,
    clientes: guardada.clientes ?? semilla.clientes,
    operaciones: guardada.operaciones ?? semilla.operaciones,
    materiales: guardada.materiales ?? semilla.materiales,
    proveedores: guardada.proveedores ?? semilla.proveedores,
    turnos: guardada.turnos ?? semilla.turnos,
    usuarios: guardada.usuarios ?? semilla.usuarios,
    auditoria: guardada.auditoria ?? semilla.auditoria,
    sesionUsuarioId: guardada.sesionUsuarioId ?? semilla.sesionUsuarioId,
  };
}

export function crearAlmacenLocal(
  almacenamiento: Storage | null = typeof window === 'undefined'
    ? null
    : window.localStorage,
): Almacen {
  let memoria: BaseDatos | null = null;

  const persistir = (base: BaseDatos) => {
    memoria = base;
    try {
      almacenamiento?.setItem(CLAVE, JSON.stringify(base));
    } catch {
      // Sin espacio o en modo privado: la sesión sigue en memoria.
    }
  };

  return {
    async cargar() {
      if (memoria) return memoria;
      const hoy = hoyEnBogota();
      const crudo = almacenamiento?.getItem(CLAVE);
      if (!crudo) {
        const semilla = crearSemilla(hoy);
        persistir(semilla);
        return semilla;
      }
      try {
        const base = reconciliar(JSON.parse(crudo) as Partial<BaseDatos>, hoy);
        memoria = base;
        return base;
      } catch {
        const semilla = crearSemilla(hoy);
        persistir(semilla);
        return semilla;
      }
    },

    async guardar(base) {
      persistir(base);
    },

    async reiniciar() {
      const semilla = crearSemilla(hoyEnBogota());
      persistir(semilla);
      return semilla;
    },
  };
}
