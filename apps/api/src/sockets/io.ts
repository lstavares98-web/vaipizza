import type { Server } from "socket.io";

// Simple singleton so route/service modules can emit events without every
// call site threading `io` through function signatures. Set once in
// server.ts right after the Server is constructed.
let ioInstance: Server | null = null;

export function setIO(io: Server) {
  ioInstance = io;
}

export function getIO(): Server | null {
  return ioInstance;
}

export const rooms = {
  // Staff-created phone/counter orders may not belong to a login user. No
  // authenticated socket ever joins this fallback room, so emitting an
  // order event for an unregistered customer is a harmless no-op while
  // keeping the operational call sites simple and null-safe.
  customer: (userId: string | null | undefined) => userId ? `customer:${userId}` : "customer:unregistered",
  restaurant: (restaurantId: string) => `restaurant:${restaurantId}`,
  courier: (courierId: string) => `courier:${courierId}`,
  order: (orderId: string) => `order:${orderId}`,
};
