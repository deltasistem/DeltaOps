import { Router, type IRouter } from "express";
import { sql, desc } from "drizzle-orm";
import {
  db,
  assetsTable,
  workOrdersTable,
  maintenancePlansTable,
  sparePartsTable,
} from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetAssetStatusBreakdownResponse,
  GetWorkOrdersByTypeResponse,
  GetCostsByMonthResponse,
  GetCostsByAssetResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const OPEN_STATES = ["pendiente", "asignado", "en_proceso", "esperando_repuesto"];

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [assets, orders, plans, parts] = await Promise.all([
    db.select().from(assetsTable),
    db.select().from(workOrdersTable),
    db.select().from(maintenancePlansTable),
    db.select().from(sparePartsTable),
  ]);

  const totalEquipos = assets.length;
  const equiposOperativos = assets.filter((a) => a.estado === "operativo").length;
  const equiposEnMantenimiento = assets.filter(
    (a) => a.estado === "mantenimiento",
  ).length;
  const equiposFueraServicio = assets.filter(
    (a) => a.estado === "fuera_servicio",
  ).length;

  const now = Date.now();
  const otAbiertas = orders.filter((o) => OPEN_STATES.includes(o.estado)).length;
  const otVencidas = orders.filter(
    (o) =>
      OPEN_STATES.includes(o.estado) &&
      o.fechaProgramada != null &&
      o.fechaProgramada.getTime() < now,
  ).length;

  const mantenimientosProgramados = plans.filter((p) => p.activo).length;
  const mantenimientosEjecutados = orders.filter(
    (o) => o.tipo === "preventivo" && (o.estado === "finalizado" || o.estado === "cerrado"),
  ).length;

  const closed = orders.filter(
    (o) => o.fechaCierre != null && o.horasReales != null,
  );
  const mttr =
    closed.length > 0
      ? closed.reduce((s, o) => s + (o.horasReales ?? 0), 0) / closed.length
      : 0;

  const correctivos = orders.filter((o) => o.tipo === "correctivo").length;
  const totalHorasOperacion = assets.reduce(
    (s, a) => s + (a.horasAcumuladas ?? 0),
    0,
  );
  const mtbf = correctivos > 0 ? totalHorasOperacion / correctivos : 0;

  const disponibilidadMecanica =
    totalEquipos > 0
      ? Math.round(((totalEquipos - equiposFueraServicio) / totalEquipos) * 1000) / 10
      : 0;
  const disponibilidadOperacional =
    totalEquipos > 0
      ? Math.round((equiposOperativos / totalEquipos) * 1000) / 10
      : 0;

  const repuestosBajoStock = parts.filter((p) => p.stock <= p.stockMinimo).length;

  res.json(
    GetDashboardSummaryResponse.parse({
      totalEquipos,
      equiposOperativos,
      equiposEnMantenimiento,
      equiposFueraServicio,
      otAbiertas,
      otVencidas,
      mantenimientosProgramados,
      mantenimientosEjecutados,
      disponibilidadMecanica,
      disponibilidadOperacional,
      mttr: Math.round(mttr * 10) / 10,
      mtbf: Math.round(mtbf * 10) / 10,
      repuestosBajoStock,
    }),
  );
});

router.get("/dashboard/asset-status", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      estado: assetsTable.estado,
      value: sql<number>`cast(count(*) as int)`,
    })
    .from(assetsTable)
    .groupBy(assetsTable.estado);
  const labels: Record<string, string> = {
    operativo: "Operativo",
    mantenimiento: "En Mantenimiento",
    fuera_servicio: "Fuera de Servicio",
  };
  res.json(
    GetAssetStatusBreakdownResponse.parse(
      rows.map((r) => ({ label: labels[r.estado] ?? r.estado, value: r.value })),
    ),
  );
});

router.get("/dashboard/work-orders-by-type", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      tipo: workOrdersTable.tipo,
      value: sql<number>`cast(count(*) as int)`,
    })
    .from(workOrdersTable)
    .groupBy(workOrdersTable.tipo);
  const labels: Record<string, string> = {
    preventivo: "Preventivo",
    correctivo: "Correctivo",
    predictivo: "Predictivo",
  };
  res.json(
    GetWorkOrdersByTypeResponse.parse(
      rows.map((r) => ({ label: labels[r.tipo] ?? r.tipo, value: r.value })),
    ),
  );
});

router.get("/dashboard/costs-by-month", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      mes: sql<string>`to_char(${workOrdersTable.fechaCreacion}, 'YYYY-MM')`,
      costo: sql<number>`cast(coalesce(sum(coalesce(${workOrdersTable.costoManoObra},0) + coalesce(${workOrdersTable.costoRepuestos},0)),0) as double precision)`,
    })
    .from(workOrdersTable)
    .groupBy(sql`to_char(${workOrdersTable.fechaCreacion}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${workOrdersTable.fechaCreacion}, 'YYYY-MM')`);
  const meses: Record<string, string> = {
    "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr", "05": "May", "06": "Jun",
    "07": "Jul", "08": "Ago", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
  };
  res.json(
    GetCostsByMonthResponse.parse(
      rows.map((r) => ({
        mes: meses[r.mes.split("-")[1]] ?? r.mes,
        costo: Math.round(r.costo),
      })),
    ),
  );
});

router.get("/dashboard/costs-by-asset", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      equipo: assetsTable.nombre,
      costo: sql<number>`cast(coalesce(sum(coalesce(${workOrdersTable.costoManoObra},0) + coalesce(${workOrdersTable.costoRepuestos},0)),0) as double precision)`,
    })
    .from(workOrdersTable)
    .innerJoin(assetsTable, sql`${assetsTable.id} = ${workOrdersTable.equipoId}`)
    .groupBy(assetsTable.nombre)
    .orderBy(desc(sql`sum(coalesce(${workOrdersTable.costoManoObra},0) + coalesce(${workOrdersTable.costoRepuestos},0))`))
    .limit(8);
  res.json(
    GetCostsByAssetResponse.parse(
      rows.map((r) => ({ equipo: r.equipo, costo: Math.round(r.costo) })),
    ),
  );
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(workOrdersTable)
    .orderBy(desc(workOrdersTable.fechaCreacion))
    .limit(10);
  res.json(
    GetRecentActivityResponse.parse(
      rows.map((o) => ({
        id: o.id,
        tipo: o.tipo,
        descripcion: `${o.numero} — ${o.descripcion ?? "Orden de trabajo"}`,
        fecha: o.fechaCreacion.toISOString(),
      })),
    ),
  );
});

export default router;
