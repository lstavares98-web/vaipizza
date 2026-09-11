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

export interface QaDeliveryApiStep {
  label: string;
  method: QaDeliveryApiMethod;
  path: string;
  body: Record<string, unknown> | undefined;
  expectedStatus: QaDeliveryStatus;
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
