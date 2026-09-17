import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@yummix/types";

const state = vi.hoisted(() => {
  const userFindFirst = vi.fn();
  const txUserUpdate = vi.fn();
  const txPasswordResetDeleteMany = vi.fn();
  const txPasswordResetCreate = vi.fn();
  const txRefreshUpdateMany = vi.fn();
  const hashPassword = vi.fn(async () => "temporary-password-hash");
  const tx = {
    user: { update: txUserUpdate },
    passwordResetToken: { deleteMany: txPasswordResetDeleteMany, create: txPasswordResetCreate },
    refreshToken: { updateMany: txRefreshUpdateMany },
  };
  const prisma = {
    user: { findFirst: userFindFirst },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return {
    prisma,
    userFindFirst,
    txUserUpdate,
    txPasswordResetDeleteMany,
    txPasswordResetCreate,
    txRefreshUpdateMany,
    hashPassword,
  };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("bcryptjs", () => ({ default: { hash: state.hashPassword } }));
vi.mock("../auth/tokens.js", () => ({ hashToken: vi.fn((value: string) => `hash:${value}`) }));

import { resetCustomerPassword } from "./admin.service.js";

describe("admin customer password reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.userFindFirst.mockResolvedValue({
      id: "customer-1",
      email: "cliente@example.com",
      name: "Cliente",
      role: Role.CUSTOMER,
    });
    state.txUserUpdate.mockResolvedValue({ id: "customer-1" });
    state.txPasswordResetDeleteMany.mockResolvedValue({ count: 0 });
    state.txPasswordResetCreate.mockResolvedValue({ id: "marker-1" });
    state.txRefreshUpdateMany.mockResolvedValue({ count: 2 });
  });

  it("generates a temporary password, creates a forced-change marker and revokes old sessions", async () => {
    const result = await resetCustomerPassword("customer-1");

    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(10);
    expect(state.hashPassword).toHaveBeenCalledWith(result.temporaryPassword, 12);
    expect(state.txUserUpdate).toHaveBeenCalledWith({
      where: { id: "customer-1" },
      data: { passwordHash: "temporary-password-hash" },
    });
    expect(state.txPasswordResetDeleteMany).toHaveBeenCalledWith({
      where: { tokenHash: "hash:forced-password-change:customer-1" },
    });
    expect(state.txPasswordResetCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "customer-1",
        tokenHash: "hash:forced-password-change:customer-1",
        usedAt: null,
      }),
    });
    expect(state.txRefreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "customer-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.customer).toEqual(expect.objectContaining({
      id: "customer-1",
      email: "cliente@example.com",
      name: "Cliente",
    }));
  });
});
