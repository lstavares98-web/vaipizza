import { PrismaClient } from "@prisma/client";

// Single shared instance — avoids exhausting Postgres connections across
// hot-reloads in dev and across route modules in prod.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
