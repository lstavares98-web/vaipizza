import { Router } from "express";
import { z } from "zod";
import { updateOrderStatusSchema } from "@yummix/validation";
import { OrderStatus, Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireOwnRestaurant, requireRole } from "../../middleware/auth.js";
import * as ordersService from "./orders.service.js";

export const restaurantOrdersRouter = Router();
restaurantOrdersRouter.use(
  requireAuth,
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF, Role.KITCHEN),
  requireOwnRestaurant,
);

const listQuerySchema = z.object({
  status: z.string().optional(), // comma-separated OrderStatus values
});

restaurantOrdersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = listQuerySchema.parse(req.query);
    const statuses = status ? (status.split(",") as OrderStatus[]) : undefined;
    const orders = await ordersService.listOrdersForRestaurant(req.auth!.restaurantId!, statuses);
    res.json({ success: true, orders });
  }),
);

restaurantOrdersRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const input = updateOrderStatusSchema.parse(req.body);
    const order = await ordersService.updateOrderStatusByRestaurant(
      req.auth!.restaurantId!,
      req.auth!.role,
      req.params.id!,
      input,
    );
    res.json({ success: true, order });
  }),
);
