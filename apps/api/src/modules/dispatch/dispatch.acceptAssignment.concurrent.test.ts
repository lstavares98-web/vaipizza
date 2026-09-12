import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const assignmentUpdateMany = vi.fn();
  const competingFindMany = vi.fn();
  const courierUpdateMany = vi.fn();
  const orderUpdateMany = vi.fn();
  const orderFindUnique = vi.fn();

  const tx = {
    courierAssignment: {
      updateMany: assignmentUpdateMany,
      findMany: competingFindMany,
    },
    courier: { updateMany: courierUpdateMany },
    order: {
      updateMany: orderUpdateMany,
      findUnique: orderFindUnique,
    },
    orderStatusEvent: { create: vi.fn() },
  };

  const prisma = {
    courierAssignment: { findFirst: vi.fn() },
    adminAlert: { updateMany: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return {
    prisma,
    tx,
    assignmentUpdateMany,
    competingFindMany,
    courierUpdateMany,
    orderUpdateMany,
    orderFindUnique,
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("../../config/env.js", () => ({
  env: {
    ASSIGNMENT_OFFER_TTL_SECONDS: 60,
    COURIER_LOCATION_MAX_AGE_SECONDS: 120,
    COURIER_MAX_ACCURACY_METERS: 100,
    DISPATCH_FAIRNESS_WINDOW_MINUTES: 30,
  },
}));
vi.mock("../../sockets/io.js", () => ({
  getIO: () => undefined,
  rooms: {
    restaurant: (id: string) => id,
    customer: (id: string) => id,
    courier: (id: string) => id,
  },
}));

import { acceptAssignment } from "./dispatch.service.js";

describe("acceptAssignment concurrent offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    state.prisma.courierAssignment.findFirst.mockResolvedValue({
      id: "a1",
      orderId: "o1",
      courierId: "c1",
    });
    state.assignmentUpdateMany.mockResolvedValue({ count: 1 });
    state.courierUpdateMany.mockResolvedValue({ count: 1 });
    state.orderUpdateMany.mockResolvedValue({ count: 1 });
    state.orderFindUnique.mockResolvedValue({
      id: "o1",
      restaurantId: "r1",
      userId: "u1",
      courierId: "c1",
      status: "COURIER_ASSIGNED",
    });
    state.competingFindMany.mockResolvedValue([{ id: "a2", courierId: "c2" }]);
    state.prisma.adminAlert.updateMany.mockResolvedValue({ count: 0 });
  });

  it("cancels competing offers and releases losing couriers after one acceptance wins", async () => {
    const order = await acceptAssignment("c1", "a1");

    expect(order?.id).toBe("o1");
    expect(state.competingFindMany).toHaveBeenCalledWith({
      where: { orderId: "o1", id: { not: "a1" }, status: "OFFERED" },
      select: { id: true, courierId: true },
    });
    expect(state.assignmentUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a2"] }, status: "OFFERED" },
      data: { status: "CANCELLED", respondedAt: expect.any(Date) },
    });
    expect(state.courierUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c2"] }, status: "ASSIGNED" },
      data: { status: "AVAILABLE" },
    });
  });
});
