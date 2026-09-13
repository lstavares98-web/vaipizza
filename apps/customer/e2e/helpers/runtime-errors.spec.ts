import { expect, test } from "@playwright/test";
import {
  filterUnexpectedRuntimeIssues,
  isCriticalApiUrl,
  isKnownDeploymentPendingCspIssue,
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

test("deployment-pending CSP classifier only recognizes the diagnosed staging font and Netlify HUD violations", () => {
  const fontViolation = issue(
    "console-error",
    "Loading the stylesheet 'https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;600;700&display=swap' violates the following Content Security Policy directive: \"style-src 'self' 'unsafe-inline'\". Note that 'style-src-elem' was not explicitly set, so 'style-src' is used as a fallback. The action has been blocked.",
  );
  const hudViolation = issue(
    "console-error",
    "Executing inline script violates the following Content Security Policy directive 'script-src 'self''. Either the 'unsafe-inline' keyword, a hash ('sha256-mTJ4cJaTm2Gw95GeXEpZdvEEY9ybh6FZu1bwcNE7QlY='), or a nonce ('nonce-...') is required to enable inline execution. The action has been blocked.",
  );

  expect(isKnownDeploymentPendingCspIssue(fontViolation)).toBe(true);
  expect(isKnownDeploymentPendingCspIssue(hudViolation)).toBe(true);
  expect(isKnownDeploymentPendingCspIssue(issue("console-error", "Refused to load an unexpected script because of CSP"))).toBe(false);
  expect(isKnownDeploymentPendingCspIssue(issue("pageerror", fontViolation.message))).toBe(false);
  expect(isKnownDeploymentPendingCspIssue(issue("console-error", fontViolation.message.replace("fonts.googleapis.com", "evil.example.com")))).toBe(false);
  expect(isKnownDeploymentPendingCspIssue(issue("console-error", hudViolation.message.replace("mTJ4cJaTm2Gw95GeXEpZdvEEY9ybh6FZu1bwcNE7QlY=", "different=")))).toBe(false);
});
