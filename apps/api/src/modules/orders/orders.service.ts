import type { CheckoutInput } from "@yummix/validation";
import { OrderStatus, Role, type Role as RoleType } from "@yummix/types";
import Stripe from "stripe";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { calcDeliveryFee, haversineKm } from "../../utils/geo.js";
import { computeSplitBasePrice, computeUnitPrice, round2 } from "../../utils/pricing.js";
import { resolveCoupon } from "./coupons.js";
import { assertTransitionAllowed, CUSTOMER_CANCELLABLE_STATUSES } from "./orderStateMachine.js";
import { attemptRefund } from "../../services/refund.service.js";
import { getIO, rooms } from "../../sockets/io.js";
import { tryAssignOrder } from "../dispatch/dispatch.service.js";
import { computeChangeDue } from "../couriers/cash.js";
import { comboInclude } from "../combos/combos.service.js";
import { buildComboSelectionSnapshot, isComboScheduleAvailable, priceCombo, validateComboSelection, type ComboSelectionInput } from "../combos/combo.rules.js";

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

const cartItemInclude = {
  product: { include: { modifierGroups: { include: { options: true } } } },
  combo: { include: comboInclude },
  secondaryProduct: true,
  modifiers: { include: { option: { include: { group: true } } } },
} as const;

function validateComboOrBadRequest(combo: Parameters<typeof validateComboSelection>[0], selections: ComboSelectionInput[]) {
  try { return validateComboSelection(combo, selections); }
  catch (error) { throw badRequest(error instanceof Error ? error.message : "Seleção de combo inválida", "INVALID_COMBO_SELECTION"); }
}
function priceComboOrBadRequest(combo: Parameters<typeof priceCombo>[0], selections: ComboSelectionInput[]) {
  try { return priceCombo(combo, selections); }
  catch (error) { throw badRequest(error instanceof Error ? error.message : "Seleção de combo inválida", "INVALID_COMBO_SELECTION"); }
}

function priceCartItems(items: Array<any>, combosEnabled: boolean, now = new Date()) {
  return items.map((item) => {
    if (item.combo) {
      if (!combosEnabled || !item.combo.isActive) throw badRequest("Um combo do carrinho deixou de estar disponível", "COMBO_NOT_AVAILABLE");
      if ((item.combo.startsAt && now < item.combo.startsAt) || (item.combo.endsAt && now > item.combo.endsAt) || !isComboScheduleAvailable(item.combo, now)) {
        throw badRequest("Um combo do carrinho não está disponível neste horário", "COMBO_NOT_AVAILABLE");
      }
      const selections = (item.comboSelections ?? []) as ComboSelectionInput[];
      validateComboOrBadRequest(item.combo, selections);
      const unitPrice = priceComboOrBadRequest(item.combo, selections);
      const lineTotal = round2(unitPrice * item.quantity);
      return {
        productId: null,
        comboId: item.combo.id,
        productNameSnapshot: item.combo.name,
        secondaryProductId: null,
        secondaryProductNameSnapshot: null,
        splitPricingRule: null,
        comboSelectionsSnapshot: buildComboSelectionSnapshot(item.combo, selections),
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        notes: item.notes,
        modifiers: [],
      };
    }

    if (!item.product) throw badRequest("Item de carrinho inválido", "INVALID_CART_ITEM");
    const options = item.modifiers.map((m: any) => m.option);
    const base = item.secondaryProduct
      ? computeSplitBasePrice(item.product.basePrice, item.secondaryProduct.basePrice, item.product.splitPricingRule)
      : item.product.basePrice;
    const unitPrice = computeUnitPrice(base, options);
    const lineTotal = round2(unitPrice * item.quantity);
    return {
      productId: item.productId,
      comboId: null,
      productNameSnapshot: item.product.name,
      secondaryProductId: item.secondaryProductId,
      secondaryProductNameSnapshot: item.secondaryProduct?.name ?? null,
      splitPricingRule: item.secondaryProduct ? item.product.splitPricingRule : null,
      comboSelectionsSnapshot: null,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      notes: item.notes,
      modifiers: item.modifiers.map((m: any) => ({
        optionId: m.optionId,
        nameSnapshot: m.option.name,
        priceDeltaSnapshot: m.option.priceDelta,
      })),
    };
  });
}

