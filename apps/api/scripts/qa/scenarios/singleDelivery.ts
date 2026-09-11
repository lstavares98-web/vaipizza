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

export function singleDeliveryStatusPlan(): QaDeliveryStatus[] {
  return [...DELIVERY_STATUS_PLAN];
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
