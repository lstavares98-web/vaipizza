import { ORDER_TRANSITIONS, Role, type OrderStatus } from "@yummix/types";
import { forbidden, badRequest } from "../../utils/AppError.js";

/**
 * Enforces the single-writer-per-status rule described in
 * PROJECT_ANALYSIS.md: each order status can only be advanced by exactly
 * one actor. Generalizes the legacy Yummix's `RESTAURANT_TRANSITIONS`
 * table (which only covered the restaurant's slice) to the full 10-state
 * flow, using the shared table so the frontends can mirror the same rules
 * for what UI to show without duplicating them.
 */
export function assertTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
  actorRole: Role | "SYSTEM",
) {
  const rule = ORDER_TRANSITIONS[from];
  if (!rule || !rule.next.includes(to)) {
    throw badRequest(`Não é possível mudar de "${from}" para "${to}"`, "INVALID_TRANSITION");
  }
  // Restaurant staff can act on the owner's behalf; every other actor is
  // exclusive (only KITCHEN drives KDS transitions, only COURIER drives
  // delivery transitions).
  const allowedActors: (Role | "SYSTEM")[] =
    rule.actor === Role.RESTAURANT_OWNER
      ? [Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF, "SYSTEM"]
      : [rule.actor, "SYSTEM"];
  if (!allowedActors.includes(actorRole)) {
    throw forbidden(`Apenas ${rule.actor} pode mudar "${from}" para "${to}"`);
  }
}

export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = ["NEW", "ACCEPTED", "PREPARING"];
