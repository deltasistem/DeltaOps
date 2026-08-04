/**
 * DGP-008.1 · Módulo Activos — Infraestructura.
 *
 * Puertos + adaptadores Fake (offline) y PostgreSQL. El aggregate se persiste
 * en tablas PROPIAS del módulo (deltaops.act_activos / _read / _sync_receipts),
 * NUNCA en el Record Store (ese se reserva a los catálogos). RLS por tenant:
 * escrituras con set_config vía pgSessionOf(uow); lecturas con withTenantRead.
 */
import type { Pool } from "pg";
import {
  fail,
  KernelErrors,
  ok,
  pgSessionOf,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import type { Activo } from "../domain/activo";
import type { EstadoActivo } from "../domain/maquina-estados";

/* -------------------------------- Puertos -------------------------------- */

export interface ActivoFilter {
  readonly estado?: EstadoActivo;
  readonly criticidad?: string;
  readonly ubicacionId?: string;
  readonly tipo?: string;
  readonly limit?: number;
}

export interface ActivoRepository {
  insert(uow: UnitOfWork, a: Activo): Promise<Result<void, KernelError>>;
  update(uow: UnitOfWork, a: Activo, expectedVersion: number): Promise<Result<void, KernelError>>;
  findById(tenantId: string, id: string): Promise<Result<Activo | null, KernelError>>;
  findByCodigo(tenantId: string, codigo: string): Promise<Result<Activo | null, KernelError>>;
  list(tenantId: string, filter: ActivoFilter): Promise<Result<Activo[], KernelError>>;
}

export interface ActivoReadRow {
  readonly tenantId: string;
  readonly id: string;
  readonly codigoEmpresarial: string;
  readonly nombre: string;
  readonly estado: EstadoActivo;
  readonly tipo: string;
  readonly criticidad: string | null;
  readonly ubicacionId: string | null;
  readonly datos: Record<string, unknown>;
  readonly version: number;
  readonly lastEventId: string;
  readonly actualizadoAt: Date;
}

export interface ActivoReadModel {
  apply(uow: UnitOfWork, row: ActivoReadRow): Promise<Result<boolean, KernelError>>;
  get(tenantId: string, id: string): Promise<Result<ActivoReadRow | null, KernelError>>;
  list(tenantId: string, filter: ActivoFilter): Promise<Result<ActivoReadRow[], KernelError>>;
  stats(tenantId: string): Promise<Result<Record<string, number>, KernelError>>;
  /** Diagnóstico: último `last_event_id` proyectado del tenant (o `null`). */
  lastEventId(tenantId: string): Promise<Result<string | null, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/**
 * Recibo durable de sincronización offline, indexado por `(tenant, opId)`.
 * Registra el `opId`, el `id` de cliente de la entidad, el comando, el estado
 * (`pendiente` durante la RECLAMACIÓN; luego el estado terminal
 * aplicada/idempotente/conflicto/rechazada) y el payload de respuesta completo,
 * de modo que un REPLAY (creación o mutación) devuelve el recibo original SIN
 * re-ejecutar el comando. Aislado por tenant vía RLS.
 */
export interface SyncReceipt {
  readonly opId: string;
  readonly clienteId: string | null;
  readonly comando: string;
  readonly estado: string;
  readonly resultado: unknown;
  /** Antigüedad del recibo (para recuperar 'pendiente' viejos). */
  readonly createdAt?: Date;
}

/** Resultado de reclamar durablemente un `opId` antes de ejecutar el comando. */
export interface ClaimResult {
  /** `true` si ESTA solicitud reclamó (insertó) el recibo 'pendiente'. */
  readonly duenio: boolean;
  /** Recibo existente cuando `duenio=false` (puede estar en curso o terminal). */
  readonly recibo?: SyncReceipt;
}

export interface SyncReceiptStore {
  /**
   * RECLAMA durablemente el `opId` ANTES de ejecutar: inserta el recibo en
   * estado 'pendiente' con ON CONFLICT DO NOTHING y, en la MISMA transacción,
   * determina si esta solicitud ganó la reclamación. Si no ganó, devuelve el
   * recibo existente (terminal ⇒ replay; 'pendiente' ⇒ otro dueño en curso).
   */
  claim(tenantId: string, opId: string, clienteId: string | null, comando: string): Promise<Result<ClaimResult, KernelError>>;
  /** Busca el recibo por `(tenant, opId)`. Lectura tenant-scoped (RLS). */
  find(tenantId: string, opId: string): Promise<Result<SyncReceipt | null, KernelError>>;
  /**
   * FINALIZA un recibo 'pendiente' propio: UPDATE al estado terminal con el
   * resultado completo (sólo si sigue 'pendiente'). Devuelve `true` si actualizó.
   * Un fallo aquí NO debe reportarse como éxito durable.
   */
  finalize(tenantId: string, r: SyncReceipt): Promise<Result<boolean, KernelError>>;
  /**
   * LIBERA una reclamación 'pendiente' (DELETE) para permitir que un reintento
   * posterior vuelva a reclamar el `opId`. Se usa ante fallos de infraestructura
   * del comando (KRN-INF-001), que no dejan efecto durable alguno.
   */
  release(tenantId: string, opId: string): Promise<Result<void, KernelError>>;
  /**
   * Diagnóstico (consola): lista todos los recibos del tenant (tenant-scoped,
   * RLS). Sólo lectura; no participa del protocolo de reclamación.
   */
  listByTenant(tenantId: string): Promise<Result<SyncReceipt[], KernelError>>;
}

/* ----------------------------- Serialización ----------------------------- */

/** Empaqueta todos los campos del aggregate como `datos` (JSONB en PG). */
export function activoADatos(a: Activo): Record<string, unknown> {
  return {
    codigoEmpresarial: a.codigoEmpresarial,
    nombre: a.nombre,
    descripcion: a.descripcion,
    estado: a.estado,
    tipo: a.tipo,
    categoria: a.categoria,
    familia: a.familia,
    subfamilia: a.subfamilia,
    fabricante: a.fabricante,
    modelo: a.modelo,
    serie: a.serie,
    anio: a.anio,
    fechaCompra: a.fechaCompra,
    fechaPuestaServicio: a.fechaPuestaServicio,
    vidaUtil: a.vidaUtil,
    valorAdquisicion: a.valorAdquisicion,
    valorResidual: a.valorResidual,
    moneda: a.moneda,
    centroCosto: a.centroCosto,
    empresa: a.empresa,
    proyecto: a.proyecto,
    proveedor: a.proveedor,
    ubicacion: a.ubicacion,
    responsable: a.responsable,
    supervisor: a.supervisor,
    horometro: a.horometro,
    odometro: a.odometro,
    garantia: a.garantia,
    identificacion: a.identificacion,
    especificaciones: a.especificaciones,
    criticidad: a.criticidad,
    prioridad: a.prioridad,
    observaciones: a.observaciones,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
  };
}

function datosAActivo(
  tenantId: string,
  id: string,
  version: number,
  updatedAt: Date,
  d: Record<string, unknown>,
): Activo {
  const s = (k: string): string | null => (d[k] == null ? null : String(d[k]));
  const n = (k: string): number | null => (d[k] == null ? null : Number(d[k]));
  return {
    id,
    tenantId,
    codigoEmpresarial: String(d["codigoEmpresarial"] ?? ""),
    nombre: String(d["nombre"] ?? ""),
    descripcion: String(d["descripcion"] ?? ""),
    estado: (d["estado"] as EstadoActivo) ?? "BORRADOR",
    tipo: String(d["tipo"] ?? ""),
    categoria: String(d["categoria"] ?? ""),
    familia: String(d["familia"] ?? ""),
    subfamilia: s("subfamilia"),
    fabricante: s("fabricante"),
    modelo: s("modelo"),
    serie: s("serie"),
    anio: n("anio"),
    fechaCompra: s("fechaCompra"),
    fechaPuestaServicio: s("fechaPuestaServicio"),
    vidaUtil: n("vidaUtil"),
    valorAdquisicion: n("valorAdquisicion"),
    valorResidual: n("valorResidual"),
    moneda: s("moneda"),
    centroCosto: s("centroCosto"),
    empresa: s("empresa"),
    proyecto: s("proyecto"),
    proveedor: s("proveedor"),
    ubicacion: (d["ubicacion"] as Activo["ubicacion"]) ?? null,
    responsable: s("responsable"),
    supervisor: s("supervisor"),
    horometro: (d["horometro"] as Activo["horometro"]) ?? null,
    odometro: (d["odometro"] as Activo["odometro"]) ?? null,
    garantia: (d["garantia"] as Activo["garantia"]) ?? null,
    identificacion: (d["identificacion"] as Activo["identificacion"]) ?? null,
    especificaciones: (d["especificaciones"] as Activo["especificaciones"]) ?? null,
    criticidad: s("criticidad"),
    prioridad: s("prioridad"),
    observaciones: String(d["observaciones"] ?? ""),
    version,
    createdBy: String(d["createdBy"] ?? ""),
    createdAt: d["createdAt"] ? new Date(String(d["createdAt"])) : updatedAt,
    updatedAt,
  };
}

/* ------------------------------ Adaptadores Fake -------------------------- */

export class FakeActivoRepository implements ActivoRepository {
  private readonly rows = new Map<string, Activo>();
  private key(t: string, id: string) {
    return `${t}::${id}`;
  }

  async insert(_uow: UnitOfWork, a: Activo): Promise<Result<void, KernelError>> {
    if (this.rows.has(this.key(a.tenantId, a.id))) {
      return fail(KernelErrors.conflict(`Activo ya existe: ${a.id}`));
    }
    this.rows.set(this.key(a.tenantId, a.id), a);
    return ok(undefined);
  }

  async update(_uow: UnitOfWork, a: Activo, expectedVersion: number): Promise<Result<void, KernelError>> {
    const current = this.rows.get(this.key(a.tenantId, a.id));
    if (!current || current.version !== expectedVersion) {
      return fail(KernelErrors.conflict(`Conflicto de concurrencia en ${a.id}`));
    }
    this.rows.set(this.key(a.tenantId, a.id), a);
    return ok(undefined);
  }

  async findById(tenantId: string, id: string) {
    return ok(this.rows.get(this.key(tenantId, id)) ?? null);
  }

  async findByCodigo(tenantId: string, codigo: string) {
    for (const a of this.rows.values()) {
      if (a.tenantId === tenantId && a.codigoEmpresarial.toLowerCase() === codigo.toLowerCase()) {
        return ok(a);
      }
    }
    return ok(null);
  }

  async list(tenantId: string, filter: ActivoFilter) {
    const all = [...this.rows.values()]
      .filter(
        (a) =>
          a.tenantId === tenantId &&
          (!filter.estado || a.estado === filter.estado) &&
          (!filter.criticidad || a.criticidad === filter.criticidad) &&
          (!filter.tipo || a.tipo === filter.tipo) &&
          (!filter.ubicacionId || a.ubicacion?.ubicacionId === filter.ubicacionId),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return ok(all.slice(0, filter.limit ?? 100));
  }
}

export class FakeActivoReadModel implements ActivoReadModel {
  private readonly rows = new Map<string, ActivoReadRow>();
  private readonly applied = new Set<string>();
  private key(t: string, id: string) {
    return `${t}::${id}`;
  }

  async apply(_uow: UnitOfWork, row: ActivoReadRow): Promise<Result<boolean, KernelError>> {
    if (this.applied.has(row.lastEventId)) return ok(false);
    const current = this.rows.get(this.key(row.tenantId, row.id));
    if (current && current.version > row.version) return ok(false); // evento viejo
    this.applied.add(row.lastEventId);
    this.rows.set(this.key(row.tenantId, row.id), row);
    return ok(true);
  }

  async get(tenantId: string, id: string) {
    return ok(this.rows.get(this.key(tenantId, id)) ?? null);
  }

  async list(tenantId: string, filter: ActivoFilter) {
    const all = [...this.rows.values()]
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          (!filter.estado || r.estado === filter.estado) &&
          (!filter.criticidad || r.criticidad === filter.criticidad) &&
          (!filter.tipo || r.tipo === filter.tipo) &&
          (!filter.ubicacionId || r.ubicacionId === filter.ubicacionId),
      )
      .sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime());
    return ok(all.slice(0, filter.limit ?? 100));
  }

  async stats(tenantId: string): Promise<Result<Record<string, number>, KernelError>> {
    const s: Record<string, number> = {};
    for (const r of this.rows.values()) {
      if (r.tenantId === tenantId) s[r.estado] = (s[r.estado] ?? 0) + 1;
    }
    return ok(s);
  }

  async lastEventId(tenantId: string): Promise<Result<string | null, KernelError>> {
    let latest: ActivoReadRow | null = null;
    for (const r of this.rows.values()) {
      if (r.tenantId === tenantId && (!latest || r.actualizadoAt.getTime() >= latest.actualizadoAt.getTime())) latest = r;
    }
    return ok(latest ? latest.lastEventId : null);
  }

  async clear(_uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>> {
    // Al vaciar el read model del tenant se DEBE reiniciar el guard de
    // idempotencia por eventId para que la reproyección por replay (que reusa
    // los MISMOS event ids) pueda repoblar las filas eliminadas.
    for (const [k, r] of this.rows) {
      if (r.tenantId === tenantId) {
        this.applied.delete(r.lastEventId);
        this.rows.delete(k);
      }
    }
    return ok(undefined);
  }
}

/**
 * Store de recibos en memoria (offline/pruebas). Aislado por tenant. Emula el
 * protocolo de RECLAMACIÓN durable: claim (insert 'pendiente' ON CONFLICT DO
 * NOTHING) → finalize (UPDATE 'pendiente'→terminal) → release (DELETE).
 */
export class FakeSyncReceiptStore implements SyncReceiptStore {
  private readonly rows = new Map<string, SyncReceipt & { createdAt: Date }>();
  private key(tenantId: string, opId: string): string {
    return `${tenantId}::${opId}`;
  }

  async claim(
    tenantId: string,
    opId: string,
    clienteId: string | null,
    comando: string,
  ): Promise<Result<ClaimResult, KernelError>> {
    const k = this.key(tenantId, opId);
    const existente = this.rows.get(k);
    if (existente) return ok({ duenio: false, recibo: existente });
    const nuevo = { opId, clienteId, comando, estado: "pendiente", resultado: null, createdAt: new Date(this.now) };
    this.rows.set(k, nuevo);
    return ok({ duenio: true });
  }

  async find(tenantId: string, opId: string): Promise<Result<SyncReceipt | null, KernelError>> {
    return ok(this.rows.get(this.key(tenantId, opId)) ?? null);
  }

  async finalize(tenantId: string, r: SyncReceipt): Promise<Result<boolean, KernelError>> {
    const k = this.key(tenantId, r.opId);
    const existente = this.rows.get(k);
    if (!existente || existente.estado !== "pendiente") return ok(false);
    this.rows.set(k, { ...existente, comando: r.comando, estado: r.estado, resultado: r.resultado });
    return ok(true);
  }

  async release(tenantId: string, opId: string): Promise<Result<void, KernelError>> {
    this.rows.delete(this.key(tenantId, opId));
    return ok(undefined);
  }

  async listByTenant(tenantId: string): Promise<Result<SyncReceipt[], KernelError>> {
    const prefix = `${tenantId}::`;
    const out: SyncReceipt[] = [];
    for (const [k, r] of this.rows) if (k.startsWith(prefix)) out.push(r);
    out.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    return ok(out);
  }

  /** Reloj inyectable para pruebas de recuperación de 'pendiente' viejos. */
  now = Date.now();
}

/* ---------------------------- Adaptadores PG ------------------------------ */

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

interface PgRow {
  tenant_id: string;
  id: string;
  version: number;
  updated_at: Date;
  datos: Record<string, unknown>;
}

export class PgActivoRepository implements ActivoRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, a: Activo): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, a.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.act_activos
           (tenant_id, id, codigo_empresarial, nombre, estado, tipo, criticidad, ubicacion_id,
            datos, version, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          a.tenantId, a.id, a.codigoEmpresarial, a.nombre, a.estado, a.tipo, a.criticidad,
          a.ubicacion?.ubicacionId ?? null, JSON.stringify(activoADatos(a)), a.version,
          a.createdBy, a.createdAt, a.updatedAt,
        ],
      );
      return ok(undefined);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "23505") {
        return fail(KernelErrors.conflict(`Activo duplicado (${a.id} / ${a.codigoEmpresarial})`));
      }
      return fail(KernelErrors.infrastructure("Repository insert falló", err));
    }
  }

  async update(uow: UnitOfWork, a: Activo, expectedVersion: number): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, a.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.act_activos
         SET codigo_empresarial=$4, nombre=$5, estado=$6, tipo=$7, criticidad=$8,
             ubicacion_id=$9, datos=$10, version=$11, updated_at=$12
         WHERE tenant_id=$1 AND id=$2 AND version=$3`,
        [
          a.tenantId, a.id, expectedVersion, a.codigoEmpresarial, a.nombre, a.estado, a.tipo,
          a.criticidad, a.ubicacion?.ubicacionId ?? null, JSON.stringify(activoADatos(a)),
          a.version, a.updatedAt,
        ],
      );
      if (res.rowCount === 0) {
        return fail(
          KernelErrors.conflict(`Conflicto de concurrencia en ${a.id} (esperada v${expectedVersion})`),
        );
      }
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository update falló", err));
    }
  }

  async findById(tenantId: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query<PgRow>(`SELECT * FROM deltaops.act_activos WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? datosAActivo(r.tenant_id, r.id, r.version, r.updated_at, r.datos) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository findById falló", err));
    }
  }

  async findByCodigo(tenantId: string, codigo: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query<PgRow>(
          `SELECT * FROM deltaops.act_activos WHERE tenant_id=$1 AND lower(codigo_empresarial)=lower($2)`,
          [tenantId, codigo],
        ),
      );
      const r = res.rows[0];
      return ok(r ? datosAActivo(r.tenant_id, r.id, r.version, r.updated_at, r.datos) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository findByCodigo falló", err));
    }
  }

  async list(tenantId: string, filter: ActivoFilter) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query<PgRow>(
          `SELECT * FROM deltaops.act_activos
           WHERE tenant_id=$1
             AND ($2::text IS NULL OR estado=$2)
             AND ($3::text IS NULL OR criticidad=$3)
             AND ($4::text IS NULL OR tipo=$4)
             AND ($5::text IS NULL OR ubicacion_id=$5)
           ORDER BY updated_at DESC LIMIT $6`,
          [
            tenantId, filter.estado ?? null, filter.criticidad ?? null, filter.tipo ?? null,
            filter.ubicacionId ?? null, filter.limit ?? 100,
          ],
        ),
      );
      return ok(res.rows.map((r) => datosAActivo(r.tenant_id, r.id, r.version, r.updated_at, r.datos)));
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository list falló", err));
    }
  }
}

