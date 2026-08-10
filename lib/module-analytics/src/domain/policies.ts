/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — Policies de dominio.
 *
 * Declarativas y puras: sin IO, sin conocer el tenant. La capa de aplicación
 * inyecta la coherencia (propiedad de dashboard, tipo de definición) en el
 * `subject`. Cada policy está ENLAZADA a un comando concreto y expresa reglas de
 * NEGOCIO transversales (propiedad, inmutabilidad del sistema).
 */
export const POLICY_PUEDE_DEFINIR_INDICADOR = "modulo.analytics.puede-definir-indicador";
export const POLICY_PUEDE_ADMINISTRAR_INDICADOR = "modulo.analytics.puede-administrar-indicador";
export const POLICY_PUEDE_CREAR_DASHBOARD = "modulo.analytics.puede-crear-dashboard";
export const POLICY_PUEDE_EDITAR_DASHBOARD = "modulo.analytics.puede-editar-dashboard";
export const POLICY_PUEDE_ELIMINAR_DASHBOARD = "modulo.analytics.puede-eliminar-dashboard";
export const POLICY_PUEDE_EVALUAR = "modulo.analytics.puede-evaluar";
export const POLICY_PUEDE_EXPORTAR = "modulo.analytics.puede-exportar";

export const POLICIES = [
  POLICY_PUEDE_DEFINIR_INDICADOR,
  POLICY_PUEDE_ADMINISTRAR_INDICADOR,
  POLICY_PUEDE_CREAR_DASHBOARD,
  POLICY_PUEDE_EDITAR_DASHBOARD,
  POLICY_PUEDE_ELIMINAR_DASHBOARD,
  POLICY_PUEDE_EVALUAR,
  POLICY_PUEDE_EXPORTAR,
] as const;

type Subject = Record<string, unknown>;
type Decision = { allow: boolean; reason: string };

const permitir = (reason: string): Decision => ({ allow: true, reason });
const denegar = (reason: string): Decision => ({ allow: false, reason });

export function policiesDelModulo() {
  return [
    {
      name: POLICY_PUEDE_DEFINIR_INDICADOR,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("definible");
      },
    },
    {
      name: POLICY_PUEDE_ADMINISTRAR_INDICADOR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // Las definiciones del SISTEMA no se editan por vías normales.
        if (s["delSistema"] === true) return denegar("Una definición del sistema es inmutable");
        return permitir("administrable");
      },
    },
    {
      name: POLICY_PUEDE_CREAR_DASHBOARD,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_EDITAR_DASHBOARD,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["delSistema"] === true) return denegar("Un dashboard del sistema es inmutable; clónalo para editar");
        if (s["esPropietario"] === false) return denegar("Sólo el propietario puede editar su dashboard");
        return permitir("editable");
      },
    },
    {
      name: POLICY_PUEDE_ELIMINAR_DASHBOARD,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["delSistema"] === true) return denegar("Un dashboard del sistema no se elimina");
        if (s["esPropietario"] === false) return denegar("Sólo el propietario puede eliminar su dashboard");
        return permitir("eliminable");
      },
    },
    {
      name: POLICY_PUEDE_EVALUAR,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("evaluable");
      },
    },
    {
      name: POLICY_PUEDE_EXPORTAR,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("exportable");
      },
    },
  ];
}
