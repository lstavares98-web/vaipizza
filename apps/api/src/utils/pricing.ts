interface PricedModifierOption {
  priceDelta: number;
}

/** Sum of a product's base price + every selected modifier's price delta. */
export function computeUnitPrice(basePrice: number, options: PricedModifierOption[]): number {
  const modifiersTotal = options.reduce((sum, o) => sum + o.priceDelta, 0);
  return round2(basePrice + modifiersTotal);
}

/**
 * Price for a split ("half & half") product: two halves, each with its own
 * base price, combined per the product's configured pricing rule.
 * Modifiers are priced separately and added on top (they apply to the
 * whole item, not per half — e.g. "extra cheese" tops the whole pizza).
 */
export function computeSplitBasePrice(
  primaryBasePrice: number,
  secondaryBasePrice: number,
  rule: "MOST_EXPENSIVE" | "AVERAGE",
): number {
  if (rule === "MOST_EXPENSIVE") return Math.max(primaryBasePrice, secondaryBasePrice);
  return round2((primaryBasePrice + secondaryBasePrice) / 2);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Discount never exceeds the subtotal — a coupon can zero an order out, never go negative. */
export function computeCouponDiscount(
  subtotal: number,
  coupon: { percentOff?: number | null; amountOff?: number | null },
): number {
  const raw = coupon.percentOff ? subtotal * (coupon.percentOff / 100) : (coupon.amountOff ?? 0);
  return round2(Math.min(raw, subtotal));
}
