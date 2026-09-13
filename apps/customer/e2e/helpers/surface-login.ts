import fs from "node:fs";
import type { APIRequestContext, BrowserContext } from "@playwright/test";
import {
  installStagingSession,
  loginStagingSession,
  type StagingCredentials,
  type StagingSessionSurface,
  type StagingSessionTokens,
} from "./staging-sessions";

export interface BrowserUiFixture {
  runId: string;
  apiUrl: string;
  orderId: string;
  orderNumber: number;
  credentials: Record<StagingSessionSurface, StagingCredentials>;
}

export type BrowserSurfaceSessions = Record<StagingSessionSurface, StagingSessionTokens>;

const SURFACES: StagingSessionSurface[] = ["customer", "restaurant", "kds", "courier"];

function assertApprovedFixtureApiUrl(apiUrl: string): string {
  const parsed = new URL(apiUrl);
  const approved = parsed.hostname === "vaipizza-api-staging.onrender.com"
    || parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1";
  if (!approved) throw new Error("Browser UI fixture API URL is not an approved QA target");
  return parsed.origin;
}

function assertFixtureCredentials(surface: StagingSessionSurface, credentials: StagingCredentials | undefined): void {
  if (!credentials?.email?.startsWith("qa+") || !credentials.email.endsWith("@vaipizza.test") || !credentials.password) {
    throw new Error(`Browser UI fixture has invalid ${surface} credentials`);
  }
}

export function loadBrowserUiFixture(filePath = process.env.QA_BROWSER_FIXTURE_FILE): BrowserUiFixture {
  const approvedPath = filePath?.trim();
  if (!approvedPath) throw new Error("QA_BROWSER_FIXTURE_FILE is required for live browser UI QA");

  const fixture = JSON.parse(fs.readFileSync(approvedPath, "utf8")) as BrowserUiFixture;
  if (!fixture.runId?.startsWith("QA-") || !fixture.orderId || !Number.isInteger(fixture.orderNumber)) {
    throw new Error("Browser UI fixture is incomplete");
  }
  fixture.apiUrl = assertApprovedFixtureApiUrl(fixture.apiUrl);
  for (const surface of SURFACES) assertFixtureCredentials(surface, fixture.credentials?.[surface]);
  return fixture;
}

export async function installBrowserSurfaceSessions(
  request: APIRequestContext,
  context: BrowserContext,
  fixture: BrowserUiFixture,
): Promise<BrowserSurfaceSessions> {
  const sessions = {} as BrowserSurfaceSessions;
  for (const surface of SURFACES) {
    const tokens = await loginStagingSession(request, fixture.apiUrl, surface, fixture.credentials[surface]);
    await installStagingSession(context, surface, tokens);
    sessions[surface] = tokens;
  }
  return sessions;
}
