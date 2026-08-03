/**
 * DGP-007 · Dynamic Forms Engine — Composición oficial del motor.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + el motor de formularios,
 * seleccionando adaptadores Fake (offline) o PostgreSQL según haya `pool`
 * (el Record Store de la plataforma resuelve la persistencia). Conecta el
 * resolutor de plantillas al store del runtime.
 */
import type { Pool } from "pg";
import {
  createPlatformRuntime,
  type PlatformRuntime,
  type PlatformRuntimeOptions,
} from "@workspace/platform";
import { crearMotorFormularios, type OpcionesMotor } from "./modulo";
import { ResolutorPlantillaStore } from "./resolutor";

export interface FormulariosRuntime {
  readonly platform: PlatformRuntime;
}

/**
 * Crea el runtime del motor de formularios. Si no se inyecta un `resolutor`,
 * usa el ResolutorPlantillaStore conectado al Record Store del runtime.
 */
export function crearFormulariosRuntime(
  options: Omit<PlatformRuntimeOptions, "extraServices"> & {
    pool?: Pool;
    motor?: OpcionesMotor;
  } = {},
): FormulariosRuntime {
  const resolutor = options.motor?.resolutor ?? new ResolutorPlantillaStore();
  const definicion = crearMotorFormularios({ ...options.motor, resolutor });

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [definicion],
  });

  // Conecta el resolutor por defecto al store real del runtime (perezoso).
  if (resolutor instanceof ResolutorPlantillaStore) {
    resolutor.conectar(platform.store);
  }

  return { platform };
}
