import bcrypt from "bcryptjs";
import { Role } from "@yummix/types";
import type { LoginInput, RegisterCourierInput, RegisterCustomerInput } from "@yummix/validation";
import { prisma } from "../../config/prisma.js";
import { badRequest, conflict, unauthorized } from "../../utils/AppError.js";
import {
  generateOpaqueToken,
  hashToken,
  refreshTtlToDate,
  signAccessToken,
} from "./tokens.js";

const BCRYPT_ROUNDS = 12;

async function issueSession(user: { id: string; role: Role; restaurantId: string | null }) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    restaurantId: user.restaurantId ?? undefined,
  });
  const refreshToken = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTtlToDate(),
    },
  });
  return { accessToken, refreshToken };
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
  const session = await issueSession(user);
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

  const session = await issueSession(user);
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

  // Rotate: revoke the used token and issue a new pair, so a stolen
  // refresh token can only be replayed once before detection.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  return issueSession(user);
}

export async function logout(rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always behave the same whether or not the account exists, to avoid
  // leaking which emails are registered.
  if (!user) return null;

  const rawToken = generateOpaqueToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
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
    // Revoke all existing sessions on password change.
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
