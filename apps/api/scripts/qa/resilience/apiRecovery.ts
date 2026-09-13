export type TransportUncertainty = "TIMEOUT" | "DROPPED_RESPONSE";
export type InitialTransportOutcome = "UNKNOWN";

export type ReconciledCheckoutState =
  | { kind: "NO_ORDER"; orderIds: string[] }
  | { kind: "ONE_ORDER"; orderIds: string[]; orderId: string }
  | { kind: "DUPLICATE_ORDERS"; orderIds: string[] };

export function classifyTransportUncertainty(_uncertainty: TransportUncertainty): InitialTransportOutcome {
  return "UNKNOWN";
}

export function reconcileCheckoutAfterUncertainty(orderIds: readonly string[]): ReconciledCheckoutState {
  const uniqueOrderIds = Array.from(new Set(orderIds));
  if (uniqueOrderIds.length === 0) return { kind: "NO_ORDER", orderIds: [] };
  if (uniqueOrderIds.length === 1) {
    return { kind: "ONE_ORDER", orderIds: uniqueOrderIds, orderId: uniqueOrderIds[0]! };
  }
  return { kind: "DUPLICATE_ORDERS", orderIds: uniqueOrderIds };
}

export function validateRecoveredCheckout(state: ReconciledCheckoutState): void {
  if (state.kind === "DUPLICATE_ORDERS") {
    throw new Error(
      `duplicate orders after uncertain checkout: ${state.orderIds.join(", ")}`,
    );
  }
}
