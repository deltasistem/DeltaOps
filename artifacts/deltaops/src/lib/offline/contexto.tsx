/**
 * DGP-008.3 · Contexto React del framework offline.
 * Provee la cola por tenant, estado de conexión y reintento automático al
 * recuperar la conexión (evento `online`).
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ColaSync } from "./cola";
import type { OperacionCola, ResumenSync } from "./tipos";

interface OfflineCtx {
  cola: ColaSync;
  operaciones: readonly OperacionCola[];
  enLinea: boolean;
  pendientes: number;
  conflictos: OperacionCola[];
  procesar: () => Promise<ResumenSync | null>;
}

const Ctx = createContext<OfflineCtx | null>(null);

export interface OfflineProviderProps {
  tenant: string;
  children: React.ReactNode;
  /** Inyección de cola para pruebas. */
  cola?: ColaSync;
}

export function OfflineProvider({ tenant, children, cola: colaInyectada }: OfflineProviderProps) {
  const colaRef = useRef<ColaSync | null>(null);
  if (!colaRef.current) {
    colaRef.current = colaInyectada ?? new ColaSync(tenant);
  }
  const cola = colaRef.current;

  const operaciones = useSyncExternalStore(cola.subscribe, cola.getSnapshot, cola.getSnapshot);
  const [enLinea, setEnLinea] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const alConectar = () => {
      setEnLinea(true);
      // Reintento automático al recuperar conexión.
      void cola.procesar();
    };
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);
    return () => {
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
    };
  }, [cola]);

  // Al montar, si hay pendientes y estamos en línea, intentar drenar.
  useEffect(() => {
    if (enLinea && cola.pendientes() > 0) {
      void cola.procesar();
    }
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valor = useMemo<OfflineCtx>(
    () => ({
      cola,
      operaciones,
      enLinea,
      pendientes: operaciones.filter((o) => o.estado === "pendiente" || o.estado === "reintentable").length,
      conflictos: operaciones.filter((o) => o.estado === "conflicto") as OperacionCola[],
      procesar: () => cola.procesar(),
    }),
    [cola, operaciones, enLinea],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useOffline(): OfflineCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOffline debe usarse dentro de <OfflineProvider>");
  return ctx;
}

/**
 * Ejecuta una mutación con degradación offline: intenta el envío directo; si
 * falla por red, encola la operación para sincronización posterior y devuelve
 * `{ encolada: true }`.
 */
export async function mutarConOffline(
  cola: ColaSync,
  args: {
    comando: string;
    input: Record<string, unknown>;
    descripcion: string;
    /** Envío directo (online). Debe lanzar en error de red. */
    directo: () => Promise<unknown>;
  },
): Promise<{ encolada: boolean; resultado?: unknown; error?: Error }> {
  try {
    const resultado = await args.directo();
    return { encolada: false, resultado };
  } catch (e) {
    const err = e as Error;
    // Sólo encolamos si parece un fallo de red (TypeError de fetch).
    const esRed = err.name === "TypeError" || /fetch|network|failed/i.test(err.message);
    if (esRed) {
      cola.encolar({ comando: args.comando, input: args.input, descripcion: args.descripcion });
      return { encolada: true };
    }
    return { encolada: false, error: err };
  }
}
