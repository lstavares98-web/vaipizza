import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@yummix/types";

const state = vi.hoisted(() => {
  const userFindFirst = vi.fn();
  const txUserUpdate = vi.fn();
  const txRefreshUpdateMany = vi.fn();
  const hashPassword = vi.fn(async () => "temporary-password-hash");
  const tx = {
    user: { update: txUserUpdate },
    refreshToken: { updateMany: txRefreshUpdateMany },
  };
  const prisma = {
    user: { findFirst: userFindFirst },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { prisma, tx, userFindFirst, txUserUpdate, txRefreshUpdateMany, hashPassword };
});

vi.mock("../../config/prisma.js", () => ({ prisma: state.prisma }));
vi.mock("bcryptjs", () => ({ default: { hash: state.hashPassword } }));

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
    state.txRefreshUpdateMany.mockResolvedValue({ count: 2 });
  });

  it("generates a one-time temporary password, forces a change and revokes old sessions", async () => {
    const result = await resetCustomerPassword("customer-1");

    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(10);
    expect(state.hashPassword).toHaveBeenCalledWith(result.temporaryPassword, 12);
    expect(state.txUserUpdate).toHaveBeenCalledWith({
      where: { id: "customer-1" },
      data: { passwordHash: "temporary-password-hash", mustChangePassword: true },
    });
    expect(state.txRefreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "customer-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.customer).toEqual({
      id: "customer-1",
      email: "cliente@example.com",
      name: "Cliente",
    });
  });
});
