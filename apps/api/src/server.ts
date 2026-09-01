import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { Role } from "@yummix/types";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { verifyAccessToken } from "./modules/auth/tokens.js";
import { setIO, rooms } from "./sockets/io.js";
import { runDispatchSweep } from "./modules/dispatch/dispatch.service.js";

const app = createApp();
const httpServer = createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: { origin: env.corsOrigins, credentials: true },
});
setIO(io);

// Every socket authenticates with the same JWT access token used for REST
// calls (passed as `auth: { token }` on the client) and is auto-joined to
// the room(s) its role is allowed to receive events for — a customer can
// never subscribe to another customer's order updates, a restaurant
// account only ever hears about its own restaurant's orders.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next(new Error("Missing auth token"));
  try {
    socket.data.auth = verifyAccessToken(token);
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  const auth = socket.data.auth as ReturnType<typeof verifyAccessToken>;
  if (auth.role === Role.CUSTOMER) {
    socket.join(rooms.customer(auth.sub));
  } else if (
    (auth.role === Role.RESTAURANT_OWNER || auth.role === Role.RESTAURANT_STAFF || auth.role === Role.KITCHEN) &&
    auth.restaurantId
  ) {
    socket.join(rooms.restaurant(auth.restaurantId));
  } else if (auth.role === Role.COURIER) {
    socket.join(rooms.courier(auth.sub));
  }
});

httpServer.listen(env.PORT, () => {
  console.log(`VAIPIZZA API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

// Long-lived Node process, not Vercel Functions — a plain interval is the
// straightforward choice here; no cron workaround needed (see
// PROJECT_ANALYSIS.md §4 for why the legacy system couldn't do this).
setInterval(() => {
  runDispatchSweep().catch((err) => console.error("Dispatch sweep failed:", err));
}, 15_000);
