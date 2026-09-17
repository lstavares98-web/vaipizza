type DisplayUser = { name: string; phone: string | null };
type DisplayAddress = { line1: string; city: string; lat: number; lng: number };

interface OrderCustomerSource {
  user: DisplayUser | null;
  address: DisplayAddress | null;
  customerNameSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  deliveryLine1Snapshot: string | null;
  deliveryCitySnapshot: string | null;
  customerLat: number | null;
  customerLng: number | null;
}

export function buildOrderCustomerDisplay(order: OrderCustomerSource): { user: DisplayUser; address: DisplayAddress | null } {
  const user = order.user ?? {
    name: order.customerNameSnapshot?.trim() || "Cliente de balcão",
    phone: order.customerPhoneSnapshot ?? null,
  };

  if (order.address) return { user, address: order.address };

  const hasManualAddress = Boolean(order.deliveryLine1Snapshot?.trim())
    && Boolean(order.deliveryCitySnapshot?.trim())
    && Number.isFinite(order.customerLat)
    && Number.isFinite(order.customerLng);

  return {
    user,
    address: hasManualAddress
      ? {
          line1: order.deliveryLine1Snapshot!,
          city: order.deliveryCitySnapshot!,
          lat: order.customerLat!,
          lng: order.customerLng!,
        }
      : null,
  };
}
