/**
 * DGP-008.3 · Cola de sincronización offline persistente.
 *
 * - Persiste en localStorage con clave por TENANT (recuperable tras recarga).
 * - Encolado automático cuando `fetch` falla por red.
 * - Reintentos manuales y automáticos (evento `online`).
 * - Estados por operación (pendiente/enviando/aplicada/idempotente/conflicto/
 *   reintentable/rechazada) y resolución de conflictos (descartar).
 *
 * Es un store observable minimalista (patrón subscribe/getSnapshot) apto para
 * `useSyncExternalStore`.
 */
import type {
  EstadoOperacion,
  OperacionCola,
  ReciboSync,
  ResumenSync,
} from "./tipos";
import { ESTADOS_EXITO } from "./tipos";

/**
 * Base del prefijo de almacenamiento. Cada módulo (activos/ordenes) usa su propio
 * espacio de nombres para aislar las colas, manteniendo el aislamiento por tenant.
 */
function claveTenant(tenant: string, modulo: string): string {
  return `deltaops:${modulo}:cola:${tenant}`;
}

/** Genera un UUID v4 (usa crypto.randomUUID si está disponible). */
export function nuevoOpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback simple.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type Escucha = () => void;

export interface EncolarArgs {
  comando: string;
  input: Record<string, unknown>;
  descripcion: string;
  /** opId preexistente (para reusar el mismo entre reintentos). */
  opId?: string;
}

/**
 * Cola offline observable. Una instancia por tenant. El envío real se delega a
 * un `enviador` inyectable para poder testear sin red.
 */
export class ColaSync {
  private ops: OperacionCola[] = [];
  private escuchas = new Set<Escucha>();
  private enviando = false;
  private snapshot: readonly OperacionCola[] = [];

  constructor(
    private readonly tenant: string,
    private readonly enviador: (ops: OperacionCola[]) => Promise<ResumenSync> = enviarPorHttp,
    private readonly storage: Storage | null = typeof localStorage !== "undefined" ? localStorage : null,
    /** Espacio de nombres del módulo (aísla la cola por dominio). */
    private readonly modulo: string = "activos",
  ) {
    this.cargar();
  }

  /* ------------------------------ Persistencia --------------------------- */

  private cargar(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(claveTenant(this.tenant, this.modulo));
      if (raw) {
        const datos = JSON.parse(raw) as OperacionCola[];
        // Al recargar, 'enviando' vuelve a 'pendiente' (recuperación).
        this.ops = datos.map((o) => ({
          ...o,
          estado: o.estado === "enviando" ? "pendiente" : o.estado,
        }));
      }
    } catch {
      this.ops = [];
    }
    this.recalcular();
  }

  private guardar(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(claveTenant(this.tenant, this.modulo), JSON.stringify(this.ops));
    } catch {
      /* cuota excedida: se ignora, la cola sigue en memoria */
    }
  }

  private recalcular(): void {
    this.snapshot = this.ops.map((o) => ({ ...o }));
    this.guardar();
    for (const e of this.escuchas) e();
  }

  /* ------------------------------ Observable ----------------------------- */

  subscribe = (fn: Escucha): (() => void) => {
    this.escuchas.add(fn);
    return () => this.escuchas.delete(fn);
  };

  getSnapshot = (): readonly OperacionCola[] => this.snapshot;

  /* -------------------------------- API ---------------------------------- */

  /** Nº de operaciones pendientes o reintentables. */
  pendientes(): number {
    return this.ops.filter((o) => o.estado === "pendiente" || o.estado === "reintentable").length;
  }

  conflictos(): OperacionCola[] {
    return this.ops.filter((o) => o.estado === "conflicto");
  }

  /** Encola una operación y devuelve su opId. */
  encolar({ comando, input, descripcion, opId }: EncolarArgs): string {
    const id = opId ?? nuevoOpId();
    const op: OperacionCola = {
      opId: id,
      comando,
      input: { ...input, opId: id },
      descripcion,
      encoladaAt: new Date().toISOString(),
      estado: "pendiente",
      intentos: 0,
    };
    this.ops = [...this.ops, op];
    this.recalcular();
    return id;
  }

  /** Descarta una operación (por opId). Útil para conflictos o rechazos. */
  descartar(opId: string): void {
    this.ops = this.ops.filter((o) => o.opId !== opId);
    this.recalcular();
  }

  /** Purga las operaciones ya aplicadas/idempotentes. */
  purgarExitosas(): void {
    this.ops = this.ops.filter((o) => !ESTADOS_EXITO.includes(o.estado as never));
    this.recalcular();
  }

  /** Marca una operación como pendiente de nuevo (reintento manual). */
  reactivar(opId: string): void {
    this.ops = this.ops.map((o) =>
      o.opId === opId ? { ...o, estado: "pendiente", mensaje: undefined } : o,
    );
    this.recalcular();
  }

  private aplicarRecibo(recibo: ReciboSync): void {
    this.ops = this.ops.map((o) => {
      if (o.opId !== recibo.opId) return o;
      const estado = recibo.estado as EstadoOperacion;
      return {
        ...o,
        estado,
        intentos: o.intentos + 1,
        actualizadaAt: new Date().toISOString(),
        mensaje: recibo.error ?? recibo.advertencia,
        actual: recibo.actual,
        resultado: recibo.resultado,
      };
    });
  }

  /**
   * Procesa la cola: envía las pendientes/reintentables en un solo lote y
   * aplica los recibos. Devuelve el resumen del servidor (o null si no había
   * nada que enviar). Si el envío falla por red, deja las operaciones como
   * 'pendiente' para reintento posterior.
   */
  async procesar(): Promise<ResumenSync | null> {
    if (this.enviando) return null;
    const aEnviar = this.ops.filter(
      (o) => o.estado === "pendiente" || o.estado === "reintentable",
    );
    if (aEnviar.length === 0) return null;
    this.enviando = true;
    this.ops = this.ops.map((o) =>
      aEnviar.some((x) => x.opId === o.opId) ? { ...o, estado: "enviando" } : o,
    );
    this.recalcular();
    try {
      const resumen = await this.enviador(aEnviar);
      for (const r of resumen.resultados) this.aplicarRecibo(r);
      this.recalcular();
      return resumen;
    } catch (e) {
      // Fallo de red: revertir a pendiente para reintento.
      this.ops = this.ops.map((o) =>
        o.estado === "enviando"
          ? { ...o, estado: "pendiente", mensaje: (e as Error).message }
          : o,
      );
      this.recalcular();
      return null;
    } finally {
      this.enviando = false;
    }
  }

  /** Todas las operaciones (copia). */
  todas(): OperacionCola[] {
    return this.ops.map((o) => ({ ...o }));
  }
}

/** Crea un enviador HTTP para el endpoint /sync de un módulo dado. */
export function crearEnviadorHttp(
  url: string,
): (ops: OperacionCola[]) => Promise<ResumenSync> {
  return async (ops: OperacionCola[]): Promise<ResumenSync> => {
    const operaciones = ops.map((o) => ({ opId: o.opId, comando: o.comando, input: o.input }));
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operaciones }),
    });
    if (!res.ok) {
      throw new Error(`sync HTTP ${res.status}`);
    }
    return (await res.json()) as ResumenSync;
  };
}

/** Enviador HTTP por defecto: POST /api/deltaops/activos/sync. */
export const enviarPorHttp = crearEnviadorHttp("/api/deltaops/activos/sync");
