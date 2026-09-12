import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const orderCreate = vi.fn();
  let cartItemsRemaining = 1;

  const tx = {
    order: { create: orderCreate },
    couponRedemption: { create: vi.fn() },
    cartItem: {
      deleteMany: vi.fn(async () => {
        const count = cartItemsRemaining;
        cartItemsRemaining = 0;
        return { count };
      }),
    },
    cart: { update: vi.fn(async () => ({})) },
  };

  const prisma = {
    cart: { findUnique: vi.fn() },
    address: { findFirst: vi.fn() },
    order: { update: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return {
    prisma,
    tx,
    orderCreate,
    resetCartItems: () => { cartItemsRemaining = 1; },
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("../../sockets/io.js", () => ({
  getIO: () => undefined,
  rooms: { restaurant: (id: string) => id, customer: (id: string) => id },
}));

import { checkout } from "./orders.service.js";

describe("checkout concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.resetCartItems();

    state.prisma.cart.findUnique.mockResolvedValue({
      id: "cart-1",
      userId: "user-1",
      restaurantId: "restaurant-1",
      restaurant: {
        id: "restaurant-1",
        acceptsDelivery: true,
        acceptsPickup: true,
        combosEnabled: false,
        deliveryRadiusKm: 8,
      },
      items: [
        {
          id: "cart-item-1",
          cartId: "cart-1",
          productId: "product-1",
          comboId: null,
          secondaryProductId: null,
          quantity: 1,
          notes: null,
          comboSelections: null,
          product: {
            id: "product-1",
            name: "QA Pizza",
            basePrice: 10,
            splitPricingRule: "MOST_EXPENSIVE",
            modifierGroups: [],
          },
          combo: null,
          secondaryProduct: null,
          modifiers: [],
        },
      ],
    });

    let orderNumber = 0;
    state.orderCreate.mockImplementation(async () => {
      orderNumber += 1;
      return {
        id: `order-${orderNumber}`,
        orderNumber,
        restaurantId: "restaurant-1",
        userId: "user-1",
        total: 10,
        items: [],
        restaurant: { id: "restaurant-1" },
      };
    });
  });

  it("creates at most one order when the same cart is checked out twice concurrently", async () => {
    const input = {
      fulfillmentType: "PICKUP",
      paymentMethod: "CASH",
      notes: "same cart race",
    } as Parameters<typeof checkout>[1];

    const settled = await Promise.allSettled([
      checkout("user-1", input),
      checkout("user-1", input),
    ]);

    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(state.orderCreate).toHaveBeenCalledTimes(1);
  });
});
