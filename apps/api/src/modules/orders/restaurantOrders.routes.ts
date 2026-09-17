import { Router } from "express";
import { z } from "zod";
import { updateOrderStatusSchema } from "@yummix/validation";
import { OrderStatus, Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireOwnRestaurant, requireRole } from "../../middleware/auth.js";
import * as ordersService from "./orders.service.js";
import { cancelOrderBeforeHandoff } from "./cancelOrder.service.js";
import { forceReassignCourier, listNearbyCouriers } from "../dispatch/dispatch.service.js";
import { lookupManualCustomer } from "./manualCustomer.js";
import { createManualOrder } from "./manualOrder.service.js";
import { buildOrderCustomerDisplay } from "./orderCustomerDisplay.js";
import { composeAddressSearchQuery, searchAddressCoordinates } from "../addresses/forwardGeocode.js";

export const restaurantOrdersRouter = Router();
restaurantOrdersRouter.use(
  requireAuth,
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF, Role.KITCHEN),
  requireOwnRestaurant,
);

const listQuerySchema = z.object({
  status: z.string().optional(), // comma-separated OrderStatus values
});

const manualOrderSchema = z.object({
  origin: z.enum(["PHONE", "COUNTER"]),
  fulfillmentType: z.enum(["DELIVERY", "PICKUP"]),
  registeredUserId: z.string().optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  addressId: z.string().optional(),
  delivery: z.object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().max(30).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  deliveryInstructions: z.string().trim().max(300).optional(),
  paymentMethod: z.enum(["CASH", "MBWAY", "TERMINAL"]),
  amountTendered: z.number().positive().optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    productId: z.string().optional(),
    comboId: z.string().optional(),
    secondaryProductId: z.string().optional(),
    quantity: z.number().int().min(1).max(50),
    modifierOptionIds: z.array(z.string()).default([]),
    comboSelections: z.array(z.object({
      groupId: z.string(),
      optionIds: z.array(z.string()),
    })).default([]),
    notes: z.string().trim().max(300).optional(),
  })).min(1).max(50),
});

restaurantOrdersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = listQuerySchema.parse(req.query);
    const statuses = status ? (status.split(",") as OrderStatus[]) : undefined;
    const rawOrders = await ordersService.listOrdersForRestaurant(req.auth!.restaurantId!, statuses);
    const orders = rawOrders.map((order) => ({ ...order, ...buildOrderCustomerDisplay(order) }));
    res.json({ success: true, orders });
  }),
);

restaurantOrdersRouter.get(
  "/customer-lookup",
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  asyncHandler(async (req, res) => {
    const { phone } = z.object({ phone: z.string().trim().min(7).max(40) }).parse(req.query);
    const result = await lookupManualCustomer(req.auth!.restaurantId!, phone);
    res.json({ success: true, ...result });
  }),
);

restaurantOrdersRouter.get(
  "/address-search",
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  asyncHandler(async (req, res) => {
    const input = z.object({
      q: z.string().trim().min(4).max(220).optional(),
      line1: z.string().trim().min(2).max(200).optional(),
      postalCode: z.string().trim().max(30).optional(),
      city: z.string().trim().max(100).optional(),
    }).refine((value) => Boolean(value.q || value.line1), {
      message: "Indique a rua ou a pesquisa da morada",
    }).parse(req.query);

    const query = input.q ?? composeAddressSearchQuery({
      line1: input.line1 ?? "",
      postalCode: input.postalCode,
      city: input.city,
    });
    const suggestions = await searchAddressCoordinates(query);
    res.json({ success: true, suggestions });
  }),
);

restaurantOrdersRouter.post(
  "/manual",
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  asyncHandler(async (req, res) => {
    const input = manualOrderSchema.parse(req.body);
    const order = await createManualOrder(req.auth!.restaurantId!, req.auth!.role, input);
    res.status(201).json({ success: true, order });
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
