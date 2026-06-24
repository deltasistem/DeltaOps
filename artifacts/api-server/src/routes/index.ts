import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import assetsRouter from "./assets";
import workOrdersRouter from "./work-orders";
import maintenancePlansRouter from "./maintenance-plans";
import sparePartsRouter from "./spare-parts";
import locationsRouter from "./locations";
import workCentersRouter from "./work-centers";
import techniciansRouter from "./technicians";
import suppliersRouter from "./suppliers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(assetsRouter);
router.use(workOrdersRouter);
router.use(maintenancePlansRouter);
router.use(sparePartsRouter);
router.use(locationsRouter);
router.use(workCentersRouter);
router.use(techniciansRouter);
router.use(suppliersRouter);

export default router;
