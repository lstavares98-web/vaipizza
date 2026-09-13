import type { ConsoleMessage, Page, Request, Response } from "@playwright/test";

export type RuntimeIssueSource = "console-error" | "pageerror" | "requestfailed" | "response-error";

export interface RuntimeIssue {
  source: RuntimeIssueSource;
  message: string;
  url?: string;
  status?: number;
}

export interface RuntimeHealthAudit {
  issues: RuntimeIssue[];
  unexpected: (allowedMessages?: string[]) => RuntimeIssue[];
  stop: () => void;
}

export function isCriticalApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/api" || parsed.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

export function filterUnexpectedRuntimeIssues(
  issues: RuntimeIssue[],
  allowedMessages: string[] = [],
): RuntimeIssue[] {
  const allowed = new Set(allowedMessages);
  return issues.filter((issue) => !allowed.has(issue.message));
}

export function startRuntimeHealthAudit(page: Page): RuntimeHealthAudit {
  const issues: RuntimeIssue[] = [];

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    issues.push({ source: "console-error", message: message.text() });
  };

  const onPageError = (error: Error) => {
    issues.push({ source: "pageerror", message: error.stack ?? error.message });
  };

  const onRequestFailed = (request: Request) => {
    if (!isCriticalApiUrl(request.url())) return;
    issues.push({
      source: "requestfailed",
      message: request.failure()?.errorText ?? "Critical API request failed",
      url: request.url(),
    });
  };

  const onResponse = (response: Response) => {
    if (!isCriticalApiUrl(response.url()) || response.status() < 500) return;
    issues.push({
      source: "response-error",
      message: `HTTP ${response.status()}`,
      url: response.url(),
      status: response.status(),
    });
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  return {
    issues,
    unexpected: (allowedMessages: string[] = []) => filterUnexpectedRuntimeIssues(issues, allowedMessages),
    stop: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
    },
  };
}
