import { Router } from "express";
import { z } from "zod";
import { updateOrderStatusSchema } from "@yummix/validation";
import { OrderStatus, Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireOwnRestaurant, requireRole } from "../../middleware/auth.js";
import * as ordersService from "./orders.service.js";
import { cancelOrderBeforeHandoff } from "./cancelOrder.service.js";
import { forceReassignCourier, listNearbyCouriers } from "../dispatch/dispatch.service.js";

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

restaurantOrdersRouter.get(
  "/couriers/nearby",
  asyncHandler(async (req, res) => {
    const feed = await listNearbyCouriers(req.auth!.restaurantId!);
    res.json({ success: true, ...feed });
  }),
);

restaurantOrdersRouter.post(
  "/:id/reassign-courier",
  asyncHandler(async (req, res) => {
    const { courierId } = z.object({ courierId: z.string() }).parse(req.body);
    await forceReassignCourier(req.auth!.restaurantId!, req.params.id!, courierId);
    res.json({ success: true });
  }),
);

restaurantOrdersRouter.post(
  "/:id/confirm-mbway-payment",
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  asyncHandler(async (req, res) => {
    const order = await ordersService.confirmMbwayPayment(req.auth!.restaurantId!, req.params.id!);
    res.json({ success: true, order });
  }),
);

restaurantOrdersRouter.post(
  "/:id/cancel",
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const result = await cancelOrderBeforeHandoff({
      orderId: req.params.id!,
      actorRole: req.auth!.role,
      actorRestaurantId: req.auth!.restaurantId!,
      reason,
    });
    res.json({ success: true, ...result });
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
