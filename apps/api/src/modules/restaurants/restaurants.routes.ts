import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { notFound } from "../../utils/AppError.js";
import { calcDeliveryFee, haversineKm } from "../../utils/geo.js";
import { listPublicCombosBySlug } from "../combos/combos.service.js";

export const restaurantsRouter = Router();

const listQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  search: z.string().optional(),
});

function computeIsOpen(hours: { dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }[]) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayHours = hours.find((h) => h.dayOfWeek === dayOfWeek);
  return todayHours ? !todayHours.isClosed && hhmm >= todayHours.opensAt && hhmm <= todayHours.closesAt : true;
}

// "18:00 – 23:00" for today, or null when today has no hours row (or is
// marked closed) — lets the client show a real schedule line without
// having to ship the whole week's hours or duplicate this day-of-week
// lookup on the frontend.
function todayHoursLabel(hours: { dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }[]) {
  const todayHours = hours.find((h) => h.dayOfWeek === new Date().getDay());
  if (!todayHours || todayHours.isClosed) return null;
  return `${todayHours.opensAt} – ${todayHours.closesAt}`;
}

// Public: restaurant discovery. Mirrors the legacy Yummix's 10km-radius
// browse, generalized to each restaurant's own configurable radius, plus
// live open/closed + estimated delivery fee when the customer's location
// is known.
restaurantsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { lat, lng, search } = listQuerySchema.parse(req.query);

    const restaurants = await prisma.restaurant.findMany({
      where: {
        status: "APPROVED",
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      include: { hours: true },
      orderBy: { name: "asc" },
    });

    const withDerived = restaurants
      .map((r) => {
        const distanceKm = lat != null && lng != null ? haversineKm(lat, lng, r.lat, r.lng) : null;
        const isOpen = computeIsOpen(r.hours);
        const deliveryFee = distanceKm != null ? calcDeliveryFee(r, distanceKm) : null;
        // ~4 min/km average urban delivery speed, +restaurant prep buffer.
        const etaMinutes = distanceKm != null ? Math.round(distanceKm * 4 + 15) : null;
        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          description: r.description,
          logoUrl: r.logoUrl,
          bannerUrl: r.bannerUrl,
          address: r.address,
          phone: r.phone,
          todayHours: todayHoursLabel(r.hours),
          avgRating: r.avgRating,
          ratingCount: r.ratingCount,
          acceptsPickup: r.acceptsPickup,
          acceptsDelivery: r.acceptsDelivery,
          distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
          deliveryFee,
          etaMinutes,
          isOpen,
          inRange: distanceKm == null ? true : distanceKm <= r.deliveryRadiusKm,
        };
      })
      // Out-of-range restaurants are hidden entirely, matching the legacy
      // 10km discovery behaviour, just per-restaurant instead of global.
      .filter((r) => r.inRange);

    res.json({ success: true, restaurants: withDerived });
  }),
);

restaurantsRouter.get(
  "/:slug/combos",
  asyncHandler(async (req, res) => {
    const combos = await listPublicCombosBySlug(req.params.slug!);
    res.json({ success: true, combos });
  }),
);

restaurantsRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const restaurant = await prisma.restaurant.findFirst({
      where: { slug: req.params.slug, status: "APPROVED" },
      include: {
        hours: true,
        categories: {
          orderBy: { name: "asc" },
          include: {
            products: {
              where: { isAvailable: true },
              orderBy: { sortOrder: "asc" },
              include: {
                modifierGroups: {
                  orderBy: { sortOrder: "asc" },
                  include: { options: { orderBy: { sortOrder: "asc" } } },
                },
              },
            },
          },
        },
      },
    });
    if (!restaurant) throw notFound("Restaurant not found");
    res.json({ success: true, restaurant: { ...restaurant, isOpen: computeIsOpen(restaurant.hours) } });
  }),
);

// Used by the split/half-and-half picker to list candidate products from
// the same restaurant + category (only products that make sense to split
// with the one already chosen).
restaurantsRouter.get(
  "/:slug/products/:productId/split-candidates",
  asyncHandler(async (req, res) => {
    const restaurant = await prisma.restaurant.findFirst({ where: { slug: req.params.slug } });
    if (!restaurant) throw notFound("Restaurant not found");
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, restaurantId: restaurant.id },
    });
    if (!product) throw notFound("Product not found");

    const candidates = await prisma.product.findMany({
      where: {
        restaurantId: restaurant.id,
        categoryId: product.categoryId,
        allowsSplit: true,
        isAvailable: true,
        id: { not: product.id },
      },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, products: candidates });
  }),
);
