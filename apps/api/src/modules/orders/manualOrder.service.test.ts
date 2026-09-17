import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const restaurantFindUnique = vi.fn();
  const userFindFirst = vi.fn();
  const addressFindFirst = vi.fn();
  const contactUpsert = vi.fn();
  const productFindMany = vi.fn();
  const comboFindMany = vi.fn();
  const orderCreate = vi.fn();

  const tx = {
    customerContact: { upsert: contactUpsert },
    order: { create: orderCreate },
  };

  return {
    restaurantFindUnique,
    userFindFirst,
    addressFindFirst,
    contactUpsert,
    productFindMany,
    comboFindMany,
    orderCreate,
    tx,
    prisma: {
      restaurant: { findUnique: restaurantFindUnique },
      user: { findFirst: userFindFirst },
      address: { findFirst: addressFindFirst },
      customerContact: { upsert: contactUpsert },
      product: { findMany: productFindMany },
      combo: { findMany: comboFindMany },
      order: { create: orderCreate },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("../../sockets/io.js", () => ({
  getIO: vi.fn(() => null),
  rooms: { restaurant: (id: string) => `restaurant:${id}` },
}));

import { createManualOrder } from "./manualOrder.service.js";

const restaurant = {
  id: "r1",
  lat: 41.55,
  lng: -8.42,
  acceptsDelivery: true,
  acceptsPickup: true,
  combosEnabled: true,
  mbwayPhone: "+351910000000",
  deliveryRadiusKm: 8,
  deliveryFeeMode: "BASE_PLUS_PER_KM",
  deliveryFeeBase: 2,
  deliveryFeePerKm: 0.5,
  deliveryFeeFreeKm: 2,
  deliveryFeeTiers: [],
};

const product = {
  id: "p1",
  restaurantId: "r1",
  name: "Pizza Margherita",
  basePrice: 10,
  isAvailable: true,
  stock: null,
  allowsSplit: false,
  splitPricingRule: "MOST_EXPENSIVE",
  modifierGroups: [
    {
      id: "g1",
      name: "Tamanho",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ id: "o1", name: "Grande", priceDelta: 2 }],
    },
  ],
};

const baseInput = {
  origin: "COUNTER" as const,
  fulfillmentType: "PICKUP" as const,
  paymentMethod: "TERMINAL" as const,
  items: [{ productId: "p1", quantity: 1, modifierOptionIds: ["o1"] }],
};

