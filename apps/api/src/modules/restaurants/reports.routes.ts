import { Router } from "express";
import { z } from "zod";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireOwnRestaurant, requireRole } from "../../middleware/auth.js";
import { badRequest } from "../../utils/AppError.js";
import { getRestaurantReport } from "./reports.service.js";

export const reportsRouter = Router();
reportsRouter.use(
  requireAuth,
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  requireOwnRestaurant,
);

const querySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
});

reportsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to } = querySchema.parse(req.query);
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);
    if (fromDate > toDate) throw badRequest("Data inicial posterior à data final", "INVALID_RANGE");

    const report = await getRestaurantReport(req.auth!.restaurantId!, { from: fromDate, to: toDate });
    res.json({ success: true, ...report });
  }),
);
