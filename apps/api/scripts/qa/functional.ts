export interface FunctionalDeliveredState {
  orderId: string;
  customerOrder: { id: string; status: string; paymentStatus: string };
  courierHistory: Array<{ id: string; status: string }>;
  courierEarnings: {
    lifetimeDeliveries: number;
    today: { deliveries: number; total: number };
  };
}

export function assertFunctionalDeliveredState(state: FunctionalDeliveredState): void {
  if (state.customerOrder.id !== state.orderId) {
    throw new Error(`Functional QA returned the wrong customer order: ${state.customerOrder.id}`);
  }
  if (state.customerOrder.status !== "DELIVERED") {
    throw new Error(`Functional QA order is not DELIVERED: ${state.customerOrder.status}`);
  }
  if (state.customerOrder.paymentStatus !== "PAID") {
    throw new Error(`Functional QA cash payment is not PAID: ${state.customerOrder.paymentStatus}`);
  }
  if (!state.courierHistory.some((order) => order.id === state.orderId && order.status === "DELIVERED")) {
    throw new Error(`Functional QA order ${state.orderId} is missing from courier history`);
  }
  if (state.courierEarnings.lifetimeDeliveries < 1 || state.courierEarnings.today.deliveries < 1) {
    throw new Error("Functional QA delivery was not reflected in courier earnings");
  }
}

export function combineFunctionalAndCleanupErrors(
  scenarioError: Error | null,
  cleanupError: Error | null,
): Error {
  if (scenarioError && cleanupError) {
    return new Error(`Functional QA failed: ${scenarioError.message}; cleanup also failed: ${cleanupError.message}`);
  }
  if (scenarioError) return scenarioError;
  if (cleanupError) return cleanupError;
  return new Error("Functional QA failed without a reported error");
}