export async function checkout(userId: string, input: CheckoutInput) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { restaurant: true, items: { include: cartItemInclude } },
  });
  if (!cart || !cart.restaurant || cart.items.length === 0) throw badRequest("O carrinho está vazio");
  const restaurant = cart.restaurant;

  if (input.fulfillmentType === "DELIVERY" && !restaurant.acceptsDelivery) {
    throw badRequest("Este restaurante não aceita entregas");
  }
  if (input.fulfillmentType === "PICKUP" && !restaurant.acceptsPickup) {
    throw badRequest("Este restaurante não aceita recolha no local");
  }

  const pricedItems = priceCartItems(cart.items, restaurant.combosEnabled);
  const subtotal = round2(pricedItems.reduce((sum, i) => sum + i.lineTotal, 0));

  let address = null;
  let deliveryFee = 0;
  let customerLat: number | null = null;
  let customerLng: number | null = null;

  if (input.fulfillmentType === "DELIVERY") {
    if (!input.addressId) throw badRequest("Endereço obrigatório para entrega");
    address = await prisma.address.findFirst({ where: { id: input.addressId, userId } });
    if (!address) throw notFound("Endereço não encontrado");
    const distanceKm = haversineKm(address.lat, address.lng, restaurant.lat, restaurant.lng);
    if (distanceKm > restaurant.deliveryRadiusKm) {
      throw badRequest("Este endereço está fora da área de entrega do restaurante", "OUT_OF_RANGE");
    }
    deliveryFee = calcDeliveryFee(restaurant, distanceKm);
    customerLat = address.lat;
    customerLng = address.lng;
  }

  let discount = 0;
  let couponId: string | null = null;
  if (input.couponCode) {
    const result = await resolveCoupon(input.couponCode, restaurant.id, userId, subtotal);
    discount = result.discount;
    couponId = result.coupon.id;
  }

  const total = round2(subtotal - discount + deliveryFee);

  // Change is worked out now, at order time, not at the door — the
  // customer says which note/bill they'll pay with, so the restaurant can
  // send the courier out with the right change already counted.
  let amountTendered: number | undefined;
  let changeDue: number | undefined;
  if (input.paymentMethod === "CASH" && input.amountTendered != null) {
    changeDue = computeChangeDue(total, input.amountTendered);
    amountTendered = input.amountTendered;
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId,
        restaurantId: restaurant.id,
        fulfillmentType: input.fulfillmentType,
        addressId: address?.id,
        customerLat,
        customerLng,
        subtotal,
        discount,
        deliveryFee,
        total,
        paymentMethod: input.paymentMethod,
        paymentStatus: "PENDING",
        notes: input.notes,
        amountTendered,
        changeDue,
        items: {
          create: pricedItems.map((i) => ({
            productId: i.productId,
            comboId: i.comboId,
            productNameSnapshot: i.productNameSnapshot,
            secondaryProductId: i.secondaryProductId,
            secondaryProductNameSnapshot: i.secondaryProductNameSnapshot,
            splitPricingRule: i.splitPricingRule,
            comboSelectionsSnapshot: i.comboSelectionsSnapshot ?? undefined,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
            notes: i.notes,
            modifiers: { create: i.modifiers },
          })),
        },
        statusHistory: { create: { status: OrderStatus.NEW, actor: null } },
      },
      include: { items: true, restaurant: true },
    });

    if (couponId) {
      await tx.couponRedemption.create({ data: { couponId, userId, orderId: created.id } });
    }
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cart.update({ where: { id: cart.id }, data: { restaurantId: null } });

    return created;
  });

  let stripeSessionUrl: string | null = null;
  if (input.paymentMethod === "CARD" && stripe) {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${env.corsOrigins[0]}/orders/${order.id}?paid=1`,
      cancel_url: `${env.corsOrigins[0]}/orders/${order.id}?paid=0`,
      line_items: [
        {
          price_data: { currency: "eur", product_data: { name: `Pedido #${order.orderNumber}` }, unit_amount: Math.round(order.total * 100) },
          quantity: 1,
        },
      ],
      metadata: { orderId: order.id },
    });
    await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    stripeSessionUrl = session.url;
  }

  getIO()?.to(rooms.restaurant(restaurant.id)).emit("order:new", { orderId: order.id });

  return { order, stripeSessionUrl };
}

const orderInclude = {
  items: { include: { modifiers: true } },
  restaurant: true,
  address: true,
  courier: { include: { user: true } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
};

export async function getOrderForCustomer(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: orderInclude });
  if (!order) throw notFound("Order not found");
  return order;
}

export async function listOrdersForCustomer(userId: string) {
  return prisma.order.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: "desc" } });
}

export async function cancelOrderByCustomer(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw notFound("Order not found");
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
    throw badRequest("Este pedido já não pode ser cancelado", "NOT_CANCELLABLE");
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "CANCELLED",
      cancelledBy: Role.CUSTOMER,
      cancelledAt: new Date(),
      statusHistory: { create: { status: "CANCELLED", actor: Role.CUSTOMER } },
    },
  });
  const { refunded } = await attemptRefund(updated, Role.CUSTOMER);

  getIO()?.to(rooms.restaurant(order.restaurantId)).emit("order:status", { orderId: order.id, status: "CANCELLED" });
  getIO()?.to(rooms.customer(userId)).emit("order:status", { orderId: order.id, status: "CANCELLED" });

  return { order: updated, refunded };
}

// ---- Restaurant / kitchen side --------------------------------------

export async function listOrdersForRestaurant(restaurantId: string, statuses?: OrderStatus[]) {
  return prisma.order.findMany({
    where: { restaurantId, ...(statuses ? { status: { in: statuses } } : {}) },
    include: orderInclude,
    orderBy: { createdAt: "asc" },
  });
}

