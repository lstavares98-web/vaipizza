import bcrypt from "bcryptjs";
import { Role } from "@yummix/types";
import type { LoginInput, RegisterCourierInput, RegisterCustomerInput } from "@yummix/validation";
import { prisma } from "../../config/prisma.js";
import { badRequest, conflict, unauthorized } from "../../utils/AppError.js";
import { getIO, rooms } from "../../sockets/io.js";
import { normalizeCourierStatusOnLogin } from "../couriers/courierAvailability.policy.js";
import {
  generateOpaqueToken,
  hashToken,
  refreshTtlToDate,
  signAccessToken,
} from "./tokens.js";

const BCRYPT_ROUNDS = 12;
const ACTIVE_COURIER_STATUSES = ["ASSIGNED", "GOING_TO_RESTAURANT", "AT_RESTAURANT", "PICKED_UP", "DELIVERING"] as const;

type SessionUser = { id: string; role: Role; restaurantId: string | null };

function createSessionMaterial(user: SessionUser, courierSessionVersion?: number) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    restaurantId: user.restaurantId ?? undefined,
    ...(courierSessionVersion === undefined ? {} : { courierSessionVersion }),
  });
  const refreshToken = generateOpaqueToken();
  return {
    accessToken,
    refreshToken,
    refreshData: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTtlToDate(),
    },
  };
}

async function issueSession(user: SessionUser, courierSessionVersion?: number) {
  const material = createSessionMaterial(user, courierSessionVersion);
  await prisma.refreshToken.create({ data: material.refreshData });
  return { accessToken: material.accessToken, refreshToken: material.refreshToken };
}

export async function registerCustomer(input: RegisterCustomerInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("An account with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone,
      role: Role.CUSTOMER,
    },
  });
  const session = await issueSession(user);
  return { user, ...session };
}

export async function registerCourier(input: RegisterCourierInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("An account with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone,
      role: Role.COURIER,
      courier: {
        create: {
          vehicleType: input.vehicleType,
          vehicleNumber: input.vehicleNumber,
          documentIdUrl: input.documentIdUrl,
          documentLicenseUrl: input.documentLicenseUrl,
        },
      },
    },
  });
  const session = await issueSession(user, 0);
  return { user, ...session };
}

export async function login(input: LoginInput, allowedRoles: Role[]) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw unauthorized("Invalid email or password");
  if (user.isBlocked) throw unauthorized("This account has been blocked");
  if (!allowedRoles.includes(user.role as Role)) {
    throw unauthorized("This account cannot sign in through this app");
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw unauthorized("Invalid email or password");

  if (user.role !== Role.COURIER) {
    const session = await issueSession(user);
    return { user, ...session };
  }

  const courier = await prisma.courier.findUnique({ where: { userId: user.id } });
  if (!courier) throw unauthorized("Courier profile unavailable");
  if (courier.operationalState === "DEACTIVATED") {
    throw unauthorized("Esta conta de estafeta está desativada", "COURIER_DEACTIVATED");
  }

  const nextStatus = normalizeCourierStatusOnLogin(courier.status);
  const session = await prisma.$transaction(async (tx) => {
    // Updating the courier row first serializes concurrent logins for
    // the same account before older refresh sessions are revoked.
    const updatedCourier = await tx.courier.update({
      where: { id: courier.id },
      data: { sessionVersion: { increment: 1 }, status: nextStatus },
    });

    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const material = createSessionMaterial(user, updatedCourier.sessionVersion);
    await tx.refreshToken.create({ data: material.refreshData });
    return { accessToken: material.accessToken, refreshToken: material.refreshToken };
  });

  // Any already-connected courier device is the previous session.
  // The new device has not opened its socket yet, so it is safe to
  // notify and disconnect this room immediately after commit.
  const room = rooms.courier(user.id);
  getIO()?.to(room).emit("session:replaced", { message: "A sua conta foi iniciada noutro dispositivo." });
  getIO()?.in(room).disconnectSockets(true);

  return { user, ...session };
}

export async function refreshSession(rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized("Refresh token invalid or expired");
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || user.isBlocked) throw unauthorized("Account unavailable");

  let courierSessionVersion: number | undefined;
  if (user.role === Role.COURIER) {
    const courier = await prisma.courier.findUnique({ where: { userId: user.id } });
    if (!courier || courier.operationalState === "DEACTIVATED") throw unauthorized("Account unavailable");
    courierSessionVersion = courier.sessionVersion;
  }

  const material = createSessionMaterial(user, courierSessionVersion);
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({ data: material.refreshData }),
  ]);
  return { accessToken: material.accessToken, refreshToken: material.refreshToken };
}

export async function logout(rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt) return;

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) return;

  if (user.role !== Role.COURIER) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }

  const courier = await prisma.courier.findUnique({ where: { userId: user.id } });
  if (!courier) return;
  if ((ACTIVE_COURIER_STATUSES as readonly string[]).includes(courier.status)) {
    throw badRequest("Não pode terminar sessão a meio de uma entrega", "COURIER_MID_DELIVERY");
  }

  await prisma.$transaction([
    prisma.courier.update({
      where: { id: courier.id },
      data: {
        sessionVersion: { increment: 1 },
        ...(courier.status === "AVAILABLE" ? { status: "OFFLINE" as const } : {}),
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const rawToken = generateOpaqueToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { user, rawToken };
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest("Reset link is invalid or has expired");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
