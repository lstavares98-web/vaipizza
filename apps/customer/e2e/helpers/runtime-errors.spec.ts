import { expect, test } from "@playwright/test";
import {
  filterUnexpectedRuntimeIssues,
  isCriticalApiUrl,
  type RuntimeIssue,
} from "./runtime-errors";

const issue = (source: RuntimeIssue["source"], message: string, url?: string, status?: number): RuntimeIssue => ({
  source,
  message,
  url,
  status,
});

test("critical API classification only includes real API requests", () => {
  expect(isCriticalApiUrl("https://vaipizza-api-staging.onrender.com/api/orders")).toBe(true);
  expect(isCriticalApiUrl("https://vaipizza-cliente-staging.netlify.app/api/orders")).toBe(true);
  expect(isCriticalApiUrl("https://vaipizza-cliente-staging.netlify.app/assets/index.js")).toBe(false);
  expect(isCriticalApiUrl("https://fonts.googleapis.com/css2?family=Inter")).toBe(false);
});

test("uncaught errors, React fatal errors and failed critical API requests remain failures", () => {
  const issues: RuntimeIssue[] = [
    issue("pageerror", "TypeError: Cannot read properties of undefined"),
    issue("console-error", "The above error occurred in the <OrdersDashboard> component"),
    issue("requestfailed", "net::ERR_CONNECTION_RESET", "https://vaipizza-api-staging.onrender.com/api/orders"),
    issue("response-error", "HTTP 500", "https://vaipizza-api-staging.onrender.com/api/courier/orders/current", 500),
  ];

  expect(filterUnexpectedRuntimeIssues(issues)).toEqual(issues);
});

test("an exact allowlist entry suppresses only that known benign message", () => {
  const exact = "ResizeObserver loop completed with undelivered notifications.";
  const issues: RuntimeIssue[] = [
    issue("console-error", exact),
    issue("console-error", `${exact} extra`),
  ];

  expect(filterUnexpectedRuntimeIssues(issues, [exact])).toEqual([issues[1]]);
});
