import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@yummix/types";

const state = vi.hoisted(() => {
  const userFindUnique = vi.fn();
  const courierFindUnique = vi.fn();
  const refreshTokenCreate = vi.fn();
  const txCourierUpdate = vi.fn();
  const txRefreshUpdateMany = vi.fn();
  const txRefreshCreate = vi.fn();
  const signAccessToken = vi.fn(() => "access-token");

  const tx = {
    courier: { update: txCourierUpdate },
    refreshToken: {
      updateMany: txRefreshUpdateMany,
      create: txRefreshCreate,
    },
  };

  const prisma = {
    user: { findUnique: userFindUnique },
    courier: { findUnique: courierFindUnique },
    refreshToken: { create: refreshTokenCreate },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return {
    prisma,
    tx,
    userFindUnique,
    courierFindUnique,
    refreshTokenCreate,
    txCourierUpdate,
    txRefreshUpdateMany,
    txRefreshCreate,
    signAccessToken,
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async () => true), hash: vi.fn() } }));
vi.mock("./tokens.js", () => ({
  signAccessToken: state.signAccessToken,
  generateOpaqueToken: vi.fn(() => "refresh-token"),
  hashToken: vi.fn(() => "refresh-hash"),
  refreshTtlToDate: vi.fn(() => new Date("2030-01-01T00:00:00.000Z")),
}));

import { login } from "./auth.service.js";

const user = {
  id: "u1",
  email: "courier@example.com",
  passwordHash: "hash",
  name: "Courier",
  phone: null,
  role: Role.COURIER,
  isBlocked: false,
  restaurantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("exclusive courier login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.userFindUnique.mockResolvedValue(user);
    state.refreshTokenCreate.mockResolvedValue({ id: "legacy-refresh" });
    state.txRefreshUpdateMany.mockResolvedValue({ count: 1 });
    state.txRefreshCreate.mockResolvedValue({ id: "new-refresh" });
  });

  it("increments the courier session, revokes older refresh sessions and signs the new version", async () => {
    state.courierFindUnique.mockResolvedValue({
      id: "c1",
      userId: "u1",
      operationalState: "ACTIVE",
      sessionVersion: 3,
      status: "AVAILABLE",
    });
    state.txCourierUpdate.mockResolvedValue({ sessionVersion: 4, status: "OFFLINE" });

    await login({ email: user.email, password: "secret123" }, [Role.COURIER]);

    expect(state.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(state.txCourierUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { sessionVersion: { increment: 1 }, status: "OFFLINE" },
    });
    expect(state.txRefreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(state.signAccessToken).toHaveBeenCalledWith({
      sub: "u1",
      role: Role.COURIER,
      restaurantId: undefined,
      courierSessionVersion: 4,
    });
  });

  it("preserves an active delivery status when a newer device logs in", async () => {
    state.courierFindUnique.mockResolvedValue({
      id: "c1",
      userId: "u1",
      operationalState: "ACTIVE",
      sessionVersion: 9,
      status: "DELIVERING",
    });
    state.txCourierUpdate.mockResolvedValue({ sessionVersion: 10, status: "DELIVERING" });

    await login({ email: user.email, password: "secret123" }, [Role.COURIER]);

    expect(state.txCourierUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { sessionVersion: { increment: 1 }, status: "DELIVERING" },
    });
    expect(state.signAccessToken).toHaveBeenCalledWith(expect.objectContaining({ courierSessionVersion: 10 }));
  });
});