describe("createManualOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.restaurantFindUnique.mockResolvedValue(restaurant);
    state.productFindMany.mockResolvedValue([product]);
    state.comboFindMany.mockResolvedValue([]);
    state.contactUpsert.mockResolvedValue({ id: "contact-1", name: "Ana", phoneNormalized: "+351912345678" });
    state.orderCreate.mockImplementation(async ({ data }: any) => ({ id: "order-1", orderNumber: 51, ...data }));
  });

  it("creates an unidentified counter pickup and prices it on the server", async () => {
    const order = await createManualOrder("r1", "RESTAURANT_STAFF", baseInput);

    expect(order.origin).toBe("COUNTER");
    expect(order.userId).toBeNull();
    expect(order.customerContactId).toBeNull();
    expect(order.subtotal).toBe(12);
    expect(order.total).toBe(12);
    expect(order.paymentStatus).toBe("PAID");
    expect(state.contactUpsert).not.toHaveBeenCalled();
  });

  it("associates a phone order with an existing registered customer", async () => {
    state.userFindFirst.mockResolvedValueOnce({ id: "u1", role: "CUSTOMER", name: "Maria", phone: "912 345 678" });

    const order = await createManualOrder("r1", "RESTAURANT_OWNER", {
      ...baseInput,
      origin: "PHONE",
      registeredUserId: "u1",
      customerName: "ignored",
      customerPhone: "912345678",
    });

    expect(order.userId).toBe("u1");
    expect(order.customerPhoneSnapshot).toBe("+351912345678");
    expect(state.contactUpsert).not.toHaveBeenCalled();
  });

  it("creates or reuses a passwordless contact for an unregistered phone customer", async () => {
    const order = await createManualOrder("r1", "RESTAURANT_STAFF", {
      ...baseInput,
      origin: "PHONE",
      customerName: "Ana",
      customerPhone: "912 345 678",
    });

    expect(state.contactUpsert).toHaveBeenCalledWith({
      where: { phoneNormalized: "+351912345678" },
      create: { name: "Ana", phoneNormalized: "+351912345678" },
      update: { name: "Ana" },
    });
    expect(order.customerContactId).toBe("contact-1");
  });

  it("computes cash change from the server-calculated total", async () => {
    const order = await createManualOrder("r1", "RESTAURANT_STAFF", {
      ...baseInput,
      paymentMethod: "CASH",
      amountTendered: 20,
    });

    expect(order.total).toBe(12);
    expect(order.amountTendered).toBe(20);
    expect(order.changeDue).toBe(8);
  });

  it("rejects a delivery outside the restaurant radius", async () => {
    await expect(createManualOrder("r1", "RESTAURANT_STAFF", {
      ...baseInput,
      origin: "PHONE",
      fulfillmentType: "DELIVERY",
      paymentMethod: "CASH",
      customerName: "Ana",
      customerPhone: "912345678",
      delivery: { line1: "Lisboa", city: "Lisboa", lat: 38.72, lng: -9.14 },
      amountTendered: 20,
    })).rejects.toMatchObject({ code: "OUT_OF_RANGE" });
    expect(state.orderCreate).not.toHaveBeenCalled();
  });

  it("rejects unavailable or cross-restaurant products instead of trusting the client", async () => {
    state.productFindMany.mockResolvedValueOnce([]);

    await expect(createManualOrder("r1", "RESTAURANT_STAFF", baseInput)).rejects.toMatchObject({
      code: "INVALID_ORDER_ITEM",
    });
    expect(state.orderCreate).not.toHaveBeenCalled();
  });

  it("uses a registered saved address and stores immutable delivery snapshots", async () => {
    state.userFindFirst.mockResolvedValueOnce({ id: "u1", role: "CUSTOMER", name: "Maria", phone: "+351912345678" });
    state.addressFindFirst.mockResolvedValueOnce({
      id: "a1",
      userId: "u1",
      line1: "Rua A, 10",
      line2: "3.º Esq.",
      city: "Braga",
      postalCode: "4700-000",
      lat: 41.551,
      lng: -8.421,
    });

    const order = await createManualOrder("r1", "RESTAURANT_STAFF", {
      ...baseInput,
      origin: "PHONE",
      fulfillmentType: "DELIVERY",
      paymentMethod: "CASH",
      registeredUserId: "u1",
      addressId: "a1",
      amountTendered: 20,
    });

    expect(order.addressId).toBe("a1");
    expect(order.deliveryLine1Snapshot).toBe("Rua A, 10");
    expect(order.customerLat).toBe(41.551);
  });

  it("stores courier delivery instructions separately from kitchen notes", async () => {
    const order = await createManualOrder("r1", "RESTAURANT_STAFF", {
      ...baseInput,
      origin: "PHONE",
      fulfillmentType: "DELIVERY",
      paymentMethod: "CASH",
      customerName: "Ana",
      customerPhone: "912345678",
      delivery: { line1: "Rua A, 10", line2: "3.º Esq.", city: "Braga", postalCode: "4700-000", lat: 41.551, lng: -8.421 },
      deliveryInstructions: "Portão azul, perto da escola",
      notes: "Sem cebola",
      amountTendered: 20,
    } as any);

    expect(order.deliveryInstructions).toBe("Portão azul, perto da escola");
    expect(order.notes).toBe("Sem cebola");
  });
});
