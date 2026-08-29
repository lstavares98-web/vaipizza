import Stripe from "stripe";
import type { Order, Role } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

/**
 * Cancellation always transitions the order immediately — refunding is a
 * best-effort side effect, never a blocker (same principle as the legacy
 * Yummix's decoupled refund state machine, see PROJECT_ANALYSIS.md §4).
 * Failures are captured on the order + as an AdminAlert instead of thrown,
 * so a Stripe outage never leaves an order stuck mid-cancellation.
 */
export async function attemptRefund(order: Order, cancelledBy: Role | "SYSTEM") {
  if (order.paymentMethod !== "CARD" || order.paymentStatus !== "PAID" || !order.stripePaymentIntentId) {
    // Nothing was ever charged (CASH/PENDING/etc.) — no refund needed.
    return { refunded: false };
  }
  if (!stripe) {
    await flagRefundFailure(order.id, "Stripe not configured in this environment");
    return { refunded: false };
  }

  try {
    const refund = await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "REFUNDED", refundId: refund.id, refundFailed: false },
    });
    return { refunded: true };
  } catch (err) {
    await flagRefundFailure(order.id, err instanceof Error ? err.message : "Unknown Stripe error");
    return { refunded: false };
  }
}

async function flagRefundFailure(orderId: string, message: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      refundFailed: true,
      refundRetryCount: { increment: 1 },
      lastRefundError: message,
      refundNeedsManualReview: true,
    },
  });
  await prisma.adminAlert.create({
    data: { orderId, type: "REFUND_FAILED", message },
  });
}
