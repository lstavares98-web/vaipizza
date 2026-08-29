import type { NextFunction, Request, Response } from "express";
import type { JwtPayload, Role } from "@yummix/types";
import { unauthorized, forbidden } from "../utils/AppError.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

// Standard Authorization: Bearer <token> header — replaces the legacy
// project's non-standard custom `token` header.
export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return next(unauthorized("Missing bearer token"));
  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
};

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden("Insufficient role"));
    next();
  };

// For endpoints scoped to "your own restaurant" — ensures the JWT's
// restaurantId (embedded at login) matches the resource being touched.
export const requireOwnRestaurant = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth?.restaurantId) return next(forbidden("No restaurant associated with this account"));
  next();
};
