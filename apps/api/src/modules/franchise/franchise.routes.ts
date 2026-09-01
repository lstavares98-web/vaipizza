import { Router } from "express";
import rateLimit from "express-rate-limit";
import { franchiseLeadSchema } from "@yummix/validation";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { submitFranchiseLead } from "./franchise.service.js";

export const franchiseRouter = Router();
const franchiseLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

franchiseRouter.post(
  "/",
  franchiseLimiter,
  asyncHandler(async (req, res) => {
    const input = franchiseLeadSchema.parse(req.body);
    const lead = await submitFranchiseLead(input);
    res.status(201).json({ success: true, leadId: lead.id });
  }),
);
