import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "@yummix/types";
import { env } from "../../config/env.js";

export const signAccessToken = (payload: JwtPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });

export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

// Refresh tokens are opaque random strings; only their SHA-256 hash is
// stored, so a leaked database dump can't be replayed as a live session.
export const generateOpaqueToken = () => crypto.randomBytes(48).toString("hex");

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export const refreshTtlToDate = () => {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_TTL);
  const amount = match ? Number(match[1]) : 30;
  const unit = match ? match[2] : "d";
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit ?? "d"] ?? 86_400_000;
  return new Date(Date.now() + amount * multiplier);
};
