import type { AddComboToCartInput, AddToCartInput } from "@yummix/validation";
import { prisma } from "../../config/prisma.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { validateModifierSelections } from "../catalog/modifiers.js";
import { computeSplitBasePrice, computeUnitPrice, round2 } from "../../utils/pricing.js";
import { getComboForCart, comboInclude } from "../combos/combos.service.js";
import { isComboScheduleAvailable, priceCombo, validateComboSelection, type ComboSelectionInput } from "../combos/combo.rules.js";

const productInclude = {
  modifierGroups: { include: { options: true } },
} as const;

async function loadProductOrThrow(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: productInclude });
  if (!product || !product.isAvailable) throw notFound("Product not available");
  return product;
}

function validateComboOrBadRequest(combo: Parameters<typeof validateComboSelection>[0], selections: ComboSelectionInput[]) {
  try {
    return validateComboSelection(combo, selections);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Seleção de combo inválida", "INVALID_COMBO_SELECTION");
  }
}

function priceComboOrBadRequest(combo: Parameters<typeof priceCombo>[0], selections: ComboSelectionInput[]) {
  try {
    return priceCombo(combo, selections);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Seleção de combo inválida", "INVALID_COMBO_SELECTION");
  }
}

export async function getOrCreateCart(userId: string) {
  return prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function addToCart(userId: string, input: AddToCartInput) {
  const cart = await getOrCreateCart(userId);
  const product = await loadProductOrThrow(input.productId);

  let cartId = cart.id;
  // Single-restaurant cart: switching restaurants clears the existing cart,
  // same behavior as the legacy app but now explicit and user-visible via
  // `restaurantSwitched` in the response instead of a silent side effect.
  let restaurantSwitched = false;
  if (cart.restaurantId && cart.restaurantId !== product.restaurantId) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    restaurantSwitched = true;
  }
  await prisma.cart.update({ where: { id: cartId }, data: { restaurantId: product.restaurantId } });

  validateModifierSelections(product.modifierGroups, input.modifierOptionIds);

  let secondaryProductId: string | undefined;
  if (input.secondaryProductId) {
    if (!product.allowsSplit) throw badRequest("This product cannot be split");
    const secondary = await loadProductOrThrow(input.secondaryProductId);
    if (secondary.restaurantId !== product.restaurantId) {
      throw badRequest("Split product must be from the same restaurant");
    }
    secondaryProductId = secondary.id;
  }

  const item = await prisma.cartItem.create({
    data: {
      cartId,
      productId: product.id,
      secondaryProductId,
      quantity: input.quantity,
      notes: input.notes,
      modifiers: { create: input.modifierOptionIds.map((optionId) => ({ optionId })) },
    },
  });

  return { itemId: item.id, restaurantSwitched };
}

export async function addComboToCart(userId: string, input: AddComboToCartInput) {
  const cart = await getOrCreateCart(userId);
  const combo = await getComboForCart(input.comboId);
  if (!combo || !combo.isActive) throw notFound("Combo não disponível");
  const restaurant = await prisma.restaurant.findUnique({ where: { id: combo.restaurantId }, select: { combosEnabled: true } });
  if (!restaurant?.combosEnabled) throw notFound("Combo não disponível");
  const now = new Date();
  if ((combo.startsAt && now < combo.startsAt) || (combo.endsAt && now > combo.endsAt) || !isComboScheduleAvailable(combo, now)) {
    throw badRequest("Este combo não está disponível neste horário", "COMBO_NOT_AVAILABLE");
  }
  validateComboOrBadRequest(combo, input.selections);

  let restaurantSwitched = false;
  if (cart.restaurantId && cart.restaurantId !== combo.restaurantId) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    restaurantSwitched = true;
  }
  await prisma.cart.update({ where: { id: cart.id }, data: { restaurantId: combo.restaurantId } });

  const item = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      comboId: combo.id,
      comboSelections: input.selections,
      quantity: input.quantity,
      notes: input.notes,
    },
  });
  return { itemId: item.id, restaurantSwitched };
}

