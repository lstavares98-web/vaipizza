import { Router } from "express";
import { Role } from "@yummix/types";
import { comboInputSchema } from "@yummix/validation";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireOwnRestaurant, requireRole } from "../../middleware/auth.js";
import * as combosService from "./combos.service.js";

export const combosRouter = Router();
combosRouter.use(requireAuth, requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF), requireOwnRestaurant);

combosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const state = await combosService.getComboManagementState(req.auth!.restaurantId!);
    res.json({ success: true, ...state });
  }),
);

combosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = comboInputSchema.parse(req.body);
    const combo = await combosService.createCombo(req.auth!.restaurantId!, input);
    res.status(201).json({ success: true, combo });
  }),
);

combosRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = comboInputSchema.parse(req.body);
    const combo = await combosService.updateCombo(req.auth!.restaurantId!, req.params.id!, input);
    res.json({ success: true, combo });
  }),
);

combosRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await combosService.deactivateCombo(req.auth!.restaurantId!, req.params.id!);
    res.json({ success: true });
  }),
);
