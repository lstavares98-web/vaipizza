import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const courierFindUnique = vi.fn();
  const courierUpdate = vi.fn();
  const prisma = {
    courier: { findUnique: courierFindUnique, update: courierUpdate },
  };
  return { prisma, courierFindUnique, courierUpdate };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("../../config/env.js", () => ({
  env: { COURIER_LOCATION_MAX_AGE_SECONDS: 120, COURIER_MAX_ACCURACY_METERS: 100 },
}));
vi.mock("../dispatch/dispatch.service.js", () => ({ dispatchWaitingOrders: vi.fn() }));
vi.mock("../../sockets/io.js", () => ({ getIO: vi.fn(() => null), rooms: {} }));

import { setOnline } from "./courier.service.js";

const baseCourier = {
  id: "c1",
  userId: "u1",
  verificationStatus: "APPROVED",
  operationalState: "ACTIVE",
  status: "OFFLINE",
  lat: 41.561,
  lng: -8.406,
  locationUpdatedAt: new Date(),
  locationAccuracyM: 10,
};

describe("courier operational availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.courierUpdate.mockResolvedValue(baseCourier);
  });

  it("does not let a suspended courier go online", async () => {
    state.courierFindUnique.mockResolvedValueOnce({ ...baseCourier, operationalState: "SUSPENDED" });

    await expect(setOnline("u1", true)).rejects.toMatchObject({ code: "COURIER_SUSPENDED" });
    expect(state.courierUpdate).not.toHaveBeenCalled();
  });

  it("does not let a deactivated courier go online", async () => {
    state.courierFindUnique.mockResolvedValueOnce({ ...baseCourier, operationalState: "DEACTIVATED" });

    await expect(setOnline("u1", true)).rejects.toMatchObject({ code: "COURIER_DEACTIVATED" });
    expect(state.courierUpdate).not.toHaveBeenCalled();
  });
});
