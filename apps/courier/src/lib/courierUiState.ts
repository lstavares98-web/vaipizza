export type CourierOperationalState = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type CourierWorkStatus =
  | "OFFLINE"
  | "AVAILABLE"
  | "ASSIGNED"
  | "GOING_TO_RESTAURANT"
  | "AT_RESTAURANT"
  | "PICKED_UP"
  | "DELIVERING";

export function getCourierUiState(operationalState: CourierOperationalState, status: CourierWorkStatus) {
  if (operationalState === "SUSPENDED") {
    return {
      online: false,
      canToggleAvailability: false,
      title: "Suspenso",
      description: "A sua conta está temporariamente suspensa. Não pode receber novas entregas.",
    };
  }

  if (operationalState === "DEACTIVATED") {
    return {
      online: false,
      canToggleAvailability: false,
      title: "Desativado",
      description: "A sua conta está desativada e não pode receber novas entregas.",
    };
  }

  if (status === "OFFLINE") {
    return {
      online: false,
      canToggleAvailability: true,
      title: "Offline",
      description: "Fique online quando estiver pronto para começar.",
    };
  }

  return {
    online: true,
    canToggleAvailability: status === "AVAILABLE",
    title: "Online",
    description: "Está ligado à operação de entregas.",
  };
}
