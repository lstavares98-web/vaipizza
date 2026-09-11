import type { QaConfig } from "../types.js";
import { expectQaSuccess, qaRequest, type QaHttpResponse, type QaRequestOptions } from "../http.js";

const DELIVERY_STATUS_PLAN = [
  "NEW",
  "PREPARING",
  "WAITING_FOR_COURIER",
  "COURIER_ASSIGNED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export type QaDeliveryStatus = (typeof DELIVERY_STATUS_PLAN)[number];
export type QaDeliveryApiMethod = "POST" | "PATCH";
export type QaRequestExecutor = <T>(
  config: QaConfig,
  path: string,
  options?: QaRequestOptions,
) => Promise<QaHttpResponse<T>>;

export interface QaDeliveryApiStep {
  label: string;
  method: QaDeliveryApiMethod;
  path: string;
  body: Record<string, unknown> | undefined;
  expectedStatus: QaDeliveryStatus;
}

export interface QaDeliveryTokens {
  staffToken: string;
  kitchenToken: string;
  courierToken: string;
}

export interface QaTransitionResult {
  assignmentId: string;
  finalStatus: "DELIVERED";
  timings: Record<string, number>;
}

export function singleDeliveryStatusPlan(): QaDeliveryStatus[] {
  return [...DELIVERY_STATUS_PLAN];
}

export function singleDeliveryCheckoutBody(addressId: string, runId: string) {
  return {
    addressId,
    fulfillmentType: "DELIVERY" as const,
    paymentMethod: "CASH" as const,
    notes: `[QA ${runId}] single-delivery`,
    amountTendered: 50,
  };
}

export function singleDeliveryApiPlan(orderId: string, assignmentId: string): QaDeliveryApiStep[] {
  return [
    {
      label: "restaurant accept",
      method: "PATCH",
      path: `/api/restaurant/orders/${orderId}/status`,
      body: { status: "ACCEPTED" },
      expectedStatus: "PREPARING",
    },
    {
      label: "kitchen ready",
      method: "PATCH",
      path: `/api/restaurant/orders/${orderId}/status`,
      body: { status: "READY_FOR_PICKUP" },
      expectedStatus: "WAITING_FOR_COURIER",
    },
    {
      label: "courier accept",
      method: "POST",
      path: `/api/courier/assignments/${assignmentId}/accept`,
      body: undefined,
      expectedStatus: "COURIER_ASSIGNED",
    },
    {
      label: "courier pickup",
      method: "PATCH",
      path: `/api/courier/orders/${orderId}/status`,
      body: { status: "PICKED_UP" },
      expectedStatus: "PICKED_UP",
    },
    {
      label: "courier out for delivery",
      method: "PATCH",
      path: `/api/courier/orders/${orderId}/status`,
      body: { status: "OUT_FOR_DELIVERY" },
      expectedStatus: "OUT_FOR_DELIVERY",
    },
    {
      label: "courier delivered",
      method: "PATCH",
      path: `/api/courier/orders/${orderId}/status`,
      body: { status: "DELIVERED" },
      expectedStatus: "DELIVERED",
    },
  ];
}

export function assertQaOrderStatus(
  order: { status?: string | null },
  expected: QaDeliveryStatus,
  label: string,
): void {
  if (order.status !== expected) {
    throw new Error(`${label}: expected order status ${expected}, received ${order.status ?? "<missing>"}`);
  }
}

export async function runSingleDeliveryTransitions(
  config: QaConfig,
  orderId: string,
  tokens: QaDeliveryTokens,
  request: QaRequestExecutor = qaRequest,
): Promise<QaTransitionResult> {
  const timings: Record<string, number> = {};
  const placeholderPlan = singleDeliveryApiPlan(orderId, "pending-assignment");

  for (const [index, token] of [tokens.staffToken, tokens.kitchenToken].entries()) {
    const step = placeholderPlan[index]!;
    const response = await request<{ success: boolean; order: { id: string; status: string }; message?: string }>(
      config,
      step.path,
      { method: step.method, token, body: step.body },
    );
    const data = expectQaSuccess(response, step.label);
    if (!data.order?.id || data.order.id !== orderId) throw new Error(`${step.label}: API returned the wrong order`);
    assertQaOrderStatus(data.order, step.expectedStatus, step.label);
    timings[step.label] = response.durationMs;
  }

  const assignmentResponse = await request<{
    success: boolean;
    assignment: null | { id: string; order?: { id?: string } };
    message?: string;
  }>(config, "/api/courier/assignments/current", { token: tokens.courierToken });
  const assignmentData = expectQaSuccess(assignmentResponse, "courier current assignment");
  if (!assignmentData.assignment?.id) throw new Error("courier current assignment: no live offer was returned");
  if (assignmentData.assignment.order?.id && assignmentData.assignment.order.id !== orderId) {
    throw new Error(`courier current assignment: expected order ${orderId}, received ${assignmentData.assignment.order.id}`);
  }
  const assignmentId = assignmentData.assignment.id;
  timings["courier current assignment"] = assignmentResponse.durationMs;

  const courierSteps = singleDeliveryApiPlan(orderId, assignmentId).slice(2);
  for (const step of courierSteps) {
    const response = await request<{ success: boolean; order: { id: string; status: string }; message?: string }>(
      config,
      step.path,
      { method: step.method, token: tokens.courierToken, body: step.body },
    );
    const data = expectQaSuccess(response, step.label);
    if (!data.order?.id || data.order.id !== orderId) throw new Error(`${step.label}: API returned the wrong order`);
    assertQaOrderStatus(data.order, step.expectedStatus, step.label);
    timings[step.label] = response.durationMs;
  }

  return { assignmentId, finalStatus: "DELIVERED", timings };
}