export class PgActivoReadModel implements ActivoReadModel {
  constructor(private readonly pool: Pool) {}

  async apply(uow: UnitOfWork, row: ActivoReadRow): Promise<Result<boolean, KernelError>> {
    try {
      await setTenant(uow, row.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.act_activos_read
           (tenant_id, id, codigo_empresarial, nombre, estado, tipo, criticidad, ubicacion_id,
            datos, version, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tenant_id, id) DO UPDATE
           SET codigo_empresarial=EXCLUDED.codigo_empresarial, nombre=EXCLUDED.nombre,
               estado=EXCLUDED.estado, tipo=EXCLUDED.tipo, criticidad=EXCLUDED.criticidad,
               ubicacion_id=EXCLUDED.ubicacion_id, datos=EXCLUDED.datos, version=EXCLUDED.version,
               last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
           WHERE deltaops.act_activos_read.last_event_id <> EXCLUDED.last_event_id
             AND deltaops.act_activos_read.version <= EXCLUDED.version`,
        [
          row.tenantId, row.id, row.codigoEmpresarial, row.nombre, row.estado, row.tipo,
          row.criticidad, row.ubicacionId, JSON.stringify(row.datos), row.version,
          row.lastEventId, row.actualizadoAt,
        ],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel apply falló", err));
    }
  }

  async get(tenantId: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT * FROM deltaops.act_activos_read WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      const r = res.rows[0];
      return ok(r ? this.toRow(r) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel get falló", err));
    }
  }

  async list(tenantId: string, filter: ActivoFilter) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.act_activos_read
           WHERE tenant_id=$1
             AND ($2::text IS NULL OR estado=$2)
             AND ($3::text IS NULL OR criticidad=$3)
             AND ($4::text IS NULL OR tipo=$4)
             AND ($5::text IS NULL OR ubicacion_id=$5)
           ORDER BY actualizado_at DESC LIMIT $6`,
          [
            tenantId, filter.estado ?? null, filter.criticidad ?? null, filter.tipo ?? null,
            filter.ubicacionId ?? null, filter.limit ?? 100,
          ],
        ),
      );
      return ok(res.rows.map((r) => this.toRow(r)));
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel list falló", err));
    }
  }

  async stats(tenantId: string): Promise<Result<Record<string, number>, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT estado, count(*)::int AS n FROM deltaops.act_activos_read
           WHERE tenant_id=$1 GROUP BY estado`,
          [tenantId],
        ),
      );
      const s: Record<string, number> = {};
      for (const r of res.rows) s[String(r.estado)] = Number(r.n);
      return ok(s);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel stats falló", err));
    }
  }

  async lastEventId(tenantId: string): Promise<Result<string | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT last_event_id FROM deltaops.act_activos_read
           WHERE tenant_id=$1 ORDER BY actualizado_at DESC LIMIT 1`,
          [tenantId],
        ),
      );
      return ok(res.rows[0] ? String(res.rows[0]["last_event_id"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel lastEventId falló", err));
    }
  }

  async clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(`DELETE FROM deltaops.act_activos_read WHERE tenant_id=$1`, [tenantId]);
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel clear falló", err));
    }
  }

  private toRow(r: Record<string, unknown>): ActivoReadRow {
    return {
      tenantId: String(r["tenant_id"]),
      id: String(r["id"]),
      codigoEmpresarial: String(r["codigo_empresarial"] ?? ""),
      nombre: String(r["nombre"] ?? ""),
      estado: r["estado"] as EstadoActivo,
      tipo: String(r["tipo"] ?? ""),
      criticidad: r["criticidad"] == null ? null : String(r["criticidad"]),
      ubicacionId: r["ubicacion_id"] == null ? null : String(r["ubicacion_id"]),
      datos: (r["datos"] as Record<string, unknown>) ?? {},
      version: Number(r["version"]),
      lastEventId: String(r["last_event_id"]),
      actualizadoAt: r["actualizado_at"] as Date,
    };
  }
}

