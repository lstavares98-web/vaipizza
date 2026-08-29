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
  customer: (userId: string) => `customer:${userId}`,
  restaurant: (restaurantId: string) => `restaurant:${restaurantId}`,
  courier: (courierId: string) => `courier:${courierId}`,
  order: (orderId: string) => `order:${orderId}`,
};
