import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { prisma } from "../../config/prisma.js";
import { notFound } from "../../utils/AppError.js";

export const usersRouter = Router();

usersRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
    if (!user) throw notFound("User not found");
    res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, restaurantId: user.restaurantId },
    });
  }),
);
