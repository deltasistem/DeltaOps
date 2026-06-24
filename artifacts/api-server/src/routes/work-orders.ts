import { Router, type IRouter } from "express";
import { eq, and, sql, type SQL } from "drizzle-orm";
import {
  db,
  workOrdersTable,
  assetsTable,
  techniciansTable,
  workCentersTable,
} from "@workspace/db";
import {
  ListWorkOrdersQueryParams,
  ListWorkOrdersResponse,
  CreateWorkOrderBody,
  GetWorkOrderParams,
  GetWorkOrderResponse,
  UpdateWorkOrderParams,
  UpdateWorkOrderBody,
  UpdateWorkOrderResponse,
  DeleteWorkOrderParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type WorkOrderRow = typeof workOrdersTable.$inferSelect;

async function enrich(rows: WorkOrderRow[]) {
  const [assets, techs, centers] = await Promise.all([
    db.select().from(assetsTable),
    db.select().from(techniciansTable),
    db.select().from(workCentersTable),
  ]);
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const techMap = new Map(techs.map((t) => [t.id, t.nombre]));
  const centerMap = new Map(centers.map((c) => [c.id, c.nombre]));
  return rows.map((o) => {
    const asset = assetMap.get(o.equipoId);
    return {
      ...o,
      equipoNombre: asset?.nombre ?? null,
      equipoCodigo: asset?.codigo ?? null,
      tecnicoNombre: o.tecnicoId != null ? (techMap.get(o.tecnicoId) ?? null) : null,
      centroTrabajoNombre:
        o.centroTrabajoId != null ? (centerMap.get(o.centroTrabajoId) ?? null) : null,
      costoTotal: (o.costoManoObra ?? 0) + (o.costoRepuestos ?? 0),
      fechaCreacion: o.fechaCreacion.toISOString(),
      fechaProgramada: o.fechaProgramada ? o.fechaProgramada.toISOString() : null,
      fechaCierre: o.fechaCierre ? o.fechaCierre.toISOString() : null,
    };
  });
}

class InvalidDateError extends Error {}

function toDate(value: unknown): Date {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) throw new InvalidDateError();
  return d;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

function normalizeBody<T extends { fechaProgramada?: unknown; fechaCierre?: unknown }>(
  data: T,
): Omit<T, "fechaProgramada" | "fechaCierre"> & {
  fechaProgramada?: Date | null;
  fechaCierre?: Date | null;
} {
  const { fechaProgramada, fechaCierre, ...rest } = data;
  return {
    ...rest,
    ...(fechaProgramada !== undefined
      ? { fechaProgramada: fechaProgramada ? toDate(fechaProgramada) : null }
      : {}),
    ...(fechaCierre !== undefined
      ? { fechaCierre: fechaCierre ? toDate(fechaCierre) : null }
      : {}),
  };
}

router.get("/work-orders", async (req, res): Promise<void> => {
  const query = ListWorkOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { estado, tipo, prioridad } = query.data;
  const conditions: SQL[] = [];
  if (estado) conditions.push(eq(workOrdersTable.estado, estado));
  if (tipo) conditions.push(eq(workOrdersTable.tipo, tipo));
  if (prioridad) conditions.push(eq(workOrdersTable.prioridad, prioridad));
  const rows = await db
    .select()
    .from(workOrdersTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${workOrdersTable.fechaCreacion} desc`);
  res.json(ListWorkOrdersResponse.parse(await enrich(rows)));
});

router.post("/work-orders", async (req, res): Promise<void> => {
  const parsed = CreateWorkOrderBody.safeParse(req.body);
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
  let row: WorkOrderRow | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const [{ max }] = await db
      .select({
        max: sql<number>`coalesce(max(cast(substring(${workOrdersTable.numero} from 4) as integer)), 0)`,
      })
      .from(workOrdersTable);
    const numero = `OT-${String(max + 1).padStart(5, "0")}`;
    try {
      [row] = await db
        .insert(workOrdersTable)
        .values({ ...values, numero })
        .returning();
      break;
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 4) continue;
      throw err;
    }
  }
  const [enriched] = await enrich([row!]);
  res.status(201).json(GetWorkOrderResponse.parse(enriched));
});

router.get("/work-orders/:id", async (req, res): Promise<void> => {
  const params = GetWorkOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Orden de trabajo no encontrada" });
    return;
  }
  const [enriched] = await enrich([row]);
  res.json(GetWorkOrderResponse.parse(enriched));
});

router.patch("/work-orders/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateWorkOrderBody.safeParse(req.body);
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
    .update(workOrdersTable)
    .set(values)
    .where(eq(workOrdersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Orden de trabajo no encontrada" });
    return;
  }
  const [enriched] = await enrich([row]);
  res.json(UpdateWorkOrderResponse.parse(enriched));
});

router.delete("/work-orders/:id", async (req, res): Promise<void> => {
  const params = DeleteWorkOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(workOrdersTable)
    .where(eq(workOrdersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Orden de trabajo no encontrada" });
    return;
  }
  res.sendStatus(204);
});

export default router;
