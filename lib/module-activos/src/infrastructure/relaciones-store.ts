/**
 * DGP-008.2 · Módulo Activos — Infraestructura de relaciones, historial y
 * consola técnica. Puertos + adaptadores Fake (offline) y PostgreSQL. Reutiliza
 * el patrón RLS de DGP-008.1: escrituras con set_config vía pgSessionOf(uow),
 * lecturas con transacción tenant-scoped.
 *
 * Todas las proyecciones son PAYLOAD-ONLY e IDEMPOTENTES por last_event_id.
 * Jamás se lee el aggregate desde las consultas (CQRS estricto).
 */
import type { Pool } from "pg";
import {
  fail,
  KernelErrors,
  ok,
  pgSessionOf,
  type KernelError,
  type OutboxRecord,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import type { CategoriaRelacion } from "../domain/relaciones";

/* ------------------------------- Tipos ----------------------------------- */

export interface RelacionRow {
  readonly id: string;
  readonly tipo: string;
  readonly origenId: string;
  readonly destinoId: string;
}

export interface RelacionReadRow {
  readonly tenantId: string;
  readonly id: string;
  readonly tipo: string;
  readonly categoria: CategoriaRelacion;
  readonly origenId: string;
  readonly origenCodigo: string | null;
  readonly origenNombre: string | null;
  readonly destinoId: string;
  readonly destinoCodigo: string | null;
  readonly destinoNombre: string | null;
  readonly lastEventId: string;
  readonly actualizadoAt: Date;
}

export interface UbicacionHistRow {
  readonly tenantId: string;
  readonly eventId: string;
  readonly activoId: string;
  readonly ubicacionId: string | null;
  readonly etiqueta: string | null;
  readonly detalle: string | null;
  readonly coordenadas: Record<string, unknown> | null;
  readonly version: number;
  readonly actorId: string;
  readonly registradoAt: Date;
}

export interface ResponsableHistRow {
  readonly tenantId: string;
  readonly eventId: string;
  readonly activoId: string;
  readonly responsable: string | null;
  readonly supervisor: string | null;
  readonly version: number;
  readonly actorId: string;
  readonly registradoAt: Date;
}

export interface HistorialRow {
  readonly tenantId: string;
  readonly eventId: string;
  readonly activoId: string;
  readonly entityRef: string;
  readonly tipoEvento: string;
  readonly estado: string | null;
  readonly version: number;
  readonly actorId: string;
  readonly resumen: string;
  readonly registradoAt: Date;
}

/* ------------------------------- Puertos --------------------------------- */

/** Fuente de verdad de relaciones + consultas de grafo (para anticiclo). */
export interface RelacionRepository {
  insert(uow: UnitOfWork, tenantId: string, r: RelacionRow, actorId: string): Promise<Result<void, KernelError>>;
  delete(uow: UnitOfWork, tenantId: string, id: string): Promise<Result<RelacionRow | null, KernelError>>;
  find(tenantId: string, id: string): Promise<Result<RelacionRow | null, KernelError>>;
  existeArista(tenantId: string, origenId: string, destinoId: string, tipo: string): Promise<Result<boolean, KernelError>>;
  /** ¿`desdeId` alcanza a `hastaId` siguiendo aristas del `tipo` (anticiclo)? */
  alcanza(tenantId: string, desdeId: string, hastaId: string, tipo: string): Promise<Result<boolean, KernelError>>;
  /** Aristas salientes de un activo (para reconstrucción del read model). */
  salientes(tenantId: string, origenId: string): Promise<Result<RelacionRow[], KernelError>>;
  contar(tenantId: string): Promise<Result<number, KernelError>>;
}

/** Read model de relaciones (árbol/relacionados/componentes). Payload-only. */
export interface RelacionReadModel {
  apply(uow: UnitOfWork, row: RelacionReadRow): Promise<Result<boolean, KernelError>>;
  remove(uow: UnitOfWork, tenantId: string, id: string): Promise<Result<void, KernelError>>;
  /** Relaciones donde el activo participa como origen (opcional filtro categoría). */
  porOrigen(tenantId: string, origenId: string, categoria?: CategoriaRelacion): Promise<Result<RelacionReadRow[], KernelError>>;
  porDestino(tenantId: string, destinoId: string, categoria?: CategoriaRelacion): Promise<Result<RelacionReadRow[], KernelError>>;
  contar(tenantId: string): Promise<Result<number, KernelError>>;
  /** Diagnóstico (consola): último `last_event_id` proyectado del tenant. */
  lastEventId(tenantId: string): Promise<Result<string | null, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/** Read models históricos + línea de tiempo del módulo. Append-only. */
export interface HistorialStore {
  registrarUbicacion(uow: UnitOfWork, row: UbicacionHistRow): Promise<Result<boolean, KernelError>>;
  registrarResponsable(uow: UnitOfWork, row: ResponsableHistRow): Promise<Result<boolean, KernelError>>;
  registrarEvento(uow: UnitOfWork, row: HistorialRow): Promise<Result<boolean, KernelError>>;
  historialUbicaciones(tenantId: string, activoId: string): Promise<Result<UbicacionHistRow[], KernelError>>;
  historialResponsables(tenantId: string, activoId: string): Promise<Result<ResponsableHistRow[], KernelError>>;
  timeline(tenantId: string, activoId: string, limit?: number): Promise<Result<HistorialRow[], KernelError>>;
  contarEventos(tenantId: string): Promise<Result<number, KernelError>>;
  /** Diagnóstico (consola): últimas N entradas de la línea de tiempo del módulo. */
  recientes(tenantId: string, limit?: number): Promise<Result<HistorialRow[], KernelError>>;
  /** Diagnóstico (consola): último `event_id` registrado en la línea de tiempo. */
  lastEventId(tenantId: string): Promise<Result<string | null, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/** Evento durable del módulo (bitácora canónica `act_eventos`). */
export interface EventoBitacora {
  readonly tenantId: string;
  readonly eventId: string;
  readonly tipo: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
}

/**
 * Bitácora de eventos DURABLE e íntegra del módulo (`act_eventos`), fuente de
 * verdad del replay de reproyección. Es INDEPENDIENTE del outbox del Kernel y de
 * su retención/estado de procesamiento: se escribe en la MISMA UoW que emite
 * cada evento del módulo (tabla propia del módulo, no de plataforma).
 */
export interface EventLogStore {
  /** Registra un evento en la bitácora. Idempotente por `event_id`. */
  append(uow: UnitOfWork, ev: EventoBitacora): Promise<Result<boolean, KernelError>>;
  /**
   * Flujo COMPLETO de eventos del tenant en orden cronológico determinista
   * (`occurred_at asc, event_id asc`). Sólo lectura, tenant-scoped. Independiente
   * de si los eventos fueron procesados por el outbox o no.
   */
  stream(tenantId: string): Promise<Result<EventoBitacora[], KernelError>>;
  /** Nº de eventos del tenant (diagnóstico / consola). */
  contar(tenantId: string): Promise<Result<number, KernelError>>;
}

/** Resumen del outbox del módulo para la consola técnica. */
export interface OutboxResumen {
  readonly pendientes: number;
  readonly procesados: number;
  readonly ultimos: Array<{ id: string; tipo: string; processedAt: string | null; occurredAt: string }>;
}

/** Evento del módulo leído del outbox procesado (payload-only) para replay. */
export interface EventoProcesado {
  readonly id: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
}

/**
 * Diagnóstico del outbox transaccional del Kernel filtrado a los eventos de
 * ESTE módulo (event_type `modulo.activos.%`) y al tenant en curso. Sólo
 * lectura; NO reclama ni procesa registros (no perturba el procesador).
 */
export interface ConsolaStore {
  outboxDelModulo(tenantId: string, limit?: number): Promise<Result<OutboxResumen, KernelError>>;
  /**
   * Stream de eventos del módulo YA PROCESADOS, en orden cronológico
   * (occurred_at asc), tenant-scoped y sólo lectura. Es la fuente para la
   * reproyección por replay del event stream (nunca desde snapshots).
   */
  eventosProcesados(tenantId: string): Promise<Result<EventoProcesado[], KernelError>>;
}

/* ------------------------------ Fakes ------------------------------------ */

function coincideCategoria(row: RelacionReadRow, categoria?: CategoriaRelacion): boolean {
  return !categoria || row.categoria === categoria;
}

export class FakeRelacionRepository implements RelacionRepository {
  private readonly rows = new Map<string, RelacionRow & { tenantId: string }>();
  private k(t: string, id: string) {
    return `${t}::${id}`;
  }
  async insert(_uow: UnitOfWork, tenantId: string, r: RelacionRow) {
    this.rows.set(this.k(tenantId, r.id), { ...r, tenantId });
    return ok(undefined);
  }
  async delete(_uow: UnitOfWork, tenantId: string, id: string) {
    const cur = this.rows.get(this.k(tenantId, id)) ?? null;
    this.rows.delete(this.k(tenantId, id));
    return ok(cur ? { id: cur.id, tipo: cur.tipo, origenId: cur.origenId, destinoId: cur.destinoId } : null);
  }
  async find(tenantId: string, id: string) {
    const cur = this.rows.get(this.k(tenantId, id));
    return ok(cur ? { id: cur.id, tipo: cur.tipo, origenId: cur.origenId, destinoId: cur.destinoId } : null);
  }
  async existeArista(tenantId: string, origenId: string, destinoId: string, tipo: string) {
    for (const r of this.rows.values()) {
      if (r.tenantId === tenantId && r.tipo === tipo && r.origenId === origenId && r.destinoId === destinoId) {
        return ok(true);
      }
    }
    return ok(false);
  }
  async alcanza(tenantId: string, desdeId: string, hastaId: string, tipo: string) {
    // BFS por aristas del mismo tipo.
    const visto = new Set<string>();
    const cola = [desdeId];
    while (cola.length > 0) {
      const actual = cola.shift()!;
      if (actual === hastaId) return ok(true);
      if (visto.has(actual)) continue;
      visto.add(actual);
      for (const r of this.rows.values()) {
        if (r.tenantId === tenantId && r.tipo === tipo && r.origenId === actual) cola.push(r.destinoId);
      }
    }
    return ok(false);
  }
  async salientes(tenantId: string, origenId: string) {
    return ok(
      [...this.rows.values()]
        .filter((r) => r.tenantId === tenantId && r.origenId === origenId)
        .map((r) => ({ id: r.id, tipo: r.tipo, origenId: r.origenId, destinoId: r.destinoId })),
    );
  }
  async contar(tenantId: string) {
    return ok([...this.rows.values()].filter((r) => r.tenantId === tenantId).length);
  }
}

export class FakeRelacionReadModel implements RelacionReadModel {
  private readonly rows = new Map<string, RelacionReadRow>();
  private readonly applied = new Set<string>();
  private k(t: string, id: string) {
    return `${t}::${id}`;
  }
  async apply(_uow: UnitOfWork, row: RelacionReadRow) {
    if (this.applied.has(row.lastEventId)) return ok(false);
    this.applied.add(row.lastEventId);
    this.rows.set(this.k(row.tenantId, row.id), row);
    return ok(true);
  }
  async remove(_uow: UnitOfWork, tenantId: string, id: string) {
    this.rows.delete(this.k(tenantId, id));
    return ok(undefined);
  }
  async porOrigen(tenantId: string, origenId: string, categoria?: CategoriaRelacion) {
    return ok(
      [...this.rows.values()]
        .filter((r) => r.tenantId === tenantId && r.origenId === origenId && coincideCategoria(r, categoria))
        .sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || a.id.localeCompare(b.id)),
    );
  }
  async porDestino(tenantId: string, destinoId: string, categoria?: CategoriaRelacion) {
    return ok(
      [...this.rows.values()]
        .filter((r) => r.tenantId === tenantId && r.destinoId === destinoId && coincideCategoria(r, categoria))
        .sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime() || a.id.localeCompare(b.id)),
    );
  }
  async contar(tenantId: string) {
    return ok([...this.rows.values()].filter((r) => r.tenantId === tenantId).length);
  }
  async lastEventId(tenantId: string) {
    let latest: RelacionReadRow | null = null;
    for (const r of this.rows.values()) {
      if (r.tenantId === tenantId && (!latest || r.actualizadoAt.getTime() >= latest.actualizadoAt.getTime())) latest = r;
    }
    return ok(latest ? latest.lastEventId : null);
  }
  async clear(_uow: UnitOfWork, tenantId: string) {
    // Reinicia el guard de idempotencia por eventId del tenant para permitir la
    // reproyección por replay (que reusa los mismos event ids).
    for (const [k, r] of this.rows) {
      if (r.tenantId === tenantId) {
        this.applied.delete(r.lastEventId);
        this.rows.delete(k);
      }
    }
    return ok(undefined);
  }
}

export class FakeHistorialStore implements HistorialStore {
  private readonly ubic = new Map<string, UbicacionHistRow>();
  private readonly resp = new Map<string, ResponsableHistRow>();
  private readonly hist = new Map<string, HistorialRow>();
  private k(t: string, e: string) {
    return `${t}::${e}`;
  }
  async registrarUbicacion(_uow: UnitOfWork, row: UbicacionHistRow) {
    const k = this.k(row.tenantId, row.eventId);
    if (this.ubic.has(k)) return ok(false);
    this.ubic.set(k, row);
    return ok(true);
  }
  async registrarResponsable(_uow: UnitOfWork, row: ResponsableHistRow) {
    const k = this.k(row.tenantId, row.eventId);
    if (this.resp.has(k)) return ok(false);
    this.resp.set(k, row);
    return ok(true);
  }
  async registrarEvento(_uow: UnitOfWork, row: HistorialRow) {
    const k = this.k(row.tenantId, row.eventId);
    if (this.hist.has(k)) return ok(false);
    this.hist.set(k, row);
    return ok(true);
  }
  async historialUbicaciones(tenantId: string, activoId: string) {
    return ok(
      [...this.ubic.values()]
        .filter((r) => r.tenantId === tenantId && r.activoId === activoId)
        .sort((a, b) => b.registradoAt.getTime() - a.registradoAt.getTime() || b.eventId.localeCompare(a.eventId)),
    );
  }
  async historialResponsables(tenantId: string, activoId: string) {
    return ok(
      [...this.resp.values()]
        .filter((r) => r.tenantId === tenantId && r.activoId === activoId)
        .sort((a, b) => b.registradoAt.getTime() - a.registradoAt.getTime() || b.eventId.localeCompare(a.eventId)),
    );
  }
  async timeline(tenantId: string, activoId: string, limit = 100) {
    return ok(
      [...this.hist.values()]
        .filter((r) => r.tenantId === tenantId && r.activoId === activoId)
        .sort((a, b) => b.registradoAt.getTime() - a.registradoAt.getTime() || b.eventId.localeCompare(a.eventId))
        .slice(0, limit),
    );
  }
  async contarEventos(tenantId: string) {
    return ok([...this.hist.values()].filter((r) => r.tenantId === tenantId).length);
  }
  async recientes(tenantId: string, limit = 10) {
    return ok(
      [...this.hist.values()]
        .filter((r) => r.tenantId === tenantId)
        .sort((a, b) => b.registradoAt.getTime() - a.registradoAt.getTime() || b.eventId.localeCompare(a.eventId))
        .slice(0, limit),
    );
  }
  async lastEventId(tenantId: string) {
    let latest: HistorialRow | null = null;
    for (const r of this.hist.values()) {
      if (r.tenantId === tenantId && (!latest || r.registradoAt.getTime() >= latest.registradoAt.getTime())) latest = r;
    }
    return ok(latest ? latest.eventId : null);
  }
  async clear(_uow: UnitOfWork, tenantId: string) {
    for (const m of [this.ubic, this.resp, this.hist]) {
      for (const [k, r] of m as Map<string, { tenantId: string }>) {
        if (r.tenantId === tenantId) m.delete(k);
      }
    }
    return ok(undefined);
  }
}

/** Bitácora de eventos en memoria (offline). Idempotente por event_id. */
export class FakeEventLogStore implements EventLogStore {
  private readonly log = new Map<string, EventoBitacora>();
  private k(t: string, e: string) {
    return `${t}::${e}`;
  }
  async append(_uow: UnitOfWork, ev: EventoBitacora) {
    const k = this.k(ev.tenantId, ev.eventId);
    if (this.log.has(k)) return ok(false);
    this.log.set(k, ev);
    return ok(true);
  }
  async stream(tenantId: string) {
    return ok(
      [...this.log.values()]
        .filter((r) => r.tenantId === tenantId)
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.eventId.localeCompare(b.eventId)),
    );
  }
  async contar(tenantId: string) {
    return ok([...this.log.values()].filter((r) => r.tenantId === tenantId).length);
  }
}

