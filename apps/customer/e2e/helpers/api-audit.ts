import type { APIRequestContext } from "@playwright/test";

export interface OrderAuditFixture {
  apiUrl: string;
  orderId: string;
}

interface OrderResponseBody {
  order?: {
    id?: string;
    status?: string;
  };
}

async function readOrderStatus(
  request: APIRequestContext,
  fixture: OrderAuditFixture,
  customerToken: string,
): Promise<string> {
  const response = await request.get(`${fixture.apiUrl.replace(/\/$/, "")}/api/orders/${fixture.orderId}`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  if (!response.ok()) {
    throw new Error(`Authoritative order read failed with HTTP ${response.status()}`);
  }
  const body = await response.json() as OrderResponseBody;
  if (body.order?.id !== fixture.orderId || !body.order.status) {
    throw new Error("Authoritative order read returned the wrong or incomplete order");
  }
  return body.order.status;
}

export async function waitForOrderStatus(
  request: APIRequestContext,
  fixture: OrderAuditFixture,
  customerToken: string,
  expectedStatus: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "<unread>";
  let lastError: Error | null = null;

  while (Date.now() <= deadline) {
    try {
      lastStatus = await readOrderStatus(request, fixture, customerToken);
      lastError = null;
      if (lastStatus === expectedStatus) return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (lastError) {
    throw new Error(`Order did not reach ${expectedStatus}: ${lastError.message}`);
  }
  throw new Error(`Order did not reach ${expectedStatus}; last authoritative status was ${lastStatus}`);
}

export async function setCourierOrderStatus(
  request: APIRequestContext,
  fixture: OrderAuditFixture,
  courierToken: string,
  status: "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED",
): Promise<void> {
  const response = await request.patch(
    `${fixture.apiUrl.replace(/\/$/, "")}/api/courier/orders/${fixture.orderId}/status`,
    {
      headers: { Authorization: `Bearer ${courierToken}` },
      data: { status },
    },
  );
  if (!response.ok()) {
    throw new Error(`Courier transition to ${status} failed with HTTP ${response.status()}`);
  }
}
