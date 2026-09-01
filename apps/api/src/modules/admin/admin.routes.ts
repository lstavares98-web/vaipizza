import { Router } from "express";
import { z } from "zod";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as adminService from "./admin.service.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN));

const restaurantStatusSchema = z.enum(["PENDING", "APPROVED", "SUSPENDED", "REJECTED"]).optional();
const courierStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]).optional();
const orderStatusSchema = z
  .enum([
    "NEW",
    "ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "WAITING_FOR_COURIER",
    "COURIER_ASSIGNED",
    "PICKED_UP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "COLLECTED",
    "CANCELLED",
  ])
  .optional();

adminRouter.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const dashboard = await adminService.getDashboard();
    res.json({ success: true, ...dashboard });
  }),
);


// ---- Single-installation features --------------------------------------

adminRouter.get(
  "/features",
  asyncHandler(async (_req, res) => {
    const features = await adminService.getInstallationFeatures();
    res.json({ success: true, features });
  }),
);

adminRouter.patch(
  "/features",
  asyncHandler(async (req, res) => {
    const input = z.object({ combosEnabled: z.boolean().optional() }).strict().parse(req.body);
    const features = await adminService.updateInstallationFeatures(input);
    res.json({ success: true, features });
  }),
);

// ---- Restaurants --------------------------------------------------------

adminRouter.get(
  "/restaurants",
  asyncHandler(async (req, res) => {
    const status = restaurantStatusSchema.parse(req.query.status);
    const restaurants = await adminService.listRestaurants(status);
    res.json({ success: true, restaurants });
  }),
);

adminRouter.post(
  "/restaurants/:id/approve",
  asyncHandler(async (req, res) => {
    const restaurant = await adminService.approveRestaurant(req.params.id!);
    res.json({ success: true, restaurant });
  }),
);

adminRouter.post(
  "/restaurants/:id/reject",
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const restaurant = await adminService.rejectRestaurant(req.params.id!, reason);
    res.json({ success: true, restaurant });
  }),
);

adminRouter.post(
  "/restaurants/:id/suspend",
  asyncHandler(async (req, res) => {
    const restaurant = await adminService.suspendRestaurant(req.params.id!);
    res.json({ success: true, restaurant });
  }),
);

adminRouter.patch(
  "/restaurants/:id",
  asyncHandler(async (req, res) => {
    const input = z
      .object({ commissionPercent: z.number().min(0).max(100).optional(), deliveryRadiusKm: z.number().positive().optional() })
      .parse(req.body);
    const restaurant = await adminService.updateRestaurantSettings(req.params.id!, input);
    res.json({ success: true, restaurant });
  }),
);

// ---- Couriers -------------------------------------------------------------

adminRouter.get(
  "/couriers",
  asyncHandler(async (req, res) => {
    const status = courierStatusSchema.parse(req.query.status);
    const couriers = await adminService.listCouriers(status);
    res.json({ success: true, couriers });
  }),
);

adminRouter.post(
  "/couriers/:id/approve",
  asyncHandler(async (req, res) => {
    const courier = await adminService.approveCourier(req.params.id!);
    res.json({ success: true, courier });
  }),
);

adminRouter.post(
  "/couriers/:id/reject",
  asyncHandler(async (req, res) => {
    const courier = await adminService.rejectCourier(req.params.id!);
    res.json({ success: true, courier });
  }),
);

// ---- Customers --------------------------------------------------------

adminRouter.get(
  "/customers",
  asyncHandler(async (_req, res) => {
    const customers = await adminService.listCustomers();
    res.json({ success: true, customers });
  }),
);

adminRouter.post(
  "/customers/:id/block",
  asyncHandler(async (req, res) => {
    const customer = await adminService.setCustomerBlocked(req.params.id!, true);
    res.json({ success: true, customer });
  }),
);

adminRouter.post(
  "/customers/:id/unblock",
  asyncHandler(async (req, res) => {
    const customer = await adminService.setCustomerBlocked(req.params.id!, false);
    res.json({ success: true, customer });
  }),
);

// ---- Orders -------------------------------------------------------------

adminRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const status = orderStatusSchema.parse(req.query.status);
    const restaurantId = typeof req.query.restaurantId === "string" ? req.query.restaurantId : undefined;
    const orders = await adminService.listAllOrders({ status, restaurantId });
    res.json({ success: true, orders });
  }),
);

adminRouter.post(
  "/orders/:id/cancel",
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const order = await adminService.forceCancelOrder(req.params.id!, reason);
    res.json({ success: true, order });
  }),
);

// ---- Refund alerts ----------------------------------------------------

adminRouter.get(
  "/refund-alerts",
  asyncHandler(async (req, res) => {
    const resolved = req.query.resolved === "true";
    const alerts = await adminService.listAdminAlerts(resolved);
    res.json({ success: true, alerts });
  }),
);

adminRouter.post(
  "/refund-alerts/:id/resolve",
  asyncHandler(async (req, res) => {
    const alert = await adminService.resolveAdminAlert(req.params.id!);
    res.json({ success: true, alert });
  }),
);

// ---- Feedback -----------------------------------------------------------

adminRouter.get(
  "/feedback",
  asyncHandler(async (_req, res) => {
    const feedback = await adminService.listFeedback();
    res.json({ success: true, feedback });
  }),
);

// ---- Franchise leads ----------------------------------------------------

adminRouter.get(
  "/franchises",
  asyncHandler(async (_req, res) => {
    const leads = await adminService.listFranchiseLeads();
    res.json({ success: true, leads });
  }),
);

adminRouter.patch(
  "/franchises/:id",
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["NEW", "CONTACTED", "ARCHIVED"]) }).parse(req.body);
    const lead = await adminService.updateFranchiseLeadStatus(req.params.id!, status);
    res.json({ success: true, lead });
  }),
);
