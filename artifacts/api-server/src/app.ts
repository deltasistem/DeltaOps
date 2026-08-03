import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import deltaopsRouter from "./routes/deltaops";
import { logger } from "./lib/logger";
import { loadDeltaopsConfig } from "./deltaops/config";
import { createDeltaopsSession } from "./deltaops/session";
import { deltaopsMetricsMiddleware } from "./deltaops/metrics";
import { deltaopsErrorHandler } from "./deltaops/errors";

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
app.use("/api", router);
app.use("/api/deltaops", deltaopsErrorHandler);

export default app;