const PREFIJO_EVENTO = "modulo.activos.";

/**
 * Consola en memoria: lee los registros del outbox in-memory del Kernel (vía
 * accesor inyectado) y los filtra al módulo + tenant. No reclama ni procesa.
 */
export class FakeConsolaStore implements ConsolaStore {
  constructor(private readonly records: () => readonly OutboxRecord[]) {}
  async outboxDelModulo(tenantId: string, limit = 10): Promise<Result<OutboxResumen, KernelError>> {
    const propios = this.records().filter(
      (r) => r.eventType.startsWith(PREFIJO_EVENTO) && String(r.payload["tenantId"] ?? "") === tenantId,
    );
    const pendientes = propios.filter((r) => r.processedAt === null).length;
    const ultimos = [...propios]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        tipo: r.eventType,
        processedAt: r.processedAt ? r.processedAt.toISOString() : null,
        occurredAt: r.occurredAt.toISOString(),
      }));
    return ok({ pendientes, procesados: propios.length - pendientes, ultimos });
  }
  async eventosProcesados(tenantId: string): Promise<Result<EventoProcesado[], KernelError>> {
    const propios = this.records().filter(
      (r) =>
        r.eventType.startsWith(PREFIJO_EVENTO) &&
        r.processedAt !== null &&
        String(r.payload["tenantId"] ?? "") === tenantId,
    );
    const orden = [...propios].sort((a, b) => {
      const t = a.occurredAt.getTime() - b.occurredAt.getTime();
      return t !== 0 ? t : a.id.localeCompare(b.id);
    });
    return ok(
      orden.map((r) => ({ id: r.id, eventType: r.eventType, payload: r.payload, occurredAt: r.occurredAt })),
    );
  }
}

