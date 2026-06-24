import { Router, type IRouter } from "express";
import { eq, and, ilike, or, type SQL } from "drizzle-orm";
import {
  db,
  assetsTable,
  locationsTable,
  workCentersTable,
  workOrdersTable,
  techniciansTable,
} from "@workspace/db";
import {
  ListAssetsQueryParams,
  ListAssetsResponse,
  CreateAssetBody,
  GetAssetParams,
  GetAssetResponse,
  UpdateAssetParams,
  UpdateAssetBody,
  UpdateAssetResponse,
  DeleteAssetParams,
  GetAssetHistoryParams,
  GetAssetHistoryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrich(rows: (typeof assetsTable.$inferSelect)[]) {
  const [locs, centers] = await Promise.all([
    db.select().from(locationsTable),
    db.select().from(workCentersTable),
  ]);
  const locMap = new Map(locs.map((l) => [l.id, l.nombre]));
  const centerMap = new Map(centers.map((c) => [c.id, c.nombre]));
  return rows.map((r) => ({
    ...r,
    ubicacionNombre: r.ubicacionId != null ? (locMap.get(r.ubicacionId) ?? null) : null,
    centroTrabajoNombre:
      r.centroTrabajoId != null ? (centerMap.get(r.centroTrabajoId) ?? null) : null,
  }));
}

router.get("/assets", async (req, res): Promise<void> => {
  const query = ListAssetsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { estado, tipo, search } = query.data;
  const conditions: SQL[] = [];
  if (estado) conditions.push(eq(assetsTable.estado, estado));
  if (tipo) conditions.push(eq(assetsTable.tipo, tipo));
  if (search) {
    const like = `%${search}%`;
    const cond = or(
      ilike(assetsTable.nombre, like),
      ilike(assetsTable.codigo, like),
      ilike(assetsTable.marca, like),
      ilike(assetsTable.modelo, like),
    );
    if (cond) conditions.push(cond);
  }
  const rows = await db
    .select()
    .from(assetsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(assetsTable.codigo);
  res.json(ListAssetsResponse.parse(await enrich(rows)));
});

router.post("/assets", async (req, res): Promise<void> => {
  const parsed = CreateAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(assetsTable).values(parsed.data).returning();
  const [enriched] = await enrich([row]);
  res.status(201).json(GetAssetResponse.parse(enriched));
});

router.get("/assets/:id", async (req, res): Promise<void> => {
  const params = GetAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Activo no encontrado" });
    return;
  }
  const [enriched] = await enrich([row]);
  res.json(GetAssetResponse.parse(enriched));
});

router.patch("/assets/:id", async (req, res): Promise<void> => {
  const params = UpdateAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(assetsTable)
    .set(parsed.data)
    .where(eq(assetsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activo no encontrado" });
    return;
  }
  const [enriched] = await enrich([row]);
  res.json(UpdateAssetResponse.parse(enriched));
});

router.delete("/assets/:id", async (req, res): Promise<void> => {
  const params = DeleteAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(assetsTable)
    .where(eq(assetsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activo no encontrado" });
    return;
  }
  res.sendStatus(204);
});

router.get("/assets/:id/history", async (req, res): Promise<void> => {
  const params = GetAssetHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.id, params.data.id));
  if (!asset) {
    res.status(404).json({ error: "Activo no encontrado" });
    return;
  }
  const [orders, techs, centers] = await Promise.all([
    db
      .select()
      .from(workOrdersTable)
      .where(eq(workOrdersTable.equipoId, params.data.id))
      .orderBy(workOrdersTable.fechaCreacion),
    db.select().from(techniciansTable),
    db.select().from(workCentersTable),
  ]);
  const techMap = new Map(techs.map((t) => [t.id, t.nombre]));
  const centerMap = new Map(centers.map((c) => [c.id, c.nombre]));
  const history = orders.map((o) => ({
    ...o,
    equipoNombre: asset.nombre,
    equipoCodigo: asset.codigo,
    tecnicoNombre: o.tecnicoId != null ? (techMap.get(o.tecnicoId) ?? null) : null,
    centroTrabajoNombre:
      o.centroTrabajoId != null ? (centerMap.get(o.centroTrabajoId) ?? null) : null,
    costoTotal: (o.costoManoObra ?? 0) + (o.costoRepuestos ?? 0),
    fechaCreacion: o.fechaCreacion.toISOString(),
    fechaProgramada: o.fechaProgramada ? o.fechaProgramada.toISOString() : null,
    fechaCierre: o.fechaCierre ? o.fechaCierre.toISOString() : null,
  }));
  res.json(GetAssetHistoryResponse.parse(history));
});

export default router;
