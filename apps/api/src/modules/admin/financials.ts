import { round2 } from "../../utils/pricing.js";

interface FinancialOrder {
  status: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  restaurant: { commissionPercent: number };
}

export interface FinancialsSummary {
  orderCount: number;
  gmv: number;
  platformCommission: number;
  restaurantPayout: number;
  deliveryFees: number;
}

/**
 * Platform-wide revenue split. GMV excludes cancelled orders (money that
 * was never actually captured/kept). Commission is charged on the food
 * subtotal only, never on the delivery fee — that fee passes through to
 * the courier, the platform doesn't take a cut of it.
 */
export function computeFinancials(orders: FinancialOrder[]): FinancialsSummary {
  const counted = orders.filter((o) => o.status !== "CANCELLED");
  const gmv = round2(counted.reduce((sum, o) => sum + o.total, 0));
  const platformCommission = round2(
    counted.reduce((sum, o) => sum + o.subtotal * (o.restaurant.commissionPercent / 100), 0),
  );
  const deliveryFees = round2(counted.reduce((sum, o) => sum + o.deliveryFee, 0));
  const restaurantPayout = round2(
    counted.reduce((sum, o) => sum + o.subtotal, 0) - platformCommission,
  );

  return { orderCount: counted.length, gmv, platformCommission, restaurantPayout, deliveryFees };
}
