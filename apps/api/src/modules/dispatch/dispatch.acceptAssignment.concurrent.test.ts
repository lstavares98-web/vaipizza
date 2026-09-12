import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const acceptAssignment = vi.fn();
  const assignmentUpdateMany = vi.fn();
  const competingFindMany = vi.fn();
  const courierUpdateMany = vi.fn();

  const tx = {
    courierAssignment: {
      updateMany: assignmentUpdateMany,
      findMany: competingFindMany,
    },
    courier: { updateMany: courierUpdateMany },
  };

  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return {
    prisma,
    tx,
    acceptAssignment,
    assignmentUpdateMany,
    competingFindMany,
    courierUpdateMany,
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("./dispatch.service.js", () => ({ acceptAssignment: state.acceptAssignment }));

import { acceptAssignmentAndFinalize } from "./dispatch.acceptance.js";

describe("acceptAssignmentAndFinalize concurrent offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.acceptAssignment.mockResolvedValue({
      id: "o1",
      restaurantId: "r1",
      userId: "u1",
      courierId: "c1",
      status: "COURIER_ASSIGNED",
    });
    state.competingFindMany.mockResolvedValue([{ id: "a2", courierId: "c2" }]);
    state.assignmentUpdateMany.mockResolvedValue({ count: 1 });
    state.courierUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("cancels competing offers and releases losing couriers after one acceptance wins", async () => {
    const order = await acceptAssignmentAndFinalize("c1", "a1");

    expect(order?.id).toBe("o1");
    expect(state.acceptAssignment).toHaveBeenCalledWith("c1", "a1");
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

  it("does not touch competing offers when the assignment already lost", async () => {
    state.acceptAssignment.mockResolvedValueOnce(null);

    await expect(acceptAssignmentAndFinalize("c1", "a1")).resolves.toBeNull();
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });
});