function filaARecibo(r: Record<string, unknown>): SyncReceipt {
  return {
    opId: String(r["op_id"]),
    clienteId: r["cliente_id"] == null ? null : String(r["cliente_id"]),
    comando: String(r["comando"]),
    estado: String(r["estado"]),
    resultado: r["resultado"],
    createdAt: r["created_at"] == null ? undefined : (r["created_at"] as Date),
  };
}

/**
 * Store de recibos en PostgreSQL (tabla `deltaops.act_sync_receipts`, RLS por
 * tenant). Cada operación abre su PROPIA transacción mínima con
 * `set_config('app.tenant_id', …, true)` — NUNCA reutiliza ni anida la UoW del
 * comando del pipeline.
 *
 * Protocolo de RECLAMACIÓN durable:
 *  - `claim`: INSERT del recibo 'pendiente' con ON CONFLICT DO NOTHING; el
 *    `xmax=0` de la fila RETURNING indica si ESTA solicitud insertó (dueño). Si
 *    no insertó, relee la fila existente en la MISMA transacción.
 *  - `finalize`: UPDATE de 'pendiente' al estado terminal (guarda el resultado).
 *  - `release`: DELETE de la reclamación 'pendiente' (para reintentos de infra).
 */
export class PgSyncReceiptStore implements SyncReceiptStore {
  constructor(private readonly pool: Pool) {}

