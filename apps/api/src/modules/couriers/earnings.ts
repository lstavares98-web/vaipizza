import { round2 } from "../../utils/pricing.js";

const COURIER_SHARE_OF_DELIVERY_FEE = 0.7;
const BONUS_EVERY_N_DELIVERIES = 10;
const BONUS_AMOUNT = 5;

/**
 * Per-delivery earning: the courier's cut of the delivery fee, plus a
 * milestone bonus every Nth completed delivery — mirrors the legacy
 * Yummix's per-km + streak-bonus model, generalized to use the fee already
 * computed for the order instead of recomputing distance here.
 */
export function computeDeliveryEarning(deliveryFee: number, completedDeliveriesBeforeThisOne: number) {
  const base = round2(deliveryFee * COURIER_SHARE_OF_DELIVERY_FEE);
  const deliveryNumber = completedDeliveriesBeforeThisOne + 1;
  const bonus = deliveryNumber % BONUS_EVERY_N_DELIVERIES === 0 ? BONUS_AMOUNT : 0;
  return { base, bonus, total: round2(base + bonus) };
}
