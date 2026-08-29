import { Router } from "express";
import { Role } from "@yummix/types";
import {
  forgotPasswordSchema,
  loginSchema,
  registerCourierSchema,
  registerCustomerSchema,
  resetPasswordSchema,
} from "@yummix/validation";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { badRequest } from "../../utils/AppError.js";
import * as authService from "./auth.service.js";

export const authRouter = Router();

const sanitizeUser = (user: { id: string; email: string; name: string; role: string; restaurantId: string | null }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  restaurantId: user.restaurantId,
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerCustomerSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.registerCustomer(input);
    res.status(201).json({ success: true, user: sanitizeUser(user), accessToken, refreshToken });
  }),
);

authRouter.post(
  "/courier/register",
  asyncHandler(async (req, res) => {
    const input = registerCourierSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.registerCourier(input);
    res.status(201).json({ success: true, user: sanitizeUser(user), accessToken, refreshToken });
  }),
);

// Every app logs in through the same endpoint but declares which roles it
// accepts — a customer JWT can never authenticate the restaurant app, etc.
const loginFor = (roles: Role[]) =>
  asyncHandler(async (req: import("express").Request, res: import("express").Response) => {
    const input = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(input, roles);
    res.json({ success: true, user: sanitizeUser(user), accessToken, refreshToken });
  });

authRouter.post("/customer/login", loginFor([Role.CUSTOMER]));
authRouter.post("/restaurant/login", loginFor([Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF]));
authRouter.post("/kitchen/login", loginFor([Role.KITCHEN]));
authRouter.post("/courier/login", loginFor([Role.COURIER]));
authRouter.post("/admin/login", loginFor([Role.SUPER_ADMIN]));

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken || typeof refreshToken !== "string") throw badRequest("refreshToken is required");
    const session = await authService.refreshSession(refreshToken);
    res.json({ success: true, ...session });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = req.body?.refreshToken;
    if (refreshToken) await authService.logout(refreshToken);
    res.json({ success: true });
  }),
);

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(email);
    // TODO(Fase 6): plug a real transactional email provider. For now the
    // reset link is logged server-side so the flow is testable end-to-end
    // without inventing an email dependency mid-Fase-1.
    if (result) {
      console.log(`[password-reset] ${result.user.email} -> token=${result.rawToken}`);
    }
    res.json({ success: true, message: "If that email exists, a reset link has been sent." });
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    res.json({ success: true, message: "Password updated. Please log in again." });
  }),
);
