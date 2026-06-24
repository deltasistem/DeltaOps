import { Router, type IRouter } from "express";
import { eq, and, or, ilike, sql, type SQL } from "drizzle-orm";
import {
  db,
  sparePartsTable,
  locationsTable,
  stockMovementsTable,
} from "@workspace/db";
import {
  ListSparePartsQueryParams,
  ListSparePartsResponse,
  CreateSparePartBody,
  UpdateSparePartParams,
  UpdateSparePartBody,
  UpdateSparePartResponse,
  DeleteSparePartParams,
  CreateStockMovementParams,
  CreateStockMovementBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

type PartRow = typeof sparePartsTable.$inferSelect;

async function enrich(rows: PartRow[]) {
  const locs = await db.select().from(locationsTable);
  const locMap = new Map(locs.map((l) => [l.id, l.nombre]));
  return rows.map((p) => ({
    ...p,
    ubicacionNombre: p.ubicacionId != null ? (locMap.get(p.ubicacionId) ?? null) : null,
  }));
}

router.get("/spare-parts", async (req, res): Promise<void> => {
  const query = ListSparePartsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { search, lowStock } = query.data;
  const conditions: SQL[] = [];
  if (search) {
    const like = `%${search}%`;
    const cond = or(
      ilike(sparePartsTable.descripcion, like),
      ilike(sparePartsTable.codigo, like),
      ilike(sparePartsTable.categoria, like),
    );
    if (cond) conditions.push(cond);
  }
  if (lowStock) {
    conditions.push(sql`${sparePartsTable.stock} <= ${sparePartsTable.stockMinimo}`);
  }
  const rows = await db
    .select()
    .from(sparePartsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sparePartsTable.codigo);
  res.json(ListSparePartsResponse.parse(await enrich(rows)));
});

router.post("/spare-parts", async (req, res): Promise<void> => {
  const parsed = CreateSparePartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(sparePartsTable).values(parsed.data).returning();
  const [enriched] = await enrich([row]);
  res.status(201).json(UpdateSparePartResponse.parse(enriched));
});

router.patch("/spare-parts/:id", async (req, res): Promise<void> => {
  const params = UpdateSparePartParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSparePartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(sparePartsTable)
    .set(parsed.data)
    .where(eq(sparePartsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Repuesto no encontrado" });
    return;
  }
  const [enriched] = await enrich([row]);
  res.json(UpdateSparePartResponse.parse(enriched));
});

router.delete("/spare-parts/:id", async (req, res): Promise<void> => {
  const params = DeleteSparePartParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(sparePartsTable)
    .where(eq(sparePartsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Repuesto no encontrado" });
    return;
  }
  res.sendStatus(204);
});

router.post("/spare-parts/:id/movements", async (req, res): Promise<void> => {
  const params = CreateStockMovementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateStockMovementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [part] = await db
    .select()
    .from(sparePartsTable)
    .where(eq(sparePartsTable.id, params.data.id));
  if (!part) {
    res.status(404).json({ error: "Repuesto no encontrado" });
    return;
  }
  const { tipo, cantidad, motivo } = parsed.data;
  let nuevoStock = part.stock;
  if (tipo === "entrada") nuevoStock += cantidad;
  else if (tipo === "salida") nuevoStock = Math.max(0, nuevoStock - cantidad);
  else nuevoStock = cantidad;

  const row = await db.transaction(async (tx) => {
    await tx
      .insert(stockMovementsTable)
      .values({ repuestoId: part.id, tipo, cantidad, motivo });
    const [updated] = await tx
      .update(sparePartsTable)
      .set({ stock: nuevoStock })
      .where(eq(sparePartsTable.id, part.id))
      .returning();
    return updated;
  });
  const [enriched] = await enrich([row]);
  res.status(201).json(UpdateSparePartResponse.parse(enriched));
});

export default router;
