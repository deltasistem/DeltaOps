/**
 * DGP-019.1 · Módulo de Utilización — Infraestructura de PERSISTENCIA (PostgreSQL).
 *
 * Adaptadores PG de los PUERTOS del dominio (los Fakes viven en `fakes.ts`). Los
 * aggregates append-only (`utl_lecturas`, `utl_tanqueos`) guardan su estado
 * completo en la columna `datos` (JSONB, fuente de reconstrucción); las columnas
 * planas son sólo para filtrar/indexar. RLS por tenant: escrituras con
 * set_config vía pgSessionOf(uow); lecturas con withTenantRead. Mismo patrón que
 * module-correctivo (DGP-015).
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
import { CANONICOS_POR_CATALOGO, ESTADO_DESHABILITADO, ESTADO_HABILITADO, type EntradaCatalogo, type NombreCatalogo } from "../domain/catalogos";
import type {
  CatalogoPort,
  LecturaFiltro,
  LecturaRepository,
  OpcionCatalogo,
  Recibo,
  ReciboClaim,
  ReciboPort,
  TanqueoFiltro,
  TanqueoRepository,
  TenantId,
} from "../domain/ports";
import type { Lectura, Tanqueo, TipoMedidor } from "../domain/value-objects";

/* --------------------------- Helpers de sesión --------------------------- */

export async function setTenant(uow: UnitOfWork, tenantId: string): Promise<void> {
  await pgSessionOf(uow).query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export async function withTenantRead<T>(
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

function serializar<T>(agg: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(agg)) as Record<string, unknown>;
}
function parseDatos<T>(v: unknown): T {
  return ((typeof v === "string" ? JSON.parse(v) : v) ?? {}) as T;
}

/* ------------------------------- Lecturas -------------------------------- */

export class PgLecturaRepository implements LecturaRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, l: Lectura): Promise<Result<Lectura, KernelError>> {
    try {
      await setTenant(uow, l.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.utl_lecturas
           (tenant_id, id, activo_id, tipo_medidor, valor, unidad, fecha_hora, identity_id, origen, estado, inconsistente, sincronizacion_activo, op_id, datos, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [l.tenantId, l.id, l.activoId, l.tipoMedidor, l.valor, l.unidad, new Date(l.fechaHora), l.identityId, l.origen, l.estado, l.inconsistente, l.sincronizacionActivo, l.opId, JSON.stringify(serializar(l)), l.identityId],
      );
      return ok(l);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`lectura ${l.id} ya existe`));
      return fail(KernelErrors.infrastructure("lectura insert falló", err));
    }
  }

  async replace(uow: UnitOfWork, l: Lectura): Promise<Result<Lectura, KernelError>> {
    try {
      await setTenant(uow, l.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.utl_lecturas
           SET estado=$3, inconsistente=$4, sincronizacion_activo=$5, datos=$6, updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [l.tenantId, l.id, l.estado, l.inconsistente, l.sincronizacionActivo, JSON.stringify(serializar(l))],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.notFound("lectura", l.id));
      return ok(l);
    } catch (err) {
      return fail(KernelErrors.infrastructure("lectura replace falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<Lectura | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT datos FROM deltaops.utl_lecturas WHERE tenant_id=$1 AND id=$2`, [tenantId, id]));
      return ok(res.rows[0] ? parseDatos<Lectura>(res.rows[0]["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("lectura findById falló", err));
    }
  }

  async ultimaValida(tenantId: TenantId, activoId: string, tipoMedidor: TipoMedidor): Promise<Result<Lectura | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.utl_lecturas
           WHERE tenant_id=$1 AND activo_id=$2 AND tipo_medidor=$3 AND estado='vigente' AND inconsistente=false
           ORDER BY fecha_hora DESC LIMIT 1`,
          [tenantId, activoId, tipoMedidor],
        ),
      );
      return ok(res.rows[0] ? parseDatos<Lectura>(res.rows[0]["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("lectura ultimaValida falló", err));
    }
  }

  async list(tenantId: TenantId, f: LecturaFiltro): Promise<Result<Lectura[], KernelError>> {
    try {
      const cond: string[] = ["tenant_id=$1"];
      const params: unknown[] = [tenantId];
      if (f.activoId) { params.push(f.activoId); cond.push(`activo_id=$${params.length}`); }
      if (f.tipoMedidor) { params.push(f.tipoMedidor); cond.push(`tipo_medidor=$${params.length}`); }
      if (f.desde) { params.push(new Date(f.desde)); cond.push(`fecha_hora>=$${params.length}`); }
      if (f.hasta) { params.push(new Date(f.hasta)); cond.push(`fecha_hora<=$${params.length}`); }
      params.push(f.limit ?? 100); const limIdx = params.length;
      params.push(f.offset ?? 0); const offIdx = params.length;
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.utl_lecturas WHERE ${cond.join(" AND ")} ORDER BY fecha_hora DESC, id DESC LIMIT $${limIdx} OFFSET $${offIdx}`, params),
      );
      return ok(res.rows.map((r) => parseDatos<Lectura>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("lectura list falló", err));
    }
  }
}

/* ------------------------------- Tanqueos -------------------------------- */

export class PgTanqueoRepository implements TanqueoRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, t: Tanqueo): Promise<Result<Tanqueo, KernelError>> {
    try {
      await setTenant(uow, t.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.utl_tanqueos
           (tenant_id, id, activo_id, fecha_hora, litros, tipo_combustible, precio_unitario, costo_total, moneda, lectura_medidor_ref, identity_id, proveedor_id, estado, op_id, datos, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [t.tenantId, t.id, t.activoId, new Date(t.fechaHora), t.litros, t.tipoCombustible, t.precioUnitario, t.costoTotal, t.moneda, t.lecturaMedidorRef, t.identityId, t.proveedorId, t.estado, t.opId, JSON.stringify(serializar(t)), t.identityId],
      );
      return ok(t);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return fail(KernelErrors.conflict(`tanqueo ${t.id} ya existe`));
      return fail(KernelErrors.infrastructure("tanqueo insert falló", err));
    }
  }

