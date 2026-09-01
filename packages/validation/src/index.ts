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
  imageUrl: z.string().url().optional(),
  imagePublicId: z.string().optional(),
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

const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const comboFixedItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  sortOrder: z.number().int().optional(),
});

export const comboGroupOptionInputSchema = z.object({
  productId: z.string().min(1),
  priceDelta: z.number().default(0),
  sortOrder: z.number().int().optional(),
});

export const comboGroupInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    sortOrder: z.number().int().optional(),
    options: z.array(comboGroupOptionInputSchema).min(1),
  })
  .refine((group) => group.minSelect <= group.maxSelect, {
    message: "minSelect não pode ser superior a maxSelect",
    path: ["minSelect"],
  });

export const comboInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    basePrice: z.number().nonnegative(),
    compareAtPrice: z.number().nonnegative().nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    imagePublicId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    availableDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    availableFrom: hhmmSchema.nullable().optional(),
    availableTo: hhmmSchema.nullable().optional(),
    sortOrder: z.number().int().optional(),
    fixedItems: z.array(comboFixedItemSchema).default([]),
    groups: z.array(comboGroupInputSchema).default([]),
  })
  .superRefine((combo, ctx) => {
    if (combo.fixedItems.length === 0 && combo.groups.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fixedItems"], message: "O combo precisa de pelo menos um item ou grupo" });
    }
    if (combo.startsAt && combo.endsAt && new Date(combo.startsAt) > new Date(combo.endsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "Início posterior ao fim" });
    }
    if (combo.compareAtPrice != null && combo.compareAtPrice < combo.basePrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["compareAtPrice"], message: "Preço anterior deve ser igual ou superior ao preço do combo" });
    }
  });
export type ComboInput = z.infer<typeof comboInputSchema>;

export const addComboToCartSchema = z.object({
  comboId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  selections: z
    .array(
      z.object({
        groupId: z.string().min(1),
        optionIds: z.array(z.string().min(1)).max(20),
      }),
    )
    .max(30),
  notes: z.string().max(300).optional(),
});
export type AddComboToCartInput = z.infer<typeof addComboToCartSchema>;

export const franchiseLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(200),
  cityRegion: z.string().trim().min(2).max(160),
  message: z.string().trim().min(5).max(2000),
});
export type FranchiseLeadInput = z.infer<typeof franchiseLeadSchema>;
