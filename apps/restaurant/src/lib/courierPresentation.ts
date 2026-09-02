export const COURIER_STATUS_LABELS: Record<string, string> = {
  OFFLINE: "Offline",
  AVAILABLE: "Disponível",
  ASSIGNED: "Oferta pendente",
  GOING_TO_RESTAURANT: "A caminho da pizzaria",
  AT_RESTAURANT: "Na pizzaria",
  PICKED_UP: "Pedido recolhido",
  DELIVERING: "Em entrega",
};

export const COURIER_INELIGIBILITY_LABELS: Record<string, string> = {
  OFFLINE: "Offline",
  OFFER_PENDING: "Já tem uma oferta pendente",
  BUSY: "Ocupado numa entrega",
  NO_LOCATION: "Sem localização GPS",
  STALE_LOCATION: "GPS desatualizado",
  LOW_ACCURACY: "GPS com pouca precisão",
  OUTSIDE_DISPATCH_ZONE: "Fora da zona operacional",
};

export function formatGpsAge(seconds: number | null) {
  if (seconds === null) return "sem GPS";
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `há ${minutes} min`;
}
