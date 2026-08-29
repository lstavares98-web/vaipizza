// Shared enums and DTOs used by both the API and every frontend app.
// Mirrors the Prisma schema enums — keep in sync with apps/api/prisma/schema.prisma.

export const Role = {
  CUSTOMER: "CUSTOMER",
  RESTAURANT_OWNER: "RESTAURANT_OWNER",
  RESTAURANT_STAFF: "RESTAURANT_STAFF",
  KITCHEN: "KITCHEN",
  COURIER: "COURIER",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const OrderStatus = {
  NEW: "NEW",
  ACCEPTED: "ACCEPTED",
  PREPARING: "PREPARING",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  WAITING_FOR_COURIER: "WAITING_FOR_COURIER",
  COURIER_ASSIGNED: "COURIER_ASSIGNED",
  PICKED_UP: "PICKED_UP",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  COLLECTED: "COLLECTED",
  CANCELLED: "CANCELLED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

// Pickup orders skip courier stages entirely and end at COLLECTED instead
// of DELIVERED — no courier is ever assigned for these.
export const PICKUP_STATUSES: OrderStatus[] = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "COLLECTED",
  "CANCELLED",
];

export const FulfillmentType = {
  DELIVERY: "DELIVERY",
  PICKUP: "PICKUP",
} as const;
export type FulfillmentType = (typeof FulfillmentType)[keyof typeof FulfillmentType];

export const PaymentMethod = {
  CARD: "CARD",
  CASH: "CASH",
  MBWAY: "MBWAY",
  TERMINAL: "TERMINAL",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const CourierAssignmentStatus = {
  OFFERED: "OFFERED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;
export type CourierAssignmentStatus =
  (typeof CourierAssignmentStatus)[keyof typeof CourierAssignmentStatus];

export const CourierStatus = {
  OFFLINE: "OFFLINE",
  AVAILABLE: "AVAILABLE",
  ASSIGNED: "ASSIGNED",
  GOING_TO_RESTAURANT: "GOING_TO_RESTAURANT",
  AT_RESTAURANT: "AT_RESTAURANT",
  PICKED_UP: "PICKED_UP",
  DELIVERING: "DELIVERING",
} as const;
export type CourierStatus = (typeof CourierStatus)[keyof typeof CourierStatus];

export const RestaurantStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  SUSPENDED: "SUSPENDED",
  REJECTED: "REJECTED",
} as const;
export type RestaurantStatus = (typeof RestaurantStatus)[keyof typeof RestaurantStatus];

export const PricingRule = {
  MOST_EXPENSIVE: "MOST_EXPENSIVE",
  AVERAGE: "AVERAGE",
} as const;
/** How a split/half-and-half product's price is derived from its two halves. */
export type PricingRule = (typeof PricingRule)[keyof typeof PricingRule];

// ---- Order transition table -------------------------------------------
// Each status can only be advanced by exactly one actor. Mirrors the
// ownership model proven out in the legacy Yummix backend, generalized to
// the full 10-state flow. The API is the single source of truth for
// enforcement (apps/api/src/modules/orders/orderStateMachine.ts); this
// table is exported so frontends can decide what UI to show without
// duplicating the rule.
export const ORDER_TRANSITIONS: Record<OrderStatus, { next: OrderStatus[]; actor: Role | "SYSTEM" }> = {
  NEW: { next: ["ACCEPTED", "CANCELLED"], actor: Role.RESTAURANT_OWNER },
  // The restaurant (owner/staff) accepts or rejects the order and sets a
  // prep time — everything from there on ("iniciar preparação", "pedido
  // pronto") happens on the KDS screen, run by KITCHEN.
  ACCEPTED: { next: ["PREPARING", "CANCELLED"], actor: Role.KITCHEN },
  PREPARING: { next: ["READY_FOR_PICKUP"], actor: Role.KITCHEN },
  // For PICKUP orders the system moves READY_FOR_PICKUP -> COLLECTED once
  // the customer confirms collection (restaurant staff marks it) — no
  // courier stages apply. For DELIVERY orders it moves toward WAITING_FOR_COURIER.
  READY_FOR_PICKUP: {
    next: ["WAITING_FOR_COURIER", "COURIER_ASSIGNED", "COLLECTED"],
    actor: "SYSTEM",
  },
  WAITING_FOR_COURIER: { next: ["COURIER_ASSIGNED", "CANCELLED"], actor: "SYSTEM" },
  COURIER_ASSIGNED: { next: ["PICKED_UP"], actor: Role.COURIER },
  PICKED_UP: { next: ["OUT_FOR_DELIVERY"], actor: Role.COURIER },
  OUT_FOR_DELIVERY: { next: ["DELIVERED"], actor: Role.COURIER },
  DELIVERED: { next: [], actor: Role.COURIER },
  COLLECTED: { next: [], actor: Role.RESTAURANT_STAFF },
  CANCELLED: { next: [], actor: "SYSTEM" },
};

export interface JwtPayload {
  sub: string;
  role: Role;
  restaurantId?: string;
}
