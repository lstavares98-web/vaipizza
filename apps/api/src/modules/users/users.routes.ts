import { Router } from "express";
import { z } from "zod";
import { Role } from "@yummix/types";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { prisma } from "../../config/prisma.js";
import { notFound } from "../../utils/AppError.js";
import { changeOwnPassword, customerMustChangePassword } from "../auth/auth.service.js";

export const usersRouter = Router();

usersRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
    if (!user) throw notFound("User not found");
    const mustChangePassword = user.role === Role.CUSTOMER ? await customerMustChangePassword(user.id) : false;
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        restaurantId: user.restaurantId,
        mustChangePassword,
      },
    });
  }),
);

usersRouter.post(
  "/me/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { password } = z.object({ password: z.string().min(8).max(72) }).parse(req.body);
    await changeOwnPassword(req.auth!.sub, password);
    res.json({ success: true, message: "Palavra-passe atualizada. Entre novamente com a nova palavra-passe." });
  }),
);
