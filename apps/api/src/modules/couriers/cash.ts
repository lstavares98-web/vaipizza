import { round2 } from "../../utils/pricing.js";
import { badRequest } from "../../utils/AppError.js";

/**
 * Change owed to the customer when they pay in physical cash. Never
 * negative — a tendered amount below the total is a data-entry mistake the
 * courier needs to fix before confirming, not a "negative change".
 */
export function computeChangeDue(total: number, amountTendered: number): number {
  if (amountTendered < total) {
    throw badRequest(
      `Valor entregue (${amountTendered.toFixed(2)} €) é inferior ao total do pedido (${total.toFixed(2)} €)`,
      "AMOUNT_TENDERED_TOO_LOW",
    );
  }
  return round2(amountTendered - total);
}