  async replace(uow: UnitOfWork, t: Tanqueo): Promise<Result<Tanqueo, KernelError>> {
    try {
      await setTenant(uow, t.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.utl_tanqueos SET estado=$3, datos=$4, updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [t.tenantId, t.id, t.estado, JSON.stringify(serializar(t))],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.notFound("tanqueo", t.id));
      return ok(t);
    } catch (err) {
      return fail(KernelErrors.infrastructure("tanqueo replace falló", err));
    }
  }

  async findById(tenantId: TenantId, id: string): Promise<Result<Tanqueo | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT datos FROM deltaops.utl_tanqueos WHERE tenant_id=$1 AND id=$2`, [tenantId, id]));
      return ok(res.rows[0] ? parseDatos<Tanqueo>(res.rows[0]["datos"]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("tanqueo findById falló", err));
    }
  }

  async list(tenantId: TenantId, f: TanqueoFiltro): Promise<Result<Tanqueo[], KernelError>> {
    try {
      const cond: string[] = ["tenant_id=$1"];
      const params: unknown[] = [tenantId];
      if (f.activoId) { params.push(f.activoId); cond.push(`activo_id=$${params.length}`); }
      if (f.desde) { params.push(new Date(f.desde)); cond.push(`fecha_hora>=$${params.length}`); }
      if (f.hasta) { params.push(new Date(f.hasta)); cond.push(`fecha_hora<=$${params.length}`); }
      params.push(f.limit ?? 100); const limIdx = params.length;
      params.push(f.offset ?? 0); const offIdx = params.length;
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.utl_tanqueos WHERE ${cond.join(" AND ")} ORDER BY fecha_hora DESC, id DESC LIMIT $${limIdx} OFFSET $${offIdx}`, params),
      );
      return ok(res.rows.map((r) => parseDatos<Tanqueo>(r["datos"])));
    } catch (err) {
      return fail(KernelErrors.infrastructure("tanqueo list falló", err));
    }
  }
}

/* ------------------------------- Catálogos ------------------------------- */

export class PgCatalogoStore implements CatalogoPort {
  constructor(private readonly pool: Pool) {}

