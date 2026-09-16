import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const restaurantFindUnique = vi.fn();
  const courierFindMany = vi.fn();
  const prisma = {
    restaurant: { findUnique: restaurantFindUnique },
    courier: { findMany: courierFindMany },
  };
  return { prisma, restaurantFindUnique, courierFindMany };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("../../config/env.js", () => ({
  env: {
    COURIER_LOCATION_MAX_AGE_SECONDS: 120,
    COURIER_MAX_ACCURACY_METERS: 100,
    DISPATCH_FAIRNESS_WINDOW_MINUTES: 30,
    ASSIGNMENT_OFFER_TTL_SECONDS: 60,
  },
}));
vi.mock("../../sockets/io.js", () => ({ getIO: vi.fn(() => null), rooms: {} }));

import { findNearestAvailableCourier, findNearestBusyCourier } from "./dispatch.service.js";

describe("courier operational state in dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.restaurantFindUnique.mockResolvedValue({
      id: "r1",
      lat: 41.561,
      lng: -8.406,
      courierDispatchRadiusKm: 12,
    });
    state.courierFindMany.mockResolvedValue([]);
  });

  it("requires ACTIVE operational state for available courier candidates", async () => {
    await findNearestAvailableCourier("r1", []);

    expect(state.courierFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: "AVAILABLE",
        verificationStatus: "APPROVED",
        operationalState: "ACTIVE",
      }),
    });
  });

  it("requires ACTIVE operational state for busy courier candidates", async () => {
    await findNearestBusyCourier("r1", []);

    expect(state.courierFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        operationalState: "ACTIVE",
        verificationStatus: "APPROVED",
      }),
      include: expect.any(Object),
    });
  });
});
