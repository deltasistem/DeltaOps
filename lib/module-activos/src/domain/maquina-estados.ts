/**
 * DGP-008.1 · Módulo Activos — Máquina de Estados DECLARATIVA.
 *
 * Las transiciones se declaran como DATOS (DefinicionMaquinaEstados) y se
 * evalúan con el runtime genérico `MaquinaEstados` de DGP-006 Business
 * Foundation. No hay `switch`/`if` por tipo de activo: cualquier clase de
 * activo recorre el mismo ciclo de vida, configurable por catálogos.
 *
 * Ciclo:
 *   BORRADOR → REGISTRADO → OPERATIVO ⇄ MANTENIMIENTO
 *   OPERATIVO/MANTENIMIENTO → FUERA_SERVICIO (⇄ recuperable)
 *   OPERATIVO/MANTENIMIENTO/FUERA_SERVICIO → RETIRADO (final)
 */
import {
  MaquinaEstados,
  type DefinicionMaquinaEstados,
  type ResultadoTransicion,
} from "@workspace/business-foundation";

export const ESTADOS = [
  "BORRADOR",
  "REGISTRADO",
  "OPERATIVO",
  "MANTENIMIENTO",
  "FUERA_SERVICIO",
  "RETIRADO",
] as const;
export type EstadoActivo = (typeof ESTADOS)[number];

/** Comandos lógicos que disparan las transiciones (datos, no código). */
export const COMANDO_REGISTRAR = "registrar";
export const COMANDO_OPERAR = "operar";
export const COMANDO_MANTENER = "mantener";
export const COMANDO_FUERA_SERVICIO = "fuera-servicio";
export const COMANDO_RETIRAR = "retirar";

/** Declaración canónica de la máquina de estados del activo. */
export const DEFINICION_MAQUINA_ACTIVO: DefinicionMaquinaEstados = {
  estados: [
    { nombre: "BORRADOR", inicial: true },
    { nombre: "REGISTRADO" },
    { nombre: "OPERATIVO" },
    { nombre: "MANTENIMIENTO" },
    { nombre: "FUERA_SERVICIO" },
    { nombre: "RETIRADO", final: true },
  ],
  transiciones: [
    { de: "BORRADOR", a: "REGISTRADO", comando: COMANDO_REGISTRAR },
    { de: "REGISTRADO", a: "OPERATIVO", comando: COMANDO_OPERAR },
    { de: "OPERATIVO", a: "MANTENIMIENTO", comando: COMANDO_MANTENER },
    { de: "MANTENIMIENTO", a: "OPERATIVO", comando: COMANDO_OPERAR },
    { de: "OPERATIVO", a: "FUERA_SERVICIO", comando: COMANDO_FUERA_SERVICIO },
    { de: "MANTENIMIENTO", a: "FUERA_SERVICIO", comando: COMANDO_FUERA_SERVICIO },
    // FUERA_SERVICIO es recuperable: puede volver a operar.
    { de: "FUERA_SERVICIO", a: "OPERATIVO", comando: COMANDO_OPERAR },
    // RETIRADO es terminal (final): se alcanza desde estados no-borrador.
    { de: "REGISTRADO", a: "RETIRADO", comando: COMANDO_RETIRAR },
    { de: "OPERATIVO", a: "RETIRADO", comando: COMANDO_RETIRAR },
    { de: "MANTENIMIENTO", a: "RETIRADO", comando: COMANDO_RETIRAR },
    { de: "FUERA_SERVICIO", a: "RETIRADO", comando: COMANDO_RETIRAR },
  ],
};

/** Instancia única del runtime genérico de máquina de estados. */
export const maquinaActivo = new MaquinaEstados(DEFINICION_MAQUINA_ACTIVO);

export type { ResultadoTransicion };
