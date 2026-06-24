import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, locationsTable, assetsTable } from "@workspace/db";
import {
  ListLocationsResponse,
  CreateLocationBody,
  UpdateLocationParams,
  UpdateLocationBody,
  UpdateLocationResponse,
  DeleteLocationParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/locations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(locationsTable).orderBy(locationsTable.nombre);
  const counts = await db
    .select({
      ubicacionId: assetsTable.ubicacionId,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(assetsTable)
    .groupBy(assetsTable.ubicacionId);
  const countMap = new Map(counts.map((c) => [c.ubicacionId, c.count]));
  res.json(
    ListLocationsResponse.parse(
      rows.map((r) => ({ ...r, equiposCount: countMap.get(r.id) ?? 0 })),
    ),
  );
});

router.post("/locations", async (req, res): Promise<void> => {
  const parsed = CreateLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(locationsTable).values(parsed.data).returning();
  res.status(201).json(UpdateLocationResponse.parse({ ...row, equiposCount: 0 }));
});

router.patch("/locations/:id", async (req, res): Promise<void> => {
  const params = UpdateLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(locationsTable)
    .set(parsed.data)
    .where(eq(locationsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Ubicación no encontrada" });
    return;
  }
  res.json(UpdateLocationResponse.parse({ ...row, equiposCount: 0 }));
});

router.delete("/locations/:id", async (req, res): Promise<void> => {
  const params = DeleteLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(locationsTable)
    .where(eq(locationsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Ubicación no encontrada" });
    return;
  }
  res.sendStatus(204);
});

export default router;
