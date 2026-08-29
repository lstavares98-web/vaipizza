import { io, type Socket } from "socket.io-client";
import { tokenStore } from "./api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (!tokenStore.access) return null;
  if (socket?.connected || socket?.active) return socket;
  socket = io(API_URL, { auth: { token: tokenStore.access }, autoConnect: true });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
