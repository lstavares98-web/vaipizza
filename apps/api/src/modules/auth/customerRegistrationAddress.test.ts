import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCustomerSchema } from "@yummix/validation";

const state = vi.hoisted(() => {
  const userFindUnique = vi.fn();
  const userCreate = vi.fn();
  const refreshTokenCreate = vi.fn();
  const searchAddressCoordinates = vi.fn();
  const hashPassword = vi.fn(async () => "password-hash");

  return {
    prisma: {
      user: { findUnique: userFindUnique, create: userCreate },
      refreshToken: { create: refreshTokenCreate },
    },
    userFindUnique,
    userCreate,
    refreshTokenCreate,
    searchAddressCoordinates,
    hashPassword,
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("bcryptjs", () => ({ default: { hash: state.hashPassword, compare: vi.fn() } }));
vi.mock("../addresses/forwardGeocode.js", () => ({
  searchAddressCoordinates: state.searchAddressCoordinates,
  composeAddressSearchQuery: (parts: { line1: string; postalCode?: string }) =>
    [parts.line1, parts.postalCode].filter(Boolean).join(", "),
}));
vi.mock("./tokens.js", () => ({
  signAccessToken: vi.fn(() => "access-token"),
  generateOpaqueToken: vi.fn(() => "refresh-token"),
  hashToken: vi.fn(() => "refresh-hash"),
  refreshTtlToDate: vi.fn(() => new Date("2030-01-01T00:00:00.000Z")),
}));

import { registerCustomer } from "./auth.service.js";

describe("customer registration address", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.userFindUnique.mockResolvedValue(null);
    state.refreshTokenCreate.mockResolvedValue({ id: "rt1" });
    state.searchAddressCoordinates.mockResolvedValue([
      {
        line1: "Rua do Souto 10",
        city: "Braga",
        postalCode: "4700-329",
        lat: 41.5518,
        lng: -8.4229,
        displayName: "Rua do Souto 10, 4700-329 Braga, Portugal",
      },
    ]);
    state.userCreate.mockResolvedValue({
      id: "u1",
      email: "cliente@example.com",
      passwordHash: "password-hash",
      name: "Cliente",
      phone: "912345678",
      role: "CUSTOMER",
      isBlocked: false,
      restaurantId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("requires a Portuguese postal code in 0000-000 format", () => {
    const base = {
      name: "Cliente",
      email: "cliente@example.com",
      password: "segredo123",
      phone: "912345678",
      addressLine1: "Rua do Souto 10",
    };

    expect(registerCustomerSchema.safeParse({ ...base, postalCode: "4700329" }).success).toBe(false);
    expect(registerCustomerSchema.safeParse({ ...base, postalCode: "4700-329" }).success).toBe(true);
  });

  it("creates the first address as the customer's default address", async () => {
    await registerCustomer({
      name: "Cliente",
      email: "cliente@example.com",
      password: "segredo123",
      phone: "912345678",
      addressLine1: "Rua do Souto 10",
      postalCode: "4700-329",
    } as any);

    expect(state.searchAddressCoordinates).toHaveBeenCalledWith("Rua do Souto 10, 4700-329");
    expect(state.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "cliente@example.com",
        name: "Cliente",
        phone: "912345678",
        addresses: {
          create: {
            label: "Casa",
            line1: "Rua do Souto 10",
            city: "Braga",
            postalCode: "4700-329",
            lat: 41.5518,
            lng: -8.4229,
            isDefault: true,
          },
        },
      }),
    });
  });
});
