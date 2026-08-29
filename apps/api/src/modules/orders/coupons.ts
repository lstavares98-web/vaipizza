import { prisma } from "../../config/prisma.js";
import { badRequest } from "../../utils/AppError.js";
import { computeCouponDiscount } from "../../utils/pricing.js";

export async function resolveCoupon(code: string, restaurantId: string, userId: string, subtotal: number) {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) throw badRequest("Cupão inválido", "COUPON_INVALID");
  if (coupon.restaurantId && coupon.restaurantId !== restaurantId) {
    throw badRequest("Este cupão não é válido neste restaurante", "COUPON_WRONG_RESTAURANT");
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw badRequest("Este cupão expirou", "COUPON_EXPIRED");
  }
  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
    throw badRequest(`Este cupão requer um mínimo de ${coupon.minSubtotal.toFixed(2)} €`, "COUPON_MIN_SUBTOTAL");
  }

  const userRedemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.id, userId } });
  if (userRedemptions >= coupon.maxUsesPerUser) {
    throw badRequest("Já utilizou este cupão", "COUPON_ALREADY_USED");
  }
  if (coupon.maxUsesTotal != null) {
    const totalRedemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
    if (totalRedemptions >= coupon.maxUsesTotal) {
      throw badRequest("Este cupão esgotou", "COUPON_EXHAUSTED");
    }
  }

  const discount = computeCouponDiscount(subtotal, coupon);
  return { coupon, discount };
}
