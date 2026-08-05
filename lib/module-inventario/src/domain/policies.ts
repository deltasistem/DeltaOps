/**
 * DGP-011.1 · Módulo Enterprise Inventory — Policies de dominio (PolicyEngine).
 *
 * Declarativas y puras: sin IO, sin conocer el tenant. La capa de aplicación lee
 * la configuración `modulo.inventario.<clave>` y la coherencia del aggregate, y
 * las inyecta en el `subject`. Cada policy está ENLAZADA a un comando concreto.
 *
 * Las policies expresan reglas de NEGOCIO transversales; NO sustituyen al
 * Workflow Engine (que gobernará QUÉ transición de transferencia/ajuste/conteo
 * es admisible cuando el motor se monte por adaptador en fases posteriores).
 */
export const POLICY_PUEDE_CREAR_ITEM = "modulo.inventario.puede-crear-item";
export const POLICY_PUEDE_MODIFICAR_ITEM = "modulo.inventario.puede-modificar-item";
export const POLICY_PUEDE_MOVER_INVENTARIO = "modulo.inventario.puede-mover-inventario";
export const POLICY_PUEDE_RESERVAR = "modulo.inventario.puede-reservar";
export const POLICY_PUEDE_LIBERAR_RESERVA = "modulo.inventario.puede-liberar-reserva";
export const POLICY_PUEDE_TRANSFERIR = "modulo.inventario.puede-transferir";
export const POLICY_PUEDE_AJUSTAR = "modulo.inventario.puede-ajustar";
export const POLICY_PUEDE_CONTAR = "modulo.inventario.puede-contar";
export const POLICY_PUEDE_CERRAR_CONTEO = "modulo.inventario.puede-cerrar-conteo";
export const POLICY_PUEDE_ELIMINAR_ITEM = "modulo.inventario.puede-eliminar-item";

export const POLICIES = [
  POLICY_PUEDE_CREAR_ITEM,
  POLICY_PUEDE_MODIFICAR_ITEM,
  POLICY_PUEDE_MOVER_INVENTARIO,
  POLICY_PUEDE_RESERVAR,
  POLICY_PUEDE_LIBERAR_RESERVA,
  POLICY_PUEDE_TRANSFERIR,
  POLICY_PUEDE_AJUSTAR,
  POLICY_PUEDE_CONTAR,
  POLICY_PUEDE_CERRAR_CONTEO,
  POLICY_PUEDE_ELIMINAR_ITEM,
] as const;

type Subject = Record<string, unknown>;
type Decision = { allow: boolean; reason: string };

const permitir = (reason: string): Decision => ({ allow: true, reason });
const denegar = (reason: string): Decision => ({ allow: false, reason });

export function policiesDelModulo() {
  return [
    {
      name: POLICY_PUEDE_CREAR_ITEM,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_MODIFICAR_ITEM,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["eliminado"] === true) return denegar("Un item eliminado es inmutable");
        return permitir("modificable");
      },
    },
    {
      name: POLICY_PUEDE_MOVER_INVENTARIO,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // No se mueve stock de un item eliminado.
        if (s["itemEliminado"] === true) return denegar("No se mueve un item eliminado");
        // La configuración del tenant puede exigir item activo para operar.
        if (s["exigirItemActivo"] === true && s["itemActivo"] !== true) {
          return denegar("La configuración del tenant exige un item activo para mover inventario");
        }
        return permitir("movible");
      },
    },
    {
      name: POLICY_PUEDE_RESERVAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["itemEliminado"] === true) return denegar("No se reserva un item eliminado");
        return permitir("reservable");
      },
    },
    {
      name: POLICY_PUEDE_LIBERAR_RESERVA,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return s["estadoReserva"] === "activa"
          ? permitir("liberable")
          : denegar(`No se libera una reserva en estado ${String(s["estadoReserva"])}`);
      },
    },
    {
      name: POLICY_PUEDE_TRANSFERIR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // Guardarraíl previo al workflow: una transferencia terminal es inmutable.
        const estado = String(s["estado"] ?? "borrador");
        if (estado === "completada" || estado === "cancelada") {
          return denegar(`Una transferencia ${estado} no admite operaciones`);
        }
        return permitir("transferible");
      },
    },
    {
      name: POLICY_PUEDE_AJUSTAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "borrador");
        if (estado === "aplicado" || estado === "rechazado") {
          return denegar(`Un ajuste ${estado} no admite operaciones`);
        }
        return permitir("ajustable");
      },
    },
    {
      name: POLICY_PUEDE_CONTAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return s["estado"] === "cerrado"
          ? denegar("Un conteo cerrado no admite registro")
          : permitir("contable");
      },
    },
    {
      name: POLICY_PUEDE_CERRAR_CONTEO,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["estado"] === "cerrado") return denegar("El conteo ya está cerrado");
        if (s["hayPendientes"] === true) return denegar("No se cierra un conteo con líneas sin contar");
        return permitir("cerrable");
      },
    },
    {
      name: POLICY_PUEDE_ELIMINAR_ITEM,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["eliminado"] === true) return denegar("El item ya está eliminado");
        // No se elimina un item con existencias (invariante de negocio).
        if (s["conExistencias"] === true) return denegar("No se elimina un item con existencias");
        return permitir("eliminable");
      },
    },
  ];
}
