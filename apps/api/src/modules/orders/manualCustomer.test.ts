import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  contactFindUnique: vi.fn(),
  orderFindFirst: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    user: { findMany: state.userFindMany },
    customerContact: { findUnique: state.contactFindUnique },
    order: { findFirst: state.orderFindFirst },
  },
}));

import { lookupManualCustomer, normalizePhone } from "./manualCustomer.js";

describe("normalizePhone", () => {
  it.each([
    ["912 345 678", "+351912345678"],
    ["+351 912 345 678", "+351912345678"],
    ["00351 912 345 678", "+351912345678"],
    ["351912345678", "+351912345678"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("preserves an explicit non-Portuguese country code", () => {
    expect(normalizePhone("+55 (21) 99999-8888")).toBe("+5521999998888");
  });
});

describe("lookupManualCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.userFindMany.mockResolvedValue([]);
    state.contactFindUnique.mockResolvedValue(null);
    state.orderFindFirst.mockResolvedValue(null);
  });

  it("prefers a registered CUSTOMER even when a contact with the same phone exists", async () => {
    state.userFindMany.mockResolvedValueOnce([
      {
        id: "u1",
        name: "Maria",
        phone: "912 345 678",
        role: "CUSTOMER",
        addresses: [{ id: "a1", label: "Casa", line1: "Rua A", line2: null, city: "Braga", postalCode: "4700-000", lat: 41.55, lng: -8.42, isDefault: true }],
      },
    ]);
    state.contactFindUnique.mockResolvedValueOnce({ id: "c1", name: "Maria antiga", phoneNormalized: "+351912345678" });

    const result = await lookupManualCustomer("r1", "912345678");

    expect(result.type).toBe("REGISTERED");
    if (result.type === "REGISTERED") {
      expect(result.customer.id).toBe("u1");
      expect(result.customer.addresses).toHaveLength(1);
    }
    expect(state.contactFindUnique).not.toHaveBeenCalled();
  });

  it("falls back to a lightweight contact and returns the last delivery snapshot", async () => {
    state.contactFindUnique.mockResolvedValueOnce({ id: "c1", name: "João", phoneNormalized: "+351913333333" });
    state.orderFindFirst.mockResolvedValueOnce({
      deliveryLine1Snapshot: "Rua B, 10",
      deliveryLine2Snapshot: "2.º Esq.",
      deliveryCitySnapshot: "Braga",
      deliveryPostalCodeSnapshot: "4710-000",
      customerLat: 41.56,
      customerLng: -8.41,
    });

    const result = await lookupManualCustomer("r1", "+351 913 333 333");

    expect(result).toEqual({
      type: "CONTACT",
      customer: { id: "c1", name: "João", phone: "+351913333333" },
      lastDelivery: {
        line1: "Rua B, 10",
        line2: "2.º Esq.",
        city: "Braga",
        postalCode: "4710-000",
        lat: 41.56,
        lng: -8.41,
      },
    });
    expect(state.orderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "r1", customerContactId: "c1", fulfillmentType: "DELIVERY" },
    }));
  });

  it("returns NOT_FOUND for a valid phone with no registered customer or contact", async () => {
    await expect(lookupManualCustomer("r1", "914444444")).resolves.toEqual({
      type: "NOT_FOUND",
      phone: "+351914444444",
    });
  });
});
