import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, techniciansTable, workCentersTable } from "@workspace/db";
import {
  ListTechniciansResponse,
  CreateTechnicianBody,
  UpdateTechnicianParams,
  UpdateTechnicianBody,
  UpdateTechnicianResponse,
  DeleteTechnicianParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrich(rows: (typeof techniciansTable.$inferSelect)[]) {
  const centers = await db.select().from(workCentersTable);
  const centerMap = new Map(centers.map((c) => [c.id, c.nombre]));
  return rows.map((r) => ({
    ...r,
    centroTrabajoNombre:
      r.centroTrabajoId != null ? (centerMap.get(r.centroTrabajoId) ?? null) : null,
  }));
}

router.get("/technicians", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(techniciansTable)
    .orderBy(techniciansTable.nombre);
  res.json(ListTechniciansResponse.parse(await enrich(rows)));
});

router.post("/technicians", async (req, res): Promise<void> => {
  const parsed = CreateTechnicianBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(techniciansTable)
    .values(parsed.data)
    .returning();
  const [enriched] = await enrich([row]);
  res.status(201).json(UpdateTechnicianResponse.parse(enriched));
});

router.patch("/technicians/:id", async (req, res): Promise<void> => {
  const params = UpdateTechnicianParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTechnicianBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(techniciansTable)
    .set(parsed.data)
    .where(eq(techniciansTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Personal no encontrado" });
    return;
  }
  const [enriched] = await enrich([row]);
  res.json(UpdateTechnicianResponse.parse(enriched));
});

router.delete("/technicians/:id", async (req, res): Promise<void> => {
  const params = DeleteTechnicianParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(techniciansTable)
    .where(eq(techniciansTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Personal no encontrado" });
    return;
  }
  res.sendStatus(204);
});

export default router;
