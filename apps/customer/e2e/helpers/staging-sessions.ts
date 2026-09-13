import type { APIRequestContext, BrowserContext } from "@playwright/test";

export type StagingSessionSurface = "customer" | "restaurant" | "kds" | "courier";

export interface StagingSessionSurfaceConfig {
  loginPath: string;
  accessTokenKey: string;
  refreshTokenKey: string;
}

export interface StagingCredentials {
  email: string;
  password: string;
}

export interface StagingSessionTokens {
  accessToken: string;
  refreshToken: string;
}

const SURFACES: Record<StagingSessionSurface, StagingSessionSurfaceConfig> = {
  customer: {
    loginPath: "/api/auth/customer/login",
    accessTokenKey: "vaipizza_customer_access_token",
    refreshTokenKey: "vaipizza_customer_refresh_token",
  },
  restaurant: {
    loginPath: "/api/auth/restaurant/login",
    accessTokenKey: "vaipizza_restaurant_access_token",
    refreshTokenKey: "vaipizza_restaurant_refresh_token",
  },
  kds: {
    loginPath: "/api/auth/kitchen/login",
    accessTokenKey: "vaipizza_kds_access_token",
    refreshTokenKey: "vaipizza_kds_refresh_token",
  },
  courier: {
    loginPath: "/api/auth/courier/login",
    accessTokenKey: "vaipizza_courier_access_token",
    refreshTokenKey: "vaipizza_courier_refresh_token",
  },
};

export function getStagingSessionSurface(surface: StagingSessionSurface): StagingSessionSurfaceConfig {
  return { ...SURFACES[surface] };
}

function assertQaCredentials(credentials: StagingCredentials): void {
  if (!credentials.email.startsWith("qa+") || !credentials.email.endsWith("@vaipizza.test")) {
    throw new Error("Staging browser recovery may only use ephemeral QA credentials");
  }
  if (!credentials.password) throw new Error("Staging QA password is required");
}

export async function loginStagingSession(
  request: APIRequestContext,
  apiUrl: string,
  surface: StagingSessionSurface,
  credentials: StagingCredentials,
): Promise<StagingSessionTokens> {
  assertQaCredentials(credentials);
  const config = getStagingSessionSurface(surface);
  const response = await request.post(`${apiUrl.replace(/\/$/, "")}${config.loginPath}`, {
    data: credentials,
  });
  if (!response.ok()) {
    throw new Error(`QA ${surface} login failed with HTTP ${response.status()}`);
  }
  const data = (await response.json()) as Partial<StagingSessionTokens>;
  if (!data.accessToken || !data.refreshToken) {
    throw new Error(`QA ${surface} login returned incomplete tokens`);
  }
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

export async function installStagingSession(
  context: BrowserContext,
  surface: StagingSessionSurface,
  tokens: StagingSessionTokens,
): Promise<void> {
  const config = getStagingSessionSurface(surface);
  await context.addInitScript(
    ({ accessTokenKey, refreshTokenKey, accessToken, refreshToken }) => {
      localStorage.setItem(accessTokenKey, accessToken);
      localStorage.setItem(refreshTokenKey, refreshToken);
    },
    {
      accessTokenKey: config.accessTokenKey,
      refreshTokenKey: config.refreshTokenKey,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  );
}
