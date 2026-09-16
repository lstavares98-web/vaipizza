import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@yummix/types";

const state = vi.hoisted(() => {
  const orderFindUnique = vi.fn();
  const orderUpdateMany = vi.fn();
  const statusEventCreate = vi.fn();
  const assignmentFindMany = vi.fn();
  const assignmentUpdateMany = vi.fn();
  const assignmentFindFirst = vi.fn();
  const assignmentUpdate = vi.fn();
  const courierFindUnique = vi.fn();
  const courierUpdate = vi.fn();

  const tx = {
    order: { findUnique: orderFindUnique, updateMany: orderUpdateMany },
    orderStatusEvent: { create: statusEventCreate },
    courierAssignment: {
      findMany: assignmentFindMany,
      updateMany: assignmentUpdateMany,
      findFirst: assignmentFindFirst,
      update: assignmentUpdate,
    },
    courier: { findUnique: courierFindUnique, update: courierUpdate, updateMany: vi.fn() },
  };

  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  const attemptRefund = vi.fn(async () => ({ refunded: false }));
  const dispatchWaitingOrders = vi.fn(async () => undefined);

  return {
    prisma,
    tx,
    orderFindUnique,
    orderUpdateMany,
    statusEventCreate,
    assignmentFindMany,
    assignmentUpdateMany,
    assignmentFindFirst,
    assignmentUpdate,
    courierFindUnique,
    courierUpdate,
    attemptRefund,
    dispatchWaitingOrders,
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("../../services/refund.service.js", () => ({ attemptRefund: state.attemptRefund }));
vi.mock("../dispatch/dispatch.service.js", () => ({ dispatchWaitingOrders: state.dispatchWaitingOrders }));
vi.mock("../../sockets/io.js", () => ({
  getIO: vi.fn(() => null),
  rooms: {
    customer: (id: string) => `customer:${id}`,
    restaurant: (id: string) => `restaurant:${id}`,
    courier: (id: string) => `courier:${id}`,
  },
}));

import { cancelOrderBeforeHandoff } from "./cancelOrder.service.js";

function order(status: string, courierId: string | null = null) {
  return {
    id: "o1",
    status,
    courierId,
    restaurantId: "r1",
    userId: "u1",
    paymentMethod: "CASH",
    paymentStatus: "PENDING",
    stripePaymentIntentId: null,
  };
}

describe("cancelOrderBeforeHandoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.orderUpdateMany.mockResolvedValue({ count: 1 });
    state.statusEventCreate.mockResolvedValue({ id: "e1" });
    state.assignmentFindMany.mockResolvedValue([]);
    state.assignmentUpdateMany.mockResolvedValue({ count: 0 });
    state.assignmentFindFirst.mockResolvedValue(null);
    state.assignmentUpdate.mockResolvedValue({});
    state.courierFindUnique.mockResolvedValue(null);
    state.courierUpdate.mockResolvedValue({});
    state.attemptRefund.mockResolvedValue({ refunded: false });
  });

  it("records cancellation reason, actor and status history", async () => {
    const source = order("PREPARING");
    const cancelled = { ...source, status: "CANCELLED", rejectionReason: "Sem ingrediente" };
    state.orderFindUnique.mockResolvedValueOnce(source).mockResolvedValueOnce(cancelled);

    const result = await cancelOrderBeforeHandoff({
      orderId: "o1",
      actorRole: Role.RESTAURANT_STAFF,
      actorRestaurantId: "r1",
      reason: "Sem ingrediente",
    });

    expect(state.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "o1", status: "PREPARING" },
      data: expect.objectContaining({
        status: "CANCELLED",
        cancelledBy: Role.RESTAURANT_STAFF,
        cancelledAt: expect.any(Date),
        rejectionReason: "Sem ingrediente",
        courierId: null,
      }),
    });
    expect(state.statusEventCreate).toHaveBeenCalledWith({
      data: { orderId: "o1", status: "CANCELLED", actor: Role.RESTAURANT_STAFF },
    });
    expect(state.attemptRefund).toHaveBeenCalledWith(cancelled, Role.RESTAURANT_STAFF);
    expect(result.order.status).toBe("CANCELLED");
  });

  it("cancels live OFFERED and ACCEPTED assignment rows without deleting history", async () => {
    const source = order("WAITING_FOR_COURIER");
    const cancelled = { ...source, status: "CANCELLED" };
    state.orderFindUnique.mockResolvedValueOnce(source).mockResolvedValueOnce(cancelled);
    state.assignmentFindMany.mockResolvedValue([
      { id: "a1", courierId: "c1", isQueued: false, status: "OFFERED", courier: { id: "c1", userId: "cu1", operationalState: "ACTIVE" } },
      { id: "a2", courierId: "c2", isQueued: true, status: "ACCEPTED", courier: { id: "c2", userId: "cu2", operationalState: "ACTIVE" } },
    ]);

    await cancelOrderBeforeHandoff({ orderId: "o1", actorRole: Role.SUPER_ADMIN, reason: "Operação" });

    expect(state.assignmentUpdateMany).toHaveBeenCalledWith({
      where: { orderId: "o1", status: { in: ["OFFERED", "ACCEPTED"] } },
      data: { status: "CANCELLED", respondedAt: expect.any(Date) },
    });
  });

  it("promotes the oldest accepted queued order when cancellation frees the active slot", async () => {
    const source = order("COURIER_ASSIGNED", "c1");
    const promoted = { id: "o2", restaurantId: "r1", userId: "u2", status: "COURIER_ASSIGNED" };
    const cancelled = { ...source, status: "CANCELLED", courierId: null };
    state.orderFindUnique
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(promoted)
      .mockResolvedValueOnce(cancelled);
    state.assignmentFindMany.mockResolvedValue([
      { id: "a1", courierId: "c1", isQueued: false, status: "ACCEPTED", courier: { id: "c1", userId: "cu1", operationalState: "ACTIVE" } },
    ]);
    state.courierFindUnique.mockResolvedValue({ id: "c1", userId: "cu1", operationalState: "ACTIVE", status: "GOING_TO_RESTAURANT" });
    state.assignmentFindFirst.mockResolvedValue({ id: "a2", orderId: "o2", courierId: "c1", isQueued: true, status: "ACCEPTED" });
    state.orderUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });

    await cancelOrderBeforeHandoff({ orderId: "o1", actorRole: Role.RESTAURANT_OWNER, actorRestaurantId: "r1", reason: "Cliente pediu" });

    expect(state.assignmentUpdate).toHaveBeenCalledWith({ where: { id: "a2" }, data: { isQueued: false } });
    expect(state.statusEventCreate).toHaveBeenCalledWith({
      data: { orderId: "o2", status: "COURIER_ASSIGNED", actor: Role.RESTAURANT_OWNER },
    });
    expect(state.courierUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "GOING_TO_RESTAURANT" } });
  });

  it("returns the courier to AVAILABLE when the active slot is cancelled and no queued work remains", async () => {
    const source = order("COURIER_ASSIGNED", "c1");
    const cancelled = { ...source, status: "CANCELLED", courierId: null };
    state.orderFindUnique.mockResolvedValueOnce(source).mockResolvedValueOnce(cancelled);
    state.assignmentFindMany.mockResolvedValue([
      { id: "a1", courierId: "c1", isQueued: false, status: "ACCEPTED", courier: { id: "c1", userId: "cu1", operationalState: "ACTIVE" } },
    ]);
    state.courierFindUnique.mockResolvedValue({ id: "c1", userId: "cu1", operationalState: "ACTIVE", status: "GOING_TO_RESTAURANT" });
    state.assignmentFindFirst.mockResolvedValue(null);

    await cancelOrderBeforeHandoff({ orderId: "o1", actorRole: Role.RESTAURANT_STAFF, actorRestaurantId: "r1", reason: "Sem stock" });

    expect(state.courierUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "AVAILABLE" } });
    expect(state.dispatchWaitingOrders).toHaveBeenCalled();
  });

  it.each(["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "COLLECTED", "CANCELLED"])(
    "rejects cancellation from terminal/post-handoff status %s",
    async (status) => {
      state.orderFindUnique.mockResolvedValueOnce(order(status));
      await expect(cancelOrderBeforeHandoff({
        orderId: "o1",
        actorRole: Role.RESTAURANT_OWNER,
        actorRestaurantId: "r1",
        reason: "Teste",
      })).rejects.toMatchObject({ code: "NOT_CANCELLABLE" });
      expect(state.orderUpdateMany).not.toHaveBeenCalled();
    },
  );
});
