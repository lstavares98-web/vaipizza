import { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { getIO, rooms } from "../../sockets/io.js";

export const paymentsRouter = Router();
const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

const verifySchema = z.object({ orderId: z.string() });

// Called by the customer app after returning from Stripe Checkout —
// mirrors the legacy Yummix's verifyOrder flow: the redirect itself is
// untrusted, so we re-fetch the session server-side before marking PAID.
paymentsRouter.post(
  "/verify",
  requireAuth,
  requireRole(Role.CUSTOMER),
  asyncHandler(async (req, res) => {
    const { orderId } = verifySchema.parse(req.body);
    const order = await prisma.order.findFirst({ where: { id: orderId, userId: req.auth!.sub } });
    if (!order) throw notFound("Order not found");
    if (!order.stripeSessionId) throw badRequest("This order was not paid by card");
    if (!stripe) throw badRequest("Stripe is not configured in this environment");

    const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
    if (session.payment_status !== "paid") {
      return res.json({ success: false, message: "Payment not completed yet" });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
      },
    });
    getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:payment", { orderId: order.id });
    res.json({ success: true, order: updated });
  }),
);