  async claim(
    tenantId: string,
    opId: string,
    clienteId: string | null,
    comando: string,
  ): Promise<Result<ClaimResult, KernelError>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      // Reclamación atómica: `inserted` = true sólo si esta fila la insertó
      // ESTA transacción (xmax=0). ON CONFLICT DO NOTHING no devuelve filas.
      const ins = await client.query(
        `INSERT INTO deltaops.act_sync_receipts (tenant_id, op_id, cliente_id, comando, estado, resultado)
         VALUES ($1,$2,$3,$4,'pendiente','null'::jsonb)
         ON CONFLICT (tenant_id, op_id) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        [tenantId, opId, clienteId, comando],
      );
      if (ins.rows[0]?.inserted === true) {
        await client.query("COMMIT");
        return ok({ duenio: true });
      }
      // No reclamó: relee el recibo existente en la misma transacción.
      const cur = await client.query(
        `SELECT op_id, cliente_id, comando, estado, resultado, created_at
           FROM deltaops.act_sync_receipts WHERE tenant_id=$1 AND op_id=$2`,
        [tenantId, opId],
      );
      await client.query("COMMIT");
      const row = cur.rows[0];
      return ok({ duenio: false, recibo: row ? filaARecibo(row) : undefined });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      return fail(KernelErrors.infrastructure("SyncReceipt claim falló", err));
    } finally {
      client.release();
    }
  }

  async find(tenantId: string, opId: string): Promise<Result<SyncReceipt | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT op_id, cliente_id, comando, estado, resultado, created_at
             FROM deltaops.act_sync_receipts WHERE tenant_id=$1 AND op_id=$2`,
          [tenantId, opId],
        ),
      );
      const r = res.rows[0];
      if (!r) return ok(null);
      return ok(filaARecibo(r));
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt find falló", err));
    }
  }

  async finalize(tenantId: string, r: SyncReceipt): Promise<Result<boolean, KernelError>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      // Sólo finaliza si SIGUE 'pendiente' (evita pisar un estado terminal
      // ganado por otra reconciliación concurrente).
      const upd = await client.query(
        `UPDATE deltaops.act_sync_receipts
            SET comando=$3, estado=$4, resultado=$5, updated_at=now()
          WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`,
        [tenantId, r.opId, r.comando, r.estado, JSON.stringify(r.resultado ?? null)],
      );
      await client.query("COMMIT");
      return ok((upd.rowCount ?? 0) > 0);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      return fail(KernelErrors.infrastructure("SyncReceipt finalize falló", err));
    } finally {
      client.release();
    }
  }

  async release(tenantId: string, opId: string): Promise<Result<void, KernelError>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      await client.query(
        `DELETE FROM deltaops.act_sync_receipts WHERE tenant_id=$1 AND op_id=$2 AND estado='pendiente'`,
        [tenantId, opId],
      );
      await client.query("COMMIT");
      return ok(undefined);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      return fail(KernelErrors.infrastructure("SyncReceipt release falló", err));
    } finally {
      client.release();
    }
  }

  async listByTenant(tenantId: string): Promise<Result<SyncReceipt[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.act_sync_receipts WHERE tenant_id=$1 ORDER BY created_at DESC`,
          [tenantId],
        ),
      );
      return ok(res.rows.map((r) => filaARecibo(r)));
    } catch (err) {
      return fail(KernelErrors.infrastructure("SyncReceipt listByTenant falló", err));
    }
  }
}

