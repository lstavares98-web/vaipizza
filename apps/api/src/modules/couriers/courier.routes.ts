import { Router } from "express";
import { z } from "zod";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as courierService from "./courier.service.js";
import { acceptAssignment, rejectAssignment } from "../dispatch/dispatch.service.js";

export const courierRouter = Router();
courierRouter.use(requireAuth, requireRole(Role.COURIER));

courierRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const courier = await courierService.getCourierByUserId(req.auth!.sub);
    res.json({ success: true, courier });
  }),
);

courierRouter.post(
  "/online",
  asyncHandler(async (req, res) => {
    const { online } = z.object({ online: z.boolean() }).parse(req.body);
    const courier = await courierService.setOnline(req.auth!.sub, online);
    res.json({ success: true, courier });
  }),
);

courierRouter.post(
  "/location",
  asyncHandler(async (req, res) => {
    const { lat, lng } = z.object({ lat: z.number(), lng: z.number() }).parse(req.body);
    await courierService.updateLocation(req.auth!.sub, lat, lng);
    res.json({ success: true });
  }),
);

courierRouter.get(
  "/assignments/current",
  asyncHandler(async (req, res) => {
    const assignment = await courierService.getCurrentAssignment(req.auth!.sub);
    res.json({ success: true, assignment });
  }),
);

courierRouter.post(
  "/assignments/:id/accept",
  asyncHandler(async (req, res) => {
    const courier = await courierService.getCourierByUserId(req.auth!.sub);
    const order = await acceptAssignment(courier.id, req.params.id!);
    if (!order) return res.status(409).json({ success: false, message: "Esta oferta já não está disponível" });
    res.json({ success: true, order });
  }),
);

courierRouter.post(
  "/assignments/:id/reject",
  asyncHandler(async (req, res) => {
    const courier = await courierService.getCourierByUserId(req.auth!.sub);
    await rejectAssignment(courier.id, req.params.id!);
    res.json({ success: true });
  }),
);

courierRouter.get(
  "/orders/current",
  asyncHandler(async (req, res) => {
    const order = await courierService.getCurrentOrder(req.auth!.sub);
    res.json({ success: true, order });
  }),
);

const statusSchema = z.object({
  status: z.enum(["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"]),
  amountTendered: z.number().nonnegative().optional(),
});

courierRouter.patch(
  "/orders/:orderId/status",
  asyncHandler(async (req, res) => {
    const { status, amountTendered } = statusSchema.parse(req.body);
    const order = await courierService.updateDeliveryStatus(req.auth!.sub, req.params.orderId!, status, amountTendered);
    res.json({ success: true, order });
  }),
);

courierRouter.get(
  "/earnings",
  asyncHandler(async (req, res) => {
    const summary = await courierService.getEarningsSummary(req.auth!.sub);
    res.json({ success: true, ...summary });
  }),
);

courierRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const orders = await courierService.getHistory(req.auth!.sub);
    res.json({ success: true, orders });
  }),
);
