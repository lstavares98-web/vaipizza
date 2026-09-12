import type { QaScenarioStatus } from "../types.js";

export interface QaResilienceScenarioResult {
  name: string;
  status: QaScenarioStatus;
  durationMs: number;
  details?: Record<string, unknown>;
  reason?: string;
}

export interface QaOrderAudit {
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  orderCourierId: string | null;
  acceptedAssignmentCourierIds: string[];
  activeAssignmentCourierIds: string[];
  deliveryEarningCount: number;
  waitingForCourier: boolean;
}

export interface QaOrderAuditInput {
  orderId: string;
}
