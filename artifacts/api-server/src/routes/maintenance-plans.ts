import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, maintenancePlansTable, assetsTable } from "@workspace/db";
import {
  ListMaintenancePlansResponse,
  CreateMaintenancePlanBody,
  UpdateMaintenancePlanParams,
  UpdateMaintenancePlanBody,
  UpdateMaintenancePlanResponse,
  DeleteMaintenancePlanParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type PlanRow = typeof maintenancePlansTable.$inferSelect;

async function enrich(rows: PlanRow[]) {
  const assets = await db.select().from(assetsTable);
  const assetMap = new Map(assets.map((a) => [a.id, a.nombre]));
  return rows.map((p) => ({
    ...p,
    equipoNombre: assetMap.get(p.equipoId) ?? null,
    proximaFecha: p.proximaFecha ? p.proximaFecha.toISOString() : null,
  }));
}

class InvalidDateError extends Error {}

function toDate(value: unknown): Date {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) throw new InvalidDateError();
  return d;
}

function normalizeBody<T extends { proximaFecha?: unknown }>(
  data: T,
): Omit<T, "proximaFecha"> & { proximaFecha?: Date | null } {
  const { proximaFecha, ...rest } = data;
  return {
    ...rest,
    ...(proximaFecha !== undefined
      ? { proximaFecha: proximaFecha ? toDate(proximaFecha) : null }
      : {}),
  };
}

router.get("/maintenance-plans", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(maintenancePlansTable)
    .orderBy(maintenancePlansTable.nombre);
  res.json(ListMaintenancePlansResponse.parse(await enrich(rows)));
});

router.post("/maintenance-plans", async (req, res): Promise<void> => {
  const parsed = CreateMaintenancePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let values;
  try {
    values = normalizeBody(parsed.data);
  } catch (err) {
    if (err instanceof InvalidDateError) {
      res.status(400).json({ error: "Fecha inválida" });
      return;
    }
    throw err;
  }
  const [row] = await db
    .insert(maintenancePlansTable)
    .values(values)
    .returning();
  const [enriched] = await enrich([row]);
  res.status(201).json(UpdateMaintenancePlanResponse.parse(enriched));
});

router.patch("/maintenance-plans/:id", async (req, res): Promise<void> => {
  const params = UpdateMaintenancePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMaintenancePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let values;
  try {
    values = normalizeBody(parsed.data);
  } catch (err) {
    if (err instanceof InvalidDateError) {
      res.status(400).json({ error: "Fecha inválida" });
      return;
    }
    throw err;
  }
  const [row] = await db
    .update(maintenancePlansTable)
    .set(values)
    .where(eq(maintenancePlansTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Plan de mantenimiento no encontrado" });
    return;
  }
  const [enriched] = await enrich([row]);
  res.json(UpdateMaintenancePlanResponse.parse(enriched));
});

router.delete("/maintenance-plans/:id", async (req, res): Promise<void> => {
  const params = DeleteMaintenancePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(maintenancePlansTable)
    .where(eq(maintenancePlansTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Plan de mantenimiento no encontrado" });
    return;
  }
  res.sendStatus(204);
});

export default router;
