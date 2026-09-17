import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@yummix/types";

const state = vi.hoisted(() => {
  const userFindUnique = vi.fn();
  const txUserUpdate = vi.fn();
  const txPasswordResetUpdateMany = vi.fn();
  const txRefreshUpdateMany = vi.fn();
  const hashPassword = vi.fn(async () => "new-password-hash");
  const tx = {
    user: { update: txUserUpdate },
    passwordResetToken: { updateMany: txPasswordResetUpdateMany },
    refreshToken: { updateMany: txRefreshUpdateMany },
  };
  const prisma = {
    user: { findUnique: userFindUnique },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { prisma, userFindUnique, txUserUpdate, txPasswordResetUpdateMany, txRefreshUpdateMany, hashPassword };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("bcryptjs", () => ({ default: { hash: state.hashPassword, compare: vi.fn() } }));
vi.mock("./tokens.js", () => ({ hashToken: vi.fn((value: string) => `hash:${value}`) }));

import { changeOwnPassword } from "./auth.service.js";

describe("forced customer password change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.userFindUnique.mockResolvedValue({ id: "customer-1", role: Role.CUSTOMER });
    state.txUserUpdate.mockResolvedValue({ id: "customer-1" });
    state.txPasswordResetUpdateMany.mockResolvedValue({ count: 1 });
    state.txRefreshUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("stores the new password, clears the forced-change marker and revokes existing refresh sessions", async () => {
    await changeOwnPassword("customer-1", "MinhaNovaSenha123");

    expect(state.hashPassword).toHaveBeenCalledWith("MinhaNovaSenha123", 12);
    expect(state.txUserUpdate).toHaveBeenCalledWith({
      where: { id: "customer-1" },
      data: { passwordHash: "new-password-hash" },
    });
    expect(state.txPasswordResetUpdateMany).toHaveBeenCalledWith({
      where: { tokenHash: "hash:forced-password-change:customer-1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(state.txRefreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "customer-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
