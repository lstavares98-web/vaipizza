import type { CourierStatus } from "@prisma/client";

export function normalizeCourierStatusOnLogin(status: CourierStatus): CourierStatus {
  return status === "AVAILABLE" ? "OFFLINE" : status;
}