/* ------------------------------- PG helpers ------------------------------ */

async function setTenant(uow: UnitOfWork, tenantId: string): Promise<void> {
  await pgSessionOf(uow).query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

async function withTenantRead<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: { query: Pool["query"] }) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const result = await fn(client as unknown as { query: Pool["query"] });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------- PG impls -------------------------------- */

export class PgRelacionRepository implements RelacionRepository {
  constructor(private readonly pool: Pool) {}
  async insert(uow: UnitOfWork, tenantId: string, r: RelacionRow, actorId: string) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.act_relaciones (tenant_id, id, tipo, origen_id, destino_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId, r.id, r.tipo, r.origenId, r.destinoId, actorId],
      );
      return ok(undefined);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return fail(KernelErrors.conflict(`Relación duplicada (${r.tipo} ${r.origenId}->${r.destinoId})`));
      }
      return fail(KernelErrors.infrastructure("Relacion insert falló", err));
    }
  }
  async delete(uow: UnitOfWork, tenantId: string, id: string) {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(
        `DELETE FROM deltaops.act_relaciones WHERE tenant_id=$1 AND id=$2
         RETURNING id, tipo, origen_id, destino_id`,
        [tenantId, id],
      );
      const row = res.rows[0];
      return ok(
        row ? { id: String(row.id), tipo: String(row.tipo), origenId: String(row.origen_id), destinoId: String(row.destino_id) } : null,
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("Relacion delete falló", err));
    }
  }
  async find(tenantId: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT id, tipo, origen_id, destino_id FROM deltaops.act_relaciones WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const row = res.rows[0];
      return ok(
        row ? { id: String(row.id), tipo: String(row.tipo), origenId: String(row.origen_id), destinoId: String(row.destino_id) } : null,
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("Relacion find falló", err));
    }
  }
  async existeArista(tenantId: string, origenId: string, destinoId: string, tipo: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT 1 FROM deltaops.act_relaciones
           WHERE tenant_id=$1 AND tipo=$2 AND origen_id=$3 AND destino_id=$4 LIMIT 1`,
          [tenantId, tipo, origenId, destinoId],
        ),
      );
      return ok(res.rows.length > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Relacion existeArista falló", err));
    }
  }
  async alcanza(tenantId: string, desdeId: string, hastaId: string, tipo: string) {
    // Cierre transitivo con CTE recursiva sobre aristas del mismo tipo.
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `WITH RECURSIVE alcanzables(id) AS (
             SELECT $2::text
             UNION
             SELECT r.destino_id FROM deltaops.act_relaciones r
               JOIN alcanzables a ON r.origen_id = a.id
               WHERE r.tenant_id=$1 AND r.tipo=$4
           )
           SELECT 1 FROM alcanzables WHERE id=$3 LIMIT 1`,
          [tenantId, desdeId, hastaId, tipo],
        ),
      );
      return ok(res.rows.length > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Relacion alcanza falló", err));
    }
  }
  async salientes(tenantId: string, origenId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT id, tipo, origen_id, destino_id FROM deltaops.act_relaciones
           WHERE tenant_id=$1 AND origen_id=$2`,
          [tenantId, origenId],
        ),
      );
      return ok(
        res.rows.map((r) => ({
          id: String(r.id), tipo: String(r.tipo), origenId: String(r.origen_id), destinoId: String(r.destino_id),
        })),
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("Relacion salientes falló", err));
    }
  }
  async contar(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT count(*)::int AS n FROM deltaops.act_relaciones WHERE tenant_id=$1`, [tenantId]),
      );
      return ok(Number(res.rows[0]?.n ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("Relacion contar falló", err));
    }
  }
}

function toReadRow(r: Record<string, unknown>): RelacionReadRow {
  return {
    tenantId: String(r["tenant_id"]),
    id: String(r["id"]),
    tipo: String(r["tipo"]),
    categoria: String(r["categoria"]) as CategoriaRelacion,
    origenId: String(r["origen_id"]),
    origenCodigo: r["origen_codigo"] == null ? null : String(r["origen_codigo"]),
    origenNombre: r["origen_nombre"] == null ? null : String(r["origen_nombre"]),
    destinoId: String(r["destino_id"]),
    destinoCodigo: r["destino_codigo"] == null ? null : String(r["destino_codigo"]),
    destinoNombre: r["destino_nombre"] == null ? null : String(r["destino_nombre"]),
    lastEventId: String(r["last_event_id"]),
    actualizadoAt: r["actualizado_at"] as Date,
  };
}

function toHistorialRow(r: Record<string, unknown>): HistorialRow {
  return {
    tenantId: String(r["tenant_id"]),
    eventId: String(r["event_id"]),
    activoId: String(r["activo_id"]),
    entityRef: String(r["entity_ref"]),
    tipoEvento: String(r["tipo_evento"]),
    estado: r["estado"] == null ? null : String(r["estado"]),
    version: Number(r["version"]),
    actorId: String(r["actor_id"]),
    resumen: String(r["resumen"]),
    registradoAt: r["registrado_at"] as Date,
  };
}

export class PgRelacionReadModel implements RelacionReadModel {
  constructor(private readonly pool: Pool) {}
  async apply(uow: UnitOfWork, row: RelacionReadRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.act_relaciones_read
           (tenant_id, id, tipo, categoria, origen_id, origen_codigo, origen_nombre,
            destino_id, destino_codigo, destino_nombre, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tenant_id, id) DO UPDATE
           SET tipo=EXCLUDED.tipo, categoria=EXCLUDED.categoria,
               origen_id=EXCLUDED.origen_id, origen_codigo=EXCLUDED.origen_codigo,
               origen_nombre=EXCLUDED.origen_nombre, destino_id=EXCLUDED.destino_id,
               destino_codigo=EXCLUDED.destino_codigo, destino_nombre=EXCLUDED.destino_nombre,
               last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
           WHERE deltaops.act_relaciones_read.last_event_id <> EXCLUDED.last_event_id`,
        [
          row.tenantId, row.id, row.tipo, row.categoria, row.origenId, row.origenCodigo,
          row.origenNombre, row.destinoId, row.destinoCodigo, row.destinoNombre,
          row.lastEventId, row.actualizadoAt,
        ],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("RelacionRead apply falló", err));
    }
  }
  async remove(uow: UnitOfWork, tenantId: string, id: string) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(`DELETE FROM deltaops.act_relaciones_read WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("RelacionRead remove falló", err));
    }
  }
  async porOrigen(tenantId: string, origenId: string, categoria?: CategoriaRelacion) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.act_relaciones_read
           WHERE tenant_id=$1 AND origen_id=$2 AND ($3::text IS NULL OR categoria=$3)
           ORDER BY actualizado_at DESC, id ASC`,
          [tenantId, origenId, categoria ?? null],
        ),
      );
      return ok(res.rows.map(toReadRow));
    } catch (err) {
      return fail(KernelErrors.infrastructure("RelacionRead porOrigen falló", err));
    }
  }
  async porDestino(tenantId: string, destinoId: string, categoria?: CategoriaRelacion) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.act_relaciones_read
           WHERE tenant_id=$1 AND destino_id=$2 AND ($3::text IS NULL OR categoria=$3)
           ORDER BY actualizado_at DESC, id ASC`,
          [tenantId, destinoId, categoria ?? null],
        ),
      );
      return ok(res.rows.map(toReadRow));
    } catch (err) {
      return fail(KernelErrors.infrastructure("RelacionRead porDestino falló", err));
    }
  }
  async contar(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT count(*)::int AS n FROM deltaops.act_relaciones_read WHERE tenant_id=$1`, [tenantId]),
      );
      return ok(Number(res.rows[0]?.n ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("RelacionRead contar falló", err));
    }
  }
  async lastEventId(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT last_event_id FROM deltaops.act_relaciones_read
           WHERE tenant_id=$1 ORDER BY actualizado_at DESC LIMIT 1`,
          [tenantId],
        ),
      );
      return ok(res.rows[0] ? String(res.rows[0]["last_event_id"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("RelacionRead lastEventId falló", err));
    }
  }
  async clear(uow: UnitOfWork, tenantId: string) {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(`DELETE FROM deltaops.act_relaciones_read WHERE tenant_id=$1`, [tenantId]);
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("RelacionRead clear falló", err));
    }
  }
}

export class PgHistorialStore implements HistorialStore {
  constructor(private readonly pool: Pool) {}
  async registrarUbicacion(uow: UnitOfWork, row: UbicacionHistRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.act_ubicaciones_hist
           (tenant_id, event_id, activo_id, ubicacion_id, etiqueta, detalle, coordenadas, version, actor_id, registrado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [
          row.tenantId, row.eventId, row.activoId, row.ubicacionId, row.etiqueta, row.detalle,
          row.coordenadas ? JSON.stringify(row.coordenadas) : null, row.version, row.actorId, row.registradoAt,
        ],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Ubicacion hist falló", err));
    }
  }
  async registrarResponsable(uow: UnitOfWork, row: ResponsableHistRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.act_responsables_hist
           (tenant_id, event_id, activo_id, responsable, supervisor, version, actor_id, registrado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [row.tenantId, row.eventId, row.activoId, row.responsable, row.supervisor, row.version, row.actorId, row.registradoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Responsable hist falló", err));
    }
  }
  async registrarEvento(uow: UnitOfWork, row: HistorialRow) {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.act_historial
           (tenant_id, event_id, activo_id, entity_ref, tipo_evento, estado, version, actor_id, resumen, registrado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [
          row.tenantId, row.eventId, row.activoId, row.entityRef, row.tipoEvento, row.estado,
          row.version, row.actorId, row.resumen, row.registradoAt,
        ],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Historial evento falló", err));
    }
  }
  async historialUbicaciones(tenantId: string, activoId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.act_ubicaciones_hist WHERE tenant_id=$1 AND activo_id=$2 ORDER BY registrado_at DESC, event_id DESC`,
          [tenantId, activoId],
        ),
      );
      return ok(
        res.rows.map((r) => ({
          tenantId: String(r["tenant_id"]),
          eventId: String(r["event_id"]),
          activoId: String(r["activo_id"]),
          ubicacionId: r["ubicacion_id"] == null ? null : String(r["ubicacion_id"]),
          etiqueta: r["etiqueta"] == null ? null : String(r["etiqueta"]),
          detalle: r["detalle"] == null ? null : String(r["detalle"]),
          coordenadas: (r["coordenadas"] as Record<string, unknown> | null) ?? null,
          version: Number(r["version"]),
          actorId: String(r["actor_id"]),
          registradoAt: r["registrado_at"] as Date,
        })),
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("Ubicacion hist query falló", err));
    }
  }
  async historialResponsables(tenantId: string, activoId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.act_responsables_hist WHERE tenant_id=$1 AND activo_id=$2 ORDER BY registrado_at DESC, event_id DESC`,
          [tenantId, activoId],
        ),
      );
      return ok(
        res.rows.map((r) => ({
          tenantId: String(r["tenant_id"]),
          eventId: String(r["event_id"]),
          activoId: String(r["activo_id"]),
          responsable: r["responsable"] == null ? null : String(r["responsable"]),
          supervisor: r["supervisor"] == null ? null : String(r["supervisor"]),
          version: Number(r["version"]),
          actorId: String(r["actor_id"]),
          registradoAt: r["registrado_at"] as Date,
        })),
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("Responsable hist query falló", err));
    }
  }
  async timeline(tenantId: string, activoId: string, limit = 100) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.act_historial WHERE tenant_id=$1 AND activo_id=$2
           ORDER BY registrado_at DESC, event_id DESC LIMIT $3`,
          [tenantId, activoId, limit],
        ),
      );
      return ok(res.rows.map(toHistorialRow));
    } catch (err) {
      return fail(KernelErrors.infrastructure("Timeline query falló", err));
    }
  }
  async recientes(tenantId: string, limit = 10) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.act_historial WHERE tenant_id=$1
           ORDER BY registrado_at DESC, event_id DESC LIMIT $2`,
          [tenantId, limit],
        ),
      );
      return ok(res.rows.map(toHistorialRow));
    } catch (err) {
      return fail(KernelErrors.infrastructure("Historial recientes falló", err));
    }
  }
  async lastEventId(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT event_id FROM deltaops.act_historial
           WHERE tenant_id=$1 ORDER BY registrado_at DESC LIMIT 1`,
          [tenantId],
        ),
      );
      return ok(res.rows[0] ? String(res.rows[0]["event_id"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Historial lastEventId falló", err));
    }
  }
  async contarEventos(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT count(*)::int AS n FROM deltaops.act_historial WHERE tenant_id=$1`, [tenantId]),
      );
      return ok(Number(res.rows[0]?.n ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("Historial contar falló", err));
    }
  }
  async clear(uow: UnitOfWork, tenantId: string) {
    try {
      await setTenant(uow, tenantId);
      const s = pgSessionOf(uow);
      await s.query(`DELETE FROM deltaops.act_ubicaciones_hist WHERE tenant_id=$1`, [tenantId]);
      await s.query(`DELETE FROM deltaops.act_responsables_hist WHERE tenant_id=$1`, [tenantId]);
      await s.query(`DELETE FROM deltaops.act_historial WHERE tenant_id=$1`, [tenantId]);
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Historial clear falló", err));
    }
  }
}

/**
 * Bitácora de eventos en PostgreSQL (`deltaops.act_eventos`, RLS por tenant).
 * `append` escribe en la misma UoW que emite el evento (set_config via
 * pgSessionOf). `stream` es una lectura tenant-scoped, en orden determinista.
 */
export class PgEventLogStore implements EventLogStore {
  constructor(private readonly pool: Pool) {}
  async append(uow: UnitOfWork, ev: EventoBitacora) {
    try {
      await setTenant(uow, ev.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.act_eventos (tenant_id, event_id, tipo, payload, occurred_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, event_id) DO NOTHING`,
        [ev.tenantId, ev.eventId, ev.tipo, JSON.stringify(ev.payload), ev.occurredAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog append falló", err));
    }
  }
  async stream(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT tenant_id, event_id, tipo, payload, occurred_at
           FROM deltaops.act_eventos
           WHERE tenant_id=$1
           ORDER BY occurred_at ASC, event_id ASC`,
          [tenantId],
        ),
      );
      return ok(
        res.rows.map((r) => ({
          tenantId: String(r["tenant_id"]),
          eventId: String(r["event_id"]),
          tipo: String(r["tipo"]),
          payload:
            (typeof r["payload"] === "string"
              ? JSON.parse(r["payload"] as string)
              : (r["payload"] as Record<string, unknown>)) ?? {},
          occurredAt: r["occurred_at"] as Date,
        })),
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog stream falló", err));
    }
  }
  async contar(tenantId: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT count(*)::int AS n FROM deltaops.act_eventos WHERE tenant_id=$1`, [tenantId]),
      );
      return ok(Number(res.rows[0]?.n ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("EventLog contar falló", err));
    }
  }
}