export async function updateCartItem(
  userId: string,
  cartItemId: string,
  input: { quantity?: number; modifierOptionIds?: string[]; notes?: string },
) {
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, cart: { userId } },
    include: { product: { include: productInclude }, combo: { include: comboInclude } },
  });
  if (!item) throw notFound("Cart item not found");

  if (input.modifierOptionIds) {
    if (!item.product) throw badRequest("Modificadores não se aplicam a combos");
    validateModifierSelections(item.product.modifierGroups, input.modifierOptionIds);
    await prisma.cartItemModifier.deleteMany({ where: { cartItemId } });
    await prisma.cartItemModifier.createMany({
      data: input.modifierOptionIds.map((optionId) => ({ cartItemId, optionId })),
    });
  }

  await prisma.cartItem.update({
    where: { id: cartItemId },
    data: {
      ...(input.quantity != null ? { quantity: input.quantity } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

export async function removeCartItem(userId: string, cartItemId: string) {
  const item = await prisma.cartItem.findFirst({ where: { id: cartItemId, cart: { userId } } });
  if (!item) throw notFound("Cart item not found");
  await prisma.cartItem.delete({ where: { id: cartItemId } });

  const remaining = await prisma.cartItem.count({ where: { cartId: item.cartId } });
  if (remaining === 0) {
    await prisma.cart.update({ where: { id: item.cartId }, data: { restaurantId: null } });
  }
}

export async function clearCart(userId: string) {
  const cart = await getOrCreateCart(userId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cart.update({ where: { id: cart.id }, data: { restaurantId: null } });
}

// Fully-priced view of the cart — prices are computed live from the
// current catalog (not stored on the cart) so menu price changes are
// always reflected until the moment of checkout, when they get snapshotted
// onto the Order.
export async function getCartView(userId: string) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      restaurant: true,
      items: {
        include: {
          product: { include: productInclude },
          combo: { include: comboInclude },
          secondaryProduct: true,
          modifiers: { include: { option: { include: { group: true } } } },
        },
      },
    },
  });
  if (!cart) return { cart: null, items: [], subtotal: 0 };

  const items = cart.items.map((item) => {
    if (item.combo) {
      const selections = (item.comboSelections ?? []) as unknown as ComboSelectionInput[];
      const selected = validateComboOrBadRequest(item.combo, selections);
      const unitPrice = priceComboOrBadRequest(item.combo, selections);
      const lineTotal = round2(unitPrice * item.quantity);
      return {
        id: item.id,
        kind: "COMBO" as const,
        productId: null,
        comboId: item.combo.id,
        productName: item.combo.name,
        productImageUrl: item.combo.imageUrl,
        secondaryProductId: null,
        secondaryProductName: null,
        quantity: item.quantity,
        notes: item.notes,
        unitPrice,
        lineTotal,
        modifiers: [],
        comboSelections: {
          fixedItems: item.combo.fixedItems.map((fixed) => ({
            productId: fixed.productId,
            productName: fixed.product.name,
            quantity: fixed.quantity,
          })),
          selectedOptions: selected.map((option) => ({
            groupId: option.groupId,
            groupName: option.groupName,
            optionId: option.optionId,
            productId: option.productId,
            productName: option.productName,
            priceDelta: option.priceDelta,
          })),
        },
      };
    }

    if (!item.product) throw badRequest("Item de carrinho inválido", "INVALID_CART_ITEM");
    const options = item.modifiers.map((m) => m.option);
    let unitPrice: number;
    if (item.secondaryProduct) {
      const splitBase = computeSplitBasePrice(
        item.product.basePrice,
        item.secondaryProduct.basePrice,
        item.product.splitPricingRule,
      );
      unitPrice = computeUnitPrice(splitBase, options);
    } else {
      unitPrice = computeUnitPrice(item.product.basePrice, options);
    }
    const lineTotal = round2(unitPrice * item.quantity);
    return {
      id: item.id,
      kind: "PRODUCT" as const,
      productId: item.productId,
      comboId: null,
      productName: item.product.name,
      productImageUrl: item.product.imageUrl,
      secondaryProductId: item.secondaryProductId,
      secondaryProductName: item.secondaryProduct?.name ?? null,
      quantity: item.quantity,
      notes: item.notes,
      unitPrice,
      lineTotal,
      modifiers: item.modifiers.map((m) => ({
        optionId: m.optionId,
        groupName: m.option.group.name,
        name: m.option.name,
        priceDelta: m.option.priceDelta,
      })),
      comboSelections: null,
    };
  });

  const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
  return { cart: { id: cart.id, restaurant: cart.restaurant }, items, subtotal };
}
