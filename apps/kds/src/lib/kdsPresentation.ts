export interface StatusHistoryEntry {
  status: string;
  createdAt: string;
}

export interface PreparationTimingInput {
  createdAt: string;
  statusHistory?: StatusHistoryEntry[];
}

export type TicketUrgency = "normal" | "attention" | "late";

export function getPreparationElapsedMinutes(order: PreparationTimingInput, now = Date.now()) {
  const preparingAt = order.statusHistory?.find((entry) => entry.status === "PREPARING")?.createdAt;
  const startedAt = new Date(preparingAt ?? order.createdAt).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.round((now - startedAt) / 60_000));
}

export function getTicketUrgency(elapsedMinutes: number): { level: TicketUrgency; label: string } {
  if (elapsedMinutes >= 15) return { level: "late", label: "Atrasado" };
  if (elapsedMinutes >= 10) return { level: "attention", label: "Atenção" };
  return { level: "normal", label: "No tempo" };
}

export function getFulfillmentLabel(fulfillmentType?: string) {
  if (fulfillmentType === "DELIVERY") return "Delivery";
  if (fulfillmentType === "PICKUP") return "Takeaway";
  return "Pedido";
}
