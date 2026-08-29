import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

export const asyncHandler =
  <T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

// Centralized error handler — every route throws AppError (or lets an
// unexpected error bubble) instead of hand-rolling res.json({success:false})
// per controller like the legacy backend did.
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: err.flatten().fieldErrors,
    });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error" });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `No route for ${req.method} ${req.path}` });
};