/**
 * Consola en PostgreSQL: consulta de sólo lectura sobre `deltaops.kernel_outbox`
 * (tabla propia del Kernel, sin RLS; el tenant vive en `payload->>'tenantId'`).
 * Filtra a los eventos del módulo (`event_type LIKE 'modulo.activos.%'`) y al
 * tenant. No usa `claimPending` (no perturba el procesador de outbox).
 */
export class PgConsolaStore implements ConsolaStore {
  constructor(private readonly pool: Pool) {}
  async outboxDelModulo(tenantId: string, limit = 10): Promise<Result<OutboxResumen, KernelError>> {
    const client = await this.pool.connect();
    try {
      const conteo = await client.query(
        `SELECT
           count(*) FILTER (WHERE processed_at IS NULL)::int AS pendientes,
           count(*) FILTER (WHERE processed_at IS NOT NULL)::int AS procesados
         FROM deltaops.kernel_outbox
         WHERE event_type LIKE 'modulo.activos.%' AND payload->>'tenantId' = $1`,
        [tenantId],
      );
      const ultimos = await client.query(
        `SELECT id, event_type, processed_at, occurred_at
         FROM deltaops.kernel_outbox
         WHERE event_type LIKE 'modulo.activos.%' AND payload->>'tenantId' = $1
         ORDER BY occurred_at DESC LIMIT $2`,
        [tenantId, limit],
      );
      return ok({
        pendientes: Number(conteo.rows[0]?.pendientes ?? 0),
        procesados: Number(conteo.rows[0]?.procesados ?? 0),
        ultimos: ultimos.rows.map((r) => ({
          id: String(r["id"]),
          tipo: String(r["event_type"]),
          processedAt: r["processed_at"] == null ? null : (r["processed_at"] as Date).toISOString(),
          occurredAt: (r["occurred_at"] as Date).toISOString(),
        })),
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("Consola outbox falló", err));
    } finally {
      client.release();
    }
  }
  async eventosProcesados(tenantId: string): Promise<Result<EventoProcesado[], KernelError>> {
    const client = await this.pool.connect();
    try {
      const rows = await client.query(
        `SELECT id, event_type, payload, occurred_at
         FROM deltaops.kernel_outbox
         WHERE event_type LIKE 'modulo.activos.%'
           AND processed_at IS NOT NULL
           AND payload->>'tenantId' = $1
         ORDER BY occurred_at ASC, id ASC`,
        [tenantId],
      );
      return ok(
        rows.rows.map((r) => ({
          id: String(r["id"]),
          eventType: String(r["event_type"]),
          payload: (typeof r["payload"] === "string"
            ? JSON.parse(r["payload"] as string)
            : (r["payload"] as Record<string, unknown>)) ?? {},
          occurredAt: r["occurred_at"] as Date,
        })),
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("Consola eventosProcesados falló", err));
    } finally {
      client.release();
    }
  }
}
