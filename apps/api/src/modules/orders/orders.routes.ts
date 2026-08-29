import { Router } from "express";
import { checkoutSchema } from "@yummix/validation";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as ordersService from "./orders.service.js";

export const ordersRouter = Router();
ordersRouter.use(requireAuth, requireRole(Role.CUSTOMER));

ordersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = checkoutSchema.parse(req.body);
    const result = await ordersService.checkout(req.auth!.sub, input);
    res.status(201).json({ success: true, order: result.order, stripeSessionUrl: result.stripeSessionUrl });
  }),
);

ordersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const orders = await ordersService.listOrdersForCustomer(req.auth!.sub);
    res.json({ success: true, orders });
  }),
);

ordersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const order = await ordersService.getOrderForCustomer(req.auth!.sub, req.params.id!);
    res.json({ success: true, order });
  }),
);

ordersRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const result = await ordersService.cancelOrderByCustomer(req.auth!.sub, req.params.id!);
    res.json({ success: true, order: result.order, refunded: result.refunded });
  }),
);
