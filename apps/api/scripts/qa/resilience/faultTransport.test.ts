import { describe, expect, it } from "vitest";
import {
  QaDroppedResponseError,
  QaTimeoutError,
  createOneShotFaultPlan,
  delayRequest,
  dropResponseAfterServerCall,
  withTimeout,
} from "./faultTransport.js";

describe("QA fault transport", () => {
  it("times out the client without cancelling the underlying operation", async () => {
    let settled = false;
    const underlying = new Promise<string>((resolve) => {
      setTimeout(() => {
        settled = true;
        resolve("server-completed");
      }, 30);
    });

    await expect(withTimeout(underlying, 5, "checkout")).rejects.toBeInstanceOf(QaTimeoutError);
    expect(settled).toBe(false);
    await expect(underlying).resolves.toBe("server-completed");
    expect(settled).toBe(true);
  });

  it("delays deterministically for at least the requested interval", async () => {
    const startedAt = Date.now();
    await delayRequest(12);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(8);
  });

  it("drops only the response after the server operation has completed", async () => {
    let effects = 0;
    const serverCall = async () => {
      effects += 1;
      return { id: "order-1" };
    };

    await expect(dropResponseAfterServerCall(serverCall, "checkout-response")).rejects.toBeInstanceOf(
      QaDroppedResponseError,
    );
    expect(effects).toBe(1);
  });

  it("consumes a declared one-shot fault once and then passes through", () => {
    const plan = createOneShotFaultPlan([
      { point: "checkout", kind: "drop-response" },
      { point: "orders-read", kind: "synthetic-500" },
    ]);

    expect(plan.consume("unrelated")).toBeNull();
    expect(plan.consume("checkout")).toEqual({ point: "checkout", kind: "drop-response" });
    expect(plan.consume("checkout")).toBeNull();
    expect(plan.consume("orders-read")).toEqual({ point: "orders-read", kind: "synthetic-500" });
    expect(plan.consume("orders-read")).toBeNull();
  });
});
