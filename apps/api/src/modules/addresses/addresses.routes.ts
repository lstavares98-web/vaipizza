import { Router } from "express";
import { addressSchema } from "@yummix/validation";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { prisma } from "../../config/prisma.js";
import { notFound } from "../../utils/AppError.js";

export const addressesRouter = Router();
addressesRouter.use(requireAuth, requireRole(Role.CUSTOMER));

addressesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const addresses = await prisma.address.findMany({
      where: { userId: req.auth!.sub },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    res.json({ success: true, addresses });
  }),
);

addressesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = addressSchema.parse(req.body);
    const userId = req.auth!.sub;
    if (input.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const address = await prisma.address.create({ data: { ...input, userId } });
    res.status(201).json({ success: true, address });
  }),
);

addressesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = req.auth!.sub;
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw notFound("Address not found");
    const input = addressSchema.partial().parse(req.body);
    if (input.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const address = await prisma.address.update({ where: { id: existing.id }, data: input });
    res.json({ success: true, address });
  }),
);

addressesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = req.auth!.sub;
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw notFound("Address not found");
    await prisma.address.delete({ where: { id: existing.id } });
    res.json({ success: true });
  }),
);
