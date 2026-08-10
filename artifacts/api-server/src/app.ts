import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import deltaopsRouter from "./routes/deltaops";
import identityRouter from "./routes/deltaops/identity";
import platformConsoleRouter from "./routes/deltaops/platform-console";
import attachmentServeRouter from "./routes/deltaops/attachment-serve";
import referenceModuleRouter from "./routes/deltaops/reference-module";
import activosModuleRouter from "./routes/deltaops/activos-module";
import ordenesModuleRouter from "./routes/deltaops/ordenes-module";
import inventarioModuleRouter from "./routes/deltaops/inventario-module";
import planesModuleRouter from "./routes/deltaops/planes-module";
import abastecimientoModuleRouter from "./routes/deltaops/abastecimiento-module";
import preventivoModuleRouter from "./routes/deltaops/preventivo-module";
import correctivoModuleRouter from "./routes/deltaops/correctivo-module";
import analyticsModuleRouter from "./routes/deltaops/analytics-module";
import { logger } from "./lib/logger";
import { loadDeltaopsConfig } from "./deltaops/config";
import { createDeltaopsSession } from "./deltaops/session";
import { deltaopsMetricsMiddleware } from "./deltaops/metrics";
import { deltaopsErrorHandler } from "./deltaops/errors";
import { enforceEntitlements, resolveIdentitySoft } from "./deltaops/identity/middleware";

const app: Express = express();
const deltaopsConfig = loadDeltaopsConfig();

// Detrás del proxy de la plataforma (terminación TLS): necesario para que
// express-session emita cookies "secure" en producción.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DeltaOps (DGP-001): métricas, sesión y rutas de plataforma, aisladas bajo /api/deltaops
app.use("/api/deltaops", deltaopsMetricsMiddleware);
app.use("/api/deltaops", createDeltaopsSession(deltaopsConfig));
app.use("/api", deltaopsRouter);
// DGP-017: identidad, tenancy y SaaS. Se monta ANTES de los módulos de negocio
// para que el resolver suave de identidad + enforcement de entitlements se
// aplique a las superficies de módulo (rechazo backend de módulos no contratados).
app.use("/api", identityRouter);
app.use("/api", resolveIdentitySoft);
app.use("/api", enforceEntitlements);
// El servido de URLs firmadas se monta ANTES de la consola de plataforma para
// no quedar tras su middleware de admin (la firma HMAC es la autorización).
app.use("/api", attachmentServeRouter);
app.use("/api", platformConsoleRouter);
app.use("/api", referenceModuleRouter);
app.use("/api", activosModuleRouter);
app.use("/api", ordenesModuleRouter);
app.use("/api", inventarioModuleRouter);
app.use("/api", planesModuleRouter);
app.use("/api", abastecimientoModuleRouter);
app.use("/api", preventivoModuleRouter);
app.use("/api", correctivoModuleRouter);
app.use("/api", analyticsModuleRouter);
app.use("/api", router);
app.use("/api/deltaops", deltaopsErrorHandler);

export default app;
