import { Router } from "express";
import { z } from "zod";
import { productSchema } from "@yummix/validation";
import { Role } from "@yummix/types";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requireOwnRestaurant, requireRole } from "../../middleware/auth.js";
import * as catalogService from "./catalog.service.js";

export const catalogRouter = Router();
catalogRouter.use(
  requireAuth,
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  requireOwnRestaurant,
);

const categoryInputSchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().optional(),
});

catalogRouter.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const categories = await catalogService.listCategories(req.auth!.restaurantId!);
    res.json({ success: true, categories });
  }),
);

catalogRouter.post(
  "/categories",
  asyncHandler(async (req, res) => {
    const input = categoryInputSchema.parse(req.body);
    const category = await catalogService.createCategory(req.auth!.restaurantId!, input.name, input.sortOrder);
    res.status(201).json({ success: true, category });
  }),
);

catalogRouter.patch(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    const input = categoryInputSchema.partial().parse(req.body);
    const category = await catalogService.updateCategory(req.auth!.restaurantId!, req.params.id!, input);
    res.json({ success: true, category });
  }),
);

catalogRouter.delete(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    await catalogService.deleteCategory(req.auth!.restaurantId!, req.params.id!);
    res.json({ success: true });
  }),
);

catalogRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    const products = await catalogService.listProducts(req.auth!.restaurantId!);
    res.json({ success: true, products });
  }),
);

catalogRouter.post(
  "/products",
  asyncHandler(async (req, res) => {
    const input = productSchema.parse(req.body);
    const product = await catalogService.createProduct(req.auth!.restaurantId!, input);
    res.status(201).json({ success: true, product });
  }),
);

const updateProductSchema = productSchema.partial().extend({
  defaultPrepTimeMinutes: z.number().int().positive().nullable().optional(),
});

catalogRouter.patch(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const input = updateProductSchema.parse(req.body);
    const product = await catalogService.updateProduct(req.auth!.restaurantId!, req.params.id!, input);
    res.json({ success: true, product });
  }),
);

catalogRouter.delete(
  "/products/:id",
  asyncHandler(async (req, res) => {
    await catalogService.deleteProduct(req.auth!.restaurantId!, req.params.id!);
    res.json({ success: true });
  }),
);
