import type { ComboInput } from "@yummix/validation";
import { prisma } from "../../config/prisma.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { isComboScheduleAvailable } from "./combo.rules.js";

export const comboInclude = {
  fixedItems: {
    orderBy: { sortOrder: "asc" as const },
    include: { product: true },
  },
  groups: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      options: {
        orderBy: { sortOrder: "asc" as const },
        include: { product: true },
      },
    },
  },
} as const;

function uniqueProductIds(input: ComboInput) {
  return Array.from(
    new Set([
      ...input.fixedItems.map((item) => item.productId),
      ...input.groups.flatMap((group) => group.options.map((option) => option.productId)),
    ]),
  );
}

async function assertProductsBelongToRestaurant(restaurantId: string, input: ComboInput) {
  const ids = uniqueProductIds(input);
  const count = await prisma.product.count({ where: { id: { in: ids }, restaurantId } });
  if (count !== ids.length) throw badRequest("Um ou mais produtos do combo são inválidos", "INVALID_COMBO_PRODUCT");
}

function comboData(input: ComboInput) {
  return {
    name: input.name,
    description: input.description,
    basePrice: input.basePrice,
    compareAtPrice: input.compareAtPrice ?? null,
    imageUrl: input.imageUrl ?? null,
    imagePublicId: input.imagePublicId ?? null,
    isActive: input.isActive ?? true,
    isFeatured: input.isFeatured ?? false,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    availableDays: Array.from(new Set(input.availableDays)).sort((a, b) => a - b),
    availableFrom: input.availableFrom ?? null,
    availableTo: input.availableTo ?? null,
    sortOrder: input.sortOrder ?? 0,
  };
}

function nestedComboData(input: ComboInput) {
  return {
    fixedItems: {
      create: input.fixedItems.map((item, index) => ({
        productId: item.productId,
        quantity: item.quantity,
        sortOrder: item.sortOrder ?? index,
      })),
    },
    groups: {
      create: input.groups.map((group, groupIndex) => ({
        name: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        sortOrder: group.sortOrder ?? groupIndex,
        options: {
          create: group.options.map((option, optionIndex) => ({
            productId: option.productId,
            priceDelta: option.priceDelta,
            sortOrder: option.sortOrder ?? optionIndex,
          })),
        },
      })),
    },
  };
}

export async function getComboManagementState(restaurantId: string) {
  const [restaurant, combos] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { combosEnabled: true } }),
    prisma.combo.findMany({
      where: { restaurantId },
      include: comboInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
  ]);
  if (!restaurant) throw notFound("Restaurante não encontrado");
  return { combosEnabled: restaurant.combosEnabled, combos };
}

export async function createCombo(restaurantId: string, input: ComboInput) {
  await assertProductsBelongToRestaurant(restaurantId, input);
  return prisma.combo.create({
    data: {
      restaurantId,
      ...comboData(input),
      ...nestedComboData(input),
    },
    include: comboInclude,
  });
}

export async function updateCombo(restaurantId: string, comboId: string, input: ComboInput) {
  const existing = await prisma.combo.findFirst({ where: { id: comboId, restaurantId } });
  if (!existing) throw notFound("Combo não encontrado");
  await assertProductsBelongToRestaurant(restaurantId, input);

  return prisma.$transaction(async (tx) => {
    // Existing cart selections become stale when a combo definition changes.
    await tx.cartItem.deleteMany({ where: { comboId } });
    await tx.comboFixedItem.deleteMany({ where: { comboId } });
    await tx.comboGroup.deleteMany({ where: { comboId } });
    return tx.combo.update({
      where: { id: comboId },
      data: {
        ...comboData(input),
        ...nestedComboData(input),
      },
      include: comboInclude,
    });
  });
}

export async function deactivateCombo(restaurantId: string, comboId: string) {
  const existing = await prisma.combo.findFirst({ where: { id: comboId, restaurantId } });
  if (!existing) throw notFound("Combo não encontrado");
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { comboId } }),
    prisma.combo.update({ where: { id: comboId }, data: { isActive: false } }),
  ]);
}

export async function getComboForCart(comboId: string) {
  return prisma.combo.findUnique({ where: { id: comboId }, include: comboInclude });
}

export async function listPublicCombosBySlug(slug: string, now = new Date()) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true, combosEnabled: true },
  });
  if (!restaurant) throw notFound("Restaurant not found");
  if (!restaurant.combosEnabled) return [];

  const combos = await prisma.combo.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    include: comboInclude,
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return combos
    .filter((combo) => {
      if (combo.startsAt && now < combo.startsAt) return false;
      if (combo.endsAt && now > combo.endsAt) return false;
      return isComboScheduleAvailable(combo, now);
    })
    .map((combo) => ({
      id: combo.id,
      name: combo.name,
      description: combo.description,
      basePrice: combo.basePrice,
      compareAtPrice: combo.compareAtPrice,
      imageUrl: combo.imageUrl,
      isFeatured: combo.isFeatured,
      fixedItems: combo.fixedItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        product: { id: item.product.id, name: item.product.name, imageUrl: item.product.imageUrl },
      })),
      groups: combo.groups.map((group) => ({
        id: group.id,
        name: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        options: group.options
          .filter((option) => option.product.isAvailable && (option.product.stock == null || option.product.stock > 0))
          .map((option) => ({
            id: option.id,
            priceDelta: option.priceDelta,
            product: { id: option.product.id, name: option.product.name, imageUrl: option.product.imageUrl },
          })),
      })),
    }));
}
