export type QaFaultKind = "delay" | "timeout" | "drop-response" | "synthetic-500";

export interface QaFaultSpec {
  point: string;
  kind: QaFaultKind;
  delayMs?: number;
}

export class QaTimeoutError extends Error {
  readonly code = "QA_TIMEOUT";

  constructor(
    readonly point: string,
    readonly timeoutMs: number,
  ) {
    super(`QA timeout at ${point} after ${timeoutMs} ms`);
    this.name = "QaTimeoutError";
  }
}

export class QaDroppedResponseError extends Error {
  readonly code = "QA_DROPPED_RESPONSE";

  constructor(readonly point: string) {
    super(`QA dropped response after server call at ${point}`);
    this.name = "QaDroppedResponseError";
  }
}

export interface OneShotFaultPlan {
  consume(point: string): QaFaultSpec | null;
}

export function createOneShotFaultPlan(faults: readonly QaFaultSpec[]): OneShotFaultPlan {
  const remaining = faults.map((fault) => ({ ...fault, consumed: false }));

  return {
    consume(point: string): QaFaultSpec | null {
      const match = remaining.find((fault) => !fault.consumed && fault.point === point);
      if (!match) return null;
      match.consumed = true;
      const { consumed: _consumed, ...fault } = match;
      return fault;
    },
  };
}

export function delayRequest(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, point = "operation"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new QaTimeoutError(point, timeoutMs)), Math.max(0, timeoutMs));
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function dropResponseAfterServerCall<T>(
  serverCall: () => Promise<T>,
  point = "operation",
): Promise<never> {
  await serverCall();
  throw new QaDroppedResponseError(point);
}
