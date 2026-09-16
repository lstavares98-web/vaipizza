import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const courierFindUnique = vi.fn();
  const orderFindFirst = vi.fn();
  const courierUpdate = vi.fn();
  const assignmentUpdateMany = vi.fn();
  const refreshTokenUpdateMany = vi.fn();

  const tx = {
    courier: { findUnique: courierFindUnique, update: courierUpdate },
    order: { findFirst: orderFindFirst },
    courierAssignment: { updateMany: assignmentUpdateMany },
    refreshToken: { updateMany: refreshTokenUpdateMany },
  };

  const prisma = {
    courier: { findUnique: courierFindUnique, update: courierUpdate },
    order: { findFirst: orderFindFirst },
    courierAssignment: { updateMany: assignmentUpdateMany },
    refreshToken: { updateMany: refreshTokenUpdateMany },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return {
    prisma,
    tx,
    courierFindUnique,
    orderFindFirst,
    courierUpdate,
    assignmentUpdateMany,
    refreshTokenUpdateMany,
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("../../config/env.js", () => ({ env: { PRIMARY_RESTAURANT_SLUG: "vaipizza" } }));
vi.mock("../../services/refund.service.js", () => ({ attemptRefund: vi.fn() }));
vi.mock("../../sockets/io.js", () => ({
  getIO: vi.fn(() => null),
  rooms: {
    customer: (id: string) => `customer:${id}`,
    restaurant: (id: string) => `restaurant:${id}`,
    courier: (id: string) => `courier:${id}`,
  },
}));

import { setCourierOperationalState } from "./admin.service.js";

describe("setCourierOperationalState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.courierFindUnique.mockResolvedValue({
      id: "c1",
      userId: "u1",
      status: "AVAILABLE",
      operationalState: "ACTIVE",
    });
    state.orderFindFirst.mockResolvedValue(null);
    state.assignmentUpdateMany.mockResolvedValue({ count: 0 });
    state.refreshTokenUpdateMany.mockResolvedValue({ count: 2 });
    state.courierUpdate.mockResolvedValue({
      id: "c1",
      userId: "u1",
      status: "OFFLINE",
      operationalState: "SUSPENDED",
      sessionVersion: 2,
    });
  });

  it("refuses suspension while a courier has an active delivery", async () => {
    state.orderFindFirst.mockResolvedValueOnce({ id: "o1", status: "OUT_FOR_DELIVERY" });

    await expect(setCourierOperationalState("c1", "SUSPENDED")).rejects.toMatchObject({
      code: "NOT_ALLOWED_WITH_ACTIVE_DELIVERY",
    });
    expect(state.courierUpdate).not.toHaveBeenCalled();
    expect(state.refreshTokenUpdateMany).not.toHaveBeenCalled();
  });

  it("suspends an idle courier, invalidates the session and cancels outstanding offers", async () => {
    await setCourierOperationalState("c1", "SUSPENDED");

    expect(state.courierUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        operationalState: "SUSPENDED",
        status: "OFFLINE",
        sessionVersion: { increment: 1 },
      },
      include: { user: true },
    });
    expect(state.assignmentUpdateMany).toHaveBeenCalledWith({
      where: { courierId: "c1", status: "OFFERED" },
      data: { status: "CANCELLED", respondedAt: expect.any(Date) },
    });
    expect(state.refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("deactivates an idle courier and revokes every existing refresh session", async () => {
    state.courierUpdate.mockResolvedValueOnce({
      id: "c1",
      userId: "u1",
      status: "OFFLINE",
      operationalState: "DEACTIVATED",
      sessionVersion: 2,
    });

    await setCourierOperationalState("c1", "DEACTIVATED");

    expect(state.refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("reactivates a courier but leaves them offline until they explicitly go online", async () => {
    state.courierFindUnique.mockResolvedValueOnce({
      id: "c1",
      userId: "u1",
      status: "OFFLINE",
      operationalState: "SUSPENDED",
    });
    state.courierUpdate.mockResolvedValueOnce({
      id: "c1",
      userId: "u1",
      status: "OFFLINE",
      operationalState: "ACTIVE",
      sessionVersion: 2,
      user: { id: "u1" },
    });

    const result = await setCourierOperationalState("c1", "ACTIVE");

    expect(state.courierUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { operationalState: "ACTIVE", status: "OFFLINE" },
      include: { user: true },
    });
    expect(state.refreshTokenUpdateMany).not.toHaveBeenCalled();
    expect(result.status).toBe("OFFLINE");
  });
});
