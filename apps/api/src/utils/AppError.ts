export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (message = "Not found") => new AppError(404, message, "NOT_FOUND");
export const badRequest = (message = "Bad request", code?: string) =>
  new AppError(400, message, code ?? "BAD_REQUEST");
export const unauthorized = (message = "Unauthorized") => new AppError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "Forbidden") => new AppError(403, message, "FORBIDDEN");
export const conflict = (message = "Conflict") => new AppError(409, message, "CONFLICT");
