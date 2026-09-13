import { createServer, type Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";

const ORDER_ID = "qa-socket-order-1";

export interface SocketRecoveryFixture {
  orderId: string;
  setStatus(status: string, emit?: boolean): void;
  dropClientTransports(): void;
  waitForConnectedClients(expected: number, timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "http://localhost:3000",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

export async function startSocketRecoveryFixture(port = 4000): Promise<SocketRecoveryFixture> {
  let status = "NEW";
  const history: Array<{ status: string; createdAt: string }> = [
    { status: "NEW", createdAt: new Date().toISOString() },
  ];

  const httpServer: HttpServer = createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "http://localhost:3000",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/api/users/me") {
      json(res, 200, {
        user: {
          id: "qa-customer-1",
          email: "qa-socket@vaipizza.test",
          name: "QA Socket",
          role: "CUSTOMER",
        },
      });
      return;
    }

    if (req.method === "GET" && req.url === "/api/cart") {
      json(res, 200, { cart: null, items: [], subtotal: 0 });
      return;
    }

    if (req.method === "GET" && req.url === "/api/restaurants") {
      json(res, 200, { restaurants: [] });
      return;
    }

    if (req.method === "GET" && req.url === `/api/orders/${ORDER_ID}`) {
      json(res, 200, {
        order: {
          id: ORDER_ID,
          orderNumber: 9001,
          status,
          fulfillmentType: "DELIVERY",
          subtotal: 12,
          discount: 0,
          deliveryFee: 2,
          total: 14,
          paymentMethod: "CASH",
          paymentStatus: "PENDING",
          amountTendered: 20,
          changeDue: 6,
          restaurant: { name: "VaiPizza QA" },
          courier: null,
          items: [
            {
              id: "qa-item-1",
              productNameSnapshot: "Pizza QA",
              quantity: 1,
              lineTotal: 12,
              comboSelectionsSnapshot: null,
            },
          ],
          statusHistory: history,
        },
      });
      return;
    }

    json(res, 404, { message: `Unhandled QA fixture route: ${req.method} ${req.url}` });
  });

  const io = new SocketServer(httpServer, {
    cors: { origin: "http://localhost:3000", credentials: false },
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  return {
    orderId: ORDER_ID,
    setStatus(nextStatus: string, emit = true) {
      status = nextStatus;
      history.push({ status: nextStatus, createdAt: new Date().toISOString() });
      if (emit) io.emit("order:status", { orderId: ORDER_ID, status: nextStatus });
    },
    dropClientTransports() {
      for (const socket of io.sockets.sockets.values()) {
        socket.conn.close();
      }
    },
    async waitForConnectedClients(expected: number, timeoutMs = 5_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (io.engine.clientsCount === expected) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(
        `Expected ${expected} connected socket client(s), received ${io.engine.clientsCount}`,
      );
    },
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) =>
          httpServer.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  };
}
