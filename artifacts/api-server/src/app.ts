import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import deltaopsRouter from "./routes/deltaops";
import identityRouter from "./routes/deltaops/identity";
import platformConsoleRouter from "./routes/deltaops/platform-console";
import attachmentServeRouter from "./routes/deltaops/attachment-serve";
import referenceModuleRouter from "./routes/deltaops/reference-module";
import activosModuleRouter from "./routes/deltaops/activos-module";
import preoperacionalModuleRouter from "./routes/deltaops/preoperacional-module";
import ordenesModuleRouter from "./routes/deltaops/ordenes-module";
import inventarioModuleRouter from "./routes/deltaops/inventario-module";
import planesModuleRouter from "./routes/deltaops/planes-module";
import abastecimientoModuleRouter from "./routes/deltaops/abastecimiento-module";
import preventivoModuleRouter from "./routes/deltaops/preventivo-module";
import correctivoModuleRouter from "./routes/deltaops/correctivo-module";
import analyticsModuleRouter from "./routes/deltaops/analytics-module";
import utilizacionModuleRouter from "./routes/deltaops/utilizacion-module";
import manodeobraModuleRouter from "./routes/deltaops/manodeobra-module";
import costosModuleRouter from "./routes/deltaops/costos-module";
import { logger } from "./lib/logger";
import { loadDeltaopsConfig } from "./deltaops/config";
import { createDeltaopsSession } from "./deltaops/session";
import { deltaopsMetricsMiddleware } from "./deltaops/metrics";
import { deltaopsErrorHandler } from "./deltaops/errors";
import {
  enforceEntitlements,
  requireIdentityForModules,
} from "./deltaops/identity/middleware";
import { instalarProveedorNotificaciones } from "./deltaops/identity/notification-provider";

const app: Express = express();
const deltaopsConfig = loadDeltaopsConfig();

// DeltaOps · Notificaciones por correo: instala el proveedor configurado
// (fake|m365) como singleton usado por `enqueueEmail`. En producción con
// NOTIFICATION_PROVIDER=m365 y config inválida, esto FALLA al arrancar
// (sin fallback silencioso), conforme a la directiva M365.
instalarProveedorNotificaciones({ logger });

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
// DGP-017: identidad, tenancy y SaaS. Se monta como PRIMERA superficie para que
// `/auth/login|logout|session|switch-tenant|password/*|invitations`, `/users`,
// `/roles`, `/tenant/*` y `/admin/*` sean atendidos ÚNICAMENTE por el router de
// identidad (el login legacy ya NO existe en `deltaopsRouter`, no puede
// sombrear). La sesión que crea (misma cookie/store express-session) es
// reconocida por el middleware de sesión legacy Y por el runtime de identidad.
app.use("/api", identityRouter);
// Router de plataforma legacy (health/ready/info/metrics + `/auth/me` compat).
app.use("/api", deltaopsRouter);
// El servido de URLs firmadas se monta ANTES del guard estricto y de la consola
// de plataforma: su autorización es la firma HMAC de la URL, no la sesión.
app.use("/api", attachmentServeRouter);
// La consola de plataforma tiene su propio guard de admin/super-admin.
app.use("/api", platformConsoleRouter);
// Guard ESTRICTO de identidad + enforcement de entitlements: se aplican SOLO a
// las superficies de MÓDULO de negocio. Ya NO hay camino permisivo: toda sesión
// de módulo debe tener identidad + membresía activa + tenant operativo + epoch
// vigente, y su `deltaopsUserId` se re-fija a la fila espejo de ESTA sesión.
// Un módulo no contratado por el tenant se rechaza con 403 en backend.
app.use("/api", requireIdentityForModules);
app.use("/api", enforceEntitlements);
app.use("/api", referenceModuleRouter);
// DGP-LITE-04 · Preoperacional/Checklist Operacional: se monta ANTES del router
// de activos porque comparte el prefijo `/deltaops/activos` y activos tiene un
// catch-all `/:id`. El entitlement que lo gobierna es `activos` (mismo segmento);
// no introduce módulo ni entitlement nuevo.
app.use("/api", preoperacionalModuleRouter);
app.use("/api", activosModuleRouter);
app.use("/api", ordenesModuleRouter);
app.use("/api", inventarioModuleRouter);
app.use("/api", planesModuleRouter);
app.use("/api", abastecimientoModuleRouter);
app.use("/api", preventivoModuleRouter);
app.use("/api", correctivoModuleRouter);
app.use("/api", analyticsModuleRouter);
app.use("/api", utilizacionModuleRouter);
app.use("/api", manodeobraModuleRouter);
app.use("/api", costosModuleRouter);
// DGP-023.2: router legacy SGMA retirado (routers /assets, /work-orders, /dashboard,
// /spare-parts, /locations, /work-centers, /technicians, /suppliers, /maintenance-plans,
// /healthz). Health gate migrado a /api/deltaops/platform/health.
app.use("/api/deltaops", deltaopsErrorHandler);

export default app;
