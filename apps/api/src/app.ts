import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { restaurantsRouter } from "./modules/restaurants/restaurants.routes.js";
import { cartRouter } from "./modules/cart/cart.routes.js";
import { addressesRouter } from "./modules/addresses/addresses.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { restaurantOrdersRouter } from "./modules/orders/restaurantOrders.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { courierRouter } from "./modules/couriers/courier.routes.js";
import { uploadsRouter } from "./modules/uploads/uploads.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { feedbackRouter } from "./modules/feedback/feedback.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { restaurantSettingsRouter } from "./modules/restaurants/settings.routes.js";
import { cashSettlementRouter } from "./modules/restaurants/cashSettlement.routes.js";
import { reportsRouter } from "./modules/restaurants/reports.routes.js";

export function createApp() {
  const app = express();

  // Render sits the app behind a reverse proxy — without this,
  // express-rate-limit refuses to trust the X-Forwarded-For header it needs
  // to key rate limits per real client IP instead of per proxy hop.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  // Generous global cap; auth endpoints get a tighter limit below to slow
  // down credential stuffing / password-reset abuse specifically.
  app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
  const authLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

  app.get("/health", (_req, res) => res.json({ success: true, status: "ok", time: new Date().toISOString() }));

  app.use("/api/auth", authLimiter, authRouter);
  app.use("/api/restaurants", restaurantsRouter);
  app.use("/api/cart", cartRouter);
  app.use("/api/addresses", addressesRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/restaurant/orders", restaurantOrdersRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/courier", courierRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/feedback", feedbackRouter);
  app.use("/api/restaurant/catalog", catalogRouter);
  app.use("/api/restaurant/settings", restaurantSettingsRouter);
  app.use("/api/restaurant", cashSettlementRouter);
  app.use("/api/restaurant/reports", reportsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
