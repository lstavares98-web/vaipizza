export type CourierIndicatorState = "offline" | "eligible" | "blocked";

export function getCourierIndicatorState(status: string, eligibleForDispatch: boolean): CourierIndicatorState {
  if (status === "OFFLINE") return "offline";
  return eligibleForDispatch ? "eligible" : "blocked";
}

export function getCourierIndicatorStyle(status: string, eligibleForDispatch: boolean) {
  const state = getCourierIndicatorState(status, eligibleForDispatch);
  if (state === "eligible") {
    return { background: "var(--success)", boxShadow: "0 0 0 3px rgba(25,135,84,.1)" };
  }
  if (state === "blocked") {
    return { background: "var(--danger)", boxShadow: "0 0 0 3px rgba(198,53,40,.1)" };
  }
  return { background: "#aaa49a", boxShadow: "none" };
}
