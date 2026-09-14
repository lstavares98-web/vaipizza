interface QueuedOfferEligibilityInput {
  activeDeliveryCount: number;
  queuedAcceptedCount: number;
  geoEligible: boolean;
  approved: boolean;
}

export function canReceiveQueuedOffer(input: QueuedOfferEligibilityInput) {
  return (
    input.approved &&
    input.geoEligible &&
    input.activeDeliveryCount === 1 &&
    input.queuedAcceptedCount === 0
  );
}

export function shouldConsiderBusyCouriers(freeEligibleCourierCount: number) {
  return freeEligibleCourierCount === 0;
}
