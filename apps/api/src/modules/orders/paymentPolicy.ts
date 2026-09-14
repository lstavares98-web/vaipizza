export function canRestaurantStartOrder(paymentMethod: string, paymentStatus: string) {
  return paymentMethod !== "MBWAY" || paymentStatus === "PAID";
}
