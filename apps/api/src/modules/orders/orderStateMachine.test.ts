import { describe, expect, it } from "vitest";
import { Role } from "@yummix/types";
import { assertTransitionAllowed } from "./orderStateMachine.js";

describe("assertTransitionAllowed", () => {
  it("allows the restaurant owner to accept a new order", () => {
    expect(() => assertTransitionAllowed("NEW", "ACCEPTED", Role.RESTAURANT_OWNER)).not.toThrow();
  });

  it("allows restaurant staff to accept too (owner isn't the only one who can)", () => {
    expect(() => assertTransitionAllowed("NEW", "ACCEPTED", Role.RESTAURANT_STAFF)).not.toThrow();
  });

  it("rejects a courier trying to accept a new order", () => {
    expect(() => assertTransitionAllowed("NEW", "ACCEPTED", Role.COURIER)).toThrow(/Apenas/);
  });

  it("rejects a restaurant trying to skip straight from NEW to PREPARING", () => {
    expect(() => assertTransitionAllowed("NEW", "PREPARING", Role.RESTAURANT_OWNER)).toThrow(/Não é possível/);
  });

  it("only the courier can move COURIER_ASSIGNED -> PICKED_UP", () => {
    expect(() => assertTransitionAllowed("COURIER_ASSIGNED", "PICKED_UP", Role.COURIER)).not.toThrow();
    expect(() => assertTransitionAllowed("COURIER_ASSIGNED", "PICKED_UP", Role.RESTAURANT_OWNER)).toThrow();
  });

  it("rejects any transition out of a terminal state", () => {
    expect(() => assertTransitionAllowed("DELIVERED", "CANCELLED", Role.SUPER_ADMIN)).toThrow();
  });

  it("SYSTEM can always perform a system-owned transition regardless of who else could", () => {
    expect(() => assertTransitionAllowed("READY_FOR_PICKUP", "WAITING_FOR_COURIER", "SYSTEM")).not.toThrow();
  });
});