  async upsert(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, entrada: EntradaCatalogo, actorId: string): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.utl_catalogos (tenant_id, catalogo, clave, etiqueta, posicion, padre, estado, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id, catalogo, clave) DO UPDATE SET
           etiqueta=EXCLUDED.etiqueta, posicion=EXCLUDED.posicion, padre=EXCLUDED.padre, actor_id=EXCLUDED.actor_id, updated_at=now()`,
        [tenantId, catalogo, entrada.clave, entrada.etiqueta, entrada.posicion ?? 0, entrada.padre ?? null, ESTADO_HABILITADO, actorId],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo upsert falló", err));
    }
  }

  async habilitar(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, clave: string, habilitado: boolean): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.utl_catalogos SET estado=$4, updated_at=now() WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`,
        [tenantId, catalogo, clave, habilitado ? ESTADO_HABILITADO : ESTADO_DESHABILITADO],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.notFound("catalogo-entrada", `${catalogo}/${clave}`));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo habilitar falló", err));
    }
  }

  async opciones(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT clave, etiqueta, estado, posicion, padre FROM deltaops.utl_catalogos WHERE tenant_id=$1 AND catalogo=$2 ORDER BY posicion ASC, clave ASC`, [tenantId, catalogo]),
      );
      return ok(res.rows.map((r) => ({ clave: String(r["clave"]), etiqueta: String(r["etiqueta"]), estado: String(r["estado"]), posicion: Number(r["posicion"] ?? 0), padre: (r["padre"] as string | null) ?? null })));
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo opciones falló", err));
    }
  }

  async contarEntradas(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<number, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) => c.query(`SELECT count(*)::int AS n FROM deltaops.utl_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]));
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo contarEntradas falló", err));
    }
  }

  async validarReferencia(tenantId: TenantId, catalogo: NombreCatalogo, clave: string | null | undefined, obligatorio: boolean): Promise<Result<void, KernelError>> {
    if (clave == null || clave === "") {
      return obligatorio ? fail(KernelErrors.validation(`El valor del catálogo "${catalogo}" es obligatorio`)) : ok(undefined);
    }
    const total = await this.contarEntradas(tenantId, catalogo);
    if (!total.ok) return total;
    if (total.value === 0) {
      const canonicos = CANONICOS_POR_CATALOGO[catalogo];
      if (!canonicos || canonicos.includes(clave)) return ok(undefined);
      return fail(KernelErrors.validation(`"${clave}" no es un valor canónico del catálogo "${catalogo}"`));
    }
    const ops = await this.opciones(tenantId, catalogo);
    if (!ops.ok) return ops;
    const habil = ops.value.find((o) => o.clave === clave && o.estado === ESTADO_HABILITADO);
    if (!habil) return fail(KernelErrors.validation(`"${clave}" no existe o está deshabilitado en el catálogo "${catalogo}"`));
    return ok(undefined);
  }
}

/* ------------------------------- Recibos --------------------------------- */

export class PgReciboStore implements ReciboPort {
  constructor(private readonly pool: Pool) {}
  async buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT op_id, comando, resultado FROM deltaops.utl_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3 AND estado='sellado'`, [tenantId, comando, opId]),
      );
      if (!res.rows[0]) return ok(null);
      const r = res.rows[0];
      return ok({ opId: String(r["op_id"]), comando: String(r["comando"]), resultado: parseDatos<Record<string, unknown>>(r["resultado"]) });
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo buscar falló", err));
    }
  }
  async reclamar(uow: UnitOfWork, tenantId: TenantId, comando: string, opId: string, actorId: string): Promise<Result<ReciboClaim, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const c = pgSessionOf(uow);
      // Claim atómico: si nadie lo tenía, insertamos 'pendiente' y somos dueños.
      // Un intento concurrente con el mismo (tenant, comando, op_id) se BLOQUEA
      // en la fila hasta que esta transacción confirme; entonces observa el
      // conflicto (DO NOTHING ⇒ 0 filas) y NO es dueño.
      const ins = await c.query(
        `INSERT INTO deltaops.utl_recibos (tenant_id, comando, op_id, resultado, actor_id, estado)
         VALUES ($1,$2,$3,'{}'::jsonb,$4,'pendiente')
         ON CONFLICT (tenant_id, comando, op_id) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        [tenantId, comando, opId, actorId],
      );
      if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true });
      // Ya reclamado (por otro): leemos el estado/resultado ya COMMITTED.
      const ex = await c.query(
        `SELECT estado, resultado FROM deltaops.utl_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`,
        [tenantId, comando, opId],
      );
      const row = ex.rows[0];
      if (row && String(row["estado"]) === "sellado") {
        return ok({ duenio: false, resultado: parseDatos<Record<string, unknown>>(row["resultado"]) });
      }
      return ok({ duenio: false, pendiente: true });
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo reclamar falló", err));
    }
  }
  async sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      // Finaliza el recibo reclamado: pendiente → sellado con resultado. Si por
      // compatibilidad no existía la fila (recibo legado sin claim), la crea.
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.utl_recibos (tenant_id, comando, op_id, resultado, actor_id, estado, updated_at)
         VALUES ($1,$2,$3,$4,$5,'sellado',now())
         ON CONFLICT (tenant_id, comando, op_id) DO UPDATE SET
           resultado=EXCLUDED.resultado, estado='sellado', updated_at=now()
           WHERE deltaops.utl_recibos.estado <> 'sellado'`,
        [tenantId, recibo.comando, recibo.opId, JSON.stringify(recibo.resultado), actorId],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo sellar falló", err));
    }
  }
}
