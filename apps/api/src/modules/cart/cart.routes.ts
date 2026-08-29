import { Router } from "express";
import { z } from "zod";
import { addToCartSchema } from "@yummix/validation";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as cartService from "./cart.service.js";

export const cartRouter = Router();
cartRouter.use(requireAuth, requireRole(Role.CUSTOMER));

cartRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const view = await cartService.getCartView(req.auth!.sub);
    res.json({ success: true, ...view });
  }),
);

cartRouter.post(
  "/items",
  asyncHandler(async (req, res) => {
    const input = addToCartSchema.parse(req.body);
    const result = await cartService.addToCart(req.auth!.sub, input);
    res.status(201).json({ success: true, ...result });
  }),
);

const updateItemSchema = z.object({
  quantity: z.number().int().min(1).max(50).optional(),
  modifierOptionIds: z.array(z.string()).optional(),
  notes: z.string().max(300).optional(),
});

cartRouter.patch(
  "/items/:itemId",
  asyncHandler(async (req, res) => {
    const input = updateItemSchema.parse(req.body);
    await cartService.updateCartItem(req.auth!.sub, req.params.itemId!, input);
    res.json({ success: true });
  }),
);

cartRouter.delete(
  "/items/:itemId",
  asyncHandler(async (req, res) => {
    await cartService.removeCartItem(req.auth!.sub, req.params.itemId!);
    res.json({ success: true });
  }),
);

cartRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    await cartService.clearCart(req.auth!.sub);
    res.json({ success: true });
  }),
);
