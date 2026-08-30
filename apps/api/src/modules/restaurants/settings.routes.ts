import { Router } from "express";
import { z } from "zod";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireOwnRestaurant, requireRole } from "../../middleware/auth.js";
import { prisma } from "../../config/prisma.js";
import { badRequest, notFound } from "../../utils/AppError.js";

export const restaurantSettingsRouter = Router();
restaurantSettingsRouter.use(
  requireAuth,
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  requireOwnRestaurant,
);

restaurantSettingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.auth!.restaurantId! },
      include: {
        deliveryFeeTiers: { orderBy: { upToKm: "asc" } },
        hours: { orderBy: { dayOfWeek: "asc" } },
      },
    });
    if (!restaurant) throw notFound("Restaurant not found");
    res.json({ success: true, restaurant });
  }),
);

const hourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  isClosed: z.boolean().optional(),
});

const hoursSchema = z.object({
  // Always the full week (0-6) — simpler to replace the whole schedule
  // at once than to reconcile a partial patch against 7 unique rows.
  days: z.array(hourSchema).min(1).max(7),
});

restaurantSettingsRouter.put(
  "/hours",
  asyncHandler(async (req, res) => {
    const { days } = hoursSchema.parse(req.body);
    const restaurantId = req.auth!.restaurantId!;
    await prisma.$transaction(
      days.map((d) =>
        prisma.restaurantHours.upsert({
          where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: d.dayOfWeek } },
          create: { restaurantId, ...d },
          update: { opensAt: d.opensAt, closesAt: d.closesAt, isClosed: d.isClosed ?? false },
        }),
      ),
    );
    const hours = await prisma.restaurantHours.findMany({ where: { restaurantId }, orderBy: { dayOfWeek: "asc" } });
    res.json({ success: true, hours });
  }),
);

const tierSchema = z.object({ upToKm: z.number().positive(), fee: z.number().nonnegative() });

const settingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  address: z.string().min(1).max(200).optional(),
  phone: z.string().min(6).max(20).optional(),
  deliveryFeeMode: z.enum(["TIERED", "BASE_PLUS_PER_KM"]).optional(),
  deliveryFeeBase: z.number().nonnegative().optional(),
  deliveryFeePerKm: z.number().nonnegative().optional(),
  deliveryFeeFreeKm: z.number().nonnegative().optional(),
  deliveryFeeTiers: z.array(tierSchema).optional(),
  deliveryRadiusKm: z.number().positive().optional(),
  acceptsPickup: z.boolean().optional(),
  acceptsDelivery: z.boolean().optional(),
  defaultPrepTimeMinutes: z.number().int().positive().optional(),
});

restaurantSettingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const input = settingsSchema.parse(req.body);
    const restaurantId = req.auth!.restaurantId!;
    if (!input.acceptsPickup && !input.acceptsDelivery && (input.acceptsPickup === false || input.acceptsDelivery === false)) {
      // Both explicitly false in the same request would leave the restaurant unreachable.
      const current = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
      const nextPickup = input.acceptsPickup ?? current?.acceptsPickup;
      const nextDelivery = input.acceptsDelivery ?? current?.acceptsDelivery;
      if (!nextPickup && !nextDelivery) {
        throw badRequest("O restaurante precisa de aceitar entrega ou recolha", "NO_FULFILLMENT_METHOD");
      }
    }

    const { deliveryFeeTiers, ...rest } = input;

    const restaurant = await prisma.$transaction(async (tx) => {
      if (deliveryFeeTiers) {
        await tx.deliveryFeeTier.deleteMany({ where: { restaurantId } });
        if (deliveryFeeTiers.length > 0) {
          await tx.deliveryFeeTier.createMany({
            data: deliveryFeeTiers.map((t) => ({ ...t, restaurantId })),
          });
        }
      }
      return tx.restaurant.update({
        where: { id: restaurantId },
        data: rest,
        include: { deliveryFeeTiers: { orderBy: { upToKm: "asc" } } },
      });
    });

    res.json({ success: true, restaurant });
  }),
);