interface UpdateStatusInput {
  status: OrderStatus;
  prepTimeMinutes?: number;
  rejectionReason?: string;
}

// The counter no longer types a prep time on every order — max of each
// product's own default (falls back to the restaurant-wide default) gives
// a reasonable estimate for free. An explicit prepTimeMinutes in the
// request still overrides it (e.g. the counter knows this one will take
// longer for some reason).
async function computeAutoPrepTime(orderId: string, restaurantId: string): Promise<number> {
  const [items, restaurant] = await Promise.all([
    prisma.orderItem.findMany({
      where: { orderId },
      include: { product: { select: { defaultPrepTimeMinutes: true } } },
    }),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { defaultPrepTimeMinutes: true } }),
  ]);
  const productTimes = items.map((i) => i.product?.defaultPrepTimeMinutes).filter((t): t is number => t != null);
  return productTimes.length > 0 ? Math.max(...productTimes) : restaurant.defaultPrepTimeMinutes;
}

export async function updateOrderStatusByRestaurant(
  restaurantId: string,
  actorRole: RoleType,
  orderId: string,
  input: UpdateStatusInput,
) {
  const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
  if (!order) throw notFound("Order not found");

  // A restaurant rejecting a new order is modeled as a cancellation with a
  // reason, not a distinct status — keeps the state machine to one
  // terminal "cancelled" branch instead of two.
  if (order.status === "NEW" && input.status === "CANCELLED") {
    assertTransitionAllowed(order.status, "CANCELLED", actorRole);
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        cancelledBy: actorRole,
        cancelledAt: new Date(),
        rejectionReason: input.rejectionReason,
        statusHistory: { create: { status: "CANCELLED", actor: actorRole } },
      },
    });
    await attemptRefund(updated, actorRole);
    getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status: "CANCELLED" });
    return updated;
  }

  // "Aceitar" is now a single click for the counter: it folds NEW->ACCEPTED
  // and the old separate "iniciar preparação" (ACCEPTED->PREPARING, used to
  // be a KDS-only action) into one atomic transition, with the prep time
  // computed automatically instead of asked via a prompt. The kitchen ticket
  // screen only ever sees orders already in PREPARING.
  if (order.status === "NEW" && input.status === "ACCEPTED") {
    assertTransitionAllowed(order.status, "ACCEPTED", actorRole);
    const prepTimeMinutes = input.prepTimeMinutes ?? (await computeAutoPrepTime(order.id, restaurantId));
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PREPARING",
        prepTimeMinutes,
        acceptedAt: new Date(),
        statusHistory: {
          create: [
            { status: "ACCEPTED", actor: actorRole },
            { status: "PREPARING", actor: actorRole },
          ],
        },
      },
    });
    getIO()?.to(rooms.restaurant(restaurantId)).emit("order:status", { orderId: order.id, status: "PREPARING" });
    getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status: "PREPARING" });
    return updated;
  }

  // Marking a PICKUP order as collected happens at the counter — it's a
  // restaurant action, not a "SYSTEM" one, so it's special-cased the same
  // way rejection is above (READY_FOR_PICKUP's table entry otherwise only
  // covers the automatic DELIVERY-routing transitions).
  if (order.status === "READY_FOR_PICKUP" && input.status === "COLLECTED") {
    if (order.fulfillmentType !== "PICKUP") throw badRequest("Only pickup orders can be marked collected");
    if (actorRole !== Role.RESTAURANT_OWNER && actorRole !== Role.RESTAURANT_STAFF) {
      throw badRequest("Only restaurant staff can mark an order collected");
    }
  } else {
    assertTransitionAllowed(order.status, input.status, actorRole);
  }

  const timestamps: Record<string, Date> = {};
  if (input.status === "ACCEPTED") timestamps.acceptedAt = new Date();
  if (input.status === "READY_FOR_PICKUP" || input.status === "COLLECTED") timestamps.readyAt = new Date();
  if (input.status === "DELIVERED" || input.status === "COLLECTED") timestamps.deliveredAt = new Date();

  // READY_FOR_PICKUP auto-routes: pickup orders wait for the customer,
  // delivery orders enter the (Fase 4) dispatch queue.
  let nextStatus: OrderStatus = input.status;
  if (input.status === "READY_FOR_PICKUP" && order.fulfillmentType === "DELIVERY") {
    nextStatus = "WAITING_FOR_COURIER";
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: nextStatus,
      ...(input.prepTimeMinutes ? { prepTimeMinutes: input.prepTimeMinutes } : {}),
      ...timestamps,
      statusHistory: { create: { status: nextStatus, actor: actorRole } },
    },
  });

  getIO()?.to(rooms.restaurant(restaurantId)).emit("order:status", { orderId: order.id, status: nextStatus });
  getIO()?.to(rooms.customer(order.userId)).emit("order:status", { orderId: order.id, status: nextStatus });

  if (nextStatus === "WAITING_FOR_COURIER") {
    await tryAssignOrder(order.id);
  }

  return updated;
}
