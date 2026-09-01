export type DeliveryTarget = "restaurant" | "customer";
export type DeliveryNextStatus = "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED";

export interface DeliveryStep {
  title: string;
  label: string;
  next: DeliveryNextStatus;
  target: DeliveryTarget;
}

const STEPS: Record<string, DeliveryStep> = {
  COURIER_ASSIGNED: {
    title: "Recolher na VAIPIZZA",
    label: "Confirmar recolha",
    next: "PICKED_UP",
    target: "restaurant",
  },
  PICKED_UP: {
    title: "Iniciar entrega",
    label: "A caminho do cliente",
    next: "OUT_FOR_DELIVERY",
    target: "customer",
  },
  OUT_FOR_DELIVERY: {
    title: "Entregar ao cliente",
    label: "Confirmar entrega",
    next: "DELIVERED",
    target: "customer",
  },
};

export function getDeliveryStep(status: string): DeliveryStep | null {
  return STEPS[status] ?? null;
}

export function buildDirectionsUrl(lat: number, lng: number) {
  const destination = encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
