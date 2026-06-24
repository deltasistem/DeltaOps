import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, workCentersTable } from "@workspace/db";
import {
  ListWorkCentersResponse,
  CreateWorkCenterBody,
  UpdateWorkCenterParams,
  UpdateWorkCenterBody,
  UpdateWorkCenterResponse,
  DeleteWorkCenterParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/work-centers", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(workCentersTable)
    .orderBy(workCentersTable.nombre);
  res.json(ListWorkCentersResponse.parse(rows));
});

router.post("/work-centers", async (req, res): Promise<void> => {
  const parsed = CreateWorkCenterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(workCentersTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(UpdateWorkCenterResponse.parse(row));
});

router.patch("/work-centers/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkCenterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateWorkCenterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(workCentersTable)
    .set(parsed.data)
    .where(eq(workCentersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Centro de trabajo no encontrado" });
    return;
  }
  res.json(UpdateWorkCenterResponse.parse(row));
});

router.delete("/work-centers/:id", async (req, res): Promise<void> => {
  const params = DeleteWorkCenterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(workCentersTable)
    .where(eq(workCentersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Centro de trabajo no encontrado" });
    return;
  }
  res.sendStatus(204);
});

export default router;
