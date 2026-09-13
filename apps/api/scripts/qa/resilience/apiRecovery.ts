import { QaDroppedResponseError, QaTimeoutError } from "./faultTransport.js";

export type TransportUncertainty = "TIMEOUT" | "DROPPED_RESPONSE";
export type InitialTransportOutcome = "UNKNOWN";
export type RecoveryTransportOutcome = "CONFIRMED" | "UNKNOWN";

export type ReconciledCheckoutState =
  | { kind: "NO_ORDER"; orderIds: string[] }
  | { kind: "ONE_ORDER"; orderIds: string[]; orderId: string }
  | { kind: "DUPLICATE_ORDERS"; orderIds: string[] };

export interface CheckoutRecoveryResult {
  transportOutcome: RecoveryTransportOutcome;
  state: ReconciledCheckoutState;
}

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

function isTransportUncertainty(error: unknown): boolean {
  return error instanceof QaTimeoutError || error instanceof QaDroppedResponseError;
}

export async function recoverCheckoutAfterUncertainMutation(
  mutation: () => Promise<unknown>,
  readAuthoritativeOrderIds: () => Promise<string[]>,
  rememberDiscoveredOrderIds: (orderIds: string[]) => Promise<void>,
): Promise<CheckoutRecoveryResult> {
  let transportOutcome: RecoveryTransportOutcome = "CONFIRMED";

  try {
    await mutation();
  } catch (error) {
    if (!isTransportUncertainty(error)) throw error;
    transportOutcome = "UNKNOWN";
  }

  const orderIds = await readAuthoritativeOrderIds();
  await rememberDiscoveredOrderIds(orderIds);
  const state = reconcileCheckoutAfterUncertainty(orderIds);
  validateRecoveredCheckout(state);

  return { transportOutcome, state };
}
