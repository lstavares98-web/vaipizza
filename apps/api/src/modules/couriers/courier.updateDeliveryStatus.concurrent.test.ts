import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const orderFindFirst = vi.fn();
  const orderUpdate = vi.fn();
  const orderUpdateMany = vi.fn();
  const orderFindUnique = vi.fn();
  const orderStatusEventCreate = vi.fn();
  const courierFindUnique = vi.fn();
  const courierUpdate = vi.fn();
  const courierEarningCreate = vi.fn();
  const courierAssignmentFindFirst = vi.fn();
  const courierAssignmentUpdate = vi.fn();
  const courierAssignmentUpdateMany = vi.fn();
  const dispatchWaitingOrders = vi.fn();

  const tx = {
    order: {
      updateMany: orderUpdateMany,
      findUnique: orderFindUnique,
    },
    orderStatusEvent: { create: orderStatusEventCreate },
    courier: { update: courierUpdate },
    courierEarning: { create: courierEarningCreate },
    courierAssignment: {
      findFirst: courierAssignmentFindFirst,
      update: courierAssignmentUpdate,
      updateMany: courierAssignmentUpdateMany,
    },
  };

  const prisma = {
    courier: {
      findUnique: courierFindUnique,
      update: courierUpdate,
    },
    order: {
      findFirst: orderFindFirst,
      update: orderUpdate,
    },
    courierAssignment: {
      findFirst: courierAssignmentFindFirst,
    },
    courierEarning: { create: courierEarningCreate },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (client: typeof tx) => Promise<unknown>)(tx);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };

  return {
    prisma,
    tx,
    orderFindFirst,
    orderUpdate,
    orderUpdateMany,
    orderFindUnique,
    orderStatusEventCreate,
    courierFindUnique,
    courierUpdate,
    courierEarningCreate,
    courierAssignmentFindFirst,
    courierAssignmentUpdate,
    courierAssignmentUpdateMany,
    dispatchWaitingOrders,
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("../../config/env.js", () => ({
  env: {
    COURIER_LOCATION_MAX_AGE_SECONDS: 120,
    COURIER_MAX_ACCURACY_METERS: 100,
  },
}));
vi.mock("../../sockets/io.js", () => ({
  getIO: () => undefined,
  rooms: {
    courier: (id: string) => `courier:${id}`,
    restaurant: (id: string) => `restaurant:${id}`,
    customer: (id: string) => `customer:${id}`,
  },
}));
vi.mock("../dispatch/dispatch.service.js", () => ({ dispatchWaitingOrders: state.dispatchWaitingOrders }));
vi.mock("./earnings.js", () => ({
  computeDeliveryEarning: () => ({ base: 4, bonus: 0, total: 4 }),
}));

import { updateDeliveryStatus } from "./courier.service.js";

describe("updateDeliveryStatus concurrent DELIVERED", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    state.courierFindUnique.mockResolvedValue({
      id: "c1",
      userId: "u-courier",
      verificationStatus: "APPROVED",
      status: "DELIVERING",
      lifetimeDeliveries: 7,
      lat: 41.56,
      lng: -8.40,
      locationUpdatedAt: new Date(),
      locationAccuracyM: 10,
    });
    state.orderFindFirst.mockResolvedValue({
      id: "o1",
      courierId: "c1",
      userId: "u-customer",
      restaurantId: "r1",
      status: "OUT_FOR_DELIVERY",
      paymentMethod: "CASH",
      paymentStatus: "PENDING",
      deliveryFee: 4,
    });
    state.orderUpdate.mockResolvedValue({
      id: "o1",
      courierId: "c1",
      userId: "u-customer",
      restaurantId: "r1",
      status: "DELIVERED",
      paymentStatus: "PAID",
    });
    state.orderFindUnique.mockResolvedValue({
      id: "o1",
      courierId: "c1",
      userId: "u-customer",
      restaurantId: "r1",
      status: "DELIVERED",
      paymentStatus: "PAID",
    });
    state.orderUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    state.orderStatusEventCreate.mockResolvedValue({ id: "event-1" });
    state.courierUpdate.mockResolvedValue({ id: "c1", status: "AVAILABLE" });
    state.courierEarningCreate.mockResolvedValue({ id: "earning-1" });
    state.courierAssignmentFindFirst.mockResolvedValue(null);
    state.courierAssignmentUpdate.mockResolvedValue({});
    state.courierAssignmentUpdateMany.mockResolvedValue({ count: 0 });
    state.dispatchWaitingOrders.mockResolvedValue(undefined);
  });

  it("allows only one concurrent request to create delivery earnings and increment the courier", async () => {
    const results = await Promise.allSettled([
      updateDeliveryStatus("u-courier", "o1", "DELIVERED"),
      updateDeliveryStatus("u-courier", "o1", "DELIVERED"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(state.courierEarningCreate).toHaveBeenCalledTimes(1);
    expect(state.courierUpdate).toHaveBeenCalledTimes(1);
    expect(state.orderStatusEventCreate).toHaveBeenCalledTimes(1);
    expect(state.dispatchWaitingOrders).toHaveBeenCalledTimes(1);
  });

  it("promotes one accepted queued delivery in the same transaction", async () => {
    state.orderUpdateMany.mockReset()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    state.courierAssignmentFindFirst.mockResolvedValue({ id: "a2", orderId: "o2" });
    state.orderFindUnique.mockReset()
      .mockResolvedValueOnce({
        id: "o2",
        courierId: "c1",
        userId: "u-next-customer",
        restaurantId: "r1",
        status: "COURIER_ASSIGNED",
      })
      .mockResolvedValueOnce({
        id: "o1",
        courierId: "c1",
        userId: "u-customer",
        restaurantId: "r1",
        status: "DELIVERED",
        paymentStatus: "PAID",
      });

    const delivered = await updateDeliveryStatus("u-courier", "o1", "DELIVERED");

    expect(delivered.id).toBe("o1");
    expect(state.courierAssignmentUpdate).toHaveBeenCalledWith({
      where: { id: "a2" },
      data: { isQueued: false },
    });
    expect(state.orderStatusEventCreate).toHaveBeenCalledTimes(2);
    expect(state.courierUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "c1" },
      data: expect.objectContaining({ status: "GOING_TO_RESTAURANT" }),
    }));
    expect(state.dispatchWaitingOrders).toHaveBeenCalledTimes(1);
  });
});
