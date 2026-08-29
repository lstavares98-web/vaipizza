import { z } from "zod";

export const registerCustomerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  // Required — every order must carry a phone number for the restaurant/
  // courier to reach the customer.
  phone: z.string().min(6).max(20),
});
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerCourierSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  phone: z.string().min(6).max(20),
  vehicleType: z.enum(["BIKE", "BICYCLE", "SCOOTER", "CAR"]).default("BIKE"),
  vehicleNumber: z.string().max(20).optional(),
  documentIdUrl: z.string().url().optional(),
  documentLicenseUrl: z.string().url().optional(),
});
export type RegisterCourierInput = z.infer<typeof registerCourierSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(72),
});

export const addressSchema = z.object({
  label: z.string().min(1).max(40),
  line1: z.string().min(1).max(160),
  line2: z.string().max(160).optional(),
  city: z.string().min(1).max(80),
  postalCode: z.string().max(20).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const modifierOptionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  priceDelta: z.number(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const modifierGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  required: z.boolean(),
  minSelect: z.number().int().min(0),
  maxSelect: z.number().int().min(1),
  sortOrder: z.number().int().optional(),
  options: z.array(modifierOptionSchema).min(1),
});

export const productSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  basePrice: z.number().nonnegative(),
  isAvailable: z.boolean().optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
  allowsSplit: z.boolean().optional(),
  splitPricingRule: z.enum(["MOST_EXPENSIVE", "AVERAGE"]).optional(),
  modifierGroups: z.array(modifierGroupSchema).optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const cartItemModifierSelectionSchema = z.object({
  groupId: z.string(),
  optionIds: z.array(z.string()).min(0),
});

export const addToCartSchema = z.object({
  productId: z.string(),
  secondaryProductId: z.string().optional(),
  quantity: z.number().int().min(1).max(50),
  modifierOptionIds: z.array(z.string()).default([]),
  notes: z.string().max(300).optional(),
});
export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const checkoutSchema = z.object({
  addressId: z.string().optional(),
  fulfillmentType: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["CARD", "CASH", "MBWAY", "TERMINAL"]),
  couponCode: z.string().optional(),
  notes: z.string().max(500).optional(),
  // Only meaningful for CASH: what note/bill the customer expects to pay
  // with, so the restaurant can send the courier out with the right
  // change already in hand — nobody has to count cash at the door.
  amountTendered: z.number().nonnegative().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "COLLECTED",
    "CANCELLED",
  ]),
  prepTimeMinutes: z.number().int().positive().optional(),
  rejectionReason: z.string().max(300).optional(),
});
