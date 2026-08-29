import { Router } from "express";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireOwnRestaurant, requireRole } from "../../middleware/auth.js";
import * as cashSettlementService from "./cashSettlement.service.js";

export const cashSettlementRouter = Router();
cashSettlementRouter.use(
  requireAuth,
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  requireOwnRestaurant,
);

cashSettlementRouter.get(
  "/pending-cash",
  asyncHandler(async (req, res) => {
    const couriers = await cashSettlementService.getPendingCashByCourier(req.auth!.restaurantId!);
    res.json({ success: true, couriers });
  }),
);

cashSettlementRouter.post(
  "/pending-cash/:courierId/settle",
  asyncHandler(async (req, res) => {
    const result = await cashSettlementService.settleCourierCash(req.auth!.restaurantId!, req.params.courierId!);
    res.json({ success: true, ...result });
  }),
);
