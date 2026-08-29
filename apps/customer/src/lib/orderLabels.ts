export const ORDER_STATUS_LABELS: Record<string, string> = {
  NEW: "Pedido efetuado",
  ACCEPTED: "Confirmado pelo restaurante",
  PREPARING: "Em preparação",
  READY_FOR_PICKUP: "Pronto",
  WAITING_FOR_COURIER: "À procura de estafeta",
  COURIER_ASSIGNED: "Estafeta a caminho do restaurante",
  PICKED_UP: "Estafeta recolheu o pedido",
  OUT_FOR_DELIVERY: "A caminho da sua morada",
  DELIVERED: "Entregue",
  COLLECTED: "Levantado no restaurante",
  CANCELLED: "Cancelado",
};

export const CANCELLABLE_STATUSES = new Set(["NEW", "ACCEPTED", "PREPARING"]);
