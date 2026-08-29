import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { prisma } from "../../config/prisma.js";

export const feedbackRouter = Router();

const feedbackSchema = z.object({
  kind: z.enum(["CUSTOMER_FEEDBACK", "PARTNER_REQUEST"]),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  message: z.string().min(1).max(2000),
});

// Public — no auth. Matches the legacy app's contact/partner forms.
feedbackRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = feedbackSchema.parse(req.body);
    await prisma.feedbackSubmission.create({ data: input });
    res.status(201).json({ success: true, message: "Obrigado! A sua mensagem foi enviada." });
  }),
);
