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

/**
 * Cash the courier is physically holding after delivering a CASH order,
 * and therefore owes back to the restaurant. The restaurant sends the
 * change out with the courier in advance, so handing it to the customer
 * leaves the courier holding the *whole* note the customer paid with —
 * e.g. a €20 order paid with a €100 note: restaurant advances €80 change,
 * courier gives that €80 to the customer, and is left holding the €100
 * the customer just handed over. That full €100 is what must come back,
 * not just the €20 order value or the courier's own delivery fee.
 */
export function cashHeldByCourier(orderTotal: number, amountTendered: number | null): number {
  return round2(amountTendered ?? orderTotal);
}
