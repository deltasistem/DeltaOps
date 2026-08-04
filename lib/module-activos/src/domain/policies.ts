/**
 * DGP-008.1 · Módulo Activos — Policies de dominio (Kernel PolicyEngine).
 *
 * Declarativas y puras. Se registran una sola vez al montar el módulo y se
 * evalúan en la autorización de cada comando. Su comportamiento es
 * CONFIGURABLE por tenant: la capa de aplicación lee la configuración
 * `modulo.activos.<clave>` y la pasa como parte del `subject`, de modo que las
 * policies nunca hacen IO ni conocen el tenant.
 */
export const POLICY_PUEDE_REGISTRAR = "modulo.activos.puede-registrar";
export const POLICY_PUEDE_MODIFICAR = "modulo.activos.puede-modificar";
export const POLICY_PUEDE_RETIRAR = "modulo.activos.puede-retirar";
export const POLICY_PUEDE_CAMBIAR_UBICACION = "modulo.activos.puede-cambiar-ubicacion";
export const POLICY_PUEDE_ASIGNAR_RESPONSABLE = "modulo.activos.puede-asignar-responsable";
export const POLICY_PUEDE_MODIFICAR_HOROMETRO = "modulo.activos.puede-modificar-horometro";
export const POLICY_PUEDE_MODIFICAR_ODOMETRO = "modulo.activos.puede-modificar-odometro";
export const POLICY_PUEDE_CERRAR = "modulo.activos.puede-cerrar";

export const POLICIES = [
  POLICY_PUEDE_REGISTRAR,
  POLICY_PUEDE_MODIFICAR,
  POLICY_PUEDE_RETIRAR,
  POLICY_PUEDE_CAMBIAR_UBICACION,
  POLICY_PUEDE_ASIGNAR_RESPONSABLE,
  POLICY_PUEDE_MODIFICAR_HOROMETRO,
  POLICY_PUEDE_MODIFICAR_ODOMETRO,
  POLICY_PUEDE_CERRAR,
] as const;

type Subject = Record<string, unknown>;
type Decision = { allow: boolean; reason: string };

const permitir = (reason: string): Decision => ({ allow: true, reason });
const denegar = (reason: string): Decision => ({ allow: false, reason });

export function policiesDelModulo() {
  return [
    {
      name: POLICY_PUEDE_REGISTRAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // Solo se registra desde BORRADOR.
        return s["estado"] === "BORRADOR"
          ? permitir("registrable")
          : denegar("Solo un activo en BORRADOR puede registrarse");
      },
    },
    {
      name: POLICY_PUEDE_MODIFICAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return s["estado"] === "RETIRADO"
          ? denegar("Un activo RETIRADO es inmutable")
          : permitir("modificable");
      },
    },
    {
      name: POLICY_PUEDE_RETIRAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["estado"] === "BORRADOR") return denegar("Un activo en BORRADOR no puede retirarse");
        if (s["estado"] === "RETIRADO") return denegar("El activo ya está RETIRADO");
        // La configuración del tenant puede exigir aprobación previa.
        if (s["requiereAprobacion"] === true && s["aprobado"] !== true) {
          return denegar("El retiro requiere aprobación previa (configuración del tenant)");
        }
        return permitir("retirable");
      },
    },
    {
      name: POLICY_PUEDE_CAMBIAR_UBICACION,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return s["estado"] === "RETIRADO"
          ? denegar("No se cambia la ubicación de un activo RETIRADO")
          : permitir("ubicable");
      },
    },
    {
      name: POLICY_PUEDE_ASIGNAR_RESPONSABLE,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return s["estado"] === "RETIRADO"
          ? denegar("No se asigna responsable a un activo RETIRADO")
          : permitir("asignable");
      },
    },
    {
      name: POLICY_PUEDE_MODIFICAR_HOROMETRO,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return s["estado"] === "RETIRADO"
          ? denegar("No se modifica el horómetro de un activo RETIRADO")
          : permitir("medible");
      },
    },
    {
      name: POLICY_PUEDE_MODIFICAR_ODOMETRO,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return s["estado"] === "RETIRADO"
          ? denegar("No se modifica el odómetro de un activo RETIRADO")
          : permitir("medible");
      },
    },
    {
      name: POLICY_PUEDE_CERRAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // "Cerrar" = alcanzar el estado terminal RETIRADO de forma definitiva.
        if (s["estado"] === "RETIRADO") return denegar("El activo ya está cerrado (RETIRADO)");
        if (s["estado"] === "BORRADOR") return denegar("Un activo en BORRADOR no puede cerrarse");
        // El cierre definitivo respeta la exigencia de aprobación del tenant.
        if (s["requiereAprobacion"] === true && s["aprobado"] !== true) {
          return denegar("El cierre definitivo requiere aprobación previa (configuración del tenant)");
        }
        return permitir("cerrable");
      },
    },
  ];
}
