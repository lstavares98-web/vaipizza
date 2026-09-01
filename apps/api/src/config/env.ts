import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be set to a long random value"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be set to a long random value"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),
  FRANCHISE_NOTIFY_EMAIL: z.string().email().default("vaipizzapt@gmail.com"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  MAX_ASSIGNMENT_RETRIES: z.coerce.number().int().positive().default(5),
  ASSIGNMENT_OFFER_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  COURIER_LOCATION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(120),
  DISPATCH_FAIRNESS_WINDOW_MINUTES: z.coerce.number().int().positive().default(30),
  ALLOW_PUBLIC_COURIER_REGISTRATION: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  PASSWORD_RESET_DEBUG_LOG: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== "production") return;
  if (value.JWT_ACCESS_SECRET.length < 32) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_ACCESS_SECRET"], message: "Use at least 32 characters in production" });
  }
  if (value.JWT_REFRESH_SECRET.length < 32) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_REFRESH_SECRET"], message: "Use at least 32 characters in production" });
  }
  if (value.CORS_ORIGINS.split(",").some((origin) => origin.trim() === "*")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGINS"], message: "Wildcard CORS is forbidden in production" });
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — check .env against .env.example");
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
};
